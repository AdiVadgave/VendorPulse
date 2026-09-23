"""
Cycles.

`vendor_name` is NOT stored (it would duplicate vendors.name); the cycle keeps
only `vendor_id` and the repository reconstructs `vendor_name` on read by
joining `vendors`, so callers still see it on the dict.
"""
from __future__ import annotations

import logging
from typing import Callable, Optional

from psycopg.types.json import Jsonb

from app.db.pool import get_pool
from app.repositories.base_repository import BaseRepository
from app.repositories.vendor_repository import VendorRepository

logger = logging.getLogger(__name__)


class CycleRepository(BaseRepository):
    table = "cycles"
    pk = "cycle_id"
    columns = (
        "cycle_id", "vendor_id", "cycle_type", "quarter", "year", "description",
        "workflow_state", "created_at", "updated_at", "meeting_plan", "scorecard_config",
        "teams_meeting_url", "teams_meeting_web_link", "teams_meeting_event_id",
        "teams_meeting_scheduled_at", "scorecard_dispatched_at", "scorecard_dispatched_to",
        "meeting_time_zone", "meeting_duration_minutes",
    )
    json_columns = frozenset({"meeting_plan", "scorecard_config", "scorecard_dispatched_to"})

    def __init__(self, vendor_repo: VendorRepository, data_dir=None) -> None:
        super().__init__(data_dir)
        self._vendor_repo = vendor_repo

    def _enrich(self, rows: list[dict]) -> list[dict]:
        if not rows:
            return rows
        vendors = {v["vendor_id"]: v for v in self._vendor_repo.find_all()}
        return [
            {**c, "vendor_name": (vendors.get(c.get("vendor_id")) or {}).get("name")}
            for c in rows
        ]

    def find_all(self) -> list[dict]:
        return self._enrich(super().find_all())

    def find_by_id(self, id_field: str, id_value) -> Optional[dict]:
        row = super().find_by_id(id_field, id_value)
        return self._enrich([row])[0] if row else None

    def find_by_field(self, field: str, value) -> list[dict]:
        return self._enrich(super().find_by_field(field, value))

    # ── convenience API (unchanged signatures) ───────────────────────────────
    def get_by_cycle_id(self, cycle_id: str) -> Optional[dict]:
        return self.find_by_id("cycle_id", cycle_id)

    def get_by_vendor(self, vendor_id: str) -> list[dict]:
        return self.find_by_field("vendor_id", vendor_id)

    def advance_workflow_state(self, cycle_id: str, new_state: str, updated_at: str) -> Optional[dict]:
        return self.update_by_id(
            "cycle_id", cycle_id, {"workflow_state": new_state, "updated_at": updated_at}
        )

    def mark_scorecard_dispatched(
        self, cycle_id: str, dispatched_at: str, emails: list[str]
    ) -> Optional[dict]:
        """Record a scorecard dispatch. Emails are UNIONed into the existing
        ``scorecard_dispatched_to`` (never replaced) so a team-scoped resend adds only
        that team without erasing the record of teams already sent — the set is what
        marks which teams' columns are locked.

        The union is computed by the DATABASE over the row's own column, not
        read-modify-written in Python. The pool is autocommit, so a Python-side merge
        would blind-overwrite whatever a concurrent writer (reopen-team, another
        team-scoped send) committed in between — and the read/write gap here spans the
        whole Graph sendMail loop. Under READ COMMITTED a blocked UPDATE re-evaluates
        its SET expressions against the new row version, so referencing
        ``scorecard_dispatched_to`` inline is what makes this lost-update-proof; a value
        computed in a CTE would NOT be re-evaluated and would stay stale.

        ``DISTINCT ON (e) ... ORDER BY e, ord`` keeps the first occurrence of each email
        and the outer ``ORDER BY ord`` restores insertion order, i.e. exactly the
        order-preserving union ``dict.fromkeys`` used to give.

        The column is guarded with ``jsonb_typeof(...) = 'array'`` rather than COALESCE:
        ``clear_scorecard_dispatch`` writes Python ``None`` through ``Jsonb``, which
        stores the jsonb SCALAR ``null`` — not SQL NULL — so COALESCE would pass it
        straight through and ``jsonb_array_elements_text`` would raise "cannot extract
        elements from a scalar". That path is reachable: redo the scorecard, then send."""
        sql = """
            UPDATE "cycles" SET
                "scorecard_dispatched_at" = %s,
                "scorecard_dispatched_to" = (
                    SELECT COALESCE(jsonb_agg(d.e ORDER BY d.ord), '[]'::jsonb)
                    FROM (
                        SELECT DISTINCT ON (t.e) t.e, t.ord
                        FROM jsonb_array_elements_text(
                                 CASE WHEN jsonb_typeof("cycles"."scorecard_dispatched_to") = 'array'
                     THEN "cycles"."scorecard_dispatched_to" ELSE '[]'::jsonb END
                                 || %s::jsonb
                             ) WITH ORDINALITY AS t(e, ord)
                        ORDER BY t.e, t.ord
                    ) d
                )
            WHERE "cycle_id" = %s
        """
        try:
            with get_pool().connection() as conn:
                conn.execute(sql, (dispatched_at, Jsonb(list(emails or [])), cycle_id))
        except Exception:  # noqa: BLE001 — see below; this must never lose the lock
            # This runs AFTER the Graph sendMail loop: the reviewers already have their
            # links. If the atomic statement fails for any reason, losing the lock is far
            # worse than losing atomicity — the cycle would read as "never dispatched" and
            # the VMO could re-email everyone. Fall back to the previous read-modify-write
            # (racy, but correct in the single-writer case) and log loudly so the failure
            # is visible rather than silently degrading on every send.
            logger.exception(
                "mark_scorecard_dispatched: atomic UPDATE failed for cycle=%s — "
                "falling back to a non-atomic merge", cycle_id,
            )
            current = self.get_by_cycle_id(cycle_id) or {}
            existing = current.get("scorecard_dispatched_to")
            if not isinstance(existing, list):
                existing = []
            merged = list(dict.fromkeys([*existing, *(emails or [])]))
            return self.update_by_id(
                "cycle_id", cycle_id,
                {"scorecard_dispatched_at": dispatched_at, "scorecard_dispatched_to": merged},
            )
        # Read back through the normal path so callers still get the _enrich'd dict
        # (vendor_name) that update_by_id's RETURNING would not have provided.
        return self.get_by_cycle_id(cycle_id)

    def unmark_scorecard_dispatched(
        self, cycle_id: str, emails: list[str]
    ) -> Optional[dict]:
        """Remove one team's reviewers from the dispatch lock (the reopen-team flow).

        Single statement over the row's own column, for the same lost-update reason as
        ``mark_scorecard_dispatched`` — a Python-side subtract-and-overwrite would erase
        a reviewer a concurrent dispatch had just recorded, leaving them emailed a live
        form link but not locked. Emptying the set also clears
        ``scorecard_dispatched_at`` in the SAME statement, otherwise the two halves could
        be split across racing writers and the config would stay 409-locked for good.

        Both SET expressions read the pre-update row, so the CASE sees the same array the
        filter does. An empty *emails* leaves the set untouched (``<> ALL('{}')`` is
        TRUE), matching the previous behaviour."""
        lowered = [(e or "").strip().lower() for e in (emails or [])]
        sql = """
            UPDATE "cycles" SET
                "scorecard_dispatched_to" = (
                    SELECT COALESCE(jsonb_agg(t.e ORDER BY t.ord), '[]'::jsonb)
                    FROM jsonb_array_elements_text(
                             CASE WHEN jsonb_typeof("cycles"."scorecard_dispatched_to") = 'array'
                     THEN "cycles"."scorecard_dispatched_to" ELSE '[]'::jsonb END
                         ) WITH ORDINALITY AS t(e, ord)
                    WHERE lower(btrim(t.e)) <> ALL(%s::text[])
                ),
                "scorecard_dispatched_at" = CASE
                    WHEN NOT EXISTS (
                        SELECT 1
                        FROM jsonb_array_elements_text(
                                 CASE WHEN jsonb_typeof("cycles"."scorecard_dispatched_to") = 'array'
                     THEN "cycles"."scorecard_dispatched_to" ELSE '[]'::jsonb END
                             ) AS k(e)
                        WHERE lower(btrim(k.e)) <> ALL(%s::text[])
                    ) THEN NULL
                    ELSE "scorecard_dispatched_at"
                END
            WHERE "cycle_id" = %s
        """
        try:
            with get_pool().connection() as conn:
                conn.execute(sql, (lowered, lowered, cycle_id))
        except Exception:  # noqa: BLE001 — same rationale as mark_scorecard_dispatched
            # A failed reopen must not leave the team locked with its submissions already
            # deleted (the caller clears them first), so fall back rather than propagate.
            logger.exception(
                "unmark_scorecard_dispatched: atomic UPDATE failed for cycle=%s — "
                "falling back to a non-atomic merge", cycle_id,
            )
            current = self.get_by_cycle_id(cycle_id) or {}
            existing = current.get("scorecard_dispatched_to")
            if not isinstance(existing, list):
                existing = []
            remaining = [e for e in existing if (e or "").strip().lower() not in set(lowered)]
            changes: dict = {"scorecard_dispatched_to": remaining}
            if not remaining:
                changes["scorecard_dispatched_at"] = None
            return self.update_by_id("cycle_id", cycle_id, changes)
        return self.get_by_cycle_id(cycle_id)

    def clear_scorecard_dispatch(self, cycle_id: str) -> Optional[dict]:
        """Undo the dispatched marker so the scorecard config reopens and it can be
        re-sent (used by the 'redo scorecard' flow after a mistake)."""
        return self.update_by_id(
            "cycle_id",
            cycle_id,
            {"scorecard_dispatched_at": None, "scorecard_dispatched_to": None},
        )

    def set_scorecard_reminders(self, cycle_id: str, reminders: dict) -> Optional[dict]:
        """Persist ONLY ``scorecard_config -> reminders`` — the whole column is never
        read into Python, so nothing else in it can be clobbered.

        ``reminder_service._write_reminders`` probes for exactly this name and
        signature. While it was missing, every reminder save (deadline, offsets, the
        T-0 "already sent" list) fell back to read-modify-writing the WHOLE
        ``scorecard_config`` from a snapshot read a moment earlier — so a reminder save
        interleaved with a measure/team save reverted the team save, both returning
        200, and a team could vanish from every measure's ``teams`` list (or from the
        top-level ``teams`` roster) and stop being asked for a scorecard.

        ``jsonb_set`` replaces the one key inside the row's own current value, which
        under READ COMMITTED is re-read when a blocked UPDATE resumes — the same
        lost-update-proofing as ``mark_scorecard_dispatched``. COALESCE alone is not
        enough for the same reason either: a jsonb SCALAR ``null`` is not SQL NULL and
        would make ``jsonb_set`` return NULL, hence the ``jsonb_typeof(...) = 'object'``
        guard, which also catches a config stored as an array or a string."""
        sql = """
            UPDATE "cycles" SET
                "scorecard_config" = jsonb_set(
                    CASE WHEN jsonb_typeof("cycles"."scorecard_config") = 'object'
                         THEN "cycles"."scorecard_config" ELSE '{}'::jsonb END,
                    '{reminders}', %s::jsonb, true
                )
            WHERE "cycle_id" = %s
        """
        try:
            with get_pool().connection() as conn:
                conn.execute(sql, (Jsonb(dict(reminders or {})), cycle_id))
        except Exception:  # noqa: BLE001 — same rationale as mark_scorecard_dispatched
            # Losing the reminder settings outright (a silent "no deadline configured",
            # or a re-sent tier because the "sent" list never persisted) is worse than
            # losing atomicity, so fall back to the historical read-modify-write and log
            # loudly rather than degrade silently on every save.
            logger.exception(
                "set_scorecard_reminders: atomic UPDATE failed for cycle=%s — "
                "falling back to a non-atomic merge", cycle_id,
            )
            current = self.get_by_cycle_id(cycle_id) or {}
            cfg = current.get("scorecard_config")
            if not isinstance(cfg, dict):
                cfg = {}
            cfg = {**cfg, "reminders": dict(reminders or {})}
            return self.update_by_id("cycle_id", cycle_id, {"scorecard_config": cfg})
        return self.get_by_cycle_id(cycle_id)

    def mutate_scorecard_config(
        self,
        cycle_id: str,
        mutate: Callable[[dict], dict],
        updated_at: Optional[str] = None,
    ) -> Optional[dict]:
        """Read-modify-write ``scorecard_config`` under a row lock, in ONE transaction.

        For the edits that CANNOT be expressed as a single-key merge (``set_team_measures``
        rewrites every measure's ``teams`` list out of the config it just read). The pool
        is autocommit, so the plain read-then-update those paths use is a lost update: two
        VMOs editing different teams, or a reminder save racing a measure save, and the
        second writer silently reverts the first with both returning 200.

        ``SELECT ... FOR UPDATE`` holds the row for the whole duration of *mutate*, so
        *mutate* MUST be pure Python — no I/O, no further repository calls — or it
        serialises every config write in the system behind a network round-trip.

        *mutate* is handed the stored config and returns the config to store. A missing,
        SQL-NULL or jsonb-scalar-``null`` column arrives as ``{}`` so *mutate* never has
        to type-check. Returns the config as the UPDATE wrote it (not the pre-image), or
        ``None`` when the cycle does not exist.

        Deliberately NOT wrapped in the try/except fallback the two dispatch statements
        carry: there the atomic statement runs after mail has already gone out, so losing
        the marker is worse than losing atomicity. Here a failure has changed nothing yet,
        and quietly retrying as a racy read-modify-write would reintroduce the very lost
        update this method exists to prevent — let it surface."""
        with get_pool().connection() as conn:
            with conn.transaction():
                row = conn.execute(
                    'SELECT "scorecard_config" FROM "cycles" WHERE "cycle_id" = %s FOR UPDATE',
                    (cycle_id,),
                ).fetchone()
                if row is None:
                    logger.warning("mutate_scorecard_config: cycle not found — %s", cycle_id)
                    return None
                current = row[0] if isinstance(row[0], dict) else {}
                new_cfg = mutate(current)
                if updated_at is not None:
                    sql = (
                        'UPDATE "cycles" SET "scorecard_config" = %s, "updated_at" = %s '
                        'WHERE "cycle_id" = %s RETURNING "scorecard_config"'
                    )
                    params = (Jsonb(new_cfg), updated_at, cycle_id)
                else:
                    sql = (
                        'UPDATE "cycles" SET "scorecard_config" = %s '
                        'WHERE "cycle_id" = %s RETURNING "scorecard_config"'
                    )
                    params = (Jsonb(new_cfg), cycle_id)
                written = conn.execute(sql, params).fetchone()
        return written[0] if written else None

    def mark_teams_meeting_scheduled(
        self,
        cycle_id: str,
        *,
        teams_meeting_url: Optional[str],
        web_link: Optional[str],
        event_id: Optional[str],
        scheduled_at: str,
    ) -> Optional[dict]:
        """Persist the Graph-returned Teams meeting metadata on the cycle."""
        return self.update_by_id(
            "cycle_id",
            cycle_id,
            {
                "teams_meeting_url": teams_meeting_url,
                "teams_meeting_web_link": web_link,
                "teams_meeting_event_id": event_id,
                "teams_meeting_scheduled_at": scheduled_at,
            },
        )
