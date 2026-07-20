from __future__ import annotations

from typing import Optional

from app.repositories.base_repository import BaseRepository


class UserRepository(BaseRepository):
    table = "users"
    pk = "user_id"
    columns = ("user_id", "name", "email", "role", "organisation", "gmail", "avatar", "created_at")

    def get_by_user_id(self, user_id: str) -> Optional[dict]:
        return self.find_by_id("user_id", user_id)

    def get_by_email(self, email: str) -> Optional[dict]:
        return next(
            (u for u in self.find_all() if (u.get("email") or "").lower() == email.lower()),
            None,
        )

    def search(self, query: str) -> list[dict]:
        """Search users by name, email, or organisation."""
        q = query.lower()
        return self.find_by_predicate(
            lambda u: q in (u.get("name") or "").lower()
            or q in (u.get("email") or "").lower()
            or q in (u.get("organisation") or "").lower()
        )
