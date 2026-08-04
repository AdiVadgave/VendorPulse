"""
Generic relational repository (column-mapped).

This is the single data-access seam. The database is fully normalized (3NF):
every entity is a real table with typed columns, a domain PRIMARY KEY, and
FOREIGN KEY constraints to its parents. Genuinely nested / variable data
(meeting time slots, score maps, agent payloads, meeting plans) is kept in
JSONB columns — the standard "relational core + JSONB" pattern.

The public CRUD surface is byte-for-byte the same dict-in / dict-out contract
the services, routes, models, and agents already depend on. Each subclass
declares its table shape (``table``, ``pk``, ``columns``, ``json_columns``) and
the generic engine maps dicts to/from columns. Repositories whose entity was
de-duplicated into a shared table (cycles→vendors, attendees→stakeholders)
override ``insert``/reads to decompose on write and reconstruct on read, so
callers still see the same "fat" record.

Every table also carries a ``seq BIGSERIAL`` column used only for ordering, so
``find_all`` / field lookups return rows in insertion order exactly like the
previous store did.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional

from psycopg.types.json import Jsonb

from app.db.pool import get_pool

logger = logging.getLogger(__name__)


def _normalize_value(value: Any) -> Any:
    """Keep the dict-out contract stable across column-type changes.

    Timestamp/date columns are stored as TIMESTAMPTZ/DATE, but the whole
    application (models, routes, frontend) has always treated these fields as
    ISO-8601 *strings*. psycopg returns them as datetime/date objects, so we
    convert them back to the exact same UTC ISO string the app wrote — callers
    never see a behavioural change. Every other type (bool/int/float/JSONB
    dict|list/str/None) is already native and passes through untouched."""
    if isinstance(value, datetime):
        # datetime is a subclass of date — must be checked first. Always emit UTC
        # (+00:00), matching the app's datetime.now(timezone.utc).isoformat().
        return value.astimezone(timezone.utc).isoformat() if value.tzinfo else value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


class BaseRepository:
    """Column-mapped CRUD over a single normalized table.

    Subclasses set the class attributes below. ``data_dir`` is accepted for
    signature compatibility with the historical JSON store but is unused.
    """

    #: Table name.
    table: str = ""
    #: Domain primary-key column (e.g. "cycle_id").
    pk: str = ""
    #: Every column this repository reads/writes, in a stable order. Excludes
    #: the internal ``seq``.
    columns: tuple[str, ...] = ()
    #: Subset of ``columns`` stored as JSONB.
    json_columns: frozenset[str] = frozenset()

    def __init__(self, data_dir: Optional[Path] = None) -> None:
        if not self.table or not self.pk or not self.columns:
            raise TypeError(f"{type(self).__name__} must define table, pk and columns")
        logger.debug("Repository initialized — table=%s", self.table)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _collist(self) -> str:
        return ", ".join(f'"{c}"' for c in self.columns)

    def _row_to_dict(self, row: tuple) -> dict:
        # psycopg already decodes JSONB columns to Python dict/list and
        # bool/int/float columns to native types. Timestamp/date columns come
        # back as datetime/date objects — _normalize_value converts those to the
        # ISO strings the app has always used, so nothing downstream changes.
        return {col: _normalize_value(val) for col, val in zip(self.columns, row)}

    def _adapt(self, col: str, value: Any) -> Any:
        return Jsonb(value) if col in self.json_columns else value

    def _select(self, where: str = "", params: tuple = ()) -> list[dict]:
        sql = f'SELECT {self._collist()} FROM "{self.table}"{where} ORDER BY seq'
        with get_pool().connection() as conn:
            cur = conn.execute(sql, params)
            return [self._row_to_dict(r) for r in cur.fetchall()]

    # ------------------------------------------------------------------
    # Public CRUD interface
    # ------------------------------------------------------------------

    def find_all(self) -> list[dict]:
        return self._select()

    def find_by_id(self, id_field: str, id_value: Any) -> Optional[dict]:
        rows = self._select(f' WHERE "{id_field}" = %s', (id_value,))
        return rows[0] if rows else None

    def find_by_field(self, field: str, value: Any) -> list[dict]:
        return self._select(f' WHERE "{field}" = %s', (value,))

    def find_by_predicate(self, predicate: Callable[[dict], bool]) -> list[dict]:
        return [r for r in self.find_all() if predicate(r)]

    def insert(self, record: dict) -> dict:
        cols = [c for c in self.columns if c in record]
        values = [self._adapt(c, record[c]) for c in cols]
        collist = ", ".join(f'"{c}"' for c in cols)
        placeholders = ", ".join(["%s"] * len(cols))
        with get_pool().connection() as conn:
            conn.execute(
                f'INSERT INTO "{self.table}" ({collist}) VALUES ({placeholders})',
                values,
            )
        return record

    def update_by_id(self, id_field: str, id_value: Any, updates: dict) -> Optional[dict]:
        """Update only the supplied columns (the relational analogue of the old
        shallow dict merge)."""
        sets = [c for c in updates if c in self.columns and c != id_field]
        if not sets:
            return self.find_by_id(id_field, id_value)
        assignments = ", ".join(f'"{c}" = %s' for c in sets)
        values = [self._adapt(c, updates[c]) for c in sets]
        sql = (
            f'UPDATE "{self.table}" SET {assignments} WHERE "{id_field}" = %s '
            f'RETURNING {self._collist()}'
        )
        with get_pool().connection() as conn:
            cur = conn.execute(sql, (*values, id_value))
            row = cur.fetchone()
        if row is None:
            logger.warning("update_by_id: not found — %s=%s in %s", id_field, id_value, self.table)
            return None
        return self._row_to_dict(row)

    def replace_by_id(self, id_field: str, id_value: Any, new_record: dict) -> Optional[dict]:
        """Full replace: every column is set from *new_record* (absent → NULL)."""
        sets = [c for c in self.columns if c != id_field]
        assignments = ", ".join(f'"{c}" = %s' for c in sets)
        values = [self._adapt(c, new_record.get(c)) for c in sets]
        sql = (
            f'UPDATE "{self.table}" SET {assignments} WHERE "{id_field}" = %s '
            f'RETURNING {self._collist()}'
        )
        with get_pool().connection() as conn:
            cur = conn.execute(sql, (*values, id_value))
            row = cur.fetchone()
        if row is None:
            logger.warning("replace_by_id: not found — %s=%s in %s", id_field, id_value, self.table)
            return None
        return self._row_to_dict(row)

    def delete_by_id(self, id_field: str, id_value: Any) -> bool:
        with get_pool().connection() as conn:
            cur = conn.execute(
                f'DELETE FROM "{self.table}" WHERE "{id_field}" = %s', (id_value,)
            )
            return cur.rowcount > 0

    def delete_by_field(self, field: str, value: Any) -> int:
        with get_pool().connection() as conn:
            cur = conn.execute(
                f'DELETE FROM "{self.table}" WHERE "{field}" = %s', (value,)
            )
            return cur.rowcount

    def count(self) -> int:
        with get_pool().connection() as conn:
            cur = conn.execute(f'SELECT count(*) FROM "{self.table}"')
            return cur.fetchone()[0]
