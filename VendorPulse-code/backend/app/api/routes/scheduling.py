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
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from app.core.workflow_engine import WORKFLOW_STATES, WorkflowStateError, WorkflowViolationError, workflow_engine
from app.dependencies import (
    get_action_repo,
    get_attendee_repo,
    get_agent_run_repo,
    get_cycle_repo,
    get_llm_service,
    get_meeting_participant_repo,
    get_meeting_repo,
    get_scheduling_service,
    get_slot_repo,
    get_vendor_repo,
)
from app.services.llm_service import LLMService
from app.utils.prompts import INVITE_DRAFT_SYSTEM_PROMPT
from app.models.scheduling import (
    ApproveSlotRequest,
    CycleAttendeeCreate,
    CycleAttendeeUpdate,
    CycleCreate,
)
from app.utils.scorecard_structure import default_scorecard_config
from app.services.scheduling_service import SchedulingService
from app.services.graph_service import GraphService
from app.config import Settings, settings

logger = logging.getLogger(__name__)

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


def _http409(detail: str) -> None:
    raise HTTPException(status_code=409, detail=detail)


# ──────────────────────────────────────────────────────────────────────────────
# Cycles
# ──────────────────────────────────────────────────────────────────────────────


@router.get("/api/cycles")
def list_cycles(cycle_repo=Depends(get_cycle_repo)):
    logger.info("list_cycles called")
    cycles = cycle_repo.find_all()
    logger.info("list_cycles returning %d cycles", len(cycles))
    return {"cycles": cycles}


@router.post("/api/cycles", status_code=201)
def create_cycle(
    payload: CycleCreate,
    cycle_repo=Depends(get_cycle_repo),
    vendor_repo=Depends(get_vendor_repo),
):
    import uuid
    from datetime import datetime, timezone

    logger.info(
        "create_cycle called — vendor_id=%s, vendor_name=%s, quarter=%s, year=%s",
        payload.vendor_id, payload.vendor_name, payload.quarter, payload.year,
    )

    # Resolve or persist the vendor so future cycles can reuse it.
    vendor_id = payload.vendor_id
    vendor_name = payload.vendor_name.strip()

    if vendor_id == "v_custom":
        # Check if a vendor with this name already exists; reuse its id if so.
        new_vid = f"v_{uuid.uuid4().hex}"
        persisted = vendor_repo.find_or_create(
            vendor_name, vendor_id=new_vid, category=payload.category
        )
        vendor_id = persisted["vendor_id"]
        logger.info("create_cycle: resolved vendor '%s' → vendor_id=%s", vendor_name, vendor_id)

    now = datetime.now(timezone.utc).isoformat()
    cycle = {
        "cycle_id": f"c_{uuid.uuid4().hex}",
        "vendor_id": vendor_id,
        "vendor_name": vendor_name,
        "cycle_type": payload.cycle_type,
        "quarter": payload.quarter,
        "year": payload.year,
        "description": (payload.description or "").strip(),
        "workflow_state": "CYCLE_CREATED",
        "created_at": now,
        "updated_at": now,
        "scorecard_config": default_scorecard_config(),
    }
    result = cycle_repo.insert(cycle)
    logger.info("create_cycle success — cycle_id=%s", cycle["cycle_id"])
    return {"cycle": result, "message": "Cycle created"}


@router.get("/api/cycles/{cycleId}")
def get_cycle(cycleId: str, cycle_repo=Depends(get_cycle_repo)):
    logger.info("get_cycle called — cycleId=%s", cycleId)
    cycle = _get_cycle_or_404(cycleId, cycle_repo)
    ws = cycle.get("workflow_state", "CYCLE_CREATED")
    ws_idx = WORKFLOW_STATES.index(ws) if ws in WORKFLOW_STATES else 0
    cycle["scorecard_dispatched"] = bool(cycle.get("scorecard_dispatched_at"))
    cycle["meeting_scheduled"] = ws_idx >= WORKFLOW_STATES.index("MEETING_SCHEDULED")
    # Backfill defaults for cycles created before these fields existed.
    cycle.setdefault("cycle_type", "SPR")
    cycle.setdefault("description", "")
    # The cycle meeting-plan feature was removed; drop any stale field on older records.
    cycle.pop("meeting_plan", None)
    if not (cycle.get("scorecard_config") or {}).get("categories"):
        cycle["scorecard_config"] = default_scorecard_config()
    logger.info("get_cycle success — cycleId=%s, workflow_state=%s", cycleId, ws)
    return {"cycle": cycle}


