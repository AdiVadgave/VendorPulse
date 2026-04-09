"""
Scheduling routes for cycle and attendee management.

Graph-only scheduling hard cutover is active:
    - Real slot discovery must use /api/cycles/{cycleId}/scheduling/graph/find-times
    - Real invite sending must use /api/cycles/{cycleId}/scheduling/graph/send-invite
    - Legacy simulate/rank/agent/send-invites endpoints are intentionally disabled (HTTP 410)
"""
from __future__ import annotations

import base64
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException
from typing import Optional

from app.core.workflow_engine import WorkflowStateError, WorkflowViolationError, workflow_engine
from app.dependencies import (
    get_attendee_repo,
    get_agent_run_repo,
    get_cycle_repo,
    get_scheduling_service,
    get_slot_repo,
)
from app.models.scheduling import (
    ApproveSlotRequest,
    CycleAttendeeCreate,
    CycleAttendeeUpdate,
    CycleCreate,
    RankSlotsRequest,
)
from app.services.scheduling_service import SchedulingService
from app.services.graph_service import GraphService
from app.config import Settings, settings

router = APIRouter(tags=["scheduling"])


def _decode_jwt_payload_without_verification(token: str) -> dict | None:
    """Decode JWT payload without verifying signature (diagnostics only)."""
    if not token:
        return None
    parts = token.split(".")
    if len(parts) < 2:
        return None

    payload_b64 = parts[1]
    padding = "=" * (-len(payload_b64) % 4)
    try:
        payload_bytes = base64.urlsafe_b64decode(payload_b64 + padding)
        return json.loads(payload_bytes.decode("utf-8"))
    except Exception:
        return None


def _get_delegated_scopes_from_token(token: str) -> list[str]:
    claims = _decode_jwt_payload_without_verification(token) or {}
    scp = claims.get("scp") or ""
    return [s for s in str(scp).split(" ") if s]


def _get_graph_access_token() -> str:
    """Read Graph token from .env at request time to avoid stale in-memory tokens."""
    fresh_settings = Settings()
    token = fresh_settings.graph_access_token or settings.graph_access_token
    token = token.strip() if token else ""
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    return token


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


