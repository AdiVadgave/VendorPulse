"""
Workflow Engine — state machine for governance cycles.

Rules (from VendorPulse README):
  • Forward transitions only — no skipping, no rollback.
  • WorkflowViolationError → HTTP 409 in route handlers.
  • All transition logic lives here, not scattered through services.

Usage
-----
    engine = WorkflowEngine()

    # Validate before acting
    engine.assert_state(cycle, "CYCLE_CREATED")           # exact match
    engine.assert_at_least(cycle, "MEETING_SCHEDULED")    # current ≥ required

    # Advance one step
    updated = engine.advance(cycle, cycle_repo, now)

    # Advance to a specific target
    updated = engine.transition_to(cycle, "MEETING_SCHEDULED", cycle_repo, now)
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional


# ---------------------------------------------------------------------------
# State definitions & allowed transitions
# ---------------------------------------------------------------------------

WORKFLOW_STATES: list[str] = [
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

# Only the next immediate state is a valid transition (forward-only)
TRANSITIONS: dict[str, str] = {
    "CYCLE_CREATED":         "ATTENDEE_REFRESH_SENT",
    "ATTENDEE_REFRESH_SENT": "AVAILABILITY_COLLECTED",
    "AVAILABILITY_COLLECTED":"MEETING_SCHEDULED",
    "MEETING_SCHEDULED":     "SCORECARD_REQUEST_SENT",
    "SCORECARD_REQUEST_SENT":"SCORECARD_COLLECTION",
    "SCORECARD_COLLECTION":  "SCORECARD_COMPILED",
    "SCORECARD_COMPILED":    "INTERNAL_ALIGNMENT",
    "INTERNAL_ALIGNMENT":    "VENDOR_PREP",
    "VENDOR_PREP":           "MEETING_IN_PROGRESS",
    "MEETING_IN_PROGRESS":   "POST_MEETING_COMPLETE",
    "POST_MEETING_COMPLETE": "ARCHIVED",
}


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class WorkflowViolationError(Exception):
    """
    Raised when a state transition is invalid.
    Route handlers catch this and return HTTP 409.
    """

    def __init__(self, current: str, attempted: str) -> None:
        self.current = current
        self.attempted = attempted
        super().__init__(
            f"Workflow violation: cannot move from '{current}' to '{attempted}'. "
            f"Next valid state is '{TRANSITIONS.get(current, 'none (terminal)') }'."
        )


class WorkflowStateError(Exception):
    """Raised when the cycle is not in the required state for an action."""

    def __init__(self, current: str, required: str) -> None:
        super().__init__(
            f"Action requires state '{required}' (or later). Current state: '{current}'."
        )


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class WorkflowEngine:
    """
    Stateless helper that validates and applies workflow transitions.

    The engine itself holds no mutable state — it is safe to use as a module-level
    singleton (see `workflow_engine` at the bottom of this file).
    """

    def can_transition(self, current: str, target: str) -> bool:
        """Return True iff moving from *current* to *target* is a valid step."""
        return TRANSITIONS.get(current) == target

    def next_state(self, current: str) -> Optional[str]:
        """Return the next valid state, or None if *current* is terminal."""
        return TRANSITIONS.get(current)

    def state_index(self, state: str) -> int:
        """Ordinal position of *state* (lower = earlier in lifecycle)."""
        try:
            return WORKFLOW_STATES.index(state)
        except ValueError:
            raise ValueError(f"Unknown workflow state: '{state}'")

    # ------------------------------------------------------------------
    # Guards
    # ------------------------------------------------------------------

    def assert_state(self, cycle: dict, required: str) -> None:
        """Raise WorkflowStateError if cycle is not exactly in *required* state."""
        current = cycle.get("workflow_state", "")
        if current != required:
            raise WorkflowStateError(current, required)

    def assert_at_least(self, cycle: dict, required: str) -> None:
        """Raise WorkflowStateError if cycle hasn't reached *required* yet."""
        current = cycle.get("workflow_state", "")
        if self.state_index(current) < self.state_index(required):
            raise WorkflowStateError(current, required)

    def validate_transition(self, current: str, target: str) -> None:
        """Raise WorkflowViolationError if the transition is not allowed."""
        if not self.can_transition(current, target):
            raise WorkflowViolationError(current, target)

    # ------------------------------------------------------------------
    # Mutating operations (write through the repository)
    # ------------------------------------------------------------------

    def advance(self, cycle: dict, cycle_repo, updated_at: Optional[str] = None) -> dict:
        """
        Move *cycle* to its next state.
        Raises WorkflowViolationError if the cycle is already terminal.
        """
        current = cycle.get("workflow_state", "")
        next_st = self.next_state(current)
        if next_st is None:
            raise WorkflowViolationError(current, "<terminal>")
        ts = updated_at or datetime.now(timezone.utc).isoformat()
        return cycle_repo.advance_workflow_state(cycle["cycle_id"], next_st, ts)

    def transition_to(
        self, cycle: dict, target: str, cycle_repo, updated_at: Optional[str] = None
    ) -> dict:
        """
        Move *cycle* to *target* state.
        Raises WorkflowViolationError if the move is not a valid next step.
        """
        current = cycle.get("workflow_state", "")
        self.validate_transition(current, target)
        ts = updated_at or datetime.now(timezone.utc).isoformat()
        return cycle_repo.advance_workflow_state(cycle["cycle_id"], target, ts)


# Module-level singleton — import and use directly
workflow_engine = WorkflowEngine()
