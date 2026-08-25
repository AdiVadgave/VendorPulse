"""
Module D — Vendor Prep agent routes.

POST /api/cycles/{cycleId}/vendor-prep/brief            Generate vendor brief from scorecard
POST /api/cycles/{cycleId}/vendor-prep/pushback          Draft 3 response options for a pushback item
POST /api/cycles/{cycleId}/vendor-prep/brief/approve     Approve a generated vendor brief
POST /api/cycles/{cycleId}/vendor-prep/pushback/approve  Approve a selected pushback response
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import Settings, settings
from app.core.logging_config import sanitize_for_log
from app.dependencies import (
    get_agent_run_repo,
    get_attendee_repo,
    get_cycle_repo,
    get_meeting_attendee_repo,
    get_meeting_attendee_seed_repo,
    get_meeting_participant_repo,
    get_meeting_repo,
    get_scorecard_submission_repo,
    get_vendor_prep_agent,
)
from app.models.common import AgentResponse
from app.models.vendor_prep import GenerateBriefRequest, HandlePushbackRequest
from app.services.graph_service import GraphService
from app.services.meeting_attendee_service import (
    add_meeting_attendee,
    list_meeting_attendees,
    remove_meeting_attendee,
    reset_meeting_attendees,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cycles/{cycleId}/vendor-prep", tags=["vendor-prep"])

# A cycle has exactly ONE vendor-prep meeting. It is persisted in the SAME shared
# `meetings` store as the alignment meeting, discriminated by `meetingType`. This
# keeps the future Postgres schema a single `meetings` table (type + index columns)
# rather than a second, near-identical table — no duplicated meeting data.
VP_MEETING_TYPE = "VENDOR_PREP"
VP_MEETING_INDEX = 1


@router.post("/brief", response_model=AgentResponse)
def generate_vendor_brief(
    cycleId: str,
    payload: GenerateBriefRequest,
):
    """
    Generate a narrative vendor brief from compiled scorecard data.
    Uses Azure OpenAI when ENABLE_LLM=true, otherwise returns a deterministic brief.
    """
    logger.info("VENDOR-PREP: generate brief — cycleId=%s, vendor=%s", sanitize_for_log(cycleId), sanitize_for_log(payload.vendor_name))

    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    # The brief is derived entirely from the compiled scorecard. With no submissions
    # there is nothing to summarise — return a clear, non-fatal message the UI shows,
    # rather than an empty/garbled brief.
    if not get_scorecard_submission_repo().get_for_cycle(cycleId):
        logger.info("VENDOR-PREP: brief blocked — no scorecard submissions for cycle %s", sanitize_for_log(cycleId))
        return AgentResponse(
            status="failed",
            agent="vendor_prep",
            summary="No scorecard has been submitted for this cycle yet — collect and compile the scorecard before generating the vendor brief.",
            data=None,
            requires_approval=False,
        )

    agent = get_vendor_prep_agent(cycle_id=cycleId)
    response = agent.run(
        user_message=f"Generate a vendor brief for cycle {cycleId}",
        context={
            "action": "generate_vendor_brief",
            "params": {
                "vendor_name": payload.vendor_name or "Vendor",
            },
        },
    )
    logger.info("VENDOR-PREP: brief generated — status=%s", response.status)
    return response


@router.post("/pushback", response_model=AgentResponse)
def handle_pushback(
    cycleId: str,
    payload: HandlePushbackRequest,
):
    """
    Draft 3 response options (factual, neutral, escalation) for a vendor pushback item.
    Items flagged for legal review are excluded from AI drafting.
    """
    logger.info(
        "VENDOR-PREP: handle pushback — cycleId=%s, pushback_id=%s, category=%s, legal=%s",
        sanitize_for_log(cycleId), sanitize_for_log(payload.pushback_id), sanitize_for_log(payload.category), payload.needs_legal_review,
    )

    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    agent = get_vendor_prep_agent(cycle_id=cycleId)
    response = agent.run(
        user_message=f"Draft 3 response options for pushback {payload.pushback_id}",
        context={
            "action": "handle_pushback",
            "params": {
                "pushback_id": payload.pushback_id,
                "category": payload.category,
                "description": payload.description,
                "raised_by": payload.raised_by,
                "needs_legal_review": payload.needs_legal_review,
            },
        },
    )
    logger.info("VENDOR-PREP: pushback handled — status=%s", response.status)
    return response


# ── Approval endpoints ──────────────────────────────────────────────────────


class ApproveRequest(BaseModel):
    run_id: str
    approved_by: str = "coordinator"


@router.post("/brief/approve")
def approve_brief(cycleId: str, payload: ApproveRequest):
    """Mark a generated vendor brief as approved."""
    logger.info("VENDOR-PREP: approve brief — cycleId=%s, run_id=%s", sanitize_for_log(cycleId), sanitize_for_log(payload.run_id))

    repo = get_agent_run_repo()
    record = repo.get_by_run_id(payload.run_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Agent run '{payload.run_id}' not found")

    now = datetime.now(timezone.utc).isoformat()
    repo.update_by_id("run_id", payload.run_id, {
        "approval_status": "APPROVED",
        "approved_by": payload.approved_by,
        "approved_at": now,
    })

    logger.info("VENDOR-PREP: brief approved — run_id=%s, by=%s", sanitize_for_log(payload.run_id), sanitize_for_log(payload.approved_by))
    return {
        "status": "approved",
        "run_id": payload.run_id,
        "approved_by": payload.approved_by,
        "approved_at": now,
    }


@router.post("/pushback/approve")
def approve_pushback_response(cycleId: str, payload: ApproveRequest):
    """Mark a selected pushback response as approved."""
    logger.info("VENDOR-PREP: approve pushback — cycleId=%s, run_id=%s", sanitize_for_log(cycleId), sanitize_for_log(payload.run_id))

    repo = get_agent_run_repo()
    record = repo.get_by_run_id(payload.run_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Agent run '{payload.run_id}' not found")

    now = datetime.now(timezone.utc).isoformat()
    repo.update_by_id("run_id", payload.run_id, {
        "approval_status": "APPROVED",
        "approved_by": payload.approved_by,
        "approved_at": now,
    })

    logger.info("VENDOR-PREP: pushback approved — run_id=%s, by=%s", sanitize_for_log(payload.run_id), sanitize_for_log(payload.approved_by))
    return {
        "status": "approved",
        "run_id": payload.run_id,
        "approved_by": payload.approved_by,
        "approved_at": now,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Vendor Prep Meeting — schedule the prep call (Teams via Graph), then attach a
# transcript + AI minutes. Attendees are the internal team AND the vendor; the
# frontend can edit which of them are invited (passed as `attendee_emails`).
#
# Shares the alignment meeting's low-level building blocks (GraphService, the
# `meetings` store). See docs/GRAPH_SCHEDULING_HANDOVER.md.
# ══════════════════════════════════════════════════════════════════════════════


def _get_graph_token() -> str:
    fresh_settings = Settings()
    token = (fresh_settings.graph_access_token or settings.graph_access_token or "").strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    return token


def _cycle_attendee_emails(attendee_repo, cycleId: str) -> list[str]:
    """All attendee emails for the cycle — internal stakeholders AND vendor."""
    attendees = attendee_repo.get_for_cycle(cycleId)
    emails = [a.get("email", "").strip().lower() for a in attendees if a.get("email")]
    # De-dupe while preserving order.
    seen: set[str] = set()
    return [e for e in emails if e and not (e in seen or seen.add(e))]


def _resolve_invite_emails(payload_emails: Optional[list[str]], attendee_repo, cycleId: str) -> list[str]:
    """Use the frontend's edited selection when provided (restricted to real cycle
    attendees), otherwise default to every internal + vendor attendee."""
    all_emails = _cycle_attendee_emails(attendee_repo, cycleId)
    if not payload_emails:
        return all_emails
    allowed = set(all_emails)
    chosen = [e.strip().lower() for e in payload_emails if e and e.strip().lower() in allowed]
    return chosen or all_emails


# ── Per-meeting attendee roster (independent of the cycle attendees) ──────────


class VPAddAttendeeRequest(BaseModel):
    cycle_id: str
    name: str
    email: str
    role: str = "VMO_COORDINATOR"
    organisation: str = ""
    is_key: bool = False
    type: str = "Internal Stakeholder"
    attendance_requirement: str = "Required"
    lt_status: str = "Non-LT"
    shell_department: Optional[str] = None
    user_id: Optional[str] = None
    stakeholder_id: Optional[str] = None


class VPRemoveAttendeeRequest(BaseModel):
    cycle_id: str
    attendee_id: str


@router.get("/attendees")
def get_vendor_prep_attendees(
    cycleId: str,
    index: int = 1,
    attendee_repo=Depends(get_attendee_repo),
    ma_repo=Depends(get_meeting_attendee_repo),
    seed_repo=Depends(get_meeting_attendee_seed_repo),
):
    """This vendor-prep meeting's OWN attendee roster (internal + vendor), separate
    from the cycle's master attendee list. Seeded once from the cycle roster."""
    attendees = list_meeting_attendees(
        ma_repo, seed_repo, attendee_repo, cycleId, "vendor_prep", index, include_vendors=True
    )
    return {"attendees": attendees, "count": len(attendees)}


