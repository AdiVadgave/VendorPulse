"""Repositories for the per-meeting attendee roster.

These back the alignment / vendor-prep meeting attendee lists, which are kept
separate from the cycle's master ``attendees`` table so editing one meeting's
roster never touches the QBR / scorecard attendees.
"""
from __future__ import annotations

from app.repositories.base_repository import BaseRepository


class MeetingAttendeeRepository(BaseRepository):
    table = "meeting_attendees"
    pk = "row_id"
    columns = (
        "row_id", "cycle_id", "meeting_kind", "meeting_index",
        "stakeholder_id", "name", "email", "role", "organisation", "type",
        "is_key", "attendance_requirement", "lt_status", "shell_department", "user_id",
    )

    def get_for_meeting(self, cycle_id: str, meeting_kind: str, meeting_index: int) -> list[dict]:
        idx = int(meeting_index)
        return [
            r for r in self.find_by_field("cycle_id", cycle_id)
            if r.get("meeting_kind") == meeting_kind and int(r.get("meeting_index") or 0) == idx
        ]


class MeetingAttendeeSeedRepository(BaseRepository):
    table = "meeting_attendee_seeds"
    pk = "seed_id"
    columns = ("seed_id", "cycle_id", "meeting_kind", "meeting_index", "seeded_at")

    def is_seeded(self, seed_id: str) -> bool:
        return self.find_by_id("seed_id", seed_id) is not None
