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
