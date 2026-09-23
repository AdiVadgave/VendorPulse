"""
Scorecard persistence — internal-stakeholder submissions + the admin-adjusted
"final" snapshot.

Tables:
  scorecard_submissions  PK submission_id   FK cycle_id -> cycles
  scorecard_final        PK cycle_id        (one snapshot per cycle)

The denormalized respondent_email / respondent_name / team fields are NOT
stored — the app always re-derives them from the live attendee record, so they
were pure duplication. `scores`/`comments`/`rag`/skipped-* are JSONB.
"""
from __future__ import annotations

from typing import Optional

from app.db.pool import get_pool
from app.repositories.base_repository import BaseRepository


class ScorecardSubmissionRepository(BaseRepository):
    """One row per (cycle, attendee): the scores/RAG/comments a reviewer submitted."""

    table = "scorecard_submissions"
    pk = "submission_id"
    columns = (
        "submission_id", "cycle_id", "attendee_id", "scores", "rag_scores",
        "comments", "skipped_measures", "skipped_themes", "submitted_at",
    )
    json_columns = frozenset({"scores", "rag_scores", "comments", "skipped_measures", "skipped_themes"})

    def get_for_cycle(self, cycle_id: str) -> list[dict]:
        return self.find_by_field("cycle_id", cycle_id)

    def insert_if_absent(self, record: dict) -> bool:
        """Insert unless this (cycle_id, attendee_id) already has a row.

        Returns True when the row was written, False when one was already there.

        The route's check-then-insert straddles the AI redaction call — seconds of
        wall clock on an autocommit pool — so two tabs, or a double click, could both
        pass it and write two columns that are then silently double-counted in every
        average. This makes the DATABASE the arbiter, backed by the
        UNIQUE (cycle_id, attendee_id) index `subs_cycle_attendee_uq` (see
        app/db/schema.py).

        The conflict target is deliberately left off: `ON CONFLICT DO NOTHING` with no
        target needs no particular index to exist, so on a database where the
        self-healing index migration could not run this degrades to exactly today's
        behaviour instead of failing every submission. The only unique constraints on
        this table are the uuid primary key, the BIGSERIAL `seq` and that index, so
        nothing else can be absorbed here."""
        cols = [c for c in self.columns if c in record]
        values = [self._adapt(c, record[c]) for c in cols]
        collist = ", ".join(f'"{c}"' for c in cols)
        placeholders = ", ".join(["%s"] * len(cols))
        with get_pool().connection() as conn:
            cur = conn.execute(
                f'INSERT INTO "{self.table}" ({collist}) VALUES ({placeholders}) '
                "ON CONFLICT DO NOTHING",
                values,
            )
            return cur.rowcount > 0

    def get_by_cycle_and_attendee(self, cycle_id: str, attendee_id: str) -> Optional[dict]:
        return next(
            (s for s in self.get_for_cycle(cycle_id) if s.get("attendee_id") == attendee_id),
            None,
        )

    def delete_for_cycle_attendee(self, cycle_id: str, attendee_id: str) -> int:
        matches = [
            s for s in self.get_for_cycle(cycle_id) if s.get("attendee_id") == attendee_id
        ]
        for s in matches:
            self.delete_by_id("submission_id", s.get("submission_id"))
        return len(matches)


class FinalScorecardRepository(BaseRepository):
    """The admin-adjusted final scorecard — at most one snapshot per cycle."""

    table = "scorecard_final"
    pk = "cycle_id"
    columns = ("cycle_id", "categories", "overall_score", "note", "updated_at", "computed_at")
    json_columns = frozenset({"categories"})

    def get_for_cycle(self, cycle_id: str) -> Optional[dict]:
        return self.find_by_id("cycle_id", cycle_id)

    def upsert(self, cycle_id: str, record: dict) -> dict:
        """Insert or overwrite the single final snapshot for a cycle."""
        if self.find_by_id("cycle_id", cycle_id):
            self.replace_by_id("cycle_id", cycle_id, record)
        else:
            self.insert(record)
        return record

    def delete_for_cycle(self, cycle_id: str) -> bool:
        return self.delete_by_id("cycle_id", cycle_id)
