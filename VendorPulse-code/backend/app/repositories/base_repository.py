"""
Generic JSON-backed repository.

All read/write operations go through this class.  When the project migrates
to SQLite (or Postgres), only this layer needs to change — services and routes
remain untouched.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


class BaseRepository:
    """
    Thread-safe (enough for single-process demos) JSON file store.

    Every sub-class receives the data directory via dependency injection so
    it can be swapped in tests without touching the filesystem.
    """

    def __init__(self, filename: str, data_dir: Path) -> None:
        self._filepath = data_dir / filename
        self._filepath.parent.mkdir(parents=True, exist_ok=True)
        logger.debug("Repository initialized — file=%s", self._filepath)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _read(self) -> list[dict]:
        if not self._filepath.exists():
            return []
        return json.loads(self._filepath.read_text(encoding="utf-8"))

    def _write(self, data: list[dict]) -> None:
        self._filepath.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    # ------------------------------------------------------------------
    # Public CRUD interface
    # ------------------------------------------------------------------

    def find_all(self) -> list[dict]:
        return self._read()

    def find_by_id(self, id_field: str, id_value: str) -> Optional[dict]:
        return next(
            (r for r in self._read() if r.get(id_field) == id_value),
            None,
        )

    def find_by_field(self, field: str, value: Any) -> list[dict]:
        return [r for r in self._read() if r.get(field) == value]

    def find_by_predicate(self, predicate: Callable[[dict], bool]) -> list[dict]:
        return [r for r in self._read() if predicate(r)]

    def insert(self, record: dict) -> dict:
        logger.debug("insert — file=%s", self._filepath.name)
        records = self._read()
        records.append(record)
        self._write(records)
        return record

    def update_by_id(self, id_field: str, id_value: str, updates: dict) -> Optional[dict]:
        """Shallow-merge *updates* into the matching record."""
        logger.debug("update_by_id — file=%s, %s=%s, updates=%s", self._filepath.name, id_field, id_value, list(updates.keys()))
        records = self._read()
        idx = next((i for i, r in enumerate(records) if r.get(id_field) == id_value), None)
        if idx is None:
            logger.warning("update_by_id: record not found — %s=%s in %s", id_field, id_value, self._filepath.name)
            return None
        records[idx].update(updates)
        self._write(records)
        return records[idx]

    def replace_by_id(self, id_field: str, id_value: str, new_record: dict) -> Optional[dict]:
        """Full replace of the matching record."""
        logger.debug("replace_by_id — file=%s, %s=%s", self._filepath.name, id_field, id_value)
        records = self._read()
        idx = next((i for i, r in enumerate(records) if r.get(id_field) == id_value), None)
        if idx is None:
            logger.warning("replace_by_id: record not found — %s=%s in %s", id_field, id_value, self._filepath.name)
            return None
        records[idx] = new_record
        self._write(records)
        return new_record

    def delete_by_id(self, id_field: str, id_value: str) -> bool:
        logger.debug("delete_by_id — file=%s, %s=%s", self._filepath.name, id_field, id_value)
        records = self._read()
        filtered = [r for r in records if r.get(id_field) != id_value]
        if len(filtered) == len(records):
            logger.warning("delete_by_id: record not found — %s=%s in %s", id_field, id_value, self._filepath.name)
            return False
        self._write(filtered)
        return True

    def delete_by_field(self, field: str, value: Any) -> int:
        """Delete every record where record[field] == value; return how many were
        removed. The JSON analogue of `DELETE FROM t WHERE field = value` — used for
        cascade cleanup so child rows never dangle after a parent is removed."""
        records = self._read()
        kept = [r for r in records if r.get(field) != value]
        removed = len(records) - len(kept)
        if removed:
            self._write(kept)
        return removed

    def count(self) -> int:
        return len(self._read())
