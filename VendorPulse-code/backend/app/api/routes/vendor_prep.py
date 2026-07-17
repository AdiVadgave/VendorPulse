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
from app.dependencies import (
    get_agent_run_repo,
    get_attendee_repo,
    get_cycle_repo,
    get_meeting_repo,
    get_vendor_prep_agent,
)
from app.models.common import AgentResponse
from app.models.vendor_prep import GenerateBriefRequest, HandlePushbackRequest
from app.services.graph_service import GraphService

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
    logger.info("VENDOR-PREP: generate brief — cycleId=%s, vendor=%s", cycleId, payload.vendor_name)

    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

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
        cycleId, payload.pushback_id, payload.category, payload.needs_legal_review,
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
    logger.info("VENDOR-PREP: approve brief — cycleId=%s, run_id=%s", cycleId, payload.run_id)

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

    logger.info("VENDOR-PREP: brief approved — run_id=%s, by=%s", payload.run_id, payload.approved_by)
    return {
        "status": "approved",
        "run_id": payload.run_id,
        "approved_by": payload.approved_by,
        "approved_at": now,
    }


@router.post("/pushback/approve")
def approve_pushback_response(cycleId: str, payload: ApproveRequest):
    """Mark a selected pushback response as approved."""
    logger.info("VENDOR-PREP: approve pushback — cycleId=%s, run_id=%s", cycleId, payload.run_id)

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

    logger.info("VENDOR-PREP: pushback approved — run_id=%s, by=%s", payload.run_id, payload.approved_by)
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


def _attendee_name_map(attendee_repo, cycleId: str) -> dict[str, str]:
    return {
        a.get("email", "").strip().lower(): a.get("name") or a.get("email")
        for a in attendee_repo.get_for_cycle(cycleId)
        if a.get("email")
    }


def _resolve_invite_emails(payload_emails: Optional[list[str]], attendee_repo, cycleId: str) -> list[str]:
    """Use the frontend's edited selection when provided (restricted to real cycle
    attendees), otherwise default to every internal + vendor attendee."""
    all_emails = _cycle_attendee_emails(attendee_repo, cycleId)
    if not payload_emails:
        return all_emails
    allowed = set(all_emails)
    chosen = [e.strip().lower() for e in payload_emails if e and e.strip().lower() in allowed]
    return chosen or all_emails


class VPFindTimesRequest(BaseModel):
    cycle_id: str
    organiser_email: str
    date_range_start: str
    date_range_end: str
    duration_hours: float = 0.5
    time_zone: str = "UTC"
    # Optional edited subset of attendees to check availability for. Defaults to all.
    attendee_emails: Optional[list[str]] = None


class VPScheduleRequest(BaseModel):
    cycle_id: str
    organiser_email: str
    slot_id: str
    start_time: str
    duration_minutes: int = 30
    time_zone: str = "UTC"
    attendee_emails: Optional[list[str]] = None


def _vp_meeting_dto(m: dict) -> dict:
    return {
        "meeting_index": VP_MEETING_INDEX,
        "event_id": m.get("meetingId"),
        "teams_meeting_url": m.get("teamsMeetingUrl"),
        "web_link": m.get("webLink"),
        "attendee_count": len(m.get("participants", [])) + 1,
        "status": m.get("status"),
        "time_slot": m.get("timeSlot"),
        "title": m.get("title"),
        "attendee_emails": [p.get("userId") for p in m.get("participants", [])],
    }


