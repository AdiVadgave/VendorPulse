from __future__ import annotations

import uuid
from typing import Optional

from app.repositories.base_repository import BaseRepository


class MeetingParticipantRepository(BaseRepository):
    """Meeting participants — one row per (meeting, participant), the relational
    child of a meeting.

    `user_id` is intentionally polymorphic — a users.user_id for the generic
    meeting CRUD, or an email for the alignment/vendor-prep meetings — so it is
    a plain TEXT column with no foreign key.
    """

    table = "meeting_participants"
    pk = "row_id"
    columns = ("row_id", "meeting_id", "user_id", "status", "responded_at")

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
    """Meetings. Participants live in MeetingParticipantRepository."""

    table = "meetings"
    pk = "meeting_id"
    columns = (
        "meeting_id", "title", "description", "agenda", "organizer_id",
        "time_slot", "status", "created_at", "cycle_id", "meeting_type",
        "time_zone", "duration_minutes", "alignment_index", "teams_meeting_url", "web_link",
    )
    json_columns = frozenset({"time_slot"})

    def get_by_meeting_id(self, meeting_id: str) -> Optional[dict]:
        return self.find_by_id("meeting_id", meeting_id)

    def get_for_cycle(self, cycle_id: str) -> list[dict]:
        return self.find_by_field("cycle_id", cycle_id)

    def cancel(self, meeting_id: str) -> Optional[dict]:
        return self.update_by_id("meeting_id", meeting_id, {"status": "cancelled"})
