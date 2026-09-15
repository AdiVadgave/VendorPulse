"""Meeting-date precedence rules.

The three meeting types in a governance cycle must occur in a fixed order, by exact
start time:

    Internal Alignment call(s)  <  Vendor Prep call  <  SPR / QBR meeting

The SPR is the final vendor-facing governance meeting; the alignment and prep calls
are preparation and must happen before it. This module reads the already-scheduled
meetings and, given a proposed new start time for one of them, returns a human error
message when the new time would break that order — or ``None`` when it is valid.

Times are compared as timezone-aware UTC instants. Same-day meetings are allowed as
long as their start times keep the order (e.g. alignment 10:00, SPR 15:00 same day).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

ALIGNMENT_TYPE = "INTERNAL_ALIGNMENT"
VENDOR_PREP_TYPE = "VENDOR_PREP"

# kind values accepted by check_precedence
SPR = "spr"
ALIGNMENT = "alignment"
VENDOR_PREP = "vendor_prep"


def _parse_iso(value: object) -> Optional[datetime]:
    """Parse an ISO-8601 instant (``...Z`` or offset, or naive→UTC) to aware UTC."""
    if not isinstance(value, str) or not value.strip():
        return None
    s = value.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _slot_start_iso(meeting: dict) -> Optional[str]:
    """Rebuild the UTC ISO start from a persisted meeting ``time_slot`` (date +
    start_time stored as UTC wall-clock components)."""
    ts = meeting.get("time_slot") or {}
    date, start = ts.get("date"), ts.get("start_time")
    if date and start:
        return f"{date}T{start}:00Z"
    return None


def _fmt(dt: datetime) -> str:
    """Readable UTC label for an error message, e.g. ``Wed 16 Sep 2026, 14:00 UTC``."""
    return dt.strftime("%a %d %b %Y, %H:%M UTC")


def collect_prep_starts(meetings: list[dict]) -> tuple[list[datetime], Optional[datetime]]:
    """From the shared meetings store, return (alignment_starts, vendor_prep_start),
    skipping cancelled records. Vendor Prep is a single meeting per cycle."""
    aligns: list[datetime] = []
    vp: Optional[datetime] = None
    for m in meetings:
        if (m.get("status") or "").lower() == "cancelled":
            continue
        dt = _parse_iso(_slot_start_iso(m))
        if dt is None:
            continue
        mtype = m.get("meeting_type")
        if mtype == ALIGNMENT_TYPE:
            aligns.append(dt)
        elif mtype == VENDOR_PREP_TYPE:
            vp = dt
    return aligns, vp


def check_precedence(
    kind: str,
    new_start: str,
    *,
    cycle: dict,
    meetings: list[dict],
) -> Optional[str]:
    """Validate a proposed start time for meeting ``kind`` (``"spr"`` / ``"alignment"``
    / ``"vendor_prep"``) against the other scheduled meetings. Returns an error message
    if it breaks the Alignment < Vendor Prep < SPR order, else ``None``.

    Precedence is by exact start time, so a meeting on the same day is fine when its
    start keeps the order. Meetings not yet scheduled simply don't constrain.
    """
    new_dt = _parse_iso(new_start)
    if new_dt is None:
        return None  # let the endpoint's own parsing surface a bad timestamp

    spr = _parse_iso(cycle.get("teams_meeting_scheduled_at"))
    aligns, vp = collect_prep_starts(meetings)
    latest_align = max(aligns) if aligns else None

    if kind == ALIGNMENT:
        if spr is not None and new_dt >= spr:
            return f"The Internal Alignment call must start before the SPR meeting ({_fmt(spr)})."
        if vp is not None and new_dt >= vp:
            return f"The Internal Alignment call must start before the Vendor Prep call ({_fmt(vp)})."
    elif kind == VENDOR_PREP:
        if latest_align is not None and new_dt <= latest_align:
            return f"The Vendor Prep call must start after the Internal Alignment call ({_fmt(latest_align)})."
        if spr is not None and new_dt >= spr:
            return f"The Vendor Prep call must start before the SPR meeting ({_fmt(spr)})."
    elif kind == SPR:
        if latest_align is not None and new_dt <= latest_align:
            return f"The SPR meeting must start after the Internal Alignment call ({_fmt(latest_align)})."
        if vp is not None and new_dt <= vp:
            return f"The SPR meeting must start after the Vendor Prep call ({_fmt(vp)})."
    return None
