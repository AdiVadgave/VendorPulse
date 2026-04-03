"""
MockNotificationService — simulates Teams / push / in-app notifications.

In production: replace with MS Teams Bot Framework, Azure Notification Hubs,
or a dedicated notification microservice.
"""
from __future__ import annotations

import uuid
from typing import Literal

from app.services.mock.base_mock import BaseMockService

NotificationType = Literal[
    "SCORECARD_REQUEST", "REMINDER_1", "REMINDER_2",
    "ESCALATION", "INVITE", "NUDGE",
]


class MockNotificationService(BaseMockService):
    """
    Simulate push / in-app notifications.

    All notifications are stored in _log for frontend display.
    Tiered reminder labels (REMINDER_1 → REMINDER_2 → ESCALATION) are
    displayed in the Scorecard module's notification panel.
    """

    service_name = "mock_notifications"

    def __init__(self) -> None:
        self._log: list[dict] = []

    def push(
        self,
        stakeholder_id: str,
        notification_type: NotificationType,
        content: str,
        cycle_id: str = "",
    ) -> dict:
        """Push a single notification to a stakeholder."""
        notification_id = f"ntf_{uuid.uuid4().hex[:8]}"
        entry = {
            "notification_id": notification_id,
            "stakeholder_id": stakeholder_id,
            "cycle_id": cycle_id,
            "type": notification_type,
            "content": content,
            "sent_at": self._now(),
            "status": "SENT",
        }
        self._log.append(entry)
        self.log_call("push", {"stakeholder": stakeholder_id, "type": notification_type})
        return self.mock_response(notification_id=notification_id)

    def send_nudge(
        self, stakeholder_id: str, nudge_type: str = "PENDING_RESPONSE", cycle_id: str = ""
    ) -> dict:
        content = {
            "PENDING_RESPONSE": "Reminder: your availability response is still pending.",
            "SCORECARD_DUE": "Your scorecard submission is due soon.",
            "ACTION_OVERDUE": "You have an overdue action item.",
        }.get(nudge_type, "You have a pending task in VendorPulse.")

        return self.push(stakeholder_id, "NUDGE", content, cycle_id)

    def broadcast(self, cycle_id: str, notification_type: NotificationType, message: str) -> list[dict]:
        """
        Send the same notification to all stakeholders in the log who belong to this cycle.
        In production, this would query stakeholder IDs from the DB.
        """
        relevant_ids = list(
            {n["stakeholder_id"] for n in self._log if n.get("cycle_id") == cycle_id}
        )
        return [self.push(sid, notification_type, message, cycle_id) for sid in relevant_ids]

    def get_log(self, cycle_id: str = "") -> list[dict]:
        """Return all notifications, optionally filtered by cycle."""
        if cycle_id:
            return [n for n in self._log if n.get("cycle_id") == cycle_id]
        return list(self._log)

    def get_for_stakeholder(self, stakeholder_id: str) -> list[dict]:
        return [n for n in self._log if n.get("stakeholder_id") == stakeholder_id]
