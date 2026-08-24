"""Per-meeting attendee rosters for internal-alignment and vendor-prep meetings.

These rosters are stored in their own tables (``meeting_attendees`` +
``meeting_attendee_seeds``), completely separate from the cycle's master
``attendees`` table. Editing a meeting's roster therefore never mutates the
QBR / scorecard attendees. Each roster is seeded ONCE from the cycle roster,
then edited independently.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone


def _seed_id(cycle_id: str, kind: str, index: int) -> str:
    return f"{cycle_id}:{kind}:{int(index)}"


def _to_dto(row: dict) -> dict:
    """Shape a ``meeting_attendees`` row like a CycleAttendee for the frontend.
    ``attendee_id`` aliases the per-meeting ``row_id`` so existing UI code works."""
    return {
        "attendee_id": row.get("row_id"),
        "row_id": row.get("row_id"),
        "cycle_id": row.get("cycle_id"),
        "stakeholder_id": row.get("stakeholder_id"),
        "name": row.get("name"),
        "email": row.get("email"),
        "role": row.get("role"),
        "organisation": row.get("organisation"),
        "type": row.get("type"),
        "is_key": row.get("is_key"),
        "attendance_requirement": row.get("attendance_requirement"),
        "lt_status": row.get("lt_status"),
        "shell_department": row.get("shell_department"),
        "user_id": row.get("user_id"),
    }


def _mark_seeded(seed_repo, cycle_id: str, kind: str, index: int) -> None:
    seed_repo.insert({
        "seed_id": _seed_id(cycle_id, kind, index),
        "cycle_id": cycle_id,
        "meeting_kind": kind,
        "meeting_index": int(index),
        "seeded_at": datetime.now(timezone.utc).isoformat(),
    })


def list_meeting_attendees(
    ma_repo, seed_repo, attendee_repo,
    cycle_id: str, kind: str, index: int, include_vendors: bool,
) -> list[dict]:
    """Return the meeting's own attendee roster, seeding it ONCE from the cycle."""
    if not seed_repo.is_seeded(_seed_id(cycle_id, kind, index)):
        for a in attendee_repo.get_for_cycle(cycle_id):
            if a.get("confirmation_status") == "DECLINED":
                continue  # dropped in attendance confirmation
            if not include_vendors and a.get("type") == "Vendor":
                continue  # alignment is internal-only
            ma_repo.insert({
                "row_id": f"ma_{uuid.uuid4().hex}",
                "cycle_id": cycle_id,
                "meeting_kind": kind,
                "meeting_index": int(index),
                "stakeholder_id": a.get("stakeholder_id"),
                "name": a.get("name"),
                "email": a.get("email"),
                "role": a.get("role"),
                "organisation": a.get("organisation"),
                "type": a.get("type"),
                "is_key": a.get("is_key"),
                "attendance_requirement": a.get("attendance_requirement"),
                "lt_status": a.get("lt_status"),
                "shell_department": a.get("shell_department"),
                "user_id": a.get("user_id"),
            })
        _mark_seeded(seed_repo, cycle_id, kind, index)
    return [_to_dto(r) for r in ma_repo.get_for_meeting(cycle_id, kind, index)]


def add_meeting_attendee(ma_repo, seed_repo, cycle_id: str, kind: str, index: int, data: dict) -> dict:
    """Add one attendee to a meeting's roster only (never the cycle roster)."""
    # Mark seeded so a later list() won't re-seed over the manual edit.
    if not seed_repo.is_seeded(_seed_id(cycle_id, kind, index)):
        _mark_seeded(seed_repo, cycle_id, kind, index)
    row = {
        "row_id": f"ma_{uuid.uuid4().hex}",
        "cycle_id": cycle_id,
        "meeting_kind": kind,
        "meeting_index": int(index),
        "stakeholder_id": data.get("stakeholder_id"),
        "name": data.get("name"),
        "email": data.get("email"),
        "role": data.get("role"),
        "organisation": data.get("organisation"),
        "type": data.get("type") or "Internal Stakeholder",
        "is_key": bool(data.get("is_key")),
        "attendance_requirement": data.get("attendance_requirement") or "Required",
        "lt_status": data.get("lt_status") or "Non-LT",
        "shell_department": data.get("shell_department"),
        "user_id": data.get("user_id"),
    }
    ma_repo.insert(row)
    return _to_dto(row)


def remove_meeting_attendee(ma_repo, cycle_id: str, kind: str, index: int, row_id: str) -> bool:
    """Remove one attendee from a meeting's roster by row_id (scoped to the meeting)."""
    row = ma_repo.find_by_id("row_id", row_id)
    if not row or row.get("cycle_id") != cycle_id or row.get("meeting_kind") != kind:
        return False
    ma_repo.delete_by_id("row_id", row_id)
    return True
