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
    print("[FORMS-SERVICE] Getting Google Forms service...")
    creds = get_credentials()
    if creds is None:
        print("[FORMS-SERVICE] ERROR: No credentials available")
        raise GoogleFormsError(
            "Google account not authenticated. Visit /auth/google first."
        )
    print(f"[FORMS-SERVICE] Credentials obtained. Scopes: {creds.scopes}")
    svc = build("forms", "v1", credentials=creds)
    print("[FORMS-SERVICE] Google Forms service built successfully")
    return svc


def _load_stored_responses() -> list[dict]:
    print(f"[FORMS-SERVICE] Loading stored responses from {RESPONSES_PATH}")
    if RESPONSES_PATH.exists():
        data = json.loads(RESPONSES_PATH.read_text(encoding="utf-8"))
        print(f"[FORMS-SERVICE] Loaded {len(data)} stored responses")
        return data
    print(f"[FORMS-SERVICE] File not found: {RESPONSES_PATH} — returning empty list")
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
    print(f"[FORMS-FETCH] fetch_form_responses called with form_id={form_id}, resolved fid={fid}")
    if not fid:
        raise GoogleFormsError("GOOGLE_FORM_ID is not configured in .env")

    service = _get_forms_service()

    # First, get the form schema to map questionId → field key
    print(f"[FORMS-FETCH] Fetching form schema for formId={fid}...")
    try:
        form = service.forms().get(formId=fid).execute()
        print(f"[FORMS-FETCH] Form schema retrieved: title='{form.get('info', {}).get('title', 'N/A')}', items={len(form.get('items', []))}")
    except Exception as exc:
        print(f"[FORMS-FETCH] ERROR fetching form schema: {type(exc).__name__}: {exc}")
        raise

    question_map: dict[str, str] = {}
    for item in form.get("items", []):
        q = item.get("questionItem", {}).get("question", {})
        q_id = q.get("questionId", "")
        title = item.get("title", "")
        mapped = _match_question(title)
        print(f"[FORMS-FETCH]   Question: title='{title}', q_id={q_id}, mapped_to={mapped}")
        if mapped and q_id:
            question_map[q_id] = mapped

    print(f"[FORMS-FETCH] Question map built: {question_map}")

    # Fetch responses
    print(f"[FORMS-FETCH] Fetching responses for formId={fid}...")
    try:
        resp = service.forms().responses().list(formId=fid).execute()
        raw_responses = resp.get("responses", [])
        print(f"[FORMS-FETCH] Raw responses received: {len(raw_responses)}")
    except Exception as exc:
        print(f"[FORMS-FETCH] ERROR fetching responses: {type(exc).__name__}: {exc}")
        raise

    parsed: list[dict] = []
    for i, r in enumerate(raw_responses):
        response_id = r.get("responseId", "")
        submitted_at = r.get("lastSubmittedTime", "")
        answers = r.get("answers", {})
        print(f"[FORMS-FETCH]   Response #{i+1}: id={response_id}, submitted_at={submitted_at}, answer_keys={list(answers.keys())}")

        record: dict[str, Any] = {
            "response_id": response_id,
            "submitted_at": submitted_at,
        }
        for q_id, answer_data in answers.items():
            field_key = question_map.get(q_id)
            if not field_key:
                print(f"[FORMS-FETCH]     Skipping unmapped q_id={q_id}")
                continue
            # Extract the text answer (handles both text and scale answers)
            text_answers = answer_data.get("textAnswers", {}).get("answers", [])
            if text_answers:
                value = text_answers[0].get("value", "")
                record[field_key] = value
                print(f"[FORMS-FETCH]     {field_key} = {value}")

        parsed.append(record)
        print(f"[FORMS-FETCH]   Parsed record: {record}")

    print(f"[FORMS-FETCH] Total parsed responses: {len(parsed)}")
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
    print(f"[FORMS-POLL] poll_and_store called with form_id={form_id}")
    new_responses = fetch_form_responses(form_id)
    print(f"[FORMS-POLL] Fetched {len(new_responses)} responses from Google Forms")

    stored = _load_stored_responses()
    existing_ids = {r["response_id"] for r in stored}
    print(f"[FORMS-POLL] Existing stored responses: {len(stored)}, existing IDs: {existing_ids}")

    new_count = 0
    for resp in new_responses:
        if resp["response_id"] not in existing_ids:
            stored.append(resp)
            existing_ids.add(resp["response_id"])
            new_count += 1
            print(f"[FORMS-POLL] New response added: {resp['response_id']}")
        else:
            print(f"[FORMS-POLL] Duplicate skipped: {resp['response_id']}")

    _save_responses(stored)
    print(f"[FORMS-POLL] Saved {len(stored)} total responses ({new_count} new)")
    logger.info("Form poll complete: %d total, %d new", len(stored), new_count)

    return {
        "total": len(stored),
        "new": new_count,
        "responses": stored,
    }


def fetch_raw_form_responses(form_id: str | None = None) -> dict:
    """Fetch raw responses directly from Google Forms API without any parsing/mapping."""
    fid = form_id or settings.google_form_id
    print(f"[FORMS-RAW] fetch_raw_form_responses called with form_id={form_id}, resolved fid={fid}")
    if not fid:
        raise GoogleFormsError("GOOGLE_FORM_ID is not configured in .env")

    service = _get_forms_service()

    # Fetch form schema (for reference)
    print(f"[FORMS-RAW] Fetching form schema for formId={fid}...")
    try:
        form = service.forms().get(formId=fid).execute()
        print(f"[FORMS-RAW] Form title: '{form.get('info', {}).get('title', 'N/A')}', items: {len(form.get('items', []))}")
    except Exception as exc:
        print(f"[FORMS-RAW] ERROR fetching form schema: {type(exc).__name__}: {exc}")
        raise

    # Build question_id -> title lookup for convenience
    question_titles = {}
    for item in form.get("items", []):
        q = item.get("questionItem", {}).get("question", {})
        q_id = q.get("questionId", "")
        title = item.get("title", "")
        if q_id:
            question_titles[q_id] = title

    # Fetch raw responses
    print(f"[FORMS-RAW] Fetching responses for formId={fid}...")
    try:
        resp = service.forms().responses().list(formId=fid).execute()
        raw_responses = resp.get("responses", [])
        print(f"[FORMS-RAW] Raw responses received: {len(raw_responses)}")
    except Exception as exc:
        print(f"[FORMS-RAW] ERROR fetching responses: {type(exc).__name__}: {exc}")
        raise

    return {
        "form_id": fid,
        "form_title": form.get("info", {}).get("title", ""),
        "question_titles": question_titles,
        "total": len(raw_responses),
        "responses": raw_responses,
    }


def get_responses_for_cycle(cycle_id: str) -> list[dict]:
    """Return all stored responses that match a given cycle_id."""
    print(f"[FORMS-SERVICE] get_responses_for_cycle called with cycle_id={cycle_id}")
    stored = _load_stored_responses()
    matched = [r for r in stored if r.get("cycle_id") == cycle_id]
    print(f"[FORMS-SERVICE] Matched {len(matched)} out of {len(stored)} for cycle_id={cycle_id}")
    return matched


def get_all_stored_responses() -> list[dict]:
    print("[FORMS-SERVICE] get_all_stored_responses called")
    result = _load_stored_responses()
    print(f"[FORMS-SERVICE] Returning {len(result)} total responses")
    return result
