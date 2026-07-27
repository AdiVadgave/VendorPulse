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


# ---------------------------------------------------------------------------
# Cycle attendee models
# ---------------------------------------------------------------------------


class CycleAttendeeCreate(BaseModel):
    stakeholder_id: str
    name: str
    email: str
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


# ---------------------------------------------------------------------------
# Per-SPR scorecard configuration (which measures + per-theme weights)
# ---------------------------------------------------------------------------

ScorecardMeasureType = Literal["numeric", "rag"]


class ScorecardMeasureCfg(BaseModel):
    key: str
    label: str
    description: str = ""
    measure_type: ScorecardMeasureType = "numeric"
    # Teams (shell_department / identity) asked to score this measure. Absent =
    # not team-restricted (everyone); empty list = nobody is asked this measure.
    teams: Optional[list[str]] = None


class ScorecardCategoryCfg(BaseModel):
    key: str
    label: str
    weight: int = 0
    measures: list[ScorecardMeasureCfg] = Field(default_factory=list)


class ScorecardConfig(BaseModel):
    """The measures included in a cycle's scorecard and their per-theme weights.
    Chosen by the VMO before dispatch; defaults to the standard structure."""

    categories: list[ScorecardCategoryCfg] = Field(default_factory=list)
    configured: bool = False


class ScorecardConfigUpdate(BaseModel):
    """VMO selection: which measures to include + weight per theme.

    Labels/descriptions/types are resolved server-side from the catalog, so the
    client only sends the chosen measure keys and the per-theme weights."""

    selected_measure_keys: list[str] = Field(default_factory=list)
    weights: dict[str, int] = Field(default_factory=dict, description="theme_key -> weight (included themes must sum to 100)")
    # measure_key -> team names asked to score it. Empty list for a selected
    # measure means nobody is asked it. Omitted entirely => no team restriction.
    measure_teams: dict[str, list[str]] = Field(default_factory=dict)


class CycleCreate(BaseModel):
    vendor_id: str
    vendor_name: str
    cycle_type: CycleType = "SPR"
    quarter: Literal["Q1", "Q2", "Q3", "Q4"]
    year: int
    category: str = "IT Infrastructure"
    description: str = Field(default="", description="Free-text purpose/scope of this governance cycle")


class Cycle(BaseModel):
    cycle_id: str
    vendor_id: str
    vendor_name: str
    cycle_type: CycleType = "SPR"
    quarter: Literal["Q1", "Q2", "Q3", "Q4"]
    year: int
    description: str = ""
    workflow_state: str
    created_at: str
    updated_at: str
    # Per-SPR scorecard configuration (measures + per-theme weights). None until
    # seeded/backfilled with the default structure.
    scorecard_config: Optional[ScorecardConfig] = None
    scorecard_dispatched_at: Optional[str] = None
    scorecard_dispatched_to: Optional[list[str]] = None
    # Populated when the vendor meeting invite is sent via Graph.
    # Used by the Meeting tab's "Start Meeting" button to open the Teams meeting.
    teams_meeting_url: Optional[str] = None
    teams_meeting_web_link: Optional[str] = None
    teams_meeting_event_id: Optional[str] = None
    teams_meeting_scheduled_at: Optional[str] = None
