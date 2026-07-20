from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

MeetingStatus = Literal["scheduled", "pending", "accepted", "declined", "cancelled"]
ParticipantStatus = Literal["pending", "accepted", "declined"]


class MeetingTimeSlot(BaseModel):
    date: str = Field(..., description="YYYY-MM-DD", examples=["2026-04-10"])
    start_time: str = Field(..., description="HH:MM", examples=["10:00"])
    end_time: str = Field(..., description="HH:MM", examples=["11:00"])


class MeetingParticipant(BaseModel):
    user_id: str
    status: ParticipantStatus = "pending"
    responded_at: Optional[str] = None


class MeetingCreate(BaseModel):
    title: str = Field(..., examples=["Q1 EGB Review — NovaTech"])
    description: Optional[str] = Field(default="", examples=["Quarterly governance review"])
    agenda: Optional[str] = Field(default="", examples=["1) Scorecard\n2) Actions"])
    organizer_id: str = Field(..., examples=["u1"])
    participant_ids: list[str] = Field(..., examples=[["u2", "u3"]])
    time_slot: MeetingTimeSlot
    # VendorPulse governance context (optional)
    cycle_id: Optional[str] = Field(default=None, description="Governance cycle this meeting belongs to")
    meeting_type: Optional[str] = Field(
        default=None,
        description="INTERNAL_ALIGNMENT | VENDOR_PREP | EGB_QBR",
    )


class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    agenda: Optional[str] = None
    time_slot: Optional[MeetingTimeSlot] = None


class MeetingRespond(BaseModel):
    user_id: str = Field(..., examples=["u2"])
    status: Literal["accepted", "declined"] = Field(..., examples=["accepted"])


class CancelMeeting(BaseModel):
    organizer_id: str = Field(..., examples=["u1"])


class Meeting(BaseModel):
    """Full meeting record as stored in meetings.json. Participants live in the
    meeting_participants child store, not embedded here."""

    meeting_id: str
    title: str
    description: str
    agenda: str
    organizer_id: str
    time_slot: MeetingTimeSlot
    status: MeetingStatus
    created_at: str
    cycle_id: Optional[str] = None
    meeting_type: Optional[str] = None
