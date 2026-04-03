from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from app.models.user import UserCreate, UserUpdate
from app.repositories.user_repository import UserRepository


class UserService:
    def __init__(self, repo: UserRepository) -> None:
        self._repo = repo

    def list_users(self) -> list[dict]:
        return self._repo.find_all()

    def get_user(self, user_id: str) -> Optional[dict]:
        return self._repo.get_by_user_id(user_id)

    def create_user(self, payload: UserCreate) -> dict:
        if self._repo.get_by_email(payload.email):
            raise ValueError(f"A user with email '{payload.email}' already exists")

        initials = "".join(p[0] for p in payload.name.split() if p).upper()[:2]
        user = {
            "userId": f"u{uuid.uuid4().hex[:8]}",
            "name": payload.name,
            "email": payload.email,
            "role": payload.role,
            "avatar": initials,
            "availability": [],
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        return self._repo.insert(user)

    def update_user(self, user_id: str, payload: UserUpdate) -> Optional[dict]:
        updates = payload.model_dump(exclude_none=True)
        if not updates:
            return self._repo.get_by_user_id(user_id)
        return self._repo.update_by_id("userId", user_id, updates)

    def update_availability(self, user_id: str, date: str, slots: list[str]) -> Optional[dict]:
        return self._repo.update_availability(user_id, date, slots)

    def get_availability(self, user_id: str) -> Optional[dict]:
        user = self._repo.get_by_user_id(user_id)
        if user is None:
            return None
        return {
            "userId": user["userId"],
            "name": user["name"],
            "availability": user.get("availability", []),
        }

    def get_user_meetings(self, user_id: str, meeting_repo) -> list[dict]:
        return meeting_repo.get_for_user(user_id)
