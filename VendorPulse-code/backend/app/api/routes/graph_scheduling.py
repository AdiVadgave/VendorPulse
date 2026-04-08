"""
Graph scheduling routes — integrate Microsoft Graph API for real calendar-based slot finding and meeting creation.

Endpoints:
  POST /api/cycles/{cycleId}/scheduling/graph/find-times   Find real slots via Graph findMeetingTimes
  POST /api/cycles/{cycleId}/scheduling/graph/send-invite   Create Teams meeting + send invites
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException

from app.config import Settings, settings
from app.core.workflow_engine import WorkflowStateError, WorkflowViolationError, workflow_engine
from app.dependencies import get_cycle_repo, get_attendee_repo, get_slot_repo
from app.services.graph_service import GraphService
from app.utils.demo_attendees import get_attendee_name
from pydantic import BaseModel, Field

router = APIRouter(tags=["graph-scheduling"])


# ──────────────────────────────────────────────────────────────────────────────
# Request/Response models
# ──────────────────────────────────────────────────────────────────────────────


class FindTimesRequest(BaseModel):
    """Request body for Graph findMeetingTimes."""

    organiser_email: str = Field(..., description="Email of the meeting organiser")
    date_range_start: str = Field(..., description="YYYY-MM-DD")
    date_range_end: str = Field(..., description="YYYY-MM-DD")
    duration_hours: float = Field(0.5, description="Meeting duration (0.5 for 30 min, 1.0 for 1 hour)")
    use_specific_attendees: Optional[list[str]] = Field(
        None,
        description="If provided, only these attendees. Otherwise all cycle attendees."
    )
    time_zone: str = Field("UTC", description="Timezone for meeting")


class SendInviteRequest(BaseModel):
    """Request body for creating Teams meeting."""

    slot_id: str = Field(..., description="The slot_proposals.json slot_id to convert to Teams meeting")
    organiser_email: str = Field(..., description="Email of the meeting organiser")


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────


def _get_cycle_or_404(cycle_id: str, cycle_repo):
    """Fetch cycle or raise 404."""
    cycle = cycle_repo.get_by_cycle_id(cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycle_id}' not found")
    return cycle


def _get_graph_access_token() -> str:
    """
    Read Graph token from .env at request time.

    This avoids stale in-memory tokens when GRAPH_ACCESS_TOKEN is updated
    while the server process is still running.
    """
    fresh_settings = Settings()
    token = fresh_settings.graph_access_token or settings.graph_access_token
    token = token.strip() if token else ""

    if token.lower().startswith("bearer "):
        token = token[7:].strip()

    return token


# ──────────────────────────────────────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────────────────────────────────────


@router.post("/api/cycles/{cycleId}/scheduling/graph/find-times")
def find_meeting_times_graph(
    cycleId: str,
    payload: FindTimesRequest,
    cycle_repo=Depends(get_cycle_repo),
    attendee_repo=Depends(get_attendee_repo),
    slot_repo=Depends(get_slot_repo),
):
    """
    Find real meeting times using Microsoft Graph findMeetingTimes.
    
    Returns SlotProposal objects (compatible with existing /rank-slots response).
    """
    # Fetch cycle
    cycle = _get_cycle_or_404(cycleId, cycle_repo)

    # Check workflow state
    try:
        workflow_engine.assert_at_least(cycle, "ATTENDEE_REFRESH_SENT")
    except WorkflowStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    # Initialize Graph service using latest token from .env.
    graph_access_token = _get_graph_access_token()
    if not graph_access_token:
        raise HTTPException(
            status_code=500,
            detail="GRAPH_ACCESS_TOKEN is not set in .env",
        )

    graph_service = GraphService(graph_access_token)

    # Get attendees
    attendees = attendee_repo.get_for_cycle(cycleId)
    if not attendees:
        raise HTTPException(status_code=400, detail="No attendees found for this cycle")

    # Build attendee email list
    if payload.use_specific_attendees:
        attendee_emails = payload.use_specific_attendees
    else:
        attendee_emails = [a.get("email") for a in attendees if a.get("email")]

    # Ensure requested organiser is part of required attendees for availability checks.
    organiser_email = payload.organiser_email.strip().lower()
    attendee_emails = [e.strip().lower() for e in attendee_emails if e]
    if organiser_email and organiser_email not in attendee_emails:
        attendee_emails.append(organiser_email)

    if not attendee_emails:
        raise HTTPException(status_code=400, detail="No attendee emails found")

    # Call Graph findMeetingTimes (synchronous wrapper)
    try:
        import asyncio
        result = asyncio.run(graph_service.find_meeting_times(
            attendee_emails=attendee_emails,
            date_range_start=payload.date_range_start,
            date_range_end=payload.date_range_end,
            duration_hours=payload.duration_hours,
            time_zone=payload.time_zone,
            max_candidates=3,
            is_organizer_optional=True,
        ))
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        raise HTTPException(status_code=500, detail=f"Graph API error: {str(e)}\n{error_detail}")

    # Check for API errors
    if "error" in result:
        status_code = int(result.get("status_code") or 400)
        code = result.get("code")
        detail = result.get("detail")
        message = result.get("error")

        if status_code == 401:
            guidance = (
                "Graph token is invalid or expired. Refresh GRAPH_ACCESS_TOKEN in backend/.env "
                "from Graph Explorer (with Calendars.ReadWrite delegated permission)."
            )
            full_detail = f"{message}. {detail}. {guidance}" if detail else f"{message}. {guidance}"
        else:
            code_suffix = f" (code: {code})" if code else ""
            detail_suffix = f" - {detail}" if detail else ""
            full_detail = f"{message}{code_suffix}{detail_suffix}"

        raise HTTPException(status_code=status_code, detail=full_detail)

    # Transform Graph response to SlotProposal
    suggestions = result.get("meetingTimeSuggestions", [])
    slot_proposals = []

    for idx, suggestion in enumerate(suggestions):
        # Graph returns time in meetingTimeSlot.start.dateTime
        meeting_slot = suggestion.get("meetingTimeSlot", {})
        start_info = meeting_slot.get("start", {})
        meeting_time_str = start_info.get("dateTime", "")

        # Build SlotProposal
        slot_id = f"slot_{uuid.uuid4().hex[:8]}"
        slot_proposal = {
            "slot_id": slot_id,
            "cycle_id": cycleId,
            "proposed_time": meeting_time_str,
            "proposed_time_zone": start_info.get("timeZone") or payload.time_zone,
            "duration_minutes": int(payload.duration_hours * 60),
            "organiser_available": True,  # Graph already checked
            "exec_sponsor_available": True,  # We'll assume yes for Graph results
            "rank_score": 100 - (idx * 10),  # Higher score for earlier suggestions
            "is_approved": False,
            "attendance_count": len(attendee_emails),
            "total_attendees": len(attendee_emails),
            "conflict_count": 0,  # Graph has already resolved conflicts
            "attending": attendee_emails,
            "conflicts": [],
        }
        slot_proposals.append(slot_proposal)

        # Persist to slot_proposals.json using repository
        slot_repo.insert(slot_proposal)

    # Align workflow with deterministic path: slot discovery means
    # availability has effectively been collected for this cycle.
    now = datetime.now(timezone.utc).isoformat()
    if workflow_engine.can_transition(cycle.get("workflow_state", ""), "AVAILABILITY_COLLECTED"):
        workflow_engine.advance(cycle, cycle_repo, now)

    return {
        "message": f"Found {len(slot_proposals)} real meeting slots via Graph",
        "slot_proposals": slot_proposals,
        "attendee_count": len(attendee_emails),
    }


@router.post("/api/cycles/{cycleId}/scheduling/graph/send-invite")
def send_meeting_invite_graph(
    cycleId: str,
    payload: SendInviteRequest,
    cycle_repo=Depends(get_cycle_repo),
    attendee_repo=Depends(get_attendee_repo),
    slot_repo=Depends(get_slot_repo),
):
    """
    Create a real Teams meeting event and send invites to all cycle attendees.
    
    Takes an approved slot_id and converts it to a real Teams meeting via Graph.
    """
    # Fetch cycle
    cycle = _get_cycle_or_404(cycleId, cycle_repo)

    # Check workflow state
    try:
        workflow_engine.assert_at_least(cycle, "AVAILABILITY_COLLECTED")
    except WorkflowStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    # Initialize Graph service using latest token from .env.
    graph_access_token = _get_graph_access_token()
    if not graph_access_token:
        raise HTTPException(
            status_code=500,
            detail="GRAPH_ACCESS_TOKEN is not set in .env",
        )

    graph_service = GraphService(graph_access_token)

    # Fetch the slot
    slot = slot_repo.get_by_slot_id(payload.slot_id)

    if not slot:
        raise HTTPException(status_code=404, detail=f"Slot '{payload.slot_id}' not found")

    if not slot.get("is_approved"):
        raise HTTPException(status_code=400, detail="Slot must be approved before sending invites")

    # Get attendees
    attendees = attendee_repo.get_for_cycle(cycleId)
    attendee_emails = [a.get("email") for a in attendees if a.get("email")]

    if not attendee_emails:
        raise HTTPException(status_code=400, detail="No attendee emails found")

    # Build meeting subject
    subject = f"Vendor Meeting — {cycle.get('vendor_name', 'TBD')} ({cycle.get('quarter', '')} {cycle.get('year', '')})"

    # Create event (synchronous wrapper)
    try:
        import asyncio
        duration_minutes = slot.get("duration_minutes", 30)
        duration_hours = float(duration_minutes) / 60.0
        result = asyncio.run(graph_service.create_event(
            subject=subject,
            attendee_emails=attendee_emails,
            start_time=slot.get("proposed_time"),
            duration_hours=duration_hours,
            organiser_email=payload.organiser_email,
            is_online_meeting=True,
            time_zone=slot.get("proposed_time_zone") or "UTC",
        ))
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        raise HTTPException(status_code=500, detail=f"Graph API error: {str(e)}\n{error_detail}")

    # Check for API errors
    if "error" in result:
        status_code = int(result.get("status_code") or 400)
        code = result.get("code")
        detail = result.get("detail")
        message = result.get("error")

        if status_code == 401:
            guidance = (
                "Graph token is invalid or expired. Refresh GRAPH_ACCESS_TOKEN in backend/.env "
                "from Graph Explorer (with Calendars.ReadWrite delegated permission)."
            )
            full_detail = f"{message}. {detail}. {guidance}" if detail else f"{message}. {guidance}"
        else:
            code_suffix = f" (code: {code})" if code else ""
            detail_suffix = f" - {detail}" if detail else ""
            full_detail = f"{message}{code_suffix}{detail_suffix}"

        raise HTTPException(status_code=status_code, detail=full_detail)

    return {
        "message": "Teams meeting created and invites sent",
        "event_id": result.get("id"),
        "teams_meeting_url": result.get("onlineMeetingUrl"),
        "web_link": result.get("webLink"),
        "slot_id": payload.slot_id,
    }
