"""
Application-wide constants and enums.

All magic numbers, string literals, and threshold values live here.
Import from this module — never hardcode values in service or agent code.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Workflow states
# ---------------------------------------------------------------------------

WORKFLOW_STATES = [
    "CYCLE_CREATED",
    "ATTENDEE_REFRESH_SENT",
    "AVAILABILITY_COLLECTED",
    "MEETING_SCHEDULED",
    "SCORECARD_REQUEST_SENT",
    "SCORECARD_COLLECTION",
    "SCORECARD_COMPILED",
    "INTERNAL_ALIGNMENT",
    "VENDOR_PREP",
    "MEETING_IN_PROGRESS",
    "POST_MEETING_COMPLETE",
    "ARCHIVED",
]

# ---------------------------------------------------------------------------
# Stakeholder roles
# ---------------------------------------------------------------------------

STAKEHOLDER_ROLES = [
    "VMO_COORDINATOR",
    "INTERNAL_LEAD",
    "VENDOR_MANAGER",
    "EGB_CHAIR",
    "TECHNICAL_LEAD",
    "COMMERCIAL_LEAD",
    "VENDOR_CONTACT",
]

# ---------------------------------------------------------------------------
# Scorecard categories
# ---------------------------------------------------------------------------

SCORECARD_CATEGORIES = [
    "DELIVERY_QUALITY",
    "SLA_COMPLIANCE",
    "INNOVATION",
    "COMMUNICATION",
    "VALUE_FOR_MONEY",
]

SCORE_MIN = 1.0
SCORE_MAX = 5.0
OUTLIER_SIGMA_THRESHOLD = 1.5   # std deviations before flagging as outlier
ALIGNMENT_SPREAD_THRESHOLD = 1.5  # score spread triggering alignment flag

# ---------------------------------------------------------------------------
# Meeting types
# ---------------------------------------------------------------------------

MEETING_TYPES = ["INTERNAL_ALIGNMENT", "VENDOR_PREP", "EGB_QBR"]

# ---------------------------------------------------------------------------
# Notification types
# ---------------------------------------------------------------------------

NOTIFICATION_TYPES = [
    "SCORECARD_REQUEST",
    "REMINDER_1",
    "REMINDER_2",
    "ESCALATION",
    "INVITE",
    "NUDGE",
]

# ---------------------------------------------------------------------------
# Slot ranking constants
# (Override via settings.scheduling_* in config.py if needed)
# ---------------------------------------------------------------------------

SLOT_CONFLICT_PENALTY = 10.0        # per non-key attendee conflict
SLOT_KEY_ATTENDANCE_BONUS = 10.0    # all key attendees present
SLOT_TIMEZONE_BONUS = 5.0           # slot fully within business hours
SLOT_BUSINESS_START = 9             # 09:00
SLOT_BUSINESS_END = 17              # 17:00
SLOT_TOP_N = 3                      # number of proposals to return

# ---------------------------------------------------------------------------
# Pushback categories (Module D)
# ---------------------------------------------------------------------------

PUSHBACK_CATEGORIES = [
    "DATA_DISPUTE",
    "PROCESS_CONCERN",
    "RESOURCE_CONSTRAINT",
    "SCOPE_DISAGREEMENT",
    "OTHER",
]

# ---------------------------------------------------------------------------
# Action item statuses
# ---------------------------------------------------------------------------

ACTION_STATUSES = ["OPEN", "IN_PROGRESS", "CLOSED"]

# ---------------------------------------------------------------------------
# Agent names
# ---------------------------------------------------------------------------

AGENT_NAMES = {
    "scheduling": "scheduling_agent",
    "scorecard":  "scorecard_agent",
    "alignment":  "alignment_agent",
    "vendor_prep":"vendor_prep_agent",
    "meeting":    "meeting_agent",
    "memory":     "memory_agent",
}
