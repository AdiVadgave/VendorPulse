"""
Module E — Meeting Agent routes.

POST /api/cycles/{cycleId}/meeting/minutes           Generate meeting minutes from notes
POST /api/cycles/{cycleId}/meeting/extract-actions    Extract action items from minutes text
POST /api/cycles/{cycleId}/meeting/parse-transcript   Parse a transcript into structured notes
POST /api/cycles/{cycleId}/meeting/minutes/approve    Approve generated meeting minutes
POST /api/cycles/{cycleId}/meeting/minutes/send       Send approved minutes to internal stakeholders
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies import (
    get_agent_run_repo,
    get_attendee_repo,
    get_meeting_agent,
    get_meeting_artifact_repo,
)
from app.models.common import AgentResponse
from app.models.meeting_agent import GenerateMinutesRequest, ParseTranscriptRequest
from app.services.gmail_service import build_minutes_email
from app.services.mail_provider import get_mail_provider, MailSendError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cycles/{cycleId}/meeting", tags=["meeting-agent"])


@router.get("/artifact")
def get_meeting_artifact(
    cycleId: str,
    meeting_id: str = "",
    artifact_repo=Depends(get_meeting_artifact_repo),
):
    """Return the persisted parsed notes + generated minutes for a meeting, so the
    Meeting tab restores its state after a refresh (no re-parse / re-generate)."""
    mid = meeting_id or f"mtg-{cycleId}"
    artifact = artifact_repo.get(cycleId, mid)
    if not artifact:
        return {"meeting_id": mid, "notes": [], "minutes": None, "parsed_at": None}
    return {
        "meeting_id": mid,
        "notes": artifact.get("notes", []),
        "minutes": artifact.get("minutes"),
        "parsed_at": artifact.get("parsed_at"),
    }


@router.post("/minutes", response_model=AgentResponse)
def generate_minutes(
    cycleId: str,
    payload: GenerateMinutesRequest,
    artifact_repo=Depends(get_meeting_artifact_repo),
):
    """
    Generate formal meeting minutes from captured notes.
    Uses Azure OpenAI when ENABLE_LLM=true, otherwise returns deterministic minutes.
    """
    logger.info(
        "MEETING-AGENT: generate minutes — cycleId=%s, meetingId=%s, notes=%d",
        cycleId, payload.meeting_id, len(payload.notes),
    )

    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    agent = get_meeting_agent(cycle_id=cycleId)
    response = agent.run(
        user_message=f"Generate meeting minutes for meeting {payload.meeting_id}",
        context={
            "action": "generate_minutes",
            "params": {
                "meeting_id": payload.meeting_id,
                "notes": [n.model_dump() for n in payload.notes],
                "attendees": payload.attendees,
                "meeting_date": payload.meeting_date,
            },
        },
    )
    # Persist the generated minutes so the MoM survives a refresh.
    if response.status == "success" and isinstance(response.data, dict) and response.data.get("minutes"):
        artifact_repo.upsert(cycleId, payload.meeting_id, {
            "minutes": response.data["minutes"],
            "minutes_generated_at": datetime.now(timezone.utc).isoformat(),
        })
    logger.info("MEETING-AGENT: minutes generated — status=%s", response.status)
    return response


@router.post("/extract-actions", response_model=AgentResponse)
def extract_actions(
    cycleId: str,
    payload: dict,
):
    """
    Extract structured action items from meeting minutes text.
    """
    minutes_text = payload.get("minutes_text", "")
    if not minutes_text:
        raise HTTPException(status_code=400, detail="minutes_text is required")

    logger.info("MEETING-AGENT: extract actions — cycleId=%s, text_len=%d", cycleId, len(minutes_text))

    agent = get_meeting_agent(cycle_id=cycleId)
    response = agent.run(
        user_message="Extract action items from these meeting minutes",
        context={
            "action": "extract_actions",
            "params": {"minutes_text": minutes_text},
        },
    )
    logger.info("MEETING-AGENT: actions extracted — status=%s", response.status)
    return response


@router.post("/parse-transcript", response_model=AgentResponse)
def parse_transcript(
    cycleId: str,
    payload: ParseTranscriptRequest,
    artifact_repo=Depends(get_meeting_artifact_repo),
):
    """
    Parse a raw meeting transcript into structured notes.
    Uses Azure OpenAI to identify questions, decisions, objections, actions, etc.
    """
    logger.info(
        "MEETING-AGENT: parse transcript — cycleId=%s, meetingId=%s, len=%d",
        cycleId, payload.meeting_id, len(payload.transcript),
    )

    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    agent = get_meeting_agent(cycle_id=cycleId)
    response = agent.run(
        user_message=(
            f"Parse this meeting transcript into structured notes:\n\n{payload.transcript}"
        ),
        context={
            "action": "parse_transcript",
            "params": {
                "meeting_id": payload.meeting_id,
                "transcript": payload.transcript,
            },
        },
    )
    # Persist the parsed notes so the Meeting tab shows "already parsed" after refresh.
    if response.status == "success" and isinstance(response.data, dict):
        artifact_repo.upsert(cycleId, payload.meeting_id, {
            "notes": response.data.get("notes", []),
            "parsed_at": datetime.now(timezone.utc).isoformat(),
        })
    logger.info("MEETING-AGENT: transcript parsed — status=%s", response.status)
    return response


# ── Approval endpoint ───────────────────────────────────────────────────────


class ApproveMinutesRequest(BaseModel):
    run_id: str
    approved_by: str = "coordinator"


@router.post("/minutes/approve")
def approve_minutes(cycleId: str, payload: ApproveMinutesRequest):
    """Mark generated meeting minutes as approved and finalised."""
    logger.info("MEETING-AGENT: approve minutes — cycleId=%s, run_id=%s", cycleId, payload.run_id)

    repo = get_agent_run_repo()
    record = repo.get_by_run_id(payload.run_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Agent run '{payload.run_id}' not found")

    now = datetime.now(timezone.utc).isoformat()
    repo.update_by_id("run_id", payload.run_id, {
        "approval_status": "APPROVED",
        "approved_by": payload.approved_by,
        "approved_at": now,
    })

    logger.info("MEETING-AGENT: minutes approved — run_id=%s, by=%s", payload.run_id, payload.approved_by)
    return {
        "status": "approved",
        "run_id": payload.run_id,
        "approved_by": payload.approved_by,
        "approved_at": now,
    }


# ── Send minutes endpoint ───────────────────────────────────────────────────


class SendMinutesRequest(BaseModel):
    run_id: str
    minutes: dict[str, Any]



@router.post("/minutes/send")
def send_minutes(cycleId: str, payload: SendMinutesRequest):
    """
    Send approved meeting minutes to all internal stakeholders via Gmail API.
    Requires Google OAuth to be completed at /auth/google first.
    Uses the attendee's `gmail` field as the delivery address.
    """
    logger.info("MEETING-AGENT: send minutes — cycleId=%s, run_id=%s", cycleId, payload.run_id)

    attendee_repo = get_attendee_repo()

    all_attendees = attendee_repo.get_for_cycle(cycleId)
    internal = [
        a for a in all_attendees
        if a.get("type", "").lower() == "internal stakeholder" and a.get("gmail", "").strip()
    ]

    if not internal:
        raise HTTPException(
            status_code=404,
            detail=f"No internal stakeholders with Gmail addresses found for cycle '{cycleId}'"
        )

    minutes = payload.minutes

    sent_to = []
    failed = []

    for attendee in internal:
        gmail_addr = attendee["gmail"].strip()
        name = attendee.get("name", gmail_addr)

        email_content = build_minutes_email(
            attendee_name=name,
            vendor_name=minutes.get("vendor_name", ""),
            quarter=minutes.get("quarter", ""),
            year=minutes.get("year", 0),
            minutes=minutes,
        )

        try:
            get_mail_provider().send_html_email(
                to_email=gmail_addr,
                subject=email_content["subject"],
                html_body=email_content["html_body"],
                text_body=email_content["text_body"],
            )
            sent_to.append({"name": name, "email": gmail_addr})
            logger.info("MEETING-AGENT: minutes sent to %s (%s)", name, gmail_addr)
        except MailSendError as exc:
            logger.warning("MEETING-AGENT: failed to send to %s — %s", gmail_addr, exc)
            failed.append({"name": name, "email": gmail_addr, "error": str(exc)})

    if not sent_to and failed:
        # All failed — likely not authenticated
        first_error = failed[0]["error"]
        raise HTTPException(
            status_code=503,
            detail=f"Gmail send failed. Ensure Google OAuth is completed at /auth/google. Error: {first_error}"
        )

    logger.info(
        "MEETING-AGENT: minutes dispatch complete — cycleId=%s, sent=%d, failed=%d",
        cycleId, len(sent_to), len(failed),
    )

    return {
        "status": "sent",
        "run_id": payload.run_id,
        "sent_to": sent_to,
        "count": len(sent_to),
        "failed": failed,
        "sent_at": datetime.now(timezone.utc).isoformat(),
    }
