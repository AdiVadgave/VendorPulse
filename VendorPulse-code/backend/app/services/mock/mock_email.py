"""
MockEmailService — simulates Outlook / SMTP email delivery.

In production: replace with MS Graph sendMail or SendGrid.
All sent emails are stored in the outbox (list in memory for this session)
so the frontend can render a preview in approval panels.
"""
from __future__ import annotations

import uuid
from typing import Optional

from app.services.mock.base_mock import BaseMockService


class MockEmailService(BaseMockService):
    """
    Simulate email sending.

    The outbox is an in-process list — sufficient for demo purposes.
    Swap for DB-backed storage when integrating a real email provider.
    """

    service_name = "mock_email"

    def __init__(self) -> None:
        self._outbox: list[dict] = []

    def send(
        self,
        to: str | list[str],
        subject: str,
        body: str,
        cc: Optional[list[str]] = None,
        template_id: Optional[str] = None,
    ) -> dict:
        """
        Send a single email (or to a list of recipients).
        Returns a message_id and stores in outbox.
        """
        recipients = [to] if isinstance(to, str) else to
        message_id = f"msg_{uuid.uuid4().hex[:8]}"

        entry = {
            "message_id": message_id,
            "to": recipients,
            "cc": cc or [],
            "subject": subject,
            "body": body,
            "template_id": template_id,
            "sent_at": self._now(),
            "status": "delivered",
        }
        self._outbox.append(entry)

        self.log_call("send", {"to": recipients, "subject": subject})
        return self.mock_response(message_id=message_id, recipients=recipients)

    def send_bulk(self, recipients: list[str], subject: str, body: str) -> list[dict]:
        """Send the same email to multiple recipients, one record per recipient."""
        results = []
        for addr in recipients:
            results.append(self.send(addr, subject, body))
        return results

    def get_outbox(self) -> list[dict]:
        """Return all sent emails (for approval panel preview)."""
        return list(self._outbox)

    def clear_outbox(self) -> None:
        self._outbox.clear()

    def log_delivery(self, message_id: str, status: str) -> None:
        for msg in self._outbox:
            if msg["message_id"] == message_id:
                msg["status"] = status
                break
