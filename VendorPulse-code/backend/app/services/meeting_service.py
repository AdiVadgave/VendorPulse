"""
Meeting management service.

Handles: create, read, update, cancel, respond.
Validates availability and prevents double-booking before any write.

Future AI hook: pass meeting context to an LLM to draft agenda items
or generate a pre-meeting briefing card.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING

from app.models.meeting import MeetingCreate, MeetingUpdate
from app.repositories.meeting_repository import MeetingRepository
from app.repositories.user_repository import UserRepository
from app.services.availability_service import AvailabilityService
logger = logging.getLogger(__name__)


class MeetingService:
    def __init__(
        self,
        meeting_repo: MeetingRepository,
        user_repo: UserRepository,
        availability_svc: AvailabilityService,
    ) -> None:
        self._meetings = meeting_repo
        self._users = user_repo
        self._avail = availability_svc

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def list_meetings(self, cycle_id: Optional[str] = None) -> list[dict]:
        if cycle_id:
            return self._meetings.get_for_cycle(cycle_id)
        return self._meetings.find_all()

    def get_meeting(self, meeting_id: str) -> Optional[dict]:
        return self._meetings.get_by_meeting_id(meeting_id)

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    def create_meeting(self, payload: MeetingCreate) -> tuple[dict, list[str]]:
        """
        Create a meeting after validating all parties exist and checking for
        double-booking.

        Returns (meeting_dict, warnings) where warnings is a list of
        non-fatal issues (e.g. a participant has a conflict).

        Raises ValueError for hard failures (missing users, organiser conflict).
        """
        # Validate organiser
        if not self._users.get_by_user_id(payload.organizerId):
            raise ValueError(f"Organiser '{payload.organizerId}' not found")

        # Validate participants
        missing = [
            pid for pid in payload.participantIds if not self._users.get_by_user_id(pid)
        ]
        if missing:
            raise ValueError(f"Participants not found: {', '.join(missing)}")

        ts = payload.timeSlot
        all_meetings = self._meetings.find_all()
        all_participant_ids = [payload.organizerId] + payload.participantIds

        warnings: list[str] = []

        # Check organiser — hard block
        if self._avail.has_conflict(
            payload.organizerId, ts.date, ts.startTime, ts.endTime, all_meetings
        ):
            raise ValueError(
                f"Organiser '{payload.organizerId}' has a conflicting meeting at this time"
            )

        # Check participants — soft warnings
        for pid in payload.participantIds:
            user = self._users.get_by_user_id(pid)
            name = user.get("name", pid) if user else pid
            if self._avail.has_conflict(pid, ts.date, ts.startTime, ts.endTime, all_meetings):
                warnings.append(f"{name} has a conflicting meeting at this time")

        meeting = {
            "meetingId": f"m{uuid.uuid4().hex[:8]}",
            "title": payload.title,
            "description": payload.description or "",
            "agenda": payload.agenda or "",
            "organizerId": payload.organizerId,
            "participants": [
                {"userId": uid, "status": "pending"}
                for uid in payload.participantIds
            ],
            "timeSlot": ts.model_dump(),
            "status": "scheduled",
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "cycleId": payload.cycleId,
            "meetingType": payload.meetingType,
        }
        stored = self._meetings.insert(meeting)
        return stored, warnings

    # ------------------------------------------------------------------
    # Update / Cancel
    # ------------------------------------------------------------------

    def update_meeting(self, meeting_id: str, payload: MeetingUpdate) -> Optional[dict]:
        meeting = self._meetings.get_by_meeting_id(meeting_id)
        if meeting is None:
            return None
        updates = payload.model_dump(exclude_none=True)
        if "timeSlot" in updates:
            updates["timeSlot"] = updates["timeSlot"]  # already a dict from model_dump
        return self._meetings.update_by_id("meetingId", meeting_id, updates)

    def cancel_meeting(self, meeting_id: str, organiser_id: str) -> Optional[dict]:
        meeting = self._meetings.get_by_meeting_id(meeting_id)
        if meeting is None:
            return None
        if meeting.get("organizerId") != organiser_id:
            raise PermissionError("Only the organiser can cancel this meeting")
        return self._meetings.cancel(meeting_id)

    # ------------------------------------------------------------------
    # Invite response
    # ------------------------------------------------------------------

    def respond_to_meeting(
        self, meeting_id: str, user_id: str, status: str
    ) -> Optional[dict]:
        meeting = self._meetings.get_by_meeting_id(meeting_id)
        if meeting is None:
            return None

        participant_ids = [p.get("userId") for p in meeting.get("participants", [])]
        if user_id not in participant_ids:
            raise PermissionError("User is not a participant in this meeting")

        responded_at = datetime.now(timezone.utc).isoformat()
        updated = self._meetings.update_participant_status(meeting_id, user_id, status, responded_at)

        # Derive overall meeting status from all participant responses
        if updated:
            self._update_meeting_status(meeting_id)

        return self._meetings.get_by_meeting_id(meeting_id)

    def _update_meeting_status(self, meeting_id: str) -> None:
        """Recompute and persist meeting.status based on participant responses."""
        meeting = self._meetings.get_by_meeting_id(meeting_id)
        if not meeting:
            return

        statuses = [p.get("status") for p in meeting.get("participants", [])]
        if all(s == "accepted" for s in statuses):
            new_status = "accepted"
        elif all(s == "declined" for s in statuses):
            new_status = "declined"
        elif any(s == "pending" for s in statuses):
            new_status = "scheduled"   # still waiting for responses
        else:
            new_status = "scheduled"

        self._meetings.update_by_id("meetingId", meeting_id, {"status": new_status})
