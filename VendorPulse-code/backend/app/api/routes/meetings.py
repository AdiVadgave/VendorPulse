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

import logging
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from app.dependencies import get_meeting_service
from app.models.meeting import CancelMeeting, MeetingCreate, MeetingRespond, MeetingUpdate
from app.services.meeting_service import MeetingService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


@router.get("")
def list_meetings(
    cycleId: Optional[str] = Query(default=None, description="Filter by governance cycle"),
    svc: MeetingService = Depends(get_meeting_service),
):
    logger.info("list_meetings called — cycleId=%s", cycleId)
    meetings = svc.list_meetings(cycle_id=cycleId)
    logger.info("list_meetings returning %d meetings", len(meetings))
    return {"meetings": meetings}


@router.post("", status_code=201)
def create_meeting(
    payload: MeetingCreate,
    svc: MeetingService = Depends(get_meeting_service),
):
    logger.info(
        "create_meeting called — title=%s, organizer_id=%s, participants=%s, time_slot=%s",
        payload.title, payload.organizer_id, payload.participant_ids, payload.time_slot,
    )
    try:
        meeting, warnings = svc.create_meeting(payload)
    except ValueError as exc:
        logger.warning("create_meeting validation error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))
    logger.info("create_meeting success — meeting_id=%s, warnings=%s", meeting.get("meeting_id"), warnings)
    return {
        "meeting": meeting,
        "warnings": warnings,
        "message": "Meeting invite sent successfully",
    }


@router.get("/{meetingId}")
def get_meeting(meetingId: str, svc: MeetingService = Depends(get_meeting_service)):
    logger.info("get_meeting called — meetingId=%s", meetingId)
    meeting = svc.get_meeting(meetingId)
    if meeting is None:
        logger.warning("get_meeting: meeting %s not found", meetingId)
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {"meeting": meeting}


@router.put("/{meetingId}")
def update_meeting(
    meetingId: str,
    payload: MeetingUpdate,
    svc: MeetingService = Depends(get_meeting_service),
):
    logger.info("update_meeting called — meetingId=%s, payload=%s", meetingId, payload.model_dump(exclude_none=True))
    meeting = svc.update_meeting(meetingId, payload)
    if meeting is None:
        logger.warning("update_meeting: meeting %s not found", meetingId)
        raise HTTPException(status_code=404, detail="Meeting not found")
    logger.info("update_meeting success — meetingId=%s", meetingId)
    return {"meeting": meeting}


@router.delete("/{meetingId}")
def cancel_meeting(
    meetingId: str,
    payload: CancelMeeting = Body(...),
    svc: MeetingService = Depends(get_meeting_service),
):
    logger.info("cancel_meeting called — meetingId=%s, organizer_id=%s", meetingId, payload.organizer_id)
    try:
        meeting = svc.cancel_meeting(meetingId, payload.organizer_id)
    except PermissionError as exc:
        logger.warning("cancel_meeting permission denied: %s", exc)
        raise HTTPException(status_code=403, detail=str(exc))
    if meeting is None:
        logger.warning("cancel_meeting: meeting %s not found", meetingId)
        raise HTTPException(status_code=404, detail="Meeting not found")
    logger.info("cancel_meeting success — meetingId=%s", meetingId)
    return {"message": "Meeting cancelled successfully", "meeting": meeting}


@router.put("/{meetingId}/respond")
def respond_to_meeting(
    meetingId: str,
    payload: MeetingRespond,
    svc: MeetingService = Depends(get_meeting_service),
):
    logger.info("respond_to_meeting called — meetingId=%s, user_id=%s, status=%s", meetingId, payload.user_id, payload.status)
    try:
        meeting = svc.respond_to_meeting(meetingId, payload.user_id, payload.status)
    except PermissionError as exc:
        logger.warning("respond_to_meeting permission denied: %s", exc)
        raise HTTPException(status_code=403, detail=str(exc))
    if meeting is None:
        logger.warning("respond_to_meeting: meeting %s not found", meetingId)
        raise HTTPException(status_code=404, detail="Meeting not found")
    logger.info("respond_to_meeting success — meetingId=%s, status=%s", meetingId, payload.status)
    return {"meeting": meeting, "message": f"Meeting {payload.status} successfully"}