@router.post("/find-times")
def find_vendor_prep_times(
    cycleId: str,
    payload: VPFindTimesRequest,
    cycle_repo=Depends(get_cycle_repo),
    attendee_repo=Depends(get_attendee_repo),
):
    """Find candidate times for the vendor-prep call using Graph findMeetingTimes.
    Returns SlotProposal-shaped objects compatible with the SlotCard component."""
    logger.info("VENDOR-PREP: find times — cycleId=%s, range=%s to %s", cycleId, payload.date_range_start, payload.date_range_end)

    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    cycle = cycle_repo.get_by_cycle_id(cycleId)
    if not cycle:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycleId}' not found")

    token = _get_graph_token()
    if not token:
        raise HTTPException(status_code=500, detail="GRAPH_ACCESS_TOKEN is not set in .env")

    graph_service = GraphService(token)
    invite_emails = _resolve_invite_emails(payload.attendee_emails, attendee_repo, cycleId)
    if not invite_emails:
        raise HTTPException(status_code=400, detail="No attendee emails found for this cycle")

    try:
        result = asyncio.run(graph_service.find_meeting_times(
            attendee_emails=invite_emails,
            date_range_start=payload.date_range_start,
            date_range_end=payload.date_range_end,
            duration_hours=payload.duration_hours,
            time_zone=payload.time_zone,
            max_candidates=10,
        ))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph API error: {str(e)}")

    if "error" in result:
        status_code = int(result.get("status_code") or 400)
        raise HTTPException(status_code=status_code, detail=result.get("error", "Graph API error"))

    name_map = _attendee_name_map(attendee_repo, cycleId)
    suggestions = result.get("meetingTimeSuggestions", [])
    slot_proposals: list[dict] = []

    for suggestion in suggestions:
        start_info = (suggestion.get("meetingTimeSlot", {}) or {}).get("start", {}) or {}
        local_start_str = start_info.get("dateTime", "")
        graph_tz = start_info.get("timeZone") or payload.time_zone

        proposed_time = local_start_str
        try:
            normalized = str(local_start_str).strip()
            if "." in normalized:
                normalized = normalized.split(".", 1)[0]
            naive = datetime.fromisoformat(normalized)
            try:
                from zoneinfo import ZoneInfo
                tz_map = {"IST": "Asia/Kolkata", "UTC": "UTC", "GMT": "Europe/London"}
                tz_name = tz_map.get(graph_tz.upper(), graph_tz) if graph_tz else "UTC"
                aware = naive.replace(tzinfo=ZoneInfo(tz_name))
                proposed_time = aware.astimezone(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds") + "Z"
            except Exception:
                proposed_time = naive.isoformat(timespec="seconds") + "Z"
        except Exception:
            pass

        availability = suggestion.get("attendeeAvailability", []) or []
        avail_by_email: dict[str, str] = {}
        for item in availability:
            attendee = (item or {}).get("attendee") or {}
            email = ((attendee.get("emailAddress") or {}).get("address") or "").strip().lower()
            status = ((item or {}).get("availability") or "unknown").lower()
            if email:
                avail_by_email[email] = status

        attending_names, tentative_names, conflict_names = [], [], []
        for email in invite_emails:
            status = avail_by_email.get(email, "unknown")
            name = name_map.get(email, email)
            if status == "free":
                attending_names.append(name)
            elif status == "tentative":
                tentative_names.append(name)
            else:
                conflict_names.append(name)

        total = len(invite_emails)
        attendance_pct = ((len(attending_names) + len(tentative_names)) / total * 100) if total else 0
        conflict_penalty = len(conflict_names) * 10
        full_attendance_bonus = 10 if not conflict_names and not tentative_names else 0
        tentative_penalty = len(tentative_names) * 5
        score = max(0, min(100, round(attendance_pct - conflict_penalty - tentative_penalty + full_attendance_bonus, 1)))

        slot_proposals.append({
            "slot_id": f"vprep_{uuid.uuid4().hex[:8]}",
            "cycle_id": cycleId,
            "proposed_time": proposed_time,
            "proposed_time_zone": payload.time_zone,
            "duration_minutes": int(payload.duration_hours * 60),
            "organiser_available": True,
            "exec_sponsor_available": True,
            "rank_score": score,
            "is_approved": False,
            "attendance_count": len(attending_names) + len(tentative_names),
            "total_attendees": total,
            "conflict_count": len(conflict_names),
            "attending": attending_names,
            "tentative": tentative_names,
            "conflicts": conflict_names,
        })

    slot_proposals.sort(key=lambda s: (-s["rank_score"], s["proposed_time"]))

    return {
        "message": f"Found {len(slot_proposals)} available slots for the vendor prep call",
        "slot_proposals": slot_proposals,
        "attendee_count": len(invite_emails),
    }


@router.post("/schedule-meeting")
def schedule_vendor_prep_meeting(
    cycleId: str,
    payload: VPScheduleRequest,
    cycle_repo=Depends(get_cycle_repo),
    attendee_repo=Depends(get_attendee_repo),
    meeting_repo=Depends(get_meeting_repo),
):
    """Create (or reschedule) the single vendor-prep Teams meeting for this cycle.
    Invites the internal team + vendor (or the edited subset). Persisted with
    meetingType=VENDOR_PREP in the shared meetings store."""
    logger.info("VENDOR-PREP: schedule meeting — cycleId=%s, slot=%s", cycleId, payload.slot_id)

    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    cycle = cycle_repo.get_by_cycle_id(cycleId)
    if not cycle:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycleId}' not found")

    token = _get_graph_token()
    if not token:
        raise HTTPException(status_code=500, detail="GRAPH_ACCESS_TOKEN is not set in .env")

    graph_service = GraphService(token)
    invite_emails = _resolve_invite_emails(payload.attendee_emails, attendee_repo, cycleId)
    if not invite_emails:
        raise HTTPException(status_code=400, detail="No attendee emails found for this cycle")

    vendor_name = cycle.get("vendor_name", "TBD")
    quarter = cycle.get("quarter", "")
    year = cycle.get("year", "")
    subject = f"Vendor Prep Call — {vendor_name} ({quarter} {year})".strip()
    organiser = payload.organiser_email.strip().lower()

    # Reschedule-in-place if this cycle's vendor-prep meeting already exists.
    existing = next(
        (m for m in meeting_repo.get_for_cycle(cycleId)
         if m.get("meetingType") == VP_MEETING_TYPE and m.get("status") != "cancelled"),
        None,
    )
    is_reschedule = bool(existing and existing.get("meetingId"))

    try:
        duration_hours = float(payload.duration_minutes) / 60.0
        if is_reschedule:
            result = asyncio.run(graph_service.update_event(
                event_id=existing["meetingId"],
                start_time=payload.start_time,
                duration_hours=duration_hours,
                time_zone=payload.time_zone,
            ))
        else:
            result = asyncio.run(graph_service.create_event(
                subject=subject,
                attendee_emails=invite_emails,
                start_time=payload.start_time,
                duration_hours=duration_hours,
                organiser_email=organiser,
                is_online_meeting=True,
                time_zone=payload.time_zone,
            ))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph API error: {str(e)}")

    if "error" in result:
        status_code = int(result.get("status_code") or 400)
        raise HTTPException(status_code=status_code, detail=result.get("error", "Graph API error"))

    teams_url = result.get("onlineMeetingUrl") or (existing.get("teamsMeetingUrl") if existing else None)
    web_link = result.get("webLink") or (existing.get("webLink") if existing else None)
    event_id = result.get("id") or (existing.get("meetingId") if existing else None) or f"m{uuid.uuid4().hex[:8]}"

    try:
        start_dt = datetime.fromisoformat(payload.start_time.replace("Z", "+00:00"))
        end_dt = start_dt + timedelta(minutes=payload.duration_minutes)
        meeting_record = {
            "meetingId": event_id,
            "title": subject,
            "description": f"Vendor prep call for cycle {cycleId}",
            "agenda": "1. Vendor brief review\n2. Anticipated pushback & responses\n3. Roles for the vendor call\n4. Action items",
            "organizerId": organiser,
            "participants": [{"userId": e, "status": "pending"} for e in invite_emails if e != organiser],
            "timeSlot": {
                "date": start_dt.strftime("%Y-%m-%d"),
                "startTime": start_dt.strftime("%H:%M"),
                "endTime": end_dt.strftime("%H:%M"),
            },
            "status": "scheduled",
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "cycleId": cycleId,
            "meetingType": VP_MEETING_TYPE,
            "teamsMeetingUrl": teams_url,
            "webLink": web_link,
        }
        if is_reschedule:
            meeting_repo.replace_by_id("meetingId", event_id, meeting_record)
        else:
            meeting_repo.insert(meeting_record)
    except Exception as e:
        logger.warning("VENDOR-PREP: failed to persist meeting: %s", e)

    logger.info("VENDOR-PREP: meeting scheduled — event_id=%s, attendees=%d", event_id, len(invite_emails))
    return {
        "message": "Vendor prep meeting created",
        "event_id": event_id,
        "teams_meeting_url": teams_url,
        "web_link": web_link,
        "attendee_count": len(invite_emails),
        "attendee_emails": invite_emails,
    }


