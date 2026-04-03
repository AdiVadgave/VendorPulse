from __future__ import annotations

from pathlib import Path
from typing import Optional

from app.repositories.base_repository import BaseRepository


class SlotRepository(BaseRepository):
    def __init__(self, data_dir: Path) -> None:
        super().__init__("slot_proposals.json", data_dir)

    def get_by_slot_id(self, slot_id: str) -> Optional[dict]:
        return self.find_by_id("slot_id", slot_id)

    def get_for_cycle(self, cycle_id: str) -> list[dict]:
        return self.find_by_field("cycle_id", cycle_id)

    def get_approved_for_cycle(self, cycle_id: str) -> Optional[dict]:
        return next(
            (
                s
                for s in self.find_by_field("cycle_id", cycle_id)
                if s.get("is_approved") is True
            ),
            None,
        )

    def approve(self, slot_id: str, approved_by: str, approved_at: str) -> Optional[dict]:
        return self.update_by_id(
            "slot_id",
            slot_id,
            {"is_approved": True, "approved_by": approved_by, "approved_at": approved_at},
        )

    def clear_for_cycle(self, cycle_id: str) -> None:
        """Remove all existing proposals for a cycle before inserting new ones."""
        all_records = self._read()
        kept = [r for r in all_records if r.get("cycle_id") != cycle_id]
        self._write(kept)
