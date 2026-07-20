"""
Vendor pushback persistence.

Two stores mirroring a relational parent/child:
  pushback_items.json      PK pushback_id   FK cycle_id
  pushback_responses.json  PK response_id   FK pushback_id
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from app.repositories.base_repository import BaseRepository


class PushbackRepository(BaseRepository):
    def __init__(self, data_dir: Path) -> None:
        super().__init__("pushback_items.json", data_dir)

    def get_for_cycle(self, cycle_id: str) -> list[dict]:
        items = self.find_by_field("cycle_id", cycle_id)
        return sorted(items, key=lambda p: (p.get("created_at") or "", p.get("pushback_id") or ""))

    def get_by_pushback_id(self, pushback_id: str) -> Optional[dict]:
        return self.find_by_id("pushback_id", pushback_id)


class PushbackResponseRepository(BaseRepository):
    def __init__(self, data_dir: Path) -> None:
        super().__init__("pushback_responses.json", data_dir)

    def get_for_pushback(self, pushback_id: str) -> list[dict]:
        return self.find_by_field("pushback_id", pushback_id)

    def delete_for_pushback(self, pushback_id: str) -> int:
        return self.delete_by_field("pushback_id", pushback_id)
