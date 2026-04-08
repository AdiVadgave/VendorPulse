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

    def add_booked_slot(self, user_id: str, date: str, slot: str) -> Optional[dict]:
        """Add a booked slot for *user_id* on *date*. Idempotent."""
        user = self.get_by_user_id(user_id)
        if user is None:
            return None

        booked: list[dict] = list(user.get("booked_slots", []))
        day_idx = next((i for i, b in enumerate(booked) if b.get("date") == date), None)

        if day_idx is not None:
            existing_slots: list[str] = list(booked[day_idx].get("slots", []))
            if slot not in existing_slots:
                existing_slots.append(slot)
            booked[day_idx] = {"date": date, "slots": existing_slots}
        else:
            booked.append({"date": date, "slots": [slot]})

        return self.update_by_id("userId", user_id, {"booked_slots": booked})

    def remove_booked_slot(self, user_id: str, date: str, slot: str) -> Optional[dict]:
        """Remove a specific booked slot for *user_id* on *date*."""
        user = self.get_by_user_id(user_id)
        if user is None:
            return None

        booked: list[dict] = list(user.get("booked_slots", []))
        day_idx = next((i for i, b in enumerate(booked) if b.get("date") == date), None)

        if day_idx is not None:
            existing_slots = [s for s in booked[day_idx].get("slots", []) if s != slot]
            if existing_slots:
                booked[day_idx] = {"date": date, "slots": existing_slots}
            else:
                booked.pop(day_idx)
            return self.update_by_id("userId", user_id, {"booked_slots": booked})

        return user
