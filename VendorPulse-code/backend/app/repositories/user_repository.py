from __future__ import annotations

from typing import Optional

from app.repositories.base_repository import BaseRepository


class UserRepository(BaseRepository):
    table = "users"
    pk = "user_id"
    columns = ("user_id", "name", "email", "role", "organisation", "avatar", "created_at")

    def get_by_user_id(self, user_id: str) -> Optional[dict]:
        return self.find_by_id("user_id", user_id)

    def get_by_email(self, email: str) -> Optional[dict]:
        if not email:
            return None
        # Index-backed lookup (index on lower(email)) — no full-table scan.
        rows = self._select(' WHERE lower("email") = %s', (email.strip().lower(),))
        return rows[0] if rows else None

    def search(self, query: str) -> list[dict]:
        """Search users by name, email, or organisation (case-insensitive substring)."""
        like = f"%{query.lower()}%"
        return self._select(
            ' WHERE lower("name") LIKE %s OR lower("email") LIKE %s OR lower("organisation") LIKE %s',
            (like, like, like),
        )
