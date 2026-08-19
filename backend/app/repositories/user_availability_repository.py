"""
User availability — one row per (user, date), the relational child of a user.

Row shape: {"row_id", "user_id", "date", "slots": ["HH:MM-HH:MM", ...]}
`slots` is a JSONB array.
"""
from __future__ import annotations

import uuid
from typing import Optional

from app.repositories.base_repository import BaseRepository


class UserAvailabilityRepository(BaseRepository):
    table = "user_availability"
    pk = "row_id"
    columns = ("row_id", "user_id", "date", "slots")
    json_columns = frozenset({"slots"})

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
        self.insert({**row, "row_id": f"ua_{uuid.uuid4().hex}"})
        return row

    def delete_for_user(self, user_id: str) -> int:
        return self.delete_by_field("user_id", user_id)
