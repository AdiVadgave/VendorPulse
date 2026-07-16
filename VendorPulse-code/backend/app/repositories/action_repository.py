from __future__ import annotations

from pathlib import Path

from app.repositories.base_repository import BaseRepository


class ActionRepository(BaseRepository):
    """Persistent store for the cross-meeting action queue (action_items.json)."""

    def __init__(self, data_dir: Path) -> None:
        super().__init__("action_items.json", data_dir)

    def get_for_cycle(self, cycle_id: str) -> list[dict]:
        items = self.find_by_field("cycle_id", cycle_id)
        # Stable order: creation time, then id, so the queue reads the same every load.
        return sorted(items, key=lambda a: (a.get("created_at") or "", a.get("action_id") or ""))

    def get_by_action_id(self, action_id: str) -> dict | None:
        return self.find_by_id("action_id", action_id)
