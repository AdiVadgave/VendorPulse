"""
Scheduling (Module A) routes — returns AgentResponse envelopes.

Workflow state enforcement (HTTP 409 on violation):
  rank-slots    → cycle must be at least ATTENDEE_REFRESH_SENT
  approve-slot  → cycle must be at least AVAILABILITY_COLLECTED
  send-invites  → WorkflowEngine enforces AVAILABILITY_COLLECTED → MEETING_SCHEDULED

Other endpoints:
  GET  /api/cycles                                          List all cycles
  POST /api/cycles                                          Create a cycle
  GET  /api/cycles/{cycleId}                                Get cycle detail
  GET  /api/cycles/{cycleId}/attendees                      Get cycle attendees
  POST /api/cycles/{cycleId}/attendees                      Add attendees
  PUT  /api/cycles/{cycleId}/attendees/{attendeeId}         Update attendee
  DEL  /api/cycles/{cycleId}/attendees/{attendeeId}         Remove attendee
  POST /api/cycles/{cycleId}/scheduling/simulate-responses  Simulate availability responses
  POST /api/cycles/{cycleId}/scheduling/rank-slots          Run slot ranking algorithm
  GET  /api/cycles/{cycleId}/scheduling/slots               Get persisted slot proposals
  PUT  /api/cycles/{cycleId}/scheduling/slots/{slotId}/approve  Approve a slot
  POST /api/cycles/{cycleId}/scheduling/send-invites        Send invites for approved slot
  GET  /api/cycles/{cycleId}/scheduling/rsvp                Get RSVP status
  PUT  /api/cycles/{cycleId}/scheduling/rsvp/{attendeeId}   Update individual RSVP

  GET  /api/agent-runs                                      Agent execution log
  GET  /api/agent-runs/{runId}                              Single run detail
"""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from typing import Optional

from app.core.workflow_engine import WorkflowStateError, WorkflowViolationError, workflow_engine
from app.dependencies import (
    get_agent_run_repo,
    get_cycle_repo,
    get_scheduling_service,
)
from app.models.scheduling import (
    ApproveSlotRequest,
    CycleAttendeeCreate,
    CycleAttendeeUpdate,
    CycleCreate,
    RankSlotsRequest,
)
from app.services.scheduling_service import SchedulingService

router = APIRouter(tags=["scheduling"])


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────


def _get_cycle_or_404(cycle_id: str, cycle_repo):
    cycle = cycle_repo.get_by_cycle_id(cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycle_id}' not found")
    return cycle


def _check_workflow_state(cycle: dict, required_state: str) -> None:
    """Raise HTTP 409 if the cycle hasn't reached *required_state* yet."""
    try:
        workflow_engine.assert_at_least(cycle, required_state)
    except WorkflowStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


# ──────────────────────────────────────────────────────────────────────────────
# Cycles
# ──────────────────────────────────────────────────────────────────────────────


@router.get("/api/cycles")
def list_cycles(cycle_repo=Depends(get_cycle_repo)):
    return {"cycles": cycle_repo.find_all()}


@router.post("/api/cycles", status_code=201)
def create_cycle(payload: CycleCreate, cycle_repo=Depends(get_cycle_repo)):
    import uuid
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    cycle = {
        "cycle_id": f"c_{uuid.uuid4().hex[:8]}",
        "vendor_id": payload.vendor_id,
        "vendor_name": payload.vendor_name,
        "quarter": payload.quarter,
        "year": payload.year,
        "workflow_state": "CYCLE_CREATED",
        "created_at": now,
        "updated_at": now,
    }
    return {"cycle": cycle_repo.insert(cycle), "message": "Cycle created"}


@router.get("/api/cycles/{cycleId}")
def get_cycle(cycleId: str, cycle_repo=Depends(get_cycle_repo)):
    return {"cycle": _get_cycle_or_404(cycleId, cycle_repo)}


# ──────────────────────────────────────────────────────────────────────────────
# Attendees
# ──────────────────────────────────────────────────────────────────────────────


@router.get("/api/cycles/{cycleId}/attendees")
def get_attendees(
    cycleId: str,
    svc: SchedulingService = Depends(get_scheduling_service),
):
    return {"attendees": svc.get_attendees(cycleId)}


@router.post("/api/cycles/{cycleId}/attendees", status_code=201)
def add_attendees(
    cycleId: str,
    attendees: list[CycleAttendeeCreate] = Body(...),
    svc: SchedulingService = Depends(get_scheduling_service),
    cycle_repo=Depends(get_cycle_repo),
):
    _get_cycle_or_404(cycleId, cycle_repo)   # ensure cycle exists
    return svc.add_attendees(cycleId, attendees)


@router.put("/api/cycles/{cycleId}/attendees/{attendeeId}")
def update_attendee(
    cycleId: str,
    attendeeId: str,
    payload: CycleAttendeeUpdate,
    svc: SchedulingService = Depends(get_scheduling_service),
):
    attendees = svc.get_attendees(cycleId)
    if not any(a["attendee_id"] == attendeeId for a in attendees):
        raise HTTPException(status_code=404, detail="Attendee not found in this cycle")
    updated = svc.update_attendee(attendeeId, payload)
    if updated is None:
        raise HTTPException(status_code=404, detail="Attendee not found")
    return {"attendee": updated}


