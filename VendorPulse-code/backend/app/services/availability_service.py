"""
Availability & conflict-detection service.

Pure deterministic logic — no LLM calls.
Future AI hook: pass structured conflict data to an LLM to suggest alternatives.
"""
from __future__ import annotations

from typing import Optional

from app.repositories.user_repository import UserRepository


def _to_minutes(t: str) -> int:
    """'HH:MM' → total minutes since midnight."""
    h, m = map(int, t.split(":"))
    return h * 60 + m


def _slots_overlap(s1: str, e1: str, s2: str, e2: str) -> bool:
    """True when [s1,e1) and [s2,e2) share at least one minute."""
    return not (_to_minutes(e1) <= _to_minutes(s2) or _to_minutes(e2) <= _to_minutes(s1))


def _slot_covers(avail_start: str, avail_end: str, req_start: str, req_end: str) -> bool:
    """True when the availability window completely covers the requested window."""
    return _to_minutes(avail_start) <= _to_minutes(req_start) and _to_minutes(avail_end) >= _to_minutes(req_end)


class AvailabilityService:
    def __init__(self, user_repo: UserRepository) -> None:
        self._user_repo = user_repo

    def _get_user_availability(self, user_id: str) -> list[dict]:
        """Fetch availability from local repo."""
        user = self._user_repo.get_by_user_id(user_id)
        return user.get("availability", []) if user else []

    # ------------------------------------------------------------------
    # Core availability checks
    # ------------------------------------------------------------------

    def is_user_available(
        self,
        user_id: str,
        date: str,
        start_time: str,
        end_time: str,
    ) -> bool:
        """
        Return True if the user has an availability window that covers
        [start_time, end_time] on *date*.
        """
        availability = self._get_user_availability(user_id)
        return self._check_availability(availability, date, start_time, end_time)

    def _check_availability(
        self,
        availability: list[dict],
        date: str,
        start_time: str,
        end_time: str,
    ) -> bool:
        day_entry = next((a for a in availability if a.get("date") == date), None)
        if day_entry is None:
            return False
        for slot_str in day_entry.get("slots", []):
            if "-" not in slot_str:
                continue
            parts = slot_str.split("-")
            if len(parts) != 2:
                continue
            s_start, s_end = parts
            if _slot_covers(s_start.strip(), s_end.strip(), start_time, end_time):
                return True
        return False

    def get_free_slots_for_user(self, user_id: str, date: str) -> list[str]:
        """Return all declared availability slots for a user on a date."""
        availability = self._get_user_availability(user_id)
        day_entry = next((a for a in availability if a.get("date") == date), None)
        return day_entry.get("slots", []) if day_entry else []

    # ------------------------------------------------------------------
    # Double-booking detection
    # ------------------------------------------------------------------

    def has_conflict(
        self,
        user_id: str,
        date: str,
        start_time: str,
        end_time: str,
        existing_meetings: list[dict],
        exclude_meeting_id: Optional[str] = None,
    ) -> bool:
        """
        Return True if *user_id* already has a non-cancelled meeting that
        overlaps [start_time, end_time] on *date*.
        """
        for meeting in existing_meetings:
            if meeting.get("status") == "cancelled":
                continue
            if exclude_meeting_id and meeting.get("meetingId") == exclude_meeting_id:
                continue

            ts = meeting.get("timeSlot", {})
            if ts.get("date") != date:
                continue

            m_start = ts.get("startTime", "")
            m_end = ts.get("endTime", "")

            if not _slots_overlap(m_start, m_end, start_time, end_time):
                continue

            # Is this user involved (and not declined)?
            is_organiser = meeting.get("organizerId") == user_id
            is_participant = any(
                p.get("userId") == user_id and p.get("status") != "declined"
                for p in meeting.get("participants", [])
            )
            if is_organiser or is_participant:
                return True

        return False

    def check_all_participants(
        self,
        participant_ids: list[str],
        date: str,
        start_time: str,
        end_time: str,
        existing_meetings: list[dict],
        exclude_meeting_id: Optional[str] = None,
    ) -> dict[str, bool]:
        """
        Return a map of userId → has_conflict for every participant.
        Used before booking to surface warnings without hard-blocking.
        """
        return {
            uid: self.has_conflict(uid, date, start_time, end_time, existing_meetings, exclude_meeting_id)
            for uid in participant_ids
        }
