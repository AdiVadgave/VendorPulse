"""
Google Forms response polling service.

Fetches responses from a Google Form, parses them, maps to scorecard entries,
and stores in a local JSON file (data/scorecard_responses.json).

Deduplication is done via responseId.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from googleapiclient.discovery import build

from app.config import settings
from app.services.google_auth_service import get_credentials

logger = logging.getLogger(__name__)

RESPONSES_PATH = settings.data_dir / "scorecard_responses.json"

# Google Form question mapping — maps question text fragments to our
# parameter keys.  The Google Forms API returns question titles, so we
# match on substrings to be resilient to minor wording changes.
QUESTION_MAP: dict[str, str] = {
    "email": "email",
    "vendor name": "vendor_name",
    "cycle id": "cycle_id",
    "delivery timeliness": "DELIVERY_TIMELINESS",
    "quality": "QUALITY_OF_DELIVERY",
    "sla": "SLA_ADHERENCE",
    "resource capability": "RESOURCE_CAPABILITY",
    "operational efficiency": "OPERATIONAL_EFFICIENCY",
    "release": "RELEASE_PATCH_MGMT",
    "patch": "RELEASE_PATCH_MGMT",
    "security": "SECURITY_RISK_MGMT",
    "audit": "AUDIT_COMPLIANCE",
    "pricing": "PRICING_COMPETITIVENESS",
    "contract compliance": "CONTRACT_COMPLIANCE",
    "cost control": "COST_CONTROL",
    "billing": "BILLING_ACCURACY",
    "communication": "COMMUNICATION_EFFECTIVENESS",
    "stakeholder engagement": "STAKEHOLDER_ENGAGEMENT",
    "responsiveness": "RESPONSIVENESS",
    "collaboration": "COLLABORATION_ALIGNMENT",
}


class GoogleFormsError(RuntimeError):
    pass


def _get_forms_service():
    creds = get_credentials()
    if creds is None:
        raise GoogleFormsError(
            "Google account not authenticated. Visit /auth/google first."
        )
    return build("forms", "v1", credentials=creds)


def _load_stored_responses() -> list[dict]:
    if RESPONSES_PATH.exists():
        return json.loads(RESPONSES_PATH.read_text(encoding="utf-8"))
    return []


def _save_responses(responses: list[dict]) -> None:
    RESPONSES_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESPONSES_PATH.write_text(
        json.dumps(responses, indent=2, default=str), encoding="utf-8"
    )


def _match_question(title: str) -> str | None:
    """Map a Google Form question title to our field key."""
    lower = title.lower().strip()
    for fragment, key in QUESTION_MAP.items():
        if fragment in lower:
            return key
    return None


def fetch_form_responses(form_id: str | None = None) -> list[dict]:
    """Fetch all responses from the Google Form and return parsed records."""
    fid = form_id or settings.google_form_id
    if not fid:
        raise GoogleFormsError("GOOGLE_FORM_ID is not configured in .env")

    service = _get_forms_service()

    # First, get the form schema to map questionId → field key
    form = service.forms().get(formId=fid).execute()
    question_map: dict[str, str] = {}
    for item in form.get("items", []):
        q = item.get("questionItem", {}).get("question", {})
        q_id = q.get("questionId", "")
        title = item.get("title", "")
        mapped = _match_question(title)
        if mapped and q_id:
            question_map[q_id] = mapped

    # Fetch responses
    resp = service.forms().responses().list(formId=fid).execute()
    raw_responses = resp.get("responses", [])

    parsed: list[dict] = []
    for r in raw_responses:
        response_id = r.get("responseId", "")
        submitted_at = r.get("lastSubmittedTime", "")
        answers = r.get("answers", {})

        record: dict[str, Any] = {
            "response_id": response_id,
            "submitted_at": submitted_at,
        }
        for q_id, answer_data in answers.items():
            field_key = question_map.get(q_id)
            if not field_key:
                continue
            # Extract the text answer (handles both text and scale answers)
            text_answers = answer_data.get("textAnswers", {}).get("answers", [])
            if text_answers:
                record[field_key] = text_answers[0].get("value", "")

        parsed.append(record)

    return parsed


def poll_and_store(form_id: str | None = None) -> dict:
    """Poll Google Forms, store new responses, and return a summary.

    Returns:
        {
            "total": int,
            "new": int,
            "responses": [...]
        }
    """
    new_responses = fetch_form_responses(form_id)
    stored = _load_stored_responses()
    existing_ids = {r["response_id"] for r in stored}

    new_count = 0
    for resp in new_responses:
        if resp["response_id"] not in existing_ids:
            stored.append(resp)
            existing_ids.add(resp["response_id"])
            new_count += 1

    _save_responses(stored)
    logger.info("Form poll complete: %d total, %d new", len(stored), new_count)

    return {
        "total": len(stored),
        "new": new_count,
        "responses": stored,
    }


def get_responses_for_cycle(cycle_id: str) -> list[dict]:
    """Return all stored responses that match a given cycle_id."""
    stored = _load_stored_responses()
    return [r for r in stored if r.get("cycle_id") == cycle_id]


def get_all_stored_responses() -> list[dict]:
    return _load_stored_responses()
