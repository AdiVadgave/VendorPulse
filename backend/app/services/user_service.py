from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from app.models.user import UserCreate, UserUpdate
from app.repositories.user_availability_repository import UserAvailabilityRepository
from app.repositories.user_repository import UserRepository


class UserService:
    def __init__(self, repo: UserRepository, availability_repo: UserAvailabilityRepository) -> None:
        self._repo = repo
        self._availability = availability_repo

    def list_users(self, query: Optional[str] = None) -> list[dict]:
        if query:
            return self._repo.search(query)
        return self._repo.find_all()

    def get_user(self, user_id: str) -> Optional[dict]:
        return self._repo.get_by_user_id(user_id)

    def create_user(self, payload: UserCreate) -> dict:
        if self._repo.get_by_email(payload.email):
            raise ValueError(f"A user with email '{payload.email}' already exists")

        initials = "".join(p[0] for p in payload.name.split() if p).upper()[:2]
        user = {
            "user_id": f"u{uuid.uuid4().hex}",
            "name": payload.name,
            "email": payload.email,
            "role": payload.role,
            "organisation": payload.organisation or "",
            "avatar": initials,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        return self._repo.insert(user)

    def update_user(self, user_id: str, payload: UserUpdate) -> Optional[dict]:
        updates = payload.model_dump(exclude_none=True)
        if not updates:
            return self._repo.get_by_user_id(user_id)
        return self._repo.update_by_id("user_id", user_id, updates)

    def delete_user(self, user_id: str) -> bool:
        self._availability.delete_for_user(user_id)  # cascade
        return self._repo.delete_by_id("user_id", user_id)

    def update_availability(self, user_id: str, date: str, slots: list[str]) -> list[dict]:
        self._availability.upsert(user_id, date, slots)
        return self._availability.get_for_user(user_id)

    def get_availability(self, user_id: str) -> Optional[dict]:
        user = self._repo.get_by_user_id(user_id)
        if user is None:
            return None
        return {
            "user_id": user["user_id"],
            "name": user["name"],
            "availability": self._availability.get_for_user(user_id),
        }

    def get_user_meetings(self, user_id: str, meeting_repo, participant_repo) -> list[dict]:
        """Meetings where the user is organiser or a (non-cancelled) participant."""
        meeting_ids = participant_repo.user_meeting_ids(user_id)
        return [
            m for m in meeting_repo.find_all()
            if m.get("organizer_id") == user_id or m.get("meeting_id") in meeting_ids
        ]
