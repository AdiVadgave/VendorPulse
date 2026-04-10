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
    "comments on risk": "comment_RISK_COMPLIANCE",
    "comments on performance": "comment_PERFORMANCE",
    "comments on commercial": "comment_COMMERCIAL",
    "comments on relationship": "comment_RELATIONSHIP",
    "key recommendations": "key_recommendations",
}


class GoogleFormsError(RuntimeError):
    pass


def _get_forms_service():
    logger.info("FORMS-SERVICE: getting Google Forms service")
    creds = get_credentials()
    if creds is None:
        logger.error("FORMS-SERVICE: no credentials available")
        raise GoogleFormsError(
            "Google account not authenticated. Visit /auth/google first."
        )
    logger.debug("FORMS-SERVICE: credentials obtained, scopes=%s", creds.scopes)
    svc = build("forms", "v1", credentials=creds)
    logger.info("FORMS-SERVICE: Google Forms service built successfully")
    return svc


def _load_stored_responses() -> list[dict]:
    logger.debug("FORMS-SERVICE: loading stored responses from %s", RESPONSES_PATH)
    if RESPONSES_PATH.exists():
        data = json.loads(RESPONSES_PATH.read_text(encoding="utf-8"))
        logger.debug("FORMS-SERVICE: loaded %d stored responses", len(data))
        return data
    logger.debug("FORMS-SERVICE: file not found %s — returning empty list", RESPONSES_PATH)
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
    logger.info("FORMS-FETCH: fetch_form_responses called — form_id=%s, resolved fid=%s", form_id, fid)
    if not fid:
        raise GoogleFormsError("GOOGLE_FORM_ID is not configured in .env")

    service = _get_forms_service()

    # First, get the form schema to map questionId → field key
    logger.info("FORMS-FETCH: fetching form schema for formId=%s", fid)
    try:
        form = service.forms().get(formId=fid).execute()
        logger.info("FORMS-FETCH: form schema retrieved — title='%s', items=%d",
                     form.get("info", {}).get("title", "N/A"), len(form.get("items", [])))
    except Exception as exc:
        logger.exception("FORMS-FETCH: error fetching form schema: %s", exc)
        raise

    question_map: dict[str, str] = {}
    for item in form.get("items", []):
        # Handle regular questions (questionItem)
        q = item.get("questionItem", {}).get("question", {})
        q_id = q.get("questionId", "")
        title = item.get("title", "")
        mapped = _match_question(title)
        logger.debug("FORMS-FETCH: question title='%s', q_id=%s, mapped_to=%s", title, q_id, mapped)
        if mapped and q_id:
            question_map[q_id] = mapped

        # Handle question groups / grids (questionGroupItem) — each row is a sub-question
        group = item.get("questionGroupItem")
        if group:
            group_title = title  # The group's overall title
            for row_item in group.get("questions", []):
                row_q = row_item.get("questionId", "")
                row_title = row_item.get("rowQuestion", {}).get("title", "")
                # Try matching the row title first, then fall back to group title
                row_mapped = _match_question(row_title) or _match_question(group_title)
                logger.debug("FORMS-FETCH: group row title='%s', q_id=%s, mapped_to=%s",
                             row_title, row_q, row_mapped)
                if row_mapped and row_q:
                    question_map[row_q] = row_mapped

    logger.debug("FORMS-FETCH: question map built — %d mappings", len(question_map))

    # Fetch responses
    logger.info("FORMS-FETCH: fetching responses for formId=%s", fid)
    try:
        resp = service.forms().responses().list(formId=fid).execute()
        raw_responses = resp.get("responses", [])
        logger.info("FORMS-FETCH: raw responses received — count=%d", len(raw_responses))
    except Exception as exc:
        logger.exception("FORMS-FETCH: error fetching responses: %s", exc)
        raise

    parsed: list[dict] = []
    for i, r in enumerate(raw_responses):
        response_id = r.get("responseId", "")
        submitted_at = r.get("lastSubmittedTime", "")
        answers = r.get("answers", {})
        logger.debug("FORMS-FETCH: response #%d — id=%s, submitted_at=%s, answer_keys=%s",
                      i + 1, response_id, submitted_at, list(answers.keys()))

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
                value = text_answers[0].get("value", "")
                record[field_key] = value
            else:
                # Handle grade/scale answers (used in grid & scale question types)
                grade = answer_data.get("grade", {})
                if grade.get("score") is not None:
                    record[field_key] = str(int(grade["score"]))

        parsed.append(record)

    logger.info("FORMS-FETCH: total parsed responses=%d", len(parsed))
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
    logger.info("FORMS-POLL: poll_and_store called — form_id=%s", form_id)
    new_responses = fetch_form_responses(form_id)
    logger.info("FORMS-POLL: fetched %d responses from Google Forms", len(new_responses))

    stored = _load_stored_responses()
    existing_map = {r["response_id"]: i for i, r in enumerate(stored)}

    new_count = 0
    for resp in new_responses:
        idx = existing_map.get(resp["response_id"])
        if idx is not None:
            # Update existing response with any new/fixed fields
            stored[idx] = resp
        else:
            stored.append(resp)
            existing_map[resp["response_id"]] = len(stored) - 1
            new_count += 1
            logger.debug("FORMS-POLL: new response added — id=%s", resp["response_id"])

    _save_responses(stored)
    logger.info("FORMS-POLL: saved %d total responses (%d new)", len(stored), new_count)

    return {
        "total": len(stored),
        "new": new_count,
        "responses": stored,
    }


def fetch_raw_form_responses(form_id: str | None = None) -> dict:
    """Fetch raw responses directly from Google Forms API without any parsing/mapping."""
    fid = form_id or settings.google_form_id
    logger.info("FORMS-RAW: fetch_raw_form_responses called — form_id=%s, resolved fid=%s", form_id, fid)
    if not fid:
        raise GoogleFormsError("GOOGLE_FORM_ID is not configured in .env")

    service = _get_forms_service()

    # Fetch form schema (for reference)
    logger.info("FORMS-RAW: fetching form schema for formId=%s", fid)
    try:
        form = service.forms().get(formId=fid).execute()
        logger.info("FORMS-RAW: form title='%s', items=%d",
                     form.get("info", {}).get("title", "N/A"), len(form.get("items", [])))
    except Exception as exc:
        logger.exception("FORMS-RAW: error fetching form schema: %s", exc)
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
    logger.info("FORMS-RAW: fetching responses for formId=%s", fid)
    try:
        resp = service.forms().responses().list(formId=fid).execute()
        raw_responses = resp.get("responses", [])
        logger.info("FORMS-RAW: raw responses received — count=%d", len(raw_responses))
    except Exception as exc:
        logger.exception("FORMS-RAW: error fetching responses: %s", exc)
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
    logger.info("FORMS-SERVICE: get_responses_for_cycle — cycle_id=%s", cycle_id)
    stored = _load_stored_responses()
    matched = [r for r in stored if r.get("cycle_id") == cycle_id]
    logger.info("FORMS-SERVICE: matched %d out of %d for cycle_id=%s", len(matched), len(stored), cycle_id)
    return matched


def get_all_stored_responses() -> list[dict]:
    logger.info("FORMS-SERVICE: get_all_stored_responses called")
    result = _load_stored_responses()
    logger.info("FORMS-SERVICE: returning %d total responses", len(result))
    return result
