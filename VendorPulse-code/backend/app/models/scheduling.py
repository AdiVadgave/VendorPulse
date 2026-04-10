from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

InviteStatus = Literal["PENDING", "ACCEPTED", "DECLINED"]
AttendanceConfirmationStatus = Literal["PENDING", "CONFIRMED", "REPLACED", "DECLINED"]
AttendeeType = Literal["Internal Stakeholder", "Vendor"]
StakeholderRole = Literal[
    "VMO_COORDINATOR",
    "INTERNAL_LEAD",
    "VENDOR_MANAGER",
    "EGB_CHAIR",
    "TECHNICAL_LEAD",
    "COMMERCIAL_LEAD",
]


# ---------------------------------------------------------------------------
# Cycle attendee models
# ---------------------------------------------------------------------------


class CycleAttendeeCreate(BaseModel):
    stakeholder_id: str
    name: str
    email: str
    gmail: Optional[str] = Field(default="", description="Gmail address for scorecard dispatch")
    role: StakeholderRole
    organisation: str
    type: AttendeeType = Field(default="Internal Stakeholder", description="Internal Stakeholder or Vendor")
    is_key: bool = False
    user_id: Optional[str] = Field(
        default=None,
        description="Links to a users.json record for availability look-up",
    )


class CycleAttendeeUpdate(BaseModel):
    invite_status: Optional[InviteStatus] = None
    availability_submitted: Optional[bool] = None
    replaced_by: Optional[str] = None
    replaced_by_email: Optional[str] = None
    replacement_note: Optional[str] = None
    # Attendance confirmation fields
    confirmation_status: Optional[AttendanceConfirmationStatus] = None
    confirmation_note: Optional[str] = None
    is_key: Optional[bool] = None
    type: Optional[AttendeeType] = None
    gmail: Optional[str] = None


class CycleAttendee(BaseModel):
    """Full attendee record stored in attendees.json."""

    attendee_id: str
    cycle_id: str
    stakeholder_id: str
    name: str
    email: str
    gmail: str = ""
    role: StakeholderRole
    organisation: str
    type: AttendeeType = "Internal Stakeholder"
    is_key: bool = False
    invite_status: InviteStatus = "PENDING"
    availability_submitted: bool = False
    user_id: Optional[str] = None          # → users.json userId
    replaced_by: Optional[str] = None
    replaced_by_email: Optional[str] = None
    replacement_note: Optional[str] = None
    confirmation_status: Optional[AttendanceConfirmationStatus] = "PENDING"
    confirmation_note: Optional[str] = None


# ---------------------------------------------------------------------------
# Slot proposal models
# ---------------------------------------------------------------------------


class SlotProposal(BaseModel):
    """One ranked time-slot candidate stored in slot_proposals.json."""

    slot_id: str
    cycle_id: str
    proposed_time: str   # ISO-8601 datetime
    organiser_available: bool
    exec_sponsor_available: bool
    rank_score: float
    is_approved: bool = False
    attendance_count: int
    total_attendees: int
    conflict_count: int
    attending: list[str]   # display names
    conflicts: list[str]   # display names
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class RankSlotsRequest(BaseModel):
    """
    Input for the slot-ranking algorithm.

    attendee_user_ids maps cycle attendees to their users.json userId so the
    engine can fetch real availability data.
    """

    cycle_id: str
    attendee_user_ids: list[str] = Field(
        ...,
        description="List of users.json userIds to include in availability check",
    )
    attendee_names: dict[str, str] = Field(
        default_factory=dict,
        description="userId → display name (for readable slot output)",
    )
    attendee_key_flags: dict[str, bool] = Field(
        default_factory=dict,
        description="userId → is_key flag",
    )
    organiser_id: str = Field(..., description="userId of the meeting organiser (hard constraint)")
    exec_sponsor_id: str = Field(..., description="userId of exec sponsor (hard constraint)")
    date_range_start: str = Field(..., description="YYYY-MM-DD — first candidate day")
    date_range_end: str = Field(..., description="YYYY-MM-DD — last candidate day")
    duration_hours: float = Field(default=1.0, description="Meeting duration in hours")


class ApproveSlotRequest(BaseModel):
    approved_by: str = Field(..., description="userId of the coordinator approving the slot")
    time_zone: Optional[str] = Field(
        default=None,
        description="Optional timezone to use for the approved slot (e.g. IST, UTC, GMT)",
    )


class SimulateResponsesRequest(BaseModel):
    """Simulate all attendees submitting their availability (demo helper)."""

    cycle_id: str


# ---------------------------------------------------------------------------
# Cycle model (lightweight — full governance in future)
# ---------------------------------------------------------------------------


class CycleCreate(BaseModel):
    vendor_id: str
    vendor_name: str
    quarter: Literal["Q1", "Q2", "Q3", "Q4"]
    year: int


class Cycle(BaseModel):
    cycle_id: str
    vendor_id: str
    vendor_name: str
    quarter: Literal["Q1", "Q2", "Q3", "Q4"]
    year: int
    workflow_state: str
    created_at: str
    updated_at: str
    scorecard_dispatched_at: Optional[str] = None
    scorecard_dispatched_to: Optional[list[str]] = None
