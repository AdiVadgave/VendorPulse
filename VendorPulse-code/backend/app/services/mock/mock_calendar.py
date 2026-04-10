"""
MockCalendarService — simulates Microsoft Teams / Outlook calendar integration.

In production: replace with MS Graph API calls.
Interface is intentionally simple so agents call it without knowing it's a mock.
"""
from __future__ import annotations

import uuid
from typing import Optional

from app.services.mock.base_mock import BaseMockService


class MockCalendarService(BaseMockService):
    """
    Simulate calendar invite operations.

    send_invite   → returns a mock confirmation with a meeting URL
    update_invite → returns updated confirmation
    cancel_invite → returns cancellation confirmation
    """

    service_name = "mock_calendar"

    def send_invite(
        self,
        organiser_email: str,
        attendee_emails: list[str],
        subject: str,
        date: str,
        start_time: str,
        end_time: str,
        body: str = "",
        location: str = "Microsoft Teams",
    ) -> dict:
        """
        Simulate sending a calendar invite.

        Returns a dict with invite_id and a mock Teams meeting URL.
        """
        invite_id = f"inv_{uuid.uuid4().hex[:8]}"
        meeting_url = f"https://teams.microsoft.com/mock/meeting/{invite_id}"

        self.log_call(
            "send_invite",
            {
                "organiser": organiser_email,
                "attendees": len(attendee_emails),
                "date": date,
                "time": f"{start_time}–{end_time}",
            },
        )

        return self.mock_response(
            invite_id=invite_id,
            subject=subject,
            date=date,
            start_time=start_time,
            end_time=end_time,
            attendees=attendee_emails,
            meeting_url=meeting_url,
            location=location,
            message="Calendar invite sent successfully (mock)",
        )

    def update_invite(self, invite_id: str, **kwargs) -> dict:
        self.log_call("update_invite", {"invite_id": invite_id, **kwargs})
        return self.mock_response(invite_id=invite_id, message="Invite updated (mock)")

    def cancel_invite(self, invite_id: str, cancelled_by: str) -> dict:
        self.log_call("cancel_invite", {"invite_id": invite_id, "by": cancelled_by})
        return self.mock_response(invite_id=invite_id, message="Invite cancelled (mock)")

    def get_availability(
        self, attendee_emails: list[str], date_start: str, date_end: str
    ) -> dict[str, list[str]]:
        """
        Mock: return empty availability for all attendees.
        Real availability comes from users.json in the data layer.
        """
        self.log_call(
            "get_availability",
            {"attendees": len(attendee_emails), "range": f"{date_start}→{date_end}"},
        )
        # Return empty dict — real availability is fetched from UserRepository
        return {email: [] for email in attendee_emails}
