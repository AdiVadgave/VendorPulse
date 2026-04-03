"""
Meeting CRUD + invite response routes.

GET    /api/meetings                      List meetings (optional ?cycleId=)
POST   /api/meetings                      Create meeting (validates, checks double-booking)
GET    /api/meetings/{meetingId}          Get meeting
PUT    /api/meetings/{meetingId}          Update meeting
DELETE /api/meetings/{meetingId}          Cancel meeting (organiser only)
PUT    /api/meetings/{meetingId}/respond  Accept / decline invite
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from app.dependencies import get_meeting_service
from app.models.meeting import CancelMeeting, MeetingCreate, MeetingRespond, MeetingUpdate
from app.services.meeting_service import MeetingService

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


@router.get("")
def list_meetings(
    cycleId: Optional[str] = Query(default=None, description="Filter by governance cycle"),
    svc: MeetingService = Depends(get_meeting_service),
):
    return {"meetings": svc.list_meetings(cycle_id=cycleId)}


@router.post("", status_code=201)
def create_meeting(
    payload: MeetingCreate,
    svc: MeetingService = Depends(get_meeting_service),
):
    try:
        meeting, warnings = svc.create_meeting(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {
        "meeting": meeting,
        "warnings": warnings,
        "message": "Meeting invite sent successfully",
    }


@router.get("/{meetingId}")
def get_meeting(meetingId: str, svc: MeetingService = Depends(get_meeting_service)):
    meeting = svc.get_meeting(meetingId)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {"meeting": meeting}


@router.put("/{meetingId}")
def update_meeting(
    meetingId: str,
    payload: MeetingUpdate,
    svc: MeetingService = Depends(get_meeting_service),
):
    meeting = svc.update_meeting(meetingId, payload)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {"meeting": meeting}


@router.delete("/{meetingId}")
def cancel_meeting(
    meetingId: str,
    payload: CancelMeeting = Body(...),
    svc: MeetingService = Depends(get_meeting_service),
):
    try:
        meeting = svc.cancel_meeting(meetingId, payload.organizerId)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {"message": "Meeting cancelled successfully", "meeting": meeting}


@router.put("/{meetingId}/respond")
def respond_to_meeting(
    meetingId: str,
    payload: MeetingRespond,
    svc: MeetingService = Depends(get_meeting_service),
):
    try:
        meeting = svc.respond_to_meeting(meetingId, payload.userId, payload.status)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {"meeting": meeting, "message": f"Meeting {payload.status} successfully"}
