"""
Vendor pushback persistence.

Two tables mirroring a relational parent/child:
  pushback_items      PK pushback_id   FK cycle_id     -> cycles
  pushback_responses  PK response_id   FK pushback_id  -> pushback_items (cascade)
"""
from __future__ import annotations

from typing import Optional

from app.repositories.base_repository import BaseRepository


class PushbackRepository(BaseRepository):
    table = "pushback_items"
    pk = "pushback_id"
    columns = (
        "pushback_id", "cycle_id", "category", "description", "raised_by",
        "needs_legal_review", "status", "created_at", "updated_at",
    )

    def get_for_cycle(self, cycle_id: str) -> list[dict]:
        items = self.find_by_field("cycle_id", cycle_id)
        return sorted(items, key=lambda p: (p.get("created_at") or "", p.get("pushback_id") or ""))

    def get_by_pushback_id(self, pushback_id: str) -> Optional[dict]:
        return self.find_by_id("pushback_id", pushback_id)


class PushbackResponseRepository(BaseRepository):
    table = "pushback_responses"
    pk = "response_id"
    columns = ("response_id", "pushback_id", "stance", "content", "is_selected")

    def get_for_pushback(self, pushback_id: str) -> list[dict]:
        return self.find_by_field("pushback_id", pushback_id)

    def delete_for_pushback(self, pushback_id: str) -> int:
        return self.delete_by_field("pushback_id", pushback_id)