@router.post("/api/cycles/{cycleId}/workflow-state")
def set_workflow_state(
    cycleId: str,
    payload: dict = Body(...),
    cycle_repo=Depends(get_cycle_repo),
):
    """
    Fast-forward a cycle's workflow_state to the requested target (forward-only).

    The frontend drives workflow progress for modules C–E (alignment, vendor prep,
    meeting) which have no dedicated backend routes. This endpoint lets the client
    persist that progress server-side so the state survives localStorage clears,
    browser switches, and fresh machines.

    Body: {"target": "<WORKFLOW_STATE>"}
    - If the cycle is already at or past `target`, this is a no-op (200).
    - Backward transitions are rejected (409).
    """
    target = payload.get("target")
    if not target or target not in WORKFLOW_STATES:
        raise HTTPException(status_code=400, detail=f"Invalid or missing 'target'. Must be one of {WORKFLOW_STATES}")

    cycle = _get_cycle_or_404(cycleId, cycle_repo)
    current = cycle.get("workflow_state", "CYCLE_CREATED")
    current_idx = WORKFLOW_STATES.index(current) if current in WORKFLOW_STATES else 0
    target_idx = WORKFLOW_STATES.index(target)

    if target_idx < current_idx:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot regress workflow: cycle is already at '{current}', requested '{target}'.",
        )

    if target_idx == current_idx:
        return {"cycle": cycle, "message": "No change"}

    # Walk forward one step at a time so transition history stays consistent.
    updated = cycle
    for _ in range(target_idx - current_idx):
        updated = workflow_engine.advance(updated, cycle_repo)
    logger.info("set_workflow_state — cycleId=%s, %s -> %s", cycleId, current, target)
    return {"cycle": updated, "message": f"Advanced {current} -> {target}"}


class ManualMeetingRequest(BaseModel):
    start_time: str = Field(..., description="ISO-8601 start time chosen by the coordinator")
    time_zone: str = Field(default="IST")
    duration_minutes: int = Field(default=60)
    meeting_url: Optional[str] = Field(default=None, description="Optional meeting link the coordinator pastes")


@router.post("/api/cycles/{cycleId}/scheduling/manual-meeting")
def set_manual_meeting(
    cycleId: str,
    payload: ManualMeetingRequest,
    cycle_repo=Depends(get_cycle_repo),
):
    """Record a manually-chosen meeting date/time (no Microsoft Graph / calendar access
    required). Persists the scheduled time — and an optional pasted meeting link — on the
    cycle, then advances the workflow to MEETING_SCHEDULED so the date lives in the DB."""
    from datetime import datetime, timezone

    cycle = _get_cycle_or_404(cycleId, cycle_repo)
    cycle_repo.mark_teams_meeting_scheduled(
        cycleId,
        teams_meeting_url=(payload.meeting_url or None),
        web_link=None,
        event_id=None,
        scheduled_at=payload.start_time,
    )
    # Persist the chosen timezone + duration so the Confirmation view rehydrates
    # correctly after a refresh.
    cycle_repo.update_by_id("cycle_id", cycleId, {
        "meeting_time_zone": payload.time_zone,
        "meeting_duration_minutes": payload.duration_minutes,
    })
    # Advance forward to MEETING_SCHEDULED (never regress if already past it).
    current = cycle.get("workflow_state", "CYCLE_CREATED")
    current_idx = WORKFLOW_STATES.index(current) if current in WORKFLOW_STATES else 0
    target_idx = WORKFLOW_STATES.index("MEETING_SCHEDULED")
    updated = cycle_repo.get_by_cycle_id(cycleId)
    if current_idx < target_idx:
        for _ in range(target_idx - current_idx):
            updated = workflow_engine.advance(updated, cycle_repo)
    logger.info("MANUAL-MEETING — cycleId=%s scheduled_at=%s tz=%s", cycleId, payload.start_time, payload.time_zone)
    return {
        "cycle": updated,
        "scheduled_at": payload.start_time,
        "time_zone": payload.time_zone,
        "duration_minutes": payload.duration_minutes,
        "meeting_url": payload.meeting_url or None,
    }


