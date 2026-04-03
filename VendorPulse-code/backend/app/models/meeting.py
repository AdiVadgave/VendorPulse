from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

MeetingStatus = Literal["scheduled", "pending", "accepted", "declined", "cancelled"]
ParticipantStatus = Literal["pending", "accepted", "declined"]


class MeetingTimeSlot(BaseModel):
    date: str = Field(..., description="YYYY-MM-DD", examples=["2026-04-10"])
    startTime: str = Field(..., description="HH:MM", examples=["10:00"])
    endTime: str = Field(..., description="HH:MM", examples=["11:00"])


class MeetingParticipant(BaseModel):
    userId: str
    status: ParticipantStatus = "pending"
    respondedAt: Optional[str] = None


class MeetingCreate(BaseModel):
    title: str = Field(..., examples=["Q1 EGB Review — NovaTech"])
    description: Optional[str] = Field(default="", examples=["Quarterly governance review"])
    agenda: Optional[str] = Field(default="", examples=["1) Scorecard\n2) Actions"])
    organizerId: str = Field(..., examples=["u1"])
    participantIds: list[str] = Field(..., examples=[["u2", "u3"]])
    timeSlot: MeetingTimeSlot
    # VendorPulse governance context (optional)
    cycleId: Optional[str] = Field(default=None, description="Governance cycle this meeting belongs to")
    meetingType: Optional[str] = Field(
        default=None,
        description="INTERNAL_ALIGNMENT | VENDOR_PREP | EGB_QBR",
    )


class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    agenda: Optional[str] = None
    timeSlot: Optional[MeetingTimeSlot] = None


class MeetingRespond(BaseModel):
    userId: str = Field(..., examples=["u2"])
    status: Literal["accepted", "declined"] = Field(..., examples=["accepted"])


class CancelMeeting(BaseModel):
    organizerId: str = Field(..., examples=["u1"])


class Meeting(BaseModel):
    """Full meeting record as stored in meetings.json."""

    meetingId: str
    title: str
    description: str
    agenda: str
    organizerId: str
    participants: list[MeetingParticipant]
    timeSlot: MeetingTimeSlot
    status: MeetingStatus
    createdAt: str
    cycleId: Optional[str] = None
    meetingType: Optional[str] = None
