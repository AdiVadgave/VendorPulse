from __future__ import annotations

from typing import Optional

from app.repositories.base_repository import BaseRepository


class SlotRepository(BaseRepository):
    table = "slot_proposals"
    pk = "slot_id"
    columns = (
        "slot_id", "cycle_id", "proposed_time", "proposed_time_zone", "duration_minutes",
        "organiser_available", "exec_sponsor_available", "rank_score", "is_approved",
        "attendance_count", "total_attendees", "conflict_count", "attending", "conflicts",
        "approved_by", "approved_at", "tentative", "ranking_rationale",
    )
    json_columns = frozenset({"attending", "conflicts", "tentative"})

    def get_by_slot_id(self, slot_id: str) -> Optional[dict]:
        return self.find_by_id("slot_id", slot_id)

    def get_for_cycle(self, cycle_id: str) -> list[dict]:
        return self.find_by_field("cycle_id", cycle_id)

    def get_approved_for_cycle(self, cycle_id: str) -> Optional[dict]:
        return next(
            (s for s in self.find_by_field("cycle_id", cycle_id) if s.get("is_approved") is True),
            None,
        )

    def approve(
        self,
        slot_id: str,
        approved_by: str,
        approved_at: str,
        time_zone: Optional[str] = None,
    ) -> Optional[dict]:
        updates: dict = {"is_approved": True, "approved_by": approved_by, "approved_at": approved_at}
        if time_zone:
            # Persist as proposed_time_zone so both UI and Graph invite creation can use it.
            updates["proposed_time_zone"] = time_zone
        return self.update_by_id("slot_id", slot_id, updates)

    def clear_for_cycle(self, cycle_id: str) -> None:
        """Remove all existing proposals for a cycle before inserting new ones."""
        self.delete_by_field("cycle_id", cycle_id)
