"""
User availability — one row per (user, date), the relational child of a user.

Previously an in-place-mutated nested array inside each users.json record; now its
own store so it maps cleanly to a `user_availability` child table in Postgres.

Row shape: {"user_id": str, "date": "YYYY-MM-DD", "slots": ["HH:MM-HH:MM", ...]}
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from app.repositories.base_repository import BaseRepository


class UserAvailabilityRepository(BaseRepository):
    def __init__(self, data_dir: Path) -> None:
        super().__init__("user_availability.json", data_dir)

    def get_for_user(self, user_id: str) -> list[dict]:
        """All {date, slots} entries for a user, ordered by date."""
        rows = self.find_by_field("user_id", user_id)
        return sorted(
            [{"date": r.get("date"), "slots": r.get("slots", [])} for r in rows],
            key=lambda a: a.get("date") or "",
        )

    def upsert(self, user_id: str, date: str, slots: list[str]) -> dict:
        """Replace (or insert) the availability row for (user_id, date)."""
        existing: Optional[dict] = next(
            (r for r in self.find_by_field("user_id", user_id) if r.get("date") == date),
            None,
        )
        row = {"user_id": user_id, "date": date, "slots": slots}
        if existing:
            self.replace_by_id("row_id", existing["row_id"], {**row, "row_id": existing["row_id"]})
            return row
        import uuid
        self.insert({**row, "row_id": f"ua_{uuid.uuid4().hex}"})
        return row

    def delete_for_user(self, user_id: str) -> int:
        return self.delete_by_field("user_id", user_id)
