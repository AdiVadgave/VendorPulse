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

from app.config import settings
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

    # Initialize Graph service
    if not settings.graph_access_token:
        raise HTTPException(
            status_code=500,
            detail="GRAPH_ACCESS_TOKEN is not set in .env",
        )

    graph_service = GraphService(settings.graph_access_token)

    # Get attendees
    attendees = attendee_repo.get_for_cycle(cycleId)
    if not attendees:
        raise HTTPException(status_code=400, detail="No attendees found for this cycle")

    # Build attendee email list
    if payload.use_specific_attendees:
        attendee_emails = payload.use_specific_attendees
    else:
        attendee_emails = [a.get("email") for a in attendees if a.get("email")]

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
        ))
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        raise HTTPException(status_code=500, detail=f"Graph API error: {str(e)}\n{error_detail}")

    # Check for API errors
    if "error" in result:
        raise HTTPException(status_code=400, detail=result.get("error"))

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

    # Initialize Graph service
    if not settings.graph_access_token:
        raise HTTPException(
            status_code=500,
            detail="GRAPH_ACCESS_TOKEN is not set in .env",
        )

    graph_service = GraphService(settings.graph_access_token)

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
        result = asyncio.run(graph_service.create_event(
            subject=subject,
            attendee_emails=attendee_emails,
            start_time=slot.get("proposed_time"),
            duration_hours=0.5,  # From user spec: "half hours or configurable"
            organiser_email=payload.organiser_email,
            is_online_meeting=True,
            time_zone="UTC",
        ))
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        raise HTTPException(status_code=500, detail=f"Graph API error: {str(e)}\n{error_detail}")

    # Check for API errors
    if "error" in result:
        raise HTTPException(status_code=400, detail=result.get("error"))

    return {
        "message": "Teams meeting created and invites sent",
        "event_id": result.get("id"),
        "teams_meeting_url": result.get("onlineMeetingUrl"),
        "web_link": result.get("webLink"),
        "slot_id": payload.slot_id,
    }