@router.delete("/api/cycles/{cycleId}")
def delete_cycle(
    cycleId: str,
    cycle_repo=Depends(get_cycle_repo),
    attendee_repo=Depends(get_attendee_repo),
    slot_repo=Depends(get_slot_repo),
    action_repo=Depends(get_action_repo),
    meeting_repo=Depends(get_meeting_repo),
    participant_repo=Depends(get_meeting_participant_repo),
):
    logger.info("delete_cycle called — cycleId=%s", cycleId)
    _get_cycle_or_404(cycleId, cycle_repo)

    # Cascade: remove every child record so nothing dangles keyed to a dead cycle
    # (mirrors ON DELETE CASCADE for the eventual Postgres schema).
    removed_attendees = attendee_repo.delete_for_cycle(cycleId)
    slot_repo.clear_for_cycle(cycleId)
    removed_actions = action_repo.delete_by_field("cycle_id", cycleId)
    # Meeting participants are a child of meetings — drop them before the meetings.
    for _m in meeting_repo.get_for_cycle(cycleId):
        participant_repo.delete_for_meeting(_m.get("meeting_id", ""))
    removed_meetings = meeting_repo.delete_by_field("cycle_id", cycleId)
    from app.api.routes.scorecard_v2 import _submissions_repo, _final_repo
    removed_submissions = _submissions_repo().delete_by_field("cycle_id", cycleId)
    _final_repo().delete_by_field("cycle_id", cycleId)
    # Pushback items + their drafted responses (child).
    from app.dependencies import get_pushback_repo, get_pushback_response_repo, get_meeting_artifact_repo
    _pb_repo, _pr_repo = get_pushback_repo(), get_pushback_response_repo()
    for _pb in _pb_repo.get_for_cycle(cycleId):
        _pr_repo.delete_for_pushback(_pb.get("pushback_id", ""))
    _pb_repo.delete_by_field("cycle_id", cycleId)
    # Persisted meeting artifacts (parsed notes + minutes).
    get_meeting_artifact_repo().delete_for_cycle(cycleId)
    cycle_repo.delete_by_id("cycle_id", cycleId)

    logger.info(
        "delete_cycle success — cycleId=%s, attendees=%d actions=%d meetings=%d submissions=%d",
        cycleId, removed_attendees, removed_actions, removed_meetings, removed_submissions,
    )
    return {
        "message": f"Cycle '{cycleId}' deleted",
        "cycle_id": cycleId,
        "removed_attendees": removed_attendees,
        "removed_actions": removed_actions,
        "removed_meetings": removed_meetings,
        "removed_submissions": removed_submissions,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Attendees
# ──────────────────────────────────────────────────────────────────────────────


@router.get("/api/cycles/{cycleId}/attendees")
def get_attendees(
    cycleId: str,
    seedFromPrevious: bool = False,
    svc: SchedulingService = Depends(get_scheduling_service),
):
    logger.info("get_attendees called — cycleId=%s, seedFromPrevious=%s", cycleId, seedFromPrevious)
    attendees = svc.get_attendees(cycleId, seed_from_previous=seedFromPrevious)
    logger.info("get_attendees returning %d attendees for cycleId=%s", len(attendees), cycleId)
    return {"attendees": attendees}


@router.post("/api/cycles/{cycleId}/attendees", status_code=201)
def add_attendees(
    cycleId: str,
    attendees: list[CycleAttendeeCreate] = Body(...),
    svc: SchedulingService = Depends(get_scheduling_service),
    cycle_repo=Depends(get_cycle_repo),
):
    logger.info("add_attendees called — cycleId=%s, count=%d", cycleId, len(attendees))
    _get_cycle_or_404(cycleId, cycle_repo)   # ensure cycle exists
    result = svc.add_attendees(cycleId, attendees)
    logger.info("add_attendees success — cycleId=%s", cycleId)
    return result


@router.post("/api/cycles/{cycleId}/scheduling/attendance-confirmation/complete")
def complete_attendance_confirmation(
    cycleId: str,
    svc: SchedulingService = Depends(get_scheduling_service),
    cycle_repo=Depends(get_cycle_repo),
):
    """Advance CYCLE_CREATED → ATTENDEE_REFRESH_SENT once confirmations are resolved."""
    _get_cycle_or_404(cycleId, cycle_repo)
    try:
        updated = svc.complete_attendance_confirmation(cycleId)
    except ValueError as exc:
        _http409(str(exc))
    return {"cycle": updated}


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
    # Cascade: drop any scorecard submission this attendee filed so it can't dangle
    # (their column/score is removed from the consolidation on next compile).
    from app.api.routes.scorecard_v2 import _submissions_repo
    _submissions_repo().delete_by_field("attendee_id", attendeeId)


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
    logger.info("send_attendance_outreach called — cycleId=%s", cycleId)
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
    llm_svc: LLMService = Depends(get_llm_service),
):
    logger.info("approve_slot called — cycleId=%s, slotId=%s, approved_by=%s", cycleId, slotId, payload.approved_by)
    # Require at least AVAILABILITY_COLLECTED before approving a slot
    cycle = _get_cycle_or_404(cycleId, cycle_repo)
    _check_workflow_state(cycle, "AVAILABILITY_COLLECTED")
    result = svc.approve_slot(cycleId, slotId, payload.approved_by, time_zone=payload.time_zone)

    # AI augmentation: replace the static invite draft with a personalised LLM-generated version.
    # Falls back silently to the existing static draft if LLM is disabled or the call fails.
    if llm_svc.is_enabled and result.data and result.data.get("invite_draft"):
        try:
            draft = result.data["invite_draft"]
            user_prompt = (
                f"Vendor: {cycle.get('vendor_name', 'the vendor')}, "
                f"Quarter: {cycle.get('quarter', '')} {cycle.get('year', '')}, "
                f"Meeting time: {draft.get('proposed_time', '')}, "
                f"Timezone: {payload.time_zone or 'UTC'}, "
                f"Attending: {', '.join(draft.get('attending', []))}"
            )
            draft["draft_body"] = llm_svc.call_simple(
                user_prompt, system=INVITE_DRAFT_SYSTEM_PROMPT,
                max_tokens=settings.scheduling_llm_invite_max_tokens,
            )
            draft["draft_subject"] = (
                f"VendorPulse QBR — {cycle.get('vendor_name', 'Vendor')} "
                f"{cycle.get('quarter', '')} {cycle.get('year', '')} Governance Meeting"
            )
        except Exception:
            pass  # fall back to static draft

    logger.info("approve_slot success — cycleId=%s, slotId=%s", cycleId, slotId)
    return result


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
