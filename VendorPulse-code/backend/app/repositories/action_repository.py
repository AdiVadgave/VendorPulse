from __future__ import annotations

from app.repositories.base_repository import BaseRepository


class ActionRepository(BaseRepository):
    """Persistent store for the cross-meeting action queue (action_items)."""

    table = "action_items"
    pk = "action_id"
    columns = (
        "action_id", "cycle_id", "description", "owner", "due_date",
        "source", "status", "origin", "details", "created_at", "updated_at",
    )

    def get_for_cycle(self, cycle_id: str) -> list[dict]:
        items = self.find_by_field("cycle_id", cycle_id)
        # Stable order: creation time, then id, so the queue reads the same every load.
        return sorted(items, key=lambda a: (a.get("created_at") or "", a.get("action_id") or ""))

    def get_by_action_id(self, action_id: str) -> dict | None:
        return self.find_by_id("action_id", action_id)
