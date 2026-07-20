"""
Meeting artifacts — parsed transcript notes + generated minutes for a meeting.

One row per (cycle_id, meeting_id) so the Meeting tab restores its parsed state
after a refresh. `notes` and `minutes` are JSONB.
"""
from __future__ import annotations

import uuid
from typing import Optional

from app.repositories.base_repository import BaseRepository


class MeetingArtifactRepository(BaseRepository):
    table = "meeting_artifacts"
    pk = "artifact_id"
    columns = (
        "artifact_id", "cycle_id", "meeting_id", "notes", "minutes",
        "parsed_at", "minutes_generated_at",
    )
    json_columns = frozenset({"notes", "minutes"})

    def get(self, cycle_id: str, meeting_id: str) -> Optional[dict]:
        return next(
            (r for r in self.find_by_field("cycle_id", cycle_id) if r.get("meeting_id") == meeting_id),
            None,
        )

    def upsert(self, cycle_id: str, meeting_id: str, patch: dict) -> dict:
        existing = self.get(cycle_id, meeting_id)
        if existing:
            return self.update_by_id("artifact_id", existing["artifact_id"], patch)
        record = {
            "artifact_id": f"ma_{uuid.uuid4().hex}",
            "cycle_id": cycle_id,
            "meeting_id": meeting_id,
            "notes": [],
            "minutes": None,
            "parsed_at": None,
            "minutes_generated_at": None,
            **patch,
        }
        return self.insert(record)

    def delete_for_cycle(self, cycle_id: str) -> int:
        return self.delete_by_field("cycle_id", cycle_id)
