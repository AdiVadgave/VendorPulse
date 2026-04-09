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
    fetch_raw_form_responses,
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
    print(f"[SCORECARD-DISPATCH] Received dispatch request: cycle_id={payload.cycle_id}, vendor={payload.vendor_name}, quarter={payload.quarter}, year={payload.year}")
    print(f"[SCORECARD-DISPATCH] Attendees: {[(a.name, a.email) for a in payload.attendees]}")
    print(f"[SCORECARD-DISPATCH] form_url from payload: {payload.form_url}")

    if not is_authenticated():
        print("[SCORECARD-DISPATCH] ERROR: Not authenticated with Google")
        raise HTTPException(
            status_code=401,
            detail="Google account not connected. Visit /auth/google to authenticate.",
        )

    form_url = payload.form_url or settings.google_form_url
    print(f"[SCORECARD-DISPATCH] Using form_url: {form_url}")
    results: list[DispatchResult] = []
    sent_count = 0

    for attendee in payload.attendees:
        print(f"[SCORECARD-DISPATCH] Building email for {attendee.name} ({attendee.email})")
        email_data = build_scorecard_email(
            attendee_name=attendee.name,
            vendor_name=payload.vendor_name,
            cycle_id=payload.cycle_id,
            quarter=payload.quarter,
            year=payload.year,
            form_url=form_url,
        )

        try:
            print(f"[SCORECARD-DISPATCH] Sending email to {attendee.email}...")
            result = send_html_email(
                to_email=attendee.email,
                subject=email_data["subject"],
                html_body=email_data["html_body"],
                text_body=email_data["text_body"],
            )
            print(f"[SCORECARD-DISPATCH] Email sent successfully to {attendee.email}, message_id={result.get('id')}")
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
            print(f"[SCORECARD-DISPATCH] FAILED to send to {attendee.email}: {exc}")
            results.append(
                DispatchResult(
                    attendee=attendee.name,
                    email=attendee.email,
                    status="failed",
                    error=str(exc),
                )
            )

    print(f"[SCORECARD-DISPATCH] Done: {sent_count} sent, {len(payload.attendees) - sent_count} failed")
    return DispatchResponse(
        total=len(payload.attendees),
        sent=sent_count,
        failed=len(payload.attendees) - sent_count,
        results=results,
    )


@router.post("/poll", response_model=PollResponse)
def poll_form_responses(form_id: str | None = None):
    """Poll Google Forms for new scorecard responses and store them."""
    print(f"[SCORECARD-POLL] Received poll request: form_id={form_id}")

    if not is_authenticated():
        print("[SCORECARD-POLL] ERROR: Not authenticated with Google")
        raise HTTPException(
            status_code=401,
            detail="Google account not connected. Visit /auth/google to authenticate.",
        )

    try:
        print(f"[SCORECARD-POLL] Calling poll_and_store(form_id={form_id})...")
        data = poll_and_store(form_id)
        print(f"[SCORECARD-POLL] Poll result: total={data.get('total')}, new={data.get('new')}, responses_count={len(data.get('responses', []))}")
    except GoogleFormsError as exc:
        print(f"[SCORECARD-POLL] GoogleFormsError: {exc}")
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        print(f"[SCORECARD-POLL] Unexpected error: {type(exc).__name__}: {exc}")
        raise

    return PollResponse(**data)


@router.get("/responses/raw")
def get_raw_responses(form_id: str | None = None):
    """Get raw Google Forms responses without any parsing or mapping."""
    print(f"[SCORECARD-RAW] GET /responses/raw, form_id={form_id}")

    if not is_authenticated():
        print("[SCORECARD-RAW] ERROR: Not authenticated with Google")
        raise HTTPException(
            status_code=401,
            detail="Google account not connected. Visit /auth/google to authenticate.",
        )

    try:
        data = fetch_raw_form_responses(form_id)
        print(f"[SCORECARD-RAW] Raw responses fetched: {data['total']} responses")
        return data
    except GoogleFormsError as exc:
        print(f"[SCORECARD-RAW] GoogleFormsError: {exc}")
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        print(f"[SCORECARD-RAW] Unexpected error: {type(exc).__name__}: {exc}")
        raise


@router.get("/responses/{cycle_id}")
def get_cycle_responses(cycle_id: str):
    """Get all scorecard responses for a specific cycle. Fetches live from Google Forms if authenticated."""
    print(f"[SCORECARD-RESPONSES] GET /responses/{cycle_id}")

    if is_authenticated():
        print(f"[SCORECARD-RESPONSES] Authenticated — fetching live from Google Forms")
        try:
            data = poll_and_store()
            responses = [r for r in data["responses"] if r.get("cycle_id") == cycle_id]
            print(f"[SCORECARD-RESPONSES] Live fetch: {len(responses)} matched cycle_id={cycle_id}")
        except Exception as exc:
            print(f"[SCORECARD-RESPONSES] Live fetch failed ({exc}), falling back to stored data")
            responses = get_responses_for_cycle(cycle_id)
    else:
        print(f"[SCORECARD-RESPONSES] Not authenticated — using stored data")
        responses = get_responses_for_cycle(cycle_id)

    print(f"[SCORECARD-RESPONSES] Returning {len(responses)} responses for cycle_id={cycle_id}")
    return {"cycle_id": cycle_id, "count": len(responses), "responses": responses}


@router.get("/responses")
def get_all_responses():
    """Get all scorecard responses. Fetches live from Google Forms if authenticated."""
    print("[SCORECARD-RESPONSES] GET /responses (all)")

    if is_authenticated():
        print("[SCORECARD-RESPONSES] Authenticated — fetching live from Google Forms")
        try:
            data = poll_and_store()
            responses = data["responses"]
            print(f"[SCORECARD-RESPONSES] Live fetch: {len(responses)} total responses")
        except Exception as exc:
            print(f"[SCORECARD-RESPONSES] Live fetch failed ({exc}), falling back to stored data")
            responses = get_all_stored_responses()
    else:
        print("[SCORECARD-RESPONSES] Not authenticated — using stored data")
        responses = get_all_stored_responses()

    print(f"[SCORECARD-RESPONSES] Returning {len(responses)} responses")
    return {"count": len(responses), "responses": responses}
