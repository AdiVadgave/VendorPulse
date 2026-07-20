"""
Meeting management service.

Handles: create, read, update, cancel, respond.
Validates availability and prevents double-booking before any write.

Participants are stored in the meeting_participants child store (not embedded on
the meeting record), mirroring the future Postgres schema.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.models.meeting import MeetingCreate, MeetingUpdate
from app.repositories.meeting_repository import MeetingParticipantRepository, MeetingRepository
from app.repositories.user_repository import UserRepository
from app.services.availability_service import AvailabilityService

logger = logging.getLogger(__name__)


class MeetingService:
    def __init__(
        self,
        meeting_repo: MeetingRepository,
        participant_repo: MeetingParticipantRepository,
        user_repo: UserRepository,
        availability_svc: AvailabilityService,
    ) -> None:
        self._meetings = meeting_repo
        self._participants = participant_repo
        self._users = user_repo
        self._avail = availability_svc

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def _with_participants(self, meeting: Optional[dict]) -> Optional[dict]:
        """Attach the child participant rows so API responses keep their shape."""
        if meeting is None:
            return None
        return {**meeting, "participants": self._participants.get_for_meeting(meeting["meeting_id"])}

    def list_meetings(self, cycle_id: Optional[str] = None) -> list[dict]:
        meetings = self._meetings.get_for_cycle(cycle_id) if cycle_id else self._meetings.find_all()
        return [self._with_participants(m) for m in meetings]

    def get_meeting(self, meeting_id: str) -> Optional[dict]:
        return self._with_participants(self._meetings.get_by_meeting_id(meeting_id))

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    def create_meeting(self, payload: MeetingCreate) -> tuple[dict, list[str]]:
        """Create a meeting after validating parties exist and checking double-booking.
        Returns (meeting_dict, warnings). Raises ValueError for hard failures."""
        if not self._users.get_by_user_id(payload.organizer_id):
            raise ValueError(f"Organiser '{payload.organizer_id}' not found")

        missing = [pid for pid in payload.participant_ids if not self._users.get_by_user_id(pid)]
        if missing:
            raise ValueError(f"Participants not found: {', '.join(missing)}")

        ts = payload.time_slot
        all_meetings = self._meetings.find_all()
        warnings: list[str] = []

        if self._avail.has_conflict(payload.organizer_id, ts.date, ts.start_time, ts.end_time, all_meetings):
            raise ValueError(f"Organiser '{payload.organizer_id}' has a conflicting meeting at this time")

        for pid in payload.participant_ids:
            user = self._users.get_by_user_id(pid)
            name = user.get("name", pid) if user else pid
            if self._avail.has_conflict(pid, ts.date, ts.start_time, ts.end_time, all_meetings):
                warnings.append(f"{name} has a conflicting meeting at this time")

        meeting_id = f"m{uuid.uuid4().hex}"
        meeting = {
            "meeting_id": meeting_id,
            "title": payload.title,
            "description": payload.description or "",
            "agenda": payload.agenda or "",
            "organizer_id": payload.organizer_id,
            "time_slot": ts.model_dump(),
            "status": "scheduled",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "cycle_id": payload.cycle_id,
            "meeting_type": payload.meeting_type,
        }
        stored = self._meetings.insert(meeting)
        self._participants.set_for_meeting(meeting_id, payload.participant_ids, status="pending")
        logger.info("create_meeting success — meeting_id=%s, warnings=%s", meeting_id, warnings)
        return self._with_participants(stored), warnings

    # ------------------------------------------------------------------
    # Update / Cancel
    # ------------------------------------------------------------------

    def update_meeting(self, meeting_id: str, payload: MeetingUpdate) -> Optional[dict]:
        meeting = self._meetings.get_by_meeting_id(meeting_id)
        if meeting is None:
            return None
        updates = payload.model_dump(exclude_none=True)
        self._meetings.update_by_id("meeting_id", meeting_id, updates)
        return self.get_meeting(meeting_id)

    def cancel_meeting(self, meeting_id: str, organiser_id: str) -> Optional[dict]:
        meeting = self._meetings.get_by_meeting_id(meeting_id)
        if meeting is None:
            return None
        if meeting.get("organizer_id") != organiser_id:
            raise PermissionError("Only the organiser can cancel this meeting")
        self._meetings.cancel(meeting_id)
        return self.get_meeting(meeting_id)

    # ------------------------------------------------------------------
    # Invite response
    # ------------------------------------------------------------------

    def respond_to_meeting(self, meeting_id: str, user_id: str, status: str) -> Optional[dict]:
        meeting = self._meetings.get_by_meeting_id(meeting_id)
        if meeting is None:
            return None

        participant_ids = [p.get("user_id") for p in self._participants.get_for_meeting(meeting_id)]
        if user_id not in participant_ids:
            raise PermissionError("User is not a participant in this meeting")

        responded_at = datetime.now(timezone.utc).isoformat()
        self._participants.update_status(meeting_id, user_id, status, responded_at)
        self._update_meeting_status(meeting_id)
        return self.get_meeting(meeting_id)

    def _update_meeting_status(self, meeting_id: str) -> None:
        """Recompute and persist meeting.status based on participant responses."""
        statuses = [p.get("status") for p in self._participants.get_for_meeting(meeting_id)]
        if statuses and all(s == "accepted" for s in statuses):
            new_status = "accepted"
        elif statuses and all(s == "declined" for s in statuses):
            new_status = "declined"
        else:
            new_status = "scheduled"
        self._meetings.update_by_id("meeting_id", meeting_id, {"status": new_status})
