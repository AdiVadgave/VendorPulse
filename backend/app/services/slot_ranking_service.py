"""
Deterministic slot-ranking algorithm.

Implementation of the scoring rules from the VendorPulse README:

  Factor                 Type         Rule
  ─────────────────────  ───────────  ─────────────────────────────────────
  Organiser available    Hard         Slot invalid if organiser blocked
  Exec sponsor avail.    Hard         Slot invalid if exec sponsor blocked
  Max group attendance   Soft score   (attending / total) × 100
  Conflict count         Penalty      −10 per non-key attendee conflict
  Key attendance bonus   Bonus        +10 when all key attendees present
  Timezone suitability   Bonus        +5 if slot falls fully in 09:00–17:00

No LLM is used here.
Future AI hook: pass ranked slots + context to an LLM for a plain-English
explanation of why the top slot was chosen.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from app.config import settings
from app.services.availability_service import AvailabilityService


def _end_time(start_hour: int, start_min: int, duration_hours: float) -> tuple[int, int]:
    total_mins = start_hour * 60 + start_min + int(duration_hours * 60)
    return total_mins // 60, total_mins % 60


def _generate_candidate_slots(
    date_start: str,
    date_end: str,
    duration_hours: float,
    interval_hours: float,
    biz_start: int,
    biz_end: int,
) -> list[str]:
    """
    Enumerate every business-hours slot in [date_start, date_end].
    Returns ISO-8601 datetime strings (UTC, no offset).
    """
    start_d = date.fromisoformat(date_start)
    end_d = date.fromisoformat(date_end)
    slots: list[str] = []

    current = start_d
    step_mins = int(interval_hours * 60)

    while current <= end_d:
        start_mins = biz_start * 60
        end_limit_mins = biz_end * 60

        while start_mins + int(duration_hours * 60) <= end_limit_mins:
            h, m = divmod(start_mins, 60)
            slots.append(f"{current.isoformat()}T{h:02d}:{m:02d}:00Z")
            start_mins += step_mins

        current += timedelta(days=1)

    return slots


class SlotRankingService:
    """
    Rank candidate meeting slots for a set of attendees.

    Constructor accepts an AvailabilityService so the ranking logic never
    touches the data layer directly — easy to unit-test.
    """

    _BIZ_START = time(settings.scheduling_business_start_hour, 0)
    _BIZ_END = time(settings.scheduling_business_end_hour, 0)

    def __init__(self, availability_svc: AvailabilityService) -> None:
        self._avail = availability_svc

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def rank_slots(
        self,
        cycle_id: str,
        attendee_user_ids: list[str],
        attendee_names: dict[str, str],
        attendee_key_flags: dict[str, bool],
        organiser_id: str,
        exec_sponsor_id: str,
        date_range_start: str,
        date_range_end: str,
        duration_hours: float = 1.0,
    ) -> list[dict]:
        """
        Return up to *settings.scheduling_top_n_slots* ranked SlotProposal dicts.
        Slots where the organiser or exec sponsor is unavailable are silently dropped.
        """
        candidates = _generate_candidate_slots(
            date_start=date_range_start,
            date_end=date_range_end,
            duration_hours=duration_hours,
            interval_hours=settings.scheduling_slot_interval_hours,
            biz_start=settings.scheduling_business_start_hour,
            biz_end=settings.scheduling_business_end_hour,
        )

        results: list[dict] = []
        total = len(attendee_user_ids)

        for slot_iso in candidates:
            dt = datetime.fromisoformat(slot_iso.replace("Z", "+00:00"))
            slot_date = dt.strftime("%Y-%m-%d")
            eh, em = _end_time(dt.hour, dt.minute, duration_hours)
            slot_start = f"{dt.hour:02d}:{dt.minute:02d}"
            slot_end = f"{eh:02d}:{em:02d}"

            # ── Hard constraints ─────────────────────────────────────────
            if not self._avail.is_user_available(organiser_id, slot_date, slot_start, slot_end):
                continue
            if not self._avail.is_user_available(exec_sponsor_id, slot_date, slot_start, slot_end):
                continue

            # ── Per-attendee attendance ──────────────────────────────────
            attending: list[str] = []
            conflicts: list[str] = []

            for uid in attendee_user_ids:
                name = attendee_names.get(uid, uid)
                is_available = self._avail.is_user_available(uid, slot_date, slot_start, slot_end)
                if is_available:
                    attending.append(name)
                else:
                    conflicts.append(name)

            # ── Score calculation ────────────────────────────────────────
            attendance_pct = (len(attending) / total * 100) if total > 0 else 0

            # Penalty: only non-key attendees
            non_key_conflicts = sum(
                1
                for uid in attendee_user_ids
                if attendee_names.get(uid, uid) in conflicts
                and not attendee_key_flags.get(uid, False)
            )
            conflict_penalty = non_key_conflicts * settings.scheduling_conflict_penalty

            # Bonus: all key attendees present
            key_ids = [uid for uid, is_key in attendee_key_flags.items() if is_key]
            all_keys_present = all(
                attendee_names.get(k, k) in attending for k in key_ids
            )
            key_bonus = settings.scheduling_key_attendance_bonus if all_keys_present else 0.0

            # Bonus: slot fully within business hours
            slot_time_obj = time(dt.hour, dt.minute)
            end_time_obj = time(eh, em)
            tz_bonus = (
                settings.scheduling_tz_bonus
                if self._BIZ_START <= slot_time_obj and end_time_obj <= self._BIZ_END
                else 0.0
            )

            rank_score = max(0.0, min(100.0, attendance_pct - conflict_penalty + key_bonus + tz_bonus))

            results.append(
                {
                    "slot_id": f"sl_{uuid.uuid4().hex}",
                    "cycle_id": cycle_id,
                    "proposed_time": slot_iso,
                    "organiser_available": True,
                    "exec_sponsor_available": True,
                    "rank_score": round(rank_score, 1),
                    "is_approved": False,
                    "attendance_count": len(attending),
                    "total_attendees": total,
                    "conflict_count": len(conflicts),
                    "attending": attending,
                    "conflicts": conflicts,
                }
            )

        # Sort descending by rank_score then ascending by proposed_time (tie-break)
        results.sort(key=lambda x: (-x["rank_score"], x["proposed_time"]))
        return results[: settings.scheduling_top_n_slots]
