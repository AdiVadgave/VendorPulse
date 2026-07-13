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

# Invitee classification (applies to every invitee)
AttendanceRequirement = Literal["Required", "Optional"]
LTStatus = Literal["LT", "Non-LT"]
# Shell-internal invitee department (Shell / Internal Stakeholder invitees only)
ShellDepartment = Literal["IDTM", "IDE", "SOM", "Business", "CP", "IRM", "Other"]

# Cycle type — currently SPR (Supplier Performance Review) is the only option.
CycleType = Literal["SPR"]

# Meeting types that can make up a governance cycle. The organiser toggles which
# meetings are included and may add several INTERNAL_ALIGNMENT calls.
MeetingType = Literal[
    "INTERNAL_ALIGNMENT",
    "SUPPLIER_PREP",
    "LEADERSHIP_ALIGNMENT",
    "MAIN_GOVERNANCE",
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
    # Invitee classification
    attendance_requirement: AttendanceRequirement = Field(
        default="Required", description="Required or Optional attendee"
    )
    lt_status: LTStatus = Field(default="Non-LT", description="Leadership Team (LT) or Non-LT")
    shell_department: Optional[ShellDepartment] = Field(
        default=None,
        description="Shell department (Internal Stakeholder invitees only); null for Vendor",
    )
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
    # Invitee classification
    attendance_requirement: Optional[AttendanceRequirement] = None
    lt_status: Optional[LTStatus] = None
    shell_department: Optional[ShellDepartment] = None


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
    # Invitee classification
    attendance_requirement: AttendanceRequirement = "Required"
    lt_status: LTStatus = "Non-LT"
    shell_department: Optional[ShellDepartment] = None
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
    proposed_time_zone: Optional[str] = None
    duration_minutes: Optional[int] = None
    organiser_available: bool
    exec_sponsor_available: bool
    rank_score: float
    is_approved: bool = False
    attendance_count: int
    total_attendees: int
    conflict_count: int
    attending: list[str]   # display names
    tentative: list[str] = []
    conflicts: list[str]   # display names
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    ranking_rationale: Optional[str] = None   # LLM-generated plain-English explanation


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


class CycleMeeting(BaseModel):
    """One meeting in a cycle's meeting plan. The organiser decides which are
    included (enabled) and may rename them or add several INTERNAL_ALIGNMENT
    calls (one per product team)."""

    meeting_key: str = Field(..., description="Stable id, e.g. 'internal_alignment_1'")
    meeting_type: MeetingType
    title: str
    enabled: bool = True
    order: int = 0


def default_meeting_plan() -> list["CycleMeeting"]:
    """Default meeting plan for a new SPR cycle.

    Internal Alignment, Supplier Prep and Main Governance are enabled by
    default; a Leadership-focused alignment call is available but off by
    default. The Main Governance meeting is the one scheduled from the
    Scheduling module via Graph; the others are scheduled in their own tabs.
    """
    return [
        CycleMeeting(meeting_key="internal_alignment_1", meeting_type="INTERNAL_ALIGNMENT",
                     title="Internal Alignment Call", enabled=True, order=1),
        CycleMeeting(meeting_key="supplier_prep", meeting_type="SUPPLIER_PREP",
                     title="Supplier Prep Call", enabled=True, order=2),
        CycleMeeting(meeting_key="leadership_alignment", meeting_type="LEADERSHIP_ALIGNMENT",
                     title="Leadership Alignment Call", enabled=False, order=3),
        CycleMeeting(meeting_key="main_governance", meeting_type="MAIN_GOVERNANCE",
                     title="Main Governance Meeting", enabled=True, order=4),
    ]


class MeetingPlanUpdate(BaseModel):
    """Replace the cycle's meeting plan (VMO can change it at any time)."""

    meeting_plan: list[CycleMeeting]


class CycleCreate(BaseModel):
    vendor_id: str
    vendor_name: str
    cycle_type: CycleType = "SPR"
    quarter: Literal["Q1", "Q2", "Q3", "Q4"]
    year: int
    category: str = "IT Infrastructure"


class Cycle(BaseModel):
    cycle_id: str
    vendor_id: str
    vendor_name: str
    cycle_type: CycleType = "SPR"
    quarter: Literal["Q1", "Q2", "Q3", "Q4"]
    year: int
    workflow_state: str
    created_at: str
    updated_at: str
    meeting_plan: list[CycleMeeting] = Field(default_factory=default_meeting_plan)
    scorecard_dispatched_at: Optional[str] = None
    scorecard_dispatched_to: Optional[list[str]] = None
    # Populated when the vendor meeting invite is sent via Graph.
    # Used by the Meeting tab's "Start Meeting" button to open the Teams meeting.
    teams_meeting_url: Optional[str] = None
    teams_meeting_web_link: Optional[str] = None
    teams_meeting_event_id: Optional[str] = None
    teams_meeting_scheduled_at: Optional[str] = None
