"""
MockFormService — simulates Microsoft Forms or SharePoint form delivery.

In production: replace with MS Forms API or a custom form microservice.
Forms are rendered as in-app modals in the frontend.
"""
from __future__ import annotations

import uuid
from typing import Any

from app.services.mock.base_mock import BaseMockService


class MockFormService(BaseMockService):
    """
    Simulate form creation and response collection.

    generate_link     → returns a mock form URL per stakeholder
    collect_responses → returns in-memory submitted responses
    mark_submitted    → flag a stakeholder's form as submitted
    """

    service_name = "mock_forms"

    def __init__(self) -> None:
        self._responses: dict[str, list[dict]] = {}   # cycle_id → [responses]

    def generate_link(
        self,
        cycle_id: str,
        stakeholder_id: str,
        form_type: str = "SCORECARD",
    ) -> dict:
        """Generate a unique mock form URL for a stakeholder."""
        form_id = f"frm_{uuid.uuid4().hex[:6]}"
        url = f"https://forms.microsoft.com/mock/{form_id}?stakeholder={stakeholder_id}"

        self.log_call(
            "generate_link", {"cycle": cycle_id, "stakeholder": stakeholder_id, "type": form_type}
        )
        return self.mock_response(form_id=form_id, url=url, form_type=form_type)

    def collect_responses(self, cycle_id: str) -> list[dict]:
        """Return all submitted responses for a cycle."""
        return self._responses.get(cycle_id, [])

    def mark_submitted(self, cycle_id: str, stakeholder_id: str, data: dict[str, Any]) -> dict:
        """Record a form submission (used by 'Simulate Responses' demo button)."""
        submission = {
            "submission_id": f"sub_{uuid.uuid4().hex[:8]}",
            "cycle_id": cycle_id,
            "stakeholder_id": stakeholder_id,
            "data": data,
            "submitted_at": self._now(),
        }
        self._responses.setdefault(cycle_id, []).append(submission)
        self.log_call("mark_submitted", {"cycle": cycle_id, "stakeholder": stakeholder_id})
        return self.mock_response(**submission)

    def simulate_all_responses(self, cycle_id: str, stakeholder_ids: list[str]) -> list[dict]:
        """Demo helper: auto-submit default responses for all stakeholders."""
        results = []
        for sid in stakeholder_ids:
            results.append(
                self.mark_submitted(cycle_id, sid, {"availability": "available", "simulated": True})
            )
        return results
