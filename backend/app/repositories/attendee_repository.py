"""
Attendees — a cycle↔person junction.

Person identity (name/email/organisation) is NOT stored here; it lives
once in `persons` and is referenced by `person_id`. This repository keeps the
dict-in/dict-out contract intact: on write it decomposes the incoming "fat"
attendee dict (upserting the person by email), and on read it reconstructs the
person fields by joining `persons`, so services and routes see the same shape
they always did.
"""
from __future__ import annotations

from typing import Optional

from app.repositories.base_repository import BaseRepository
from app.repositories.person_repository import PersonRepository

# Fields that belong to the person, not the attendee row.
_PERSON_FIELDS = ("name", "email", "organisation")


class AttendeeRepository(BaseRepository):
    table = "attendees"
    pk = "attendee_id"
    columns = (
        "attendee_id", "cycle_id", "person_id", "stakeholder_id", "role", "type",
        "is_key", "attendance_requirement", "lt_status", "shell_department",
        "invite_status", "availability_submitted", "user_id", "replaced_by",
        "replaced_by_email", "replacement_note", "confirmation_status", "confirmation_note",
        "outreach_message_id", "outreach_conversation_id", "outreach_sent_at",
    )

    def __init__(self, person_repo: PersonRepository, data_dir=None) -> None:
        super().__init__(data_dir)
        self._person_repo = person_repo

    # ── read: reconstruct person fields ──────────────────────────────────────
    def _enrich(self, rows: list[dict]) -> list[dict]:
        if not rows:
            return rows
        people = {p["person_id"]: p for p in self._person_repo.find_all()}
        enriched = []
        for a in rows:
            p = people.get(a.get("person_id")) or {}
            enriched.append({**a, **{f: p.get(f) for f in _PERSON_FIELDS}})
        return enriched

    def find_all(self) -> list[dict]:
        return self._enrich(super().find_all())

    def find_by_id(self, id_field: str, id_value) -> Optional[dict]:
        row = super().find_by_id(id_field, id_value)
        return self._enrich([row])[0] if row else None

    def find_by_field(self, field: str, value) -> list[dict]:
        return self._enrich(super().find_by_field(field, value))

    # ── write: decompose the fat dict ────────────────────────────────────────
    def insert(self, record: dict) -> dict:
        person_id = record.get("person_id")
        email = record.get("email")
        if email:
            person = self._person_repo.upsert(
                email, record.get("name"), record.get("organisation")
            )
            person_id = person["person_id"]
        row = {c: record.get(c) for c in self.columns if c in record}
        row["person_id"] = person_id
        super().insert(row)
        return {**record, "person_id": person_id}

    def update_by_id(self, id_field: str, id_value, updates: dict) -> Optional[dict]:
        person_updates = {k: v for k, v in updates.items() if k in _PERSON_FIELDS}
        attendee_updates = {k: v for k, v in updates.items() if k in self.columns}
        if attendee_updates:
            super().update_by_id(id_field, id_value, attendee_updates)
        if person_updates:
            current = super().find_by_id(id_field, id_value)
            if current and current.get("person_id"):
                self._person_repo.update_by_id("person_id", current["person_id"], person_updates)
        return self.find_by_id(id_field, id_value)

    # ── convenience API (unchanged signatures) ───────────────────────────────
    def get_by_attendee_id(self, attendee_id: str) -> Optional[dict]:
        return self.find_by_id("attendee_id", attendee_id)

    def get_for_cycle(self, cycle_id: str) -> list[dict]:
        return self.find_by_field("cycle_id", cycle_id)

    def get_key_attendees(self, cycle_id: str) -> list[dict]:
        return self.find_by_predicate(
            lambda a: a.get("cycle_id") == cycle_id and a.get("is_key") is True
        )

    def mark_availability_submitted(self, attendee_id: str) -> Optional[dict]:
        return self.update_by_id("attendee_id", attendee_id, {"availability_submitted": True})

    def update_invite_status(self, attendee_id: str, status: str) -> Optional[dict]:
        return self.update_by_id("attendee_id", attendee_id, {"invite_status": status})

    def replace_attendee(
        self,
        old_attendee_id: str,
        new_attendee: dict,
        replacement_note: str,
    ) -> Optional[dict]:
        """Mark old attendee as replaced and insert a new one."""
        self.update_by_id(
            "attendee_id",
            old_attendee_id,
            {"replaced_by": new_attendee.get("name"), "replacement_note": replacement_note},
        )
        return self.insert(new_attendee)

    def delete_for_cycle(self, cycle_id: str) -> int:
        """Remove all attendees for a cycle and return how many were deleted."""
        return self.delete_by_field("cycle_id", cycle_id)