@router.delete("/api/cycles/{cycleId}")
def delete_cycle(
    cycleId: str,
    cycle_repo=Depends(get_cycle_repo),
    attendee_repo=Depends(get_attendee_repo),
    slot_repo=Depends(get_slot_repo),
):
    _get_cycle_or_404(cycleId, cycle_repo)

    removed_attendees = attendee_repo.delete_for_cycle(cycleId)
    slot_repo.clear_for_cycle(cycleId)
    cycle_repo.delete_by_id("cycle_id", cycleId)

    return {
        "message": f"Cycle '{cycleId}' deleted",
        "cycle_id": cycleId,
        "removed_attendees": removed_attendees,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Attendees
# ──────────────────────────────────────────────────────────────────────────────


@router.get("/api/cycles/{cycleId}/attendees")
def get_attendees(
    cycleId: str,
    svc: SchedulingService = Depends(get_scheduling_service),
):
    # Important: do NOT auto-seed attendees by default.
    return {"attendees": svc.get_attendees(cycleId, seed_from_previous=False)}


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
    attendees = svc.get_attendees(cycleId, seed_from_previous=False)
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
    attendees = svc.get_attendees(cycleId, seed_from_previous=False)
    if not any(a["attendee_id"] == attendeeId for a in attendees):
        raise HTTPException(status_code=404, detail="Attendee not found in this cycle")
    if not svc.remove_attendee(attendeeId):
        raise HTTPException(status_code=404, detail="Attendee not found")


# ──────────────────────────────────────────────────────────────────────────────
# Scheduling workflow
# ──────────────────────────────────────────────────────────────────────────────


@router.post("/api/cycles/{cycleId}/scheduling/attendance-outreach")
def send_attendance_outreach(
    cycleId: str,
    svc: SchedulingService = Depends(get_scheduling_service),
    cycle_repo=Depends(get_cycle_repo),
):
    """
    Trigger outreach to all attendees from the last cycle to confirm attendance.
    In production this would send emails/forms; here it marks outreach as sent.
    """
    _get_cycle_or_404(cycleId, cycle_repo)

    # Ensure attendees are loaded (may auto-seed from previous cycle)
    svc.get_attendees(cycleId, seed_from_previous=True)

    graph_access_token = _get_graph_access_token()
    if not graph_access_token:
        raise HTTPException(
            status_code=500,
            detail="GRAPH_ACCESS_TOKEN is not set in backend/.env (required for sending outreach emails via Microsoft Graph)",
        )

    scopes = _get_delegated_scopes_from_token(graph_access_token)
    if scopes and "Mail.Send" not in scopes:
        raise HTTPException(
            status_code=403,
            detail=(
                "GRAPH_ACCESS_TOKEN is missing the delegated scope 'Mail.Send'. "
                "Re-authenticate and request 'Mail.Send' (keep 'Mail.ReadWrite' as well)."
            ),
        )

    graph_service = GraphService(graph_access_token)
    return svc.send_attendance_outreach(cycleId, graph_service=graph_service)


@router.get("/api/cycles/{cycleId}/scheduling/attendance-outreach/messages")
def get_attendance_outreach_messages(
    cycleId: str,
    svc: SchedulingService = Depends(get_scheduling_service),
    cycle_repo=Depends(get_cycle_repo),
):
    """Query messages (original + replies) for each attendee conversationId."""
    _get_cycle_or_404(cycleId, cycle_repo)

    graph_access_token = _get_graph_access_token()
    if not graph_access_token:
        raise HTTPException(
            status_code=500,
            detail="GRAPH_ACCESS_TOKEN is not set in .env",
        )

    graph_service = GraphService(graph_access_token)
    try:
        import asyncio

        return asyncio.run(svc.get_attendance_outreach_messages(cycleId, graph_service=graph_service))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to query outreach messages: {str(exc)}")


@router.post("/api/cycles/{cycleId}/scheduling/simulate-attendance-confirmation")
def simulate_attendance_confirmation(
    cycleId: str,
    svc: SchedulingService = Depends(get_scheduling_service),
    cycle_repo=Depends(get_cycle_repo),
):
    """
    Simulate attendance confirmation responses from all attendees (demo helper).
    Marks ~60% as CONFIRMED, ~25% as REPLACED, rest as CONFIRMED.
    """
    raise HTTPException(
        status_code=410,
        detail="This endpoint is disabled in Graph-only mode. Use attendance outreach + Graph scheduling flow.",
    )


@router.post("/api/cycles/{cycleId}/scheduling/simulate-responses")
def simulate_responses(
    cycleId: str,
    svc: SchedulingService = Depends(get_scheduling_service),
    cycle_repo=Depends(get_cycle_repo),
):
    raise HTTPException(
        status_code=410,
        detail="This endpoint is disabled in Graph-only mode. Use /api/cycles/{cycleId}/scheduling/graph/find-times.",
    )


@router.post("/api/cycles/{cycleId}/scheduling/rank-slots")
def rank_slots(
    cycleId: str,
    payload: RankSlotsRequest,
    svc: SchedulingService = Depends(get_scheduling_service),
    cycle_repo=Depends(get_cycle_repo),
):
    raise HTTPException(
        status_code=410,
        detail="This endpoint is disabled in Graph-only mode. Use /api/cycles/{cycleId}/scheduling/graph/find-times.",
    )


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
    return svc.approve_slot(cycleId, slotId, payload.approved_by, time_zone=payload.time_zone)


@router.post("/api/cycles/{cycleId}/scheduling/send-invites")
def send_invites(
    cycleId: str,
    organiser_id: str = Body(..., embed=True),
    slot_id: str = Body(..., embed=True),
    svc: SchedulingService = Depends(get_scheduling_service),
    cycle_repo=Depends(get_cycle_repo),
):
    raise HTTPException(
        status_code=410,
        detail="This endpoint is disabled in Graph-only mode. Use /api/cycles/{cycleId}/scheduling/graph/send-invite.",
    )


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
# Scheduling Agent — autonomous run endpoint
# ──────────────────────────────────────────────────────────────────────────────


@router.post("/api/cycles/{cycleId}/scheduling/agent/run")
def run_scheduling_agent(
    cycleId: str,
    message: str = Body(
        default="Simulate availability responses then rank the best meeting slots for this cycle.",
        embed=True,
    ),
    svc: SchedulingService = Depends(get_scheduling_service),
    cycle_repo=Depends(get_cycle_repo),
    agent_run_repo=Depends(get_agent_run_repo),
):
    raise HTTPException(
        status_code=410,
        detail="This endpoint is disabled in Graph-only mode. Use /api/cycles/{cycleId}/scheduling/graph/find-times.",
    )


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
