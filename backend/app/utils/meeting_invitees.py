"""Who a stored meeting was invited to.

The alignment and vendor-prep meetings are persisted the same way: the first invitee
is kept on the meeting row as ``organizer_id`` and the rest become participant rows.
Both DTOs therefore have to put the organiser back at the front to describe the invite,
and both used to report a count computed separately from the list — so a row with a
blank participant or no organiser produced a count that disagreed with the names. The
UI showed that as "5 invited" above a list of 4.

Deriving both from one list makes disagreement impossible.
"""
from __future__ import annotations

from typing import Any, Iterable, Mapping


def invited_emails(meeting: Mapping[str, Any], participants: Iterable[Mapping[str, Any]]) -> list[str]:
    """Organiser first, then participants: lowercased, blanks dropped, de-duplicated.

    De-duplication matters because nothing in the schema stops a legacy row from listing
    the organiser among the participants as well, which would inflate the count against a
    frontend that holds the invitees in a Set.
    """
    ordered = [meeting.get("organizer_id")] + [p.get("user_id") for p in participants]
    seen: set[str] = set()
    out: list[str] = []
    for raw in ordered:
        email = (raw or "").strip().lower()
        if not email or email in seen:
            continue
        seen.add(email)
        out.append(email)
    return out
