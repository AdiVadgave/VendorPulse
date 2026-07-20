from __future__ import annotations

import uuid
from pathlib import Path
from typing import Optional

from app.repositories.base_repository import BaseRepository


class MeetingParticipantRepository(BaseRepository):
    """Meeting participants — one row per (meeting, participant), the relational
    child of a meeting. Previously an in-place-mutated nested array on each meeting
    record; now its own store so it maps to a `meeting_participants` table.

    Row shape: {"row_id", "meeting_id", "user_id", "status", "responded_at"}.
    (`user_id` holds whatever identifier the caller uses — a users.json id for the
    generic meeting CRUD, or an email for the alignment/vendor-prep meetings.)
    """

    def __init__(self, data_dir: Path) -> None:
        super().__init__("meeting_participants.json", data_dir)

    def get_for_meeting(self, meeting_id: str) -> list[dict]:
        return self.find_by_field("meeting_id", meeting_id)

    def set_for_meeting(self, meeting_id: str, participant_ids: list[str], status: str = "pending") -> list[dict]:
        """Replace all participant rows for a meeting with the given ids."""
        self.delete_by_field("meeting_id", meeting_id)
        rows = []
        for uid in participant_ids:
            row = {
                "row_id": f"mp_{uuid.uuid4().hex}",
                "meeting_id": meeting_id,
                "user_id": uid,
                "status": status,
                "responded_at": None,
            }
            self.insert(row)
            rows.append(row)
        return rows

    def update_status(self, meeting_id: str, user_id: str, status: str, responded_at: str) -> Optional[dict]:
        row = next(
            (r for r in self.get_for_meeting(meeting_id) if r.get("user_id") == user_id),
            None,
        )
        if row is None:
            return None
        return self.update_by_id("row_id", row["row_id"], {"status": status, "responded_at": responded_at})

    def user_meeting_ids(self, user_id: str) -> set[str]:
        return {r.get("meeting_id") for r in self.find_by_field("user_id", user_id)}

    def delete_for_meeting(self, meeting_id: str) -> int:
        return self.delete_by_field("meeting_id", meeting_id)


class MeetingRepository(BaseRepository):
    """Meetings (snake_case). Participants live in MeetingParticipantRepository."""

    def __init__(self, data_dir: Path) -> None:
        super().__init__("meetings.json", data_dir)

    def get_by_meeting_id(self, meeting_id: str) -> Optional[dict]:
        return self.find_by_id("meeting_id", meeting_id)

    def get_for_cycle(self, cycle_id: str) -> list[dict]:
        return self.find_by_field("cycle_id", cycle_id)

    def cancel(self, meeting_id: str) -> Optional[dict]:
        return self.update_by_id("meeting_id", meeting_id, {"status": "cancelled"})
