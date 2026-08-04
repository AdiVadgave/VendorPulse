"""
Person identity — one row per human, keyed on email (the only stable natural
key; a stakeholder_id is not 1:1 with a person). Attendee identity used to be
duplicated ~5.5x across cycles; it now lives here once and `attendees`
references it by person_id.
"""
from __future__ import annotations

import uuid
from typing import Optional

from app.repositories.base_repository import BaseRepository


class PersonRepository(BaseRepository):
    table = "persons"
    pk = "person_id"
    columns = ("person_id", "email", "name", "organisation")

    def get_by_email(self, email: str) -> Optional[dict]:
        if not email:
            return None
        # Index-backed lookup (unique index on lower(email)) — no full-table scan.
        rows = self._select(' WHERE lower("email") = %s', (email.strip().lower(),))
        return rows[0] if rows else None

    def upsert(
        self,
        email: str,
        name: Optional[str] = None,
        organisation: Optional[str] = None,
    ) -> dict:
        """Return the person for this email, creating one if absent. On an
        existing row, backfill a blank name/organisation if a value is now
        available (never overwrite a non-empty value)."""
        existing = self.get_by_email(email)
        if existing:
            patch = {}
            if name and not (existing.get("name") or ""):
                patch["name"] = name
            if organisation and not (existing.get("organisation") or ""):
                patch["organisation"] = organisation
            if patch:
                updated = self.update_by_id("person_id", existing["person_id"], patch)
                return updated or existing
            return existing
        person = {
            "person_id": f"per_{uuid.uuid4().hex}",
            "email": email.strip(),
            "name": name,
            "organisation": organisation,
        }
        self.insert(person)
        return person
