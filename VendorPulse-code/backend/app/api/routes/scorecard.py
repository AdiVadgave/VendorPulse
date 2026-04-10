"""
Scorecard API routes.

Provides endpoints for:
  1. Dispatching scorecard request emails to key attendees via Gmail
  2. Polling Google Forms for new scorecard responses
  3. Retrieving stored responses for a specific cycle
  4. Submission tracking per cycle (who submitted, who pending)
  5. Compiled scorecard: Internal Stakeholder avg vs Vendor avg
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from datetime import datetime, timezone

from app.config import settings
from app.dependencies import get_cycle_repo
from app.core.workflow_engine import workflow_engine, WORKFLOW_STATES
from app.services.gmail_service import GmailSendError, build_scorecard_email, send_html_email
from app.services.google_auth_service import is_authenticated
from app.services.google_forms_service import (
    GoogleFormsError,
    fetch_raw_form_responses,
    get_all_stored_responses,
    get_responses_for_cycle,
    poll_and_store,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scorecard", tags=["scorecard"])


# ── Request / Response models ────────────────────────────────────────────────


class AttendeeEmail(BaseModel):
    name: str
    email: str  # Gmail address to send to


class DispatchRequest(BaseModel):
    cycle_id: str
    vendor_name: str
    quarter: str
    year: int
    attendees: list[AttendeeEmail] = Field(..., min_length=1)
    form_url: str | None = None  # defaults to settings.google_form_url


class DispatchResult(BaseModel):
    attendee: str
    email: str
    status: str  # "sent" or "failed"
    message_id: str | None = None
    error: str | None = None


class DispatchResponse(BaseModel):
    total: int
    sent: int
    failed: int
    results: list[DispatchResult]


class PollResponse(BaseModel):
    total: int
    new: int
    responses: list[dict]


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/dispatch", response_model=DispatchResponse)
def dispatch_scorecard_emails(payload: DispatchRequest):
    """Send scorecard request emails to all key attendees via Gmail."""
    logger.info(
        "SCORECARD-DISPATCH: cycle_id=%s, vendor=%s, quarter=%s, year=%s",
        payload.cycle_id, payload.vendor_name, payload.quarter, payload.year,
    )
    logger.info("SCORECARD-DISPATCH: attendees=%s", [(a.name, a.email) for a in payload.attendees])
    logger.debug("SCORECARD-DISPATCH: form_url from payload=%s", payload.form_url)

    # Idempotency: if scorecard already dispatched, return previous result
    cycle_repo = get_cycle_repo()
    cycle = cycle_repo.get_by_cycle_id(payload.cycle_id)
    if cycle and cycle.get("scorecard_dispatched_at"):
        logger.info("SCORECARD-DISPATCH: already dispatched at %s, returning idempotent response", cycle["scorecard_dispatched_at"])
        already_sent = cycle.get("scorecard_dispatched_to", [])
        return DispatchResponse(
            total=len(already_sent),
            sent=len(already_sent),
            failed=0,
            results=[
                DispatchResult(attendee=email, email=email, status="sent")
                for email in already_sent
            ],
        )

    if not is_authenticated():
        logger.warning("SCORECARD-DISPATCH: not authenticated with Google")
        raise HTTPException(
            status_code=401,
            detail="Google account not connected. Visit /auth/google to authenticate.",
        )

    form_url = payload.form_url or settings.google_form_url
    logger.info("SCORECARD-DISPATCH: using form_url=%s", form_url)
    results: list[DispatchResult] = []
    sent_count = 0

    for attendee in payload.attendees:
        logger.info("SCORECARD-DISPATCH: building email for %s (%s)", attendee.name, attendee.email)
        email_data = build_scorecard_email(
            attendee_name=attendee.name,
            vendor_name=payload.vendor_name,
            cycle_id=payload.cycle_id,
            quarter=payload.quarter,
            year=payload.year,
            form_url=form_url,
        )

        try:
            logger.info("SCORECARD-DISPATCH: sending email to %s...", attendee.email)
            result = send_html_email(
                to_email=attendee.email,
                subject=email_data["subject"],
                html_body=email_data["html_body"],
                text_body=email_data["text_body"],
            )
            logger.info("SCORECARD-DISPATCH: email sent to %s, message_id=%s", attendee.email, result.get("id"))
            results.append(
                DispatchResult(
                    attendee=attendee.name,
                    email=attendee.email,
                    status="sent",
                    message_id=result.get("id"),
                )
            )
            sent_count += 1
        except GmailSendError as exc:
            logger.error("SCORECARD-DISPATCH: failed to send to %s: %s", attendee.email, exc)
            results.append(
                DispatchResult(
                    attendee=attendee.name,
                    email=attendee.email,
                    status="failed",
                    error=str(exc),
                )
            )

    logger.info("SCORECARD-DISPATCH: done — %d sent, %d failed", sent_count, len(payload.attendees) - sent_count)

    # Persist dispatch record and advance workflow
    if sent_count > 0 and cycle:
        now = datetime.now(timezone.utc).isoformat()
        sent_emails = [r.email for r in results if r.status == "sent"]
        cycle_repo.mark_scorecard_dispatched(payload.cycle_id, now, sent_emails)
        try:
            ws_idx = WORKFLOW_STATES.index(cycle.get("workflow_state", ""))
            target_idx = WORKFLOW_STATES.index("SCORECARD_REQUEST_SENT")
            if ws_idx < target_idx:
                workflow_engine.transition_to(cycle, "SCORECARD_REQUEST_SENT", cycle_repo, now)
        except Exception as exc:
            logger.warning("SCORECARD-DISPATCH: workflow advance failed: %s", exc)

    return DispatchResponse(
        total=len(payload.attendees),
        sent=sent_count,
        failed=len(payload.attendees) - sent_count,
        results=results,
    )


@router.post("/poll", response_model=PollResponse)
def poll_form_responses(form_id: str | None = None):
    """Poll Google Forms for new scorecard responses and store them."""
    logger.info("SCORECARD-POLL: form_id=%s", form_id)

    if not is_authenticated():
        logger.warning("SCORECARD-POLL: not authenticated with Google")
        raise HTTPException(
            status_code=401,
            detail="Google account not connected. Visit /auth/google to authenticate.",
        )

    try:
        logger.info("SCORECARD-POLL: calling poll_and_store(form_id=%s)", form_id)
        data = poll_and_store(form_id)
        logger.info("SCORECARD-POLL: result — total=%s, new=%s", data.get("total"), data.get("new"))
    except GoogleFormsError as exc:
        logger.error("SCORECARD-POLL: GoogleFormsError: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        logger.exception("SCORECARD-POLL: unexpected error: %s", exc)
        raise

    return PollResponse(**data)


@router.get("/responses/raw")
def get_raw_responses(form_id: str | None = None):
    """Get raw Google Forms responses without any parsing or mapping."""
    logger.info("SCORECARD-RAW: GET /responses/raw, form_id=%s", form_id)

    if not is_authenticated():
        logger.warning("SCORECARD-RAW: not authenticated with Google")
        raise HTTPException(
            status_code=401,
            detail="Google account not connected. Visit /auth/google to authenticate.",
        )

    try:
        data = fetch_raw_form_responses(form_id)
        logger.info("SCORECARD-RAW: fetched %s raw responses", data["total"])
        return data
    except GoogleFormsError as exc:
        logger.error("SCORECARD-RAW: GoogleFormsError: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        logger.exception("SCORECARD-RAW: unexpected error: %s", exc)
        raise


@router.get("/responses/{cycle_id}")
def get_cycle_responses(cycle_id: str):
    """Get all scorecard responses for a specific cycle. Fetches live from Google Forms if authenticated."""
    logger.info("SCORECARD-RESPONSES: GET /responses/%s", cycle_id)

    if is_authenticated():
        logger.info("SCORECARD-RESPONSES: authenticated — fetching live from Google Forms")
        try:
            data = poll_and_store()
            responses = [r for r in data["responses"] if r.get("cycle_id") == cycle_id]
            logger.info("SCORECARD-RESPONSES: live fetch — %d matched cycle_id=%s", len(responses), cycle_id)
        except Exception as exc:
            logger.warning("SCORECARD-RESPONSES: live fetch failed (%s), falling back to stored data", exc)
            responses = get_responses_for_cycle(cycle_id)
    else:
        logger.info("SCORECARD-RESPONSES: not authenticated — using stored data")
        responses = get_responses_for_cycle(cycle_id)

    logger.info("SCORECARD-RESPONSES: returning %d responses for cycle_id=%s", len(responses), cycle_id)
    return {"cycle_id": cycle_id, "count": len(responses), "responses": responses}


@router.get("/responses")
def get_all_responses():
    """Get all scorecard responses. Fetches live from Google Forms if authenticated."""
    logger.info("SCORECARD-RESPONSES: GET /responses (all)")

    if is_authenticated():
        logger.info("SCORECARD-RESPONSES: authenticated — fetching live from Google Forms")
        try:
            data = poll_and_store()
            responses = data["responses"]
            logger.info("SCORECARD-RESPONSES: live fetch — %d total responses", len(responses))
        except Exception as exc:
            logger.warning("SCORECARD-RESPONSES: live fetch failed (%s), falling back to stored data", exc)
            responses = get_all_stored_responses()
    else:
        logger.info("SCORECARD-RESPONSES: not authenticated — using stored data")
        responses = get_all_stored_responses()

    logger.info("SCORECARD-RESPONSES: returning %d responses", len(responses))
    return {"count": len(responses), "responses": responses}


# ── Submission Tracking ─────────────────────────────────────────────────────


@router.get("/submissions/{cycle_id}")
def get_submission_tracker(cycle_id: str):
    """
    Build a real-time submission tracker for a cycle.
    Matches form responses (by email) against cycle attendees.
    Returns who has submitted and who is still pending.
    """
    from app.dependencies import get_attendee_repo

    attendee_repo = get_attendee_repo()
    attendees = [a for a in attendee_repo.find_all() if a.get("cycle_id") == cycle_id]
    key_attendees = [a for a in attendees if a.get("is_key")]

    # Get responses for this cycle
    if is_authenticated():
        try:
            data = poll_and_store()
            responses = [r for r in data["responses"] if r.get("cycle_id") == cycle_id]
        except Exception:
            responses = get_responses_for_cycle(cycle_id)
    else:
        responses = get_responses_for_cycle(cycle_id)

    # Build email → response lookup (use first response per email for dedup)
    email_response_map: dict[str, dict] = {}
    for resp in responses:
        email = (resp.get("email") or "").lower().strip()
        if email and email not in email_response_map:
            email_response_map[email] = resp

    # Build tracker entries
    tracker = []
    for att in key_attendees:
        gmail = (att.get("gmail") or "").lower().strip()
        corp_email = (att.get("email") or "").lower().strip()
        # Match by gmail or corporate email
        matched_resp = email_response_map.get(gmail) or email_response_map.get(corp_email)

        tracker.append({
            "attendee_id": att["attendee_id"],
            "name": att["name"],
            "email": att["email"],
            "gmail": att.get("gmail", ""),
            "type": att.get("type", "Internal Stakeholder"),
            "role": att.get("role", ""),
            "organisation": att.get("organisation", ""),
            "submitted": matched_resp is not None,
            "submitted_at": matched_resp.get("submitted_at") if matched_resp else None,
            "response_id": matched_resp.get("response_id") if matched_resp else None,
        })

    total = len(tracker)
    submitted_count = sum(1 for t in tracker if t["submitted"])

    return {
        "cycle_id": cycle_id,
        "total_key_attendees": total,
        "submitted": submitted_count,
        "pending": total - submitted_count,
        "tracker": tracker,
    }


# ── Compiled Scorecard ──────────────────────────────────────────────────────

# Scorecard parameter keys grouped by category
SCORECARD_CATEGORIES = {
    "RISK_COMPLIANCE": {
        "label": "Risk & Compliance",
        "parameters": [
            {"key": "RELEASE_PATCH_MGMT", "label": "Release & Patch Management"},
            {"key": "SECURITY_RISK_MGMT", "label": "Security & Risk Management"},
            {"key": "AUDIT_COMPLIANCE", "label": "Audit & Compliance Adherence"},
        ],
    },
    "PERFORMANCE": {
        "label": "Performance",
        "parameters": [
            {"key": "DELIVERY_TIMELINESS", "label": "Delivery Timeliness"},
            {"key": "QUALITY_OF_DELIVERY", "label": "Quality of Delivery"},
            {"key": "RESOURCE_CAPABILITY", "label": "Resource Capability"},
            {"key": "SLA_ADHERENCE", "label": "SLA Adherence"},
            {"key": "OPERATIONAL_EFFICIENCY", "label": "Operational Efficiency"},
        ],
    },
    "COMMERCIAL": {
        "label": "Commercial",
        "parameters": [
            {"key": "PRICING_COMPETITIVENESS", "label": "Pricing Competitiveness"},
            {"key": "CONTRACT_COMPLIANCE", "label": "Contract Compliance"},
            {"key": "COST_CONTROL", "label": "Cost Control"},
            {"key": "BILLING_ACCURACY", "label": "Billing Accuracy"},
        ],
    },
    "RELATIONSHIP": {
        "label": "Relationship",
        "parameters": [
            {"key": "COMMUNICATION_EFFECTIVENESS", "label": "Communication Effectiveness"},
            {"key": "STAKEHOLDER_ENGAGEMENT", "label": "Stakeholder Engagement"},
            {"key": "RESPONSIVENESS", "label": "Responsiveness"},
            {"key": "COLLABORATION_ALIGNMENT", "label": "Collaboration & Alignment"},
        ],
    },
}


def _parse_score(value: str) -> int | None:
    """Extract numeric score from form answer like '3 (Acceptable)' or '5 (Excellent)'."""
    if not value:
        return None
    try:
        return int(value.strip()[0])
    except (ValueError, IndexError):
        return None


@router.get("/compiled/{cycle_id}")
def get_compiled_scorecard(cycle_id: str):
    """
    Build a compiled scorecard with 2 columns: Internal Stakeholder avg and Vendor avg.
    Matches responses to attendees by email, groups by attendee type, averages scores.
    """
    from app.dependencies import get_attendee_repo

    attendee_repo = get_attendee_repo()
    attendees = [a for a in attendee_repo.find_all() if a.get("cycle_id") == cycle_id]

    # Build email → attendee type lookup
    email_type_map: dict[str, str] = {}
    for att in attendees:
        gmail = (att.get("gmail") or "").lower().strip()
        corp = (att.get("email") or "").lower().strip()
        att_type = att.get("type", "Internal Stakeholder")
        if gmail:
            email_type_map[gmail] = att_type
        if corp:
            email_type_map[corp] = att_type

    # Get responses
    if is_authenticated():
        try:
            data = poll_and_store()
            responses = [r for r in data["responses"] if r.get("cycle_id") == cycle_id]
        except Exception:
            responses = get_responses_for_cycle(cycle_id)
    else:
        responses = get_responses_for_cycle(cycle_id)

    # Classify responses by type
    internal_responses: list[dict] = []
    vendor_responses: list[dict] = []

    for resp in responses:
        email = (resp.get("email") or "").lower().strip()
        att_type = email_type_map.get(email, "Internal Stakeholder")
        if att_type == "Vendor":
            vendor_responses.append(resp)
        else:
            internal_responses.append(resp)

    # Build compiled scorecard
    categories = []
    all_internal_scores = []
    all_vendor_scores = []

    for cat_key, cat_def in SCORECARD_CATEGORIES.items():
        params = []
        cat_internal_scores = []
        cat_vendor_scores = []

        for param in cat_def["parameters"]:
            pkey = param["key"]

            # Collect scores from internal responses
            i_scores = []
            for resp in internal_responses:
                raw = resp.get(pkey)
                if raw:
                    s = _parse_score(raw)
                    if s and 1 <= s <= 5:
                        i_scores.append(s)

            # Collect scores from vendor responses
            v_scores = []
            for resp in vendor_responses:
                raw = resp.get(pkey)
                if raw:
                    s = _parse_score(raw)
                    if s and 1 <= s <= 5:
                        v_scores.append(s)

            i_avg = round(sum(i_scores) / len(i_scores), 2) if i_scores else None
            v_avg = round(sum(v_scores) / len(v_scores), 2) if v_scores else None

            if i_avg is not None:
                cat_internal_scores.append(i_avg)
                all_internal_scores.append(i_avg)
            if v_avg is not None:
                cat_vendor_scores.append(v_avg)
                all_vendor_scores.append(v_avg)

            params.append({
                "parameter_key": pkey,
                "parameter_label": param["label"],
                "internal_avg": i_avg,
                "vendor_avg": v_avg,
                "internal_count": len(i_scores),
                "vendor_count": len(v_scores),
            })

        cat_i_avg = round(sum(cat_internal_scores) / len(cat_internal_scores), 2) if cat_internal_scores else None
        cat_v_avg = round(sum(cat_vendor_scores) / len(cat_vendor_scores), 2) if cat_vendor_scores else None

        categories.append({
            "category": cat_key,
            "category_label": cat_def["label"],
            "internal_avg": cat_i_avg,
            "vendor_avg": cat_v_avg,
            "parameters": params,
        })

    overall_i = round(sum(all_internal_scores) / len(all_internal_scores), 2) if all_internal_scores else None
    overall_v = round(sum(all_vendor_scores) / len(all_vendor_scores), 2) if all_vendor_scores else None

    # Collect comments by type
    comments: dict[str, dict] = {}
    for cat_key in SCORECARD_CATEGORIES:
        comment_key = f"comment_{cat_key}"
        internal_comments = [r.get(comment_key, "") for r in internal_responses if r.get(comment_key)]
        vendor_comments = [r.get(comment_key, "") for r in vendor_responses if r.get(comment_key)]
        if internal_comments or vendor_comments:
            comments[cat_key] = {
                "internal": internal_comments,
                "vendor": vendor_comments,
            }

    # Key recommendations
    all_recs = [r.get("key_recommendations", "") for r in responses if r.get("key_recommendations")]

    return {
        "cycle_id": cycle_id,
        "internal_respondents": len(internal_responses),
        "vendor_respondents": len(vendor_responses),
        "overall_internal_avg": overall_i,
        "overall_vendor_avg": overall_v,
        "categories": categories,
        "comments": comments,
        "key_recommendations": all_recs,
    }
