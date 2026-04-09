"""
Scorecard API routes.

Provides endpoints for:
  1. Dispatching scorecard request emails to key attendees via Gmail
  2. Polling Google Forms for new scorecard responses
  3. Retrieving stored responses for a specific cycle
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.services.gmail_service import GmailSendError, build_scorecard_email, send_html_email
from app.services.google_auth_service import is_authenticated
from app.services.google_forms_service import (
    GoogleFormsError,
    get_all_stored_responses,
    get_responses_for_cycle,
    poll_and_store,
)

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
    if not is_authenticated():
        raise HTTPException(
            status_code=401,
            detail="Google account not connected. Visit /auth/google to authenticate.",
        )

    form_url = payload.form_url or settings.google_form_url
    results: list[DispatchResult] = []
    sent_count = 0

    for attendee in payload.attendees:
        email_data = build_scorecard_email(
            attendee_name=attendee.name,
            vendor_name=payload.vendor_name,
            cycle_id=payload.cycle_id,
            quarter=payload.quarter,
            year=payload.year,
            form_url=form_url,
        )

        try:
            result = send_html_email(
                to_email=attendee.email,
                subject=email_data["subject"],
                html_body=email_data["html_body"],
                text_body=email_data["text_body"],
            )
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
            results.append(
                DispatchResult(
                    attendee=attendee.name,
                    email=attendee.email,
                    status="failed",
                    error=str(exc),
                )
            )

    return DispatchResponse(
        total=len(payload.attendees),
        sent=sent_count,
        failed=len(payload.attendees) - sent_count,
        results=results,
    )


@router.post("/poll", response_model=PollResponse)
def poll_form_responses(form_id: str | None = None):
    """Poll Google Forms for new scorecard responses and store them."""
    if not is_authenticated():
        raise HTTPException(
            status_code=401,
            detail="Google account not connected. Visit /auth/google to authenticate.",
        )

    try:
        data = poll_and_store(form_id)
    except GoogleFormsError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return PollResponse(**data)


@router.get("/responses/{cycle_id}")
def get_cycle_responses(cycle_id: str):
    """Get all stored scorecard responses for a specific cycle."""
    responses = get_responses_for_cycle(cycle_id)
    return {"cycle_id": cycle_id, "count": len(responses), "responses": responses}


@router.get("/responses")
def get_all_responses():
    """Get all stored scorecard responses across all cycles."""
    responses = get_all_stored_responses()
    return {"count": len(responses), "responses": responses}
