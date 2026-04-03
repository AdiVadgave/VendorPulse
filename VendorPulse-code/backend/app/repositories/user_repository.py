from __future__ import annotations

from pathlib import Path
from typing import Optional

from app.repositories.base_repository import BaseRepository


class UserRepository(BaseRepository):
    def __init__(self, data_dir: Path) -> None:
        super().__init__("users.json", data_dir)

    # Convenience wrappers with typed signatures

    def get_by_user_id(self, user_id: str) -> Optional[dict]:
        return self.find_by_id("userId", user_id)

    def get_by_email(self, email: str) -> Optional[dict]:
        return next(
            (u for u in self.find_all() if u.get("email", "").lower() == email.lower()),
            None,
        )

    def update_availability(self, user_id: str, date: str, slots: list[str]) -> Optional[dict]:
        """Replace (or insert) the availability entry for *date*."""
        user = self.get_by_user_id(user_id)
        if user is None:
            return None

        availability: list[dict] = user.get("availability", [])
        existing_idx = next((i for i, a in enumerate(availability) if a.get("date") == date), None)

        if existing_idx is not None:
            availability[existing_idx]["slots"] = slots
        else:
            availability.append({"date": date, "slots": slots})

        return self.update_by_id("userId", user_id, {"availability": availability})
