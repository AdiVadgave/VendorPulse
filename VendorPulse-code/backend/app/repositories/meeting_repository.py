from __future__ import annotations

from pathlib import Path
from typing import Optional

from app.repositories.base_repository import BaseRepository


class MeetingRepository(BaseRepository):
    def __init__(self, data_dir: Path) -> None:
        super().__init__("meetings.json", data_dir)

    def get_by_meeting_id(self, meeting_id: str) -> Optional[dict]:
        return self.find_by_id("meetingId", meeting_id)

    def get_for_user(self, user_id: str) -> list[dict]:
        """All non-cancelled meetings where user is organiser or participant."""
        return self.find_by_predicate(
            lambda m: (
                m.get("organizerId") == user_id
                or any(p.get("userId") == user_id for p in m.get("participants", []))
            )
        )

    def get_for_cycle(self, cycle_id: str) -> list[dict]:
        return self.find_by_field("cycleId", cycle_id)

    def update_participant_status(
        self, meeting_id: str, user_id: str, status: str, responded_at: str
    ) -> Optional[dict]:
        meeting = self.get_by_meeting_id(meeting_id)
        if meeting is None:
            return None

        participants = meeting.get("participants", [])
        pidx = next((i for i, p in enumerate(participants) if p.get("userId") == user_id), None)
        if pidx is None:
            return None

        participants[pidx]["status"] = status
        participants[pidx]["respondedAt"] = responded_at
        return self.update_by_id("meetingId", meeting_id, {"participants": participants})

    def cancel(self, meeting_id: str) -> Optional[dict]:
        return self.update_by_id("meetingId", meeting_id, {"status": "cancelled"})
