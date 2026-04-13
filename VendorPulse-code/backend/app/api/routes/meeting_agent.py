"""
Module E — Meeting Agent routes.

POST /api/cycles/{cycleId}/meeting/minutes           Generate meeting minutes from notes
POST /api/cycles/{cycleId}/meeting/extract-actions    Extract action items from minutes text
POST /api/cycles/{cycleId}/meeting/parse-transcript   Parse a transcript into structured notes
POST /api/cycles/{cycleId}/meeting/minutes/approve    Approve generated meeting minutes
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies import get_meeting_agent, get_agent_run_repo
from app.models.common import AgentResponse
from app.models.meeting_agent import GenerateMinutesRequest, ParseTranscriptRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cycles/{cycleId}/meeting", tags=["meeting-agent"])


@router.post("/minutes", response_model=AgentResponse)
def generate_minutes(
    cycleId: str,
    payload: GenerateMinutesRequest,
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
