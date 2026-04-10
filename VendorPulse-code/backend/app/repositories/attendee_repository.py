from __future__ import annotations

from pathlib import Path
from typing import Optional

from app.repositories.base_repository import BaseRepository


class AttendeeRepository(BaseRepository):
    def __init__(self, data_dir: Path) -> None:
        super().__init__("attendees.json", data_dir)

    def get_by_attendee_id(self, attendee_id: str) -> Optional[dict]:
        return self.find_by_id("attendee_id", attendee_id)

    def get_for_cycle(self, cycle_id: str) -> list[dict]:
        return self.find_by_field("cycle_id", cycle_id)

    def get_key_attendees(self, cycle_id: str) -> list[dict]:
        return self.find_by_predicate(
            lambda a: a.get("cycle_id") == cycle_id and a.get("is_key") is True
        )

    def mark_availability_submitted(self, attendee_id: str) -> Optional[dict]:
        return self.update_by_id("attendee_id", attendee_id, {"availability_submitted": True})

    def update_invite_status(self, attendee_id: str, status: str) -> Optional[dict]:
        return self.update_by_id("attendee_id", attendee_id, {"invite_status": status})

    def replace_attendee(
        self,
        old_attendee_id: str,
        new_attendee: dict,
        replacement_note: str,
    ) -> Optional[dict]:
        """Mark old attendee as replaced and insert a new one."""
        self.update_by_id(
            "attendee_id",
            old_attendee_id,
            {"replaced_by": new_attendee.get("name"), "replacement_note": replacement_note},
        )
        return self.insert(new_attendee)

    def delete_for_cycle(self, cycle_id: str) -> int:
        """Remove all attendees for a cycle and return how many were deleted."""
        all_records = self._read()
        kept = [r for r in all_records if r.get("cycle_id") != cycle_id]
        removed = len(all_records) - len(kept)
        self._write(kept)
        return removed
