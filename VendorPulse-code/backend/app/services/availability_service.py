"""
Availability & conflict-detection service.

Slot model (updated):
  Users no longer declare explicit availability windows. Instead, ALL
  business-hour slots (09:00–17:00) are treated as available by default.
  Only BOOKED slots (meetings already scheduled) block a user.

  A user is available for [start, end] on <date> when:
    1. [start, end] falls within business hours.
    2. No entry in user.booked_slots overlaps [start, end] on <date>.

Legacy "availability" windows (if still present in the JSON) are ignored by
this service so that a simple data migration (add booked_slots: []) is all
that is required — no destructive changes to existing records.

Future AI hook: pass structured conflict data to an LLM to suggest alternatives.

When a TeamsBackendClient is injected (use_teams_backend=True) availability
data is read from the Teams backend instead of the local users.json so that
there is one authoritative source.
"""
from __future__ import annotations

from typing import Optional

from app.config import settings
from app.repositories.user_repository import UserRepository


def _to_minutes(t: str) -> int:
    """'HH:MM' → total minutes since midnight."""
    h, m = map(int, t.split(":"))
    return h * 60 + m


def _slots_overlap(s1: str, e1: str, s2: str, e2: str) -> bool:
    """True when [s1,e1) and [s2,e2) share at least one minute."""
    return not (_to_minutes(e1) <= _to_minutes(s2) or _to_minutes(e2) <= _to_minutes(s1))


def _within_business_hours(start_time: str, end_time: str) -> bool:
    """True when the entire [start, end] window is within business hours."""
    biz_start = f"{settings.scheduling_business_start_hour:02d}:00"
    biz_end = f"{settings.scheduling_business_end_hour:02d}:00"
    return (
        _to_minutes(biz_start) <= _to_minutes(start_time)
        and _to_minutes(end_time) <= _to_minutes(biz_end)
    )


class AvailabilityService:
    def __init__(self, user_repo: UserRepository, teams_client=None) -> None:
        self._user_repo = user_repo
        self._teams = teams_client  # optional TeamsBackendClient
        self._user_cache: dict[str, dict | None] = {}

    def _get_user(self, user_id: str) -> dict | None:
        """Fetch user record from Teams backend if configured, else local repo.

        Results are cached for the lifetime of this service instance so that
        slot-ranking loops (which check the same users hundreds of times) do
        not issue a separate HTTP request per slot.
        """
        if user_id in self._user_cache:
            return self._user_cache[user_id]
        if self._teams is not None:
            user = self._teams.get_user(user_id)
        else:
            user = self._user_repo.get_by_user_id(user_id)
        self._user_cache[user_id] = user
        return user

    # ------------------------------------------------------------------
    # Core availability check (booked-slots model)
    # ------------------------------------------------------------------

    def is_user_available(
        self,
        user_id: str,
        date: str,
        start_time: str,
        end_time: str,
    ) -> bool:
        """
        Return True if the user is free for [start_time, end_time] on *date*.

        Rule: available = within business hours AND not booked at that time.
        """
        # Business-hours check
        if not _within_business_hours(start_time, end_time):
            return False

        user = self._get_user(user_id)
        if user is None:
            return False

        # booked_slots model: blocked if any booking overlaps the requested window
        booked = user.get("booked_slots", [])
        day_entry = next((b for b in booked if b.get("date") == date), None)
        if day_entry:
            for slot_str in day_entry.get("slots", []):
                if "-" not in slot_str:
                    continue
                parts = slot_str.split("-", 1)
                if len(parts) != 2:
                    continue
                b_start, b_end = parts[0].strip(), parts[1].strip()
                if _slots_overlap(b_start, b_end, start_time, end_time):
                    return False

        return True

    def get_free_slots_for_user(self, user_id: str, date: str) -> list[str]:
        """
        Return all 1-hour business-hour slots that are not booked for a user on *date*.
        Slots are returned as 'HH:MM-HH:MM' strings.
        """
        user = self._get_user(user_id)
        if user is None:
            return []

        booked = user.get("booked_slots", [])
        day_booked = next((b for b in booked if b.get("date") == date), None)
        booked_slots = day_booked.get("slots", []) if day_booked else []

        free: list[str] = []
        biz_start = settings.scheduling_business_start_hour
        biz_end = settings.scheduling_business_end_hour

        h = biz_start
        while h < biz_end:
            slot_start = f"{h:02d}:00"
            slot_end = f"{h + 1:02d}:00"
            # Check not booked
            blocked = False
            for slot_str in booked_slots:
                if "-" not in slot_str:
                    continue
                parts = slot_str.split("-", 1)
                if len(parts) != 2:
                    continue
                b_start, b_end = parts[0].strip(), parts[1].strip()
                if _slots_overlap(b_start, b_end, slot_start, slot_end):
                    blocked = True
                    break
            if not blocked:
                free.append(f"{slot_start}-{slot_end}")
            h += 1

        return free

    # ------------------------------------------------------------------
    # Double-booking detection (used by MeetingService)
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
