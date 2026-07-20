"""
Scorecard persistence — the internal-stakeholder submissions and the admin-adjusted
"final" snapshot.

These two stores were previously instantiated ad-hoc inside the route module, which
meant the single most business-critical data in the app bypassed the repository layer
that the JSON→Postgres migration hinges on. They now live here like every other
entity, so migrating this layer covers them too.

Tables (future Postgres):
  scorecard_submissions  PK submission_id   FK cycle_id, attendee_id
  scorecard_final        PK cycle_id        (one point-in-time snapshot per cycle)
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from app.repositories.base_repository import BaseRepository


class ScorecardSubmissionRepository(BaseRepository):
    """One row per (cycle, attendee): the scores/RAG/comments a reviewer submitted."""

    def __init__(self, data_dir: Path) -> None:
        super().__init__("scorecard_submissions.json", data_dir)

    def get_for_cycle(self, cycle_id: str) -> list[dict]:
        return self.find_by_field("cycle_id", cycle_id)

    def get_by_cycle_and_attendee(self, cycle_id: str, attendee_id: str) -> Optional[dict]:
        return next(
            (s for s in self.get_for_cycle(cycle_id) if s.get("attendee_id") == attendee_id),
            None,
        )

    def delete_for_cycle_attendee(self, cycle_id: str, attendee_id: str) -> int:
        """Remove an attendee's submission(s) for a cycle; return how many were removed."""
        matches = [
            s for s in self.get_for_cycle(cycle_id)
            if s.get("attendee_id") == attendee_id
        ]
        for s in matches:
            self.delete_by_id("submission_id", s.get("submission_id"))
        return len(matches)


class FinalScorecardRepository(BaseRepository):
    """The admin-adjusted final scorecard — at most one snapshot per cycle."""

    def __init__(self, data_dir: Path) -> None:
        super().__init__("scorecard_final.json", data_dir)

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