@router.delete("/api/cycles/{cycleId}/attendees/{attendeeId}", status_code=204)
def remove_attendee(
    cycleId: str,
    attendeeId: str,
    svc: SchedulingService = Depends(get_scheduling_service),
):
    attendees = svc.get_attendees(cycleId)
    if not any(a["attendee_id"] == attendeeId for a in attendees):
        raise HTTPException(status_code=404, detail="Attendee not found in this cycle")
    if not svc.remove_attendee(attendeeId):
        raise HTTPException(status_code=404, detail="Attendee not found")


# ──────────────────────────────────────────────────────────────────────────────
# Scheduling workflow
# ──────────────────────────────────────────────────────────────────────────────


@router.post("/api/cycles/{cycleId}/scheduling/simulate-responses")
def simulate_responses(
    cycleId: str,
    svc: SchedulingService = Depends(get_scheduling_service),
    cycle_repo=Depends(get_cycle_repo),
):
    _get_cycle_or_404(cycleId, cycle_repo)
    return svc.simulate_responses(cycleId)


@router.post("/api/cycles/{cycleId}/scheduling/rank-slots")
def rank_slots(
    cycleId: str,
    payload: RankSlotsRequest,
    svc: SchedulingService = Depends(get_scheduling_service),
    cycle_repo=Depends(get_cycle_repo),
):
    # Require at least ATTENDEE_REFRESH_SENT before ranking slots
    cycle = _get_cycle_or_404(cycleId, cycle_repo)
    _check_workflow_state(cycle, "ATTENDEE_REFRESH_SENT")
    payload.cycle_id = cycleId
    return svc.rank_slots(payload)


@router.get("/api/cycles/{cycleId}/scheduling/slots")
def get_slots(
    cycleId: str,
    svc: SchedulingService = Depends(get_scheduling_service),
):
    return {"proposals": svc.get_slot_proposals(cycleId)}


@router.put("/api/cycles/{cycleId}/scheduling/slots/{slotId}/approve")
def approve_slot(
    cycleId: str,
    slotId: str,
    payload: ApproveSlotRequest,
    svc: SchedulingService = Depends(get_scheduling_service),
    cycle_repo=Depends(get_cycle_repo),
):
    # Require at least AVAILABILITY_COLLECTED before approving a slot
    cycle = _get_cycle_or_404(cycleId, cycle_repo)
    _check_workflow_state(cycle, "AVAILABILITY_COLLECTED")
    return svc.approve_slot(cycleId, slotId, payload.approved_by)


@router.post("/api/cycles/{cycleId}/scheduling/send-invites")
def send_invites(
    cycleId: str,
    organiser_id: str = Body(..., embed=True),
    slot_id: str = Body(..., embed=True),
    svc: SchedulingService = Depends(get_scheduling_service),
    cycle_repo=Depends(get_cycle_repo),
):
    """
    Send invites and advance cycle to MEETING_SCHEDULED.
    WorkflowEngine enforces the transition — returns HTTP 409 if the cycle
    isn't in AVAILABILITY_COLLECTED state yet.
    """
    cycle = _get_cycle_or_404(cycleId, cycle_repo)
    try:
        # Validate transition is allowed before committing any side effects
        workflow_engine.validate_transition(
            cycle.get("workflow_state", ""), "MEETING_SCHEDULED"
        )
    except WorkflowViolationError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return svc.send_invites(cycleId, slot_id, organiser_id)


@router.get("/api/cycles/{cycleId}/scheduling/rsvp")
def get_rsvp(
    cycleId: str,
    svc: SchedulingService = Depends(get_scheduling_service),
):
    return svc.get_rsvp_status(cycleId)


@router.put("/api/cycles/{cycleId}/scheduling/rsvp/{attendeeId}")
def update_rsvp(
    cycleId: str,
    attendeeId: str,
    status: str = Body(..., embed=True),
    svc: SchedulingService = Depends(get_scheduling_service),
):
    updated = svc.update_rsvp(cycleId, attendeeId, status)
    if updated is None:
        raise HTTPException(status_code=404, detail="Attendee not found")
    return {"attendee": updated}


# ──────────────────────────────────────────────────────────────────────────────
# Agent runs — traceability log
# ──────────────────────────────────────────────────────────────────────────────


@router.get("/api/agent-runs", tags=["agent-runs"])
def list_agent_runs(
    cycleId: Optional[str] = None,
    limit: int = 50,
    agent_run_repo=Depends(get_agent_run_repo),
):
    """
    Return the agent execution log.
    Optionally filter by cycleId. Sorted newest-first.
    """
    if cycleId:
        runs = agent_run_repo.get_for_cycle(cycleId)
        runs.sort(key=lambda r: r.get("created_at", ""), reverse=True)
        return {"runs": runs[:limit]}
    return {"runs": agent_run_repo.get_recent(limit)}


@router.get("/api/agent-runs/{runId}", tags=["agent-runs"])
def get_agent_run(runId: str, agent_run_repo=Depends(get_agent_run_repo)):
    run = agent_run_repo.get_by_run_id(runId)
    if run is None:
        raise HTTPException(status_code=404, detail="Agent run not found")
    return {"run": run}