@router.post("/attendees/add")
def add_vendor_prep_attendee(
    cycleId: str,
    payload: VPAddAttendeeRequest,
    index: int = 1,
    ma_repo=Depends(get_meeting_attendee_repo),
    seed_repo=Depends(get_meeting_attendee_seed_repo),
):
    """Add an attendee to THIS vendor-prep meeting's roster only."""
    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")
    created = add_meeting_attendee(ma_repo, seed_repo, cycleId, "vendor_prep", index, {
        "name": payload.name, "email": payload.email, "role": payload.role,
        "organisation": payload.organisation, "is_key": payload.is_key,
        "type": payload.type, "attendance_requirement": payload.attendance_requirement,
        "lt_status": payload.lt_status, "shell_department": payload.shell_department,
        "user_id": payload.user_id, "stakeholder_id": payload.stakeholder_id,
    })
    logger.info("VENDOR-PREP: added attendee %s to meeting %s of cycle %s", sanitize_for_log(payload.name), sanitize_for_log(str(index)), sanitize_for_log(cycleId))
    return {"attendee": created, "message": f"Added {payload.name} to vendor prep meeting"}


@router.post("/attendees/remove")
def remove_vendor_prep_attendee(
    cycleId: str,
    payload: VPRemoveAttendeeRequest,
    index: int = 1,
    ma_repo=Depends(get_meeting_attendee_repo),
):
    """Remove an attendee from THIS vendor-prep meeting's roster only."""
    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")
    ok = remove_meeting_attendee(ma_repo, cycleId, "vendor_prep", index, payload.attendee_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Attendee not found in this vendor prep meeting")
    logger.info("VENDOR-PREP: removed attendee %s from meeting %s of cycle %s", sanitize_for_log(payload.attendee_id), sanitize_for_log(str(index)), sanitize_for_log(cycleId))
    return {"message": "Removed from vendor prep meeting", "attendee_id": payload.attendee_id}


@router.post("/attendees/reset")
def reset_vendor_prep_attendees(
    cycleId: str,
    index: int = 1,
    attendee_repo=Depends(get_attendee_repo),
    ma_repo=Depends(get_meeting_attendee_repo),
    seed_repo=Depends(get_meeting_attendee_seed_repo),
):
    """Reset THIS vendor-prep meeting's roster back to the cycle attendees (internal
    + vendor) — used on reschedule so the full QBR attendee list is available to
    re-pick. Never touches the cycle's master attendee list."""
    attendees = reset_meeting_attendees(
        ma_repo, seed_repo, attendee_repo, cycleId, "vendor_prep", index, include_vendors=True
    )
    logger.info("VENDOR-PREP: reset roster for meeting %s of cycle %s", sanitize_for_log(str(index)), sanitize_for_log(cycleId))
    return {"attendees": attendees, "count": len(attendees)}


class VPManualScheduleRequest(BaseModel):
    """Schedule the vendor-prep call at a coordinator-chosen time WITHOUT Microsoft
    Graph / calendar access. Persists to the shared meetings store for state recovery."""
    start_time: str
    duration_minutes: int = 30
    time_zone: str = "IST"
    attendee_emails: Optional[list[str]] = None
    meeting_url: Optional[str] = None


def _iso_start_from_slot(ts: Optional[dict]) -> Optional[str]:
    """Rebuild the UTC ISO instant from the persisted time_slot (date + start_time are
    stored as UTC wall-clock components) so the UI can show the scheduled date/time
    after a refresh, the same way the QBR meeting banner does."""
    if not ts:
        return None
    date = ts.get("date")
    start = ts.get("start_time")
    if not date or not start:
        return None
    return f"{date}T{start}:00Z"


def _vp_meeting_dto(m: dict, participant_repo) -> dict:
    participants = participant_repo.get_for_meeting(m.get("meeting_id", ""))
    return {
        "meeting_index": VP_MEETING_INDEX,
        "event_id": m.get("meeting_id"),
        "teams_meeting_url": m.get("teams_meeting_url"),
        "web_link": m.get("web_link"),
        "attendee_count": len(participants) + 1,
        "status": m.get("status"),
        "time_slot": m.get("time_slot"),
        # Scheduled date/time so the UI can render it after a refresh.
        "start_time": _iso_start_from_slot(m.get("time_slot")),
        "time_zone": m.get("time_zone"),
        "duration_minutes": m.get("duration_minutes"),
        "title": m.get("title"),
        "attendee_emails": [p.get("user_id") for p in participants],
    }


@router.post("/manual-meeting")
def schedule_vendor_prep_meeting_manual(
    cycleId: str,
    payload: VPManualScheduleRequest,
    cycle_repo=Depends(get_cycle_repo),
    attendee_repo=Depends(get_attendee_repo),
    meeting_repo=Depends(get_meeting_repo),
    participant_repo=Depends(get_meeting_participant_repo),
):
    """Record the vendor-prep meeting at a coordinator-chosen time with no Microsoft
    Graph / calendar access. Invites the internal team + vendor (or the edited subset)
    and persists to the shared meetings store (meeting_type=VENDOR_PREP). Reschedules
    in place."""
    logger.info("VENDOR-PREP: manual meeting — cycleId=%s", sanitize_for_log(cycleId))

    cycle = cycle_repo.get_by_cycle_id(cycleId)
    if not cycle:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycleId}' not found")

    invite_emails = _resolve_invite_emails(payload.attendee_emails, attendee_repo, cycleId)
    if not invite_emails:
        raise HTTPException(status_code=400, detail="No attendee emails found for this cycle")

    vendor_name = cycle.get("vendor_name", "TBD")
    quarter = cycle.get("quarter", "")
    year = cycle.get("year", "")
    subject = f"Vendor Prep Call — {vendor_name} ({quarter} {year})".strip()
    meeting_url = (payload.meeting_url or "").strip() or None

    existing = next(
        (m for m in meeting_repo.get_for_cycle(cycleId)
         if m.get("meeting_type") == VP_MEETING_TYPE and m.get("status") != "cancelled"),
        None,
    )
    is_reschedule = bool(existing and existing.get("meeting_id"))
    event_id = (existing.get("meeting_id") if existing else None) or f"m{uuid.uuid4().hex}"

    # First invitee stands in as organiser so attendee_count (participant rows + 1) matches.
    organiser = invite_emails[0]

    try:
        start_dt = datetime.fromisoformat(payload.start_time.replace("Z", "+00:00"))
        end_dt = start_dt + timedelta(minutes=payload.duration_minutes)
        meeting_record = {
            "meeting_id": event_id,
            "title": subject,
            "description": f"Vendor prep call for cycle {cycleId}",
            "agenda": "1. Vendor brief review\n2. Anticipated pushback & responses\n3. Roles for the vendor call\n4. Action items",
            "organizer_id": organiser,
            "time_slot": {
                "date": start_dt.strftime("%Y-%m-%d"),
                "start_time": start_dt.strftime("%H:%M"),
                "end_time": end_dt.strftime("%H:%M"),
            },
            "time_zone": payload.time_zone,
            "duration_minutes": payload.duration_minutes,
            "status": "scheduled",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "cycle_id": cycleId,
            "meeting_type": VP_MEETING_TYPE,
            "teams_meeting_url": meeting_url,
            "web_link": meeting_url,
        }
        if is_reschedule:
            meeting_repo.replace_by_id("meeting_id", event_id, meeting_record)
        else:
            meeting_repo.insert(meeting_record)
        participant_repo.set_for_meeting(event_id, invite_emails[1:], status="pending")
    except Exception as e:
        logger.exception("VENDOR-PREP: failed to persist manual meeting for cycle=%s", sanitize_for_log(cycleId))
        raise HTTPException(status_code=500, detail="Failed to persist vendor prep meeting")

    logger.info("VENDOR-PREP: manual meeting scheduled — event_id=%s, attendees=%d", sanitize_for_log(event_id), len(invite_emails))
    return {
        "message": "Vendor prep meeting scheduled",
        "event_id": event_id,
        "teams_meeting_url": meeting_url,
        "web_link": meeting_url,
        "attendee_count": len(invite_emails),
        "attendee_emails": invite_emails,
    }


