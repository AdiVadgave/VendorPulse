"""Who may change a scheduled meeting — reschedule it or cancel it.

A Teams meeting lives in the Outlook mailbox of whoever scheduled it, and only that
person's own (delegated) Graph session can move or cancel it. Every coordinator sees
the same cycles, so VendorPulse records the scheduler — from their SSO identity, never
from the request body — and refuses changes from anyone else.

A meeting recorded before this existed has no scheduler: it stays open to everyone, and
whoever next reschedules it becomes its scheduler.
"""
from __future__ import annotations

from typing import Optional

from fastapi import HTTPException

from app.core.auth import CurrentUser


def scheduler_email(user: CurrentUser) -> Optional[str]:
    """The identity recorded as a meeting's scheduler."""
    return (user.email or "").strip().lower() or None


def ensure_can_change_meeting(scheduled_by: Optional[str], user: CurrentUser, action: str) -> None:
    """Raise 403 unless `user` scheduled the meeting (or no scheduler is recorded)."""
    owner = (scheduled_by or "").strip().lower()
    if owner and owner != (user.email or "").strip().lower():
        raise HTTPException(
            status_code=403,
            detail=f"Only {owner}, who scheduled this meeting, can {action} it.",
        )


def graph_event_id_for(new_id: Optional[str], existing: Optional[dict], meeting_url: Optional[str]) -> Optional[str]:
    """The Outlook event id to store for an alignment / vendor-prep meeting being
    (re)scheduled.

    A newly created or moved Teams meeting sends its id. A reschedule that sends none
    keeps the stored id only while it is still the same Teams meeting (same join link):
    a different link means a different meeting, and keeping the old id would make a
    later delete cancel the wrong one."""
    new_id = (new_id or "").strip()
    if new_id:
        return new_id
    if existing and (existing.get("teams_meeting_url") or None) == (meeting_url or None):
        return existing.get("graph_event_id") or None
    return None