@router.get("/meeting")
def get_vendor_prep_meeting(
    cycleId: str,
    meeting_repo=Depends(get_meeting_repo),
):
    """Fetch this cycle's persisted vendor-prep meeting (for state recovery)."""
    meeting = next(
        (m for m in meeting_repo.get_for_cycle(cycleId)
         if m.get("meetingType") == VP_MEETING_TYPE and m.get("status") != "cancelled"),
        None,
    )
    return {"meeting": _vp_meeting_dto(meeting) if meeting else None}


@router.delete("/meeting")
def delete_vendor_prep_meeting(
    cycleId: str,
    meeting_repo=Depends(get_meeting_repo),
):
    """Cancel the vendor-prep meeting: best-effort Graph cancel + remove the record."""
    meeting = next(
        (m for m in meeting_repo.get_for_cycle(cycleId)
         if m.get("meetingType") == VP_MEETING_TYPE and m.get("status") != "cancelled"),
        None,
    )
    if not meeting:
        return {"deleted": False, "cancelled": False, "message": "No vendor prep meeting to delete"}

    cancelled = False
    token = _get_graph_token()
    event_id = meeting.get("meetingId")
    if token and event_id:
        try:
            res = asyncio.run(GraphService(token).delete_event(event_id))
            cancelled = bool(res.get("deleted"))
        except Exception as e:
            logger.warning("VENDOR-PREP: Graph cancel failed: %s", e)

    deleted = meeting_repo.delete_by_id("meetingId", event_id) if event_id else False
    return {"deleted": deleted, "cancelled": cancelled, "meeting_index": VP_MEETING_INDEX}