@router.get("/meeting")
def get_vendor_prep_meeting(
    cycleId: str,
    meeting_repo=Depends(get_meeting_repo),
    participant_repo=Depends(get_meeting_participant_repo),
):
    """Fetch this cycle's persisted vendor-prep meeting (for state recovery)."""
    meeting = next(
        (m for m in meeting_repo.get_for_cycle(cycleId)
         if m.get("meeting_type") == VP_MEETING_TYPE and m.get("status") != "cancelled"),
        None,
    )
    return {"meeting": _vp_meeting_dto(meeting, participant_repo) if meeting else None}


@router.delete("/meeting")
def delete_vendor_prep_meeting(
    cycleId: str,
    meeting_repo=Depends(get_meeting_repo),
    participant_repo=Depends(get_meeting_participant_repo),
):
    """Cancel the vendor-prep meeting: best-effort Graph cancel + remove the record + participants."""
    meeting = next(
        (m for m in meeting_repo.get_for_cycle(cycleId)
         if m.get("meeting_type") == VP_MEETING_TYPE and m.get("status") != "cancelled"),
        None,
    )
    if not meeting:
        return {"deleted": False, "cancelled": False, "message": "No vendor prep meeting to delete"}

    cancelled = False
    token = _get_graph_token()
    event_id = meeting.get("meeting_id")
    if token and event_id:
        try:
            res = asyncio.run(GraphService(token).delete_event(event_id))
            cancelled = bool(res.get("deleted"))
        except Exception as e:
            logger.warning("VENDOR-PREP: Graph cancel failed: %s", e)

    deleted = False
    if event_id:
        deleted = meeting_repo.delete_by_id("meeting_id", event_id)
        participant_repo.delete_for_meeting(event_id)
    return {"deleted": deleted, "cancelled": cancelled, "meeting_index": VP_MEETING_INDEX}
