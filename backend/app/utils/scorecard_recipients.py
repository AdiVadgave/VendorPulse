"""Eligibility rules for scorecard request recipients.

Two DIFFERENT questions are asked about the same attendee, and conflating them
is what let a reviewer be counted in one view and invisible in another:

  * ``is_key_internal_reviewer`` — "does this person owe a scorecard, and do
    their scores count?"  Attendance is irrelevant here: declining a MEETING
    invite says nothing about the scorecard they were asked to fill in.
  * ``is_scorecard_recipient``  — "may we EMAIL this person a form link?"
    Same rule, plus: we never mail someone who declined attendance.

Read paths (the submission tracker, the consolidated scorecard) use the first;
send paths (dispatch, reminders) use the second.
"""
from __future__ import annotations


def is_key_internal_reviewer(attendee: dict) -> bool:
    """Return whether an attendee is a key internal-stakeholder scorecard reviewer.

    This is the population the consolidated scorecard is compiled over, so the
    tracker that reports "who filled the scorecard" must use it too — otherwise
    a submission can score the vendor while having no row in the status view."""
    return bool(
        attendee.get("is_key")
        and attendee.get("type") != "Vendor"
    )


def is_scorecard_recipient(attendee: dict) -> bool:
    """Return whether an attendee remains eligible to receive a scorecard request.

    A reviewer who declined attendance is still a reviewer (see
    ``is_key_internal_reviewer``) — we simply do not email them."""
    return bool(
        is_key_internal_reviewer(attendee)
        and attendee.get("confirmation_status") != "DECLINED"
    )
