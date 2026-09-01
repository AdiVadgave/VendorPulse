"""Eligibility rules for scorecard request recipients."""
from __future__ import annotations


def is_scorecard_recipient(attendee: dict) -> bool:
    """Return whether an attendee remains eligible to receive a scorecard request."""
    return (
        attendee.get("is_key")
        and attendee.get("type") != "Vendor"
        and attendee.get("confirmation_status") != "DECLINED"
    )