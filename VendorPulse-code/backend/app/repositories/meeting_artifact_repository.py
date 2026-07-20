"""
Meeting artifacts — the parsed transcript notes and generated minutes for a meeting.

One document per (cycle_id, meeting_id) so the Meeting tab can restore its parsed
state after a refresh (transcript shows as already parsed; minutes are not
regenerated). `notes` and `minutes` are JSON blobs (jsonb in Postgres).

Row shape: {artifact_id, cycle_id, meeting_id, notes: [...], minutes: {...}|null,
            parsed_at, minutes_generated_at}
"""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Optional

from app.repositories.base_repository import BaseRepository


class MeetingArtifactRepository(BaseRepository):
    def __init__(self, data_dir: Path) -> None:
        super().__init__("meeting_artifacts.json", data_dir)

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
