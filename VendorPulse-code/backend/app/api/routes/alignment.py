"""
Module C — Alignment routes.

POST /api/cycles/{cycleId}/alignment/extract-actions       Extract action items from alignment notes
POST /api/cycles/{cycleId}/alignment/schedule-meeting      Create Teams meeting for internal alignment
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.config import Settings, settings
from app.dependencies import get_llm_service, get_cycle_repo, get_attendee_repo, get_alignment_agent, get_meeting_repo
from app.models.common import AgentResponse
from app.services.graph_service import GraphService
from app.utils.prompts import ALIGNMENT_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cycles/{cycleId}/alignment", tags=["alignment"])


class ExtractActionsRequest(BaseModel):
    cycle_id: str
    notes_text: str


class FindTimesRequest(BaseModel):
    cycle_id: str
    organiser_email: str = Field(..., description="Email of the meeting organiser (must match Graph token owner)")
    date_range_start: str = Field(..., description="YYYY-MM-DD")
    date_range_end: str = Field(..., description="YYYY-MM-DD")
    duration_hours: float = Field(0.5, description="Meeting duration (0.5 = 30 min)")
    time_zone: str = Field("UTC", description="Timezone for meeting")


class ScheduleMeetingRequest(BaseModel):
    cycle_id: str
    organiser_email: str = Field(..., description="Email of the meeting organiser (must match Graph token owner)")
    slot_id: str = Field(..., description="Slot ID from find-times results")
    start_time: str = Field(..., description="ISO-8601 start time from the selected slot")
    duration_minutes: int = Field(30, description="Meeting duration in minutes")
    time_zone: str = Field("UTC", description="Timezone for meeting")
    meeting_index: int = Field(1, description="Which alignment meeting (1-based) — a cycle may have several")


@router.post("/extract-actions", response_model=AgentResponse)
def extract_actions(cycleId: str, payload: ExtractActionsRequest):
    """
    Extract structured action items from internal alignment meeting notes.
    Uses Azure OpenAI when ENABLE_LLM=true, otherwise uses keyword heuristics.
    """
    logger.info("ALIGNMENT: extract actions — cycleId=%s, text_len=%d", cycleId, len(payload.notes_text))

    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    if not payload.notes_text.strip():
        raise HTTPException(status_code=400, detail="notes_text is required")

    llm = get_llm_service() if settings.enable_llm else None
    actions: list[dict] = []

    if llm and llm.is_enabled:
        prompt = (
            "Extract all action items from the following internal alignment meeting notes.\n"
            "Return a JSON array where each item has:\n"
            "  action_id (generate a short id like 'a1','a2'...),\n"
            "  description (a short one-line title of the action, max ~12 words),\n"
            "  details (a fuller 1-2 sentence description: the what, the why, and any "
            "context needed to discuss it in the next meeting — never invent facts),\n"
            "  owner (person responsible — use the name from the notes),\n"
            "  due_date (YYYY-MM-DD if mentioned, otherwise null),\n"
            '  source: "alignment",\n'
            '  status: "OPEN"\n\n'
            f"Notes:\n{payload.notes_text}\n\n"
            "Return ONLY the JSON array, no markdown or explanation."
        )
        raw = llm.call_simple(prompt, system=ALIGNMENT_SYSTEM_PROMPT, max_tokens=1024)
        logger.info("ALIGNMENT extract-actions: LLM raw (%d chars): %s", len(raw), raw[:500])
        try:
            parsed = json.loads(_strip_markdown_json(raw))
            if isinstance(parsed, list):
                actions = parsed
            elif isinstance(parsed, dict) and "actions" in parsed:
                actions = parsed["actions"]
        except json.JSONDecodeError as e:
            logger.warning("ALIGNMENT extract-actions: JSON parse failed: %s", e)
            actions = _fallback_extract(payload.notes_text)
    else:
        actions = _fallback_extract(payload.notes_text)

    # Ensure each action has required fields
    for a in actions:
        a.setdefault("action_id", f"a-{uuid.uuid4().hex[:6]}")
        a.setdefault("source", "alignment")
        a.setdefault("status", "OPEN")
        a.setdefault("owner", "TBD")
        a.setdefault("due_date", None)
        a.setdefault("details", "")

    return AgentResponse(
        status="success",
        agent="alignment_agent",
        summary=f"Extracted {len(actions)} action items from alignment notes.",
        data={"actions": actions},
        warnings=[],
        next_actions=["REVIEW_ACTIONS"],
        requires_approval=False,
    )


def _get_graph_token() -> str:
    fresh_settings = Settings()
    token = (fresh_settings.graph_access_token or settings.graph_access_token or "").strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    return token


def _get_internal_emails(attendee_repo, cycleId: str) -> list[str]:
    attendees = attendee_repo.get_for_cycle(cycleId)
    internal_emails = [
        a.get("email") for a in attendees
        if a.get("email") and a.get("type", "Internal Stakeholder") != "Vendor"
    ]
    if not internal_emails:
        internal_emails = [a.get("email") for a in attendees if a.get("email")]
    return [e.strip().lower() for e in internal_emails if e]


def _get_internal_attendees(attendee_repo, cycleId: str) -> list[dict]:
    """Return full attendee dicts for internal stakeholders only."""
    attendees = attendee_repo.get_for_cycle(cycleId)
    internal = [
        a for a in attendees
        if a.get("type", "Internal Stakeholder") != "Vendor"
    ]
    if not internal:
        internal = attendees
    return internal


@router.post("/find-times")
def find_alignment_times(
    cycleId: str,
    payload: FindTimesRequest,
    cycle_repo=Depends(get_cycle_repo),
    attendee_repo=Depends(get_attendee_repo),
):
    """
    Find available meeting times for internal stakeholders using Graph findMeetingTimes.
    Returns slot proposals compatible with SlotCard component.
    """
    logger.info("ALIGNMENT: find times — cycleId=%s, range=%s to %s", cycleId, payload.date_range_start, payload.date_range_end)

    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    cycle = cycle_repo.get_by_cycle_id(cycleId)
    if not cycle:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycleId}' not found")

    token = _get_graph_token()
    if not token:
        raise HTTPException(status_code=500, detail="GRAPH_ACCESS_TOKEN is not set in .env")

    graph_service = GraphService(token)
    internal_emails = _get_internal_emails(attendee_repo, cycleId)
    if not internal_emails:
        raise HTTPException(status_code=400, detail="No internal stakeholder emails found for this cycle")

    try:
        result = asyncio.run(graph_service.find_meeting_times(
            attendee_emails=internal_emails,
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

    from app.utils.demo_attendees import get_attendee_name

    suggestions = result.get("meetingTimeSuggestions", [])
    slot_proposals = []

    for idx, suggestion in enumerate(suggestions):
        meeting_slot = suggestion.get("meetingTimeSlot", {})
        start_info = meeting_slot.get("start", {})
        local_start_str = start_info.get("dateTime", "")
        graph_tz = start_info.get("timeZone") or payload.time_zone

        # Convert to UTC ISO
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

        # Compute attendee availability
        availability = suggestion.get("attendeeAvailability", []) or []
        attending_names = []
        tentative_names = []
        conflict_names = []

        avail_by_email = {}
        for item in availability:
            attendee = (item or {}).get("attendee") or {}
            email = ((attendee.get("emailAddress") or {}).get("address") or "").strip().lower()
            status = ((item or {}).get("availability") or "unknown").lower()
            if email:
                avail_by_email[email] = status

        for email in internal_emails:
            status = avail_by_email.get(email, "unknown")
            name = get_attendee_name(email) or email
            if status == "free":
                attending_names.append(name)
            elif status == "tentative":
                tentative_names.append(name)
            else:
                conflict_names.append(name)

        # Compute rank_score using attendance-based formula (same as scheduling tab)
        total = len(internal_emails)
        attendance_pct = ((len(attending_names) + len(tentative_names)) / total * 100) if total > 0 else 0
        conflict_penalty = len(conflict_names) * 10
        # Bonus if all attendees are free (no tentative/conflicts)
        full_attendance_bonus = 10 if len(conflict_names) == 0 and len(tentative_names) == 0 else 0
        # Penalty for tentative attendees (softer than conflicts)
        tentative_penalty = len(tentative_names) * 5
        score = max(0, min(100, round(attendance_pct - conflict_penalty - tentative_penalty + full_attendance_bonus, 1)))

        slot_id = f"align_{uuid.uuid4().hex[:8]}"
        slot_proposals.append({
            "slot_id": slot_id,
            "cycle_id": cycleId,
            "proposed_time": proposed_time,
            "proposed_time_zone": payload.time_zone,
            "duration_minutes": int(payload.duration_hours * 60),
            "organiser_available": True,
            "exec_sponsor_available": True,
            "rank_score": score,
            "is_approved": False,
            "attendance_count": len(attending_names) + len(tentative_names),
            "total_attendees": len(internal_emails),
            "conflict_count": len(conflict_names),
            "attending": attending_names,
            "tentative": tentative_names,
            "conflicts": conflict_names,
        })

    slot_proposals.sort(key=lambda s: (-s["rank_score"], s["proposed_time"]))

    return {
        "message": f"Found {len(slot_proposals)} available slots for internal alignment",
        "slot_proposals": slot_proposals,
        "attendee_count": len(internal_emails),
    }


@router.post("/schedule-meeting")
def schedule_alignment_meeting(
    cycleId: str,
    payload: ScheduleMeetingRequest,
    cycle_repo=Depends(get_cycle_repo),
    attendee_repo=Depends(get_attendee_repo),
    meeting_repo=Depends(get_meeting_repo),
):
    """
    Create a Teams meeting for internal alignment using a selected slot.
    Invites all internal stakeholders. Persists to meetings.json for state recovery.
    """
    logger.info("ALIGNMENT: schedule meeting — cycleId=%s, slot=%s", cycleId, payload.slot_id)

    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    cycle = cycle_repo.get_by_cycle_id(cycleId)
    if not cycle:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycleId}' not found")

    token = _get_graph_token()
    if not token:
        raise HTTPException(status_code=500, detail="GRAPH_ACCESS_TOKEN is not set in .env")

    graph_service = GraphService(token)
    internal_emails = _get_internal_emails(attendee_repo, cycleId)
    if not internal_emails:
        raise HTTPException(status_code=400, detail="No internal stakeholder emails found for this cycle")

    vendor_name = cycle.get("vendor_name", "TBD")
    quarter = cycle.get("quarter", "")
    year = cycle.get("year", "")
    meeting_index = max(1, int(payload.meeting_index or 1))
    suffix = f" #{meeting_index}" if meeting_index > 1 else ""
    subject = f"Internal Alignment{suffix} — {vendor_name} ({quarter} {year})"

    # Reschedule-in-place: if THIS alignment meeting (same index) already exists,
    # PATCH the existing Teams event (keeps the join link + invite thread) instead
    # of creating a duplicate. Mirrors the Scheduling module's reschedule.
    existing = next(
        (m for m in meeting_repo.get_for_cycle(cycleId)
         if m.get("meetingType") == "INTERNAL_ALIGNMENT"
         and int(m.get("alignmentIndex", 1)) == meeting_index
         and m.get("status") != "cancelled"),
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
                attendee_emails=internal_emails,
                start_time=payload.start_time,
                duration_hours=duration_hours,
                organiser_email=payload.organiser_email.strip().lower(),
                is_online_meeting=True,
                time_zone=payload.time_zone,
            ))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph API error: {str(e)}")

    if "error" in result:
        status_code = int(result.get("status_code") or 400)
        raise HTTPException(status_code=status_code, detail=result.get("error", "Graph API error"))

    # On reschedule, Graph's PATCH may not echo the online-meeting URL — keep the old one.
    teams_url = result.get("onlineMeetingUrl") or (existing.get("teamsMeetingUrl") if existing else None)
    web_link = result.get("webLink") or (existing.get("webLink") if existing else None)
    event_id = result.get("id") or (existing.get("meetingId") if existing else None) or f"m{uuid.uuid4().hex[:8]}"

    # Persist meeting to meetings.json so state survives refresh
    try:
        # Parse start time for the time slot
        start_dt = datetime.fromisoformat(payload.start_time.replace("Z", "+00:00"))
        end_dt = start_dt + timedelta(minutes=payload.duration_minutes)
        meeting_record = {
            "meetingId": event_id,
            "title": subject,
            "description": f"Internal alignment meeting for cycle {cycleId}",
            "agenda": "1. Score comparison review\n2. Alignment flags discussion\n3. Face-off model roles\n4. Action items",
            "organizerId": payload.organiser_email,
            "participants": [{"userId": e, "status": "pending"} for e in internal_emails if e != payload.organiser_email.strip().lower()],
            "timeSlot": {
                "date": start_dt.strftime("%Y-%m-%d"),
                "startTime": start_dt.strftime("%H:%M"),
                "endTime": end_dt.strftime("%H:%M"),
            },
            "status": "scheduled",
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "cycleId": cycleId,
            "meetingType": "INTERNAL_ALIGNMENT",
            "alignmentIndex": meeting_index,
            "teamsMeetingUrl": teams_url,
            "webLink": web_link,
        }
        if is_reschedule:
            meeting_repo.replace_by_id("meetingId", event_id, meeting_record)
            logger.info("ALIGNMENT: meeting rescheduled — meetingId=%s", event_id)
        else:
            meeting_repo.insert(meeting_record)
            logger.info("ALIGNMENT: meeting persisted — meetingId=%s", event_id)
    except Exception as e:
        logger.warning("ALIGNMENT: failed to persist meeting: %s", e)

    logger.info("ALIGNMENT: meeting scheduled — event_id=%s, attendees=%d", event_id, len(internal_emails))

    return {
        "message": "Internal alignment meeting created",
        "event_id": event_id,
        "teams_meeting_url": teams_url,
        "web_link": web_link,
        "attendee_count": len(internal_emails),
        "attendee_emails": internal_emails,
    }


# ── Alignment meeting state retrieval ─────────────────────────────────────────


def _alignment_meeting_dto(m: dict) -> dict:
    return {
        "meeting_index": int(m.get("alignmentIndex", 1)),
        "event_id": m.get("meetingId"),
        "teams_meeting_url": m.get("teamsMeetingUrl"),
        "web_link": m.get("webLink"),
        "attendee_count": len(m.get("participants", [])) + 1,
        "status": m.get("status"),
        "time_slot": m.get("timeSlot"),
        "title": m.get("title"),
    }


@router.get("/meeting")
def get_alignment_meeting(
    cycleId: str,
    index: int = 1,
    meeting_repo=Depends(get_meeting_repo),
):
    """
    Check if the given internal-alignment meeting (by 1-based index) already
    exists for this cycle. Returns meeting details if scheduled, or null if not.
    """
    meetings = meeting_repo.get_for_cycle(cycleId)
    alignment_meeting = next(
        (m for m in meetings
         if m.get("meetingType") == "INTERNAL_ALIGNMENT"
         and int(m.get("alignmentIndex", 1)) == int(index)
         and m.get("status") != "cancelled"),
        None,
    )
    if not alignment_meeting:
        return {"meeting": None}
    return {"meeting": _alignment_meeting_dto(alignment_meeting)}


@router.get("/meetings")
def list_alignment_meetings(
    cycleId: str,
    meeting_repo=Depends(get_meeting_repo),
):
    """All internal-alignment meetings scheduled for this cycle, ordered by index."""
    meetings = [
        m for m in meeting_repo.get_for_cycle(cycleId)
        if m.get("meetingType") == "INTERNAL_ALIGNMENT" and m.get("status") != "cancelled"
    ]
    dtos = sorted((_alignment_meeting_dto(m) for m in meetings), key=lambda d: d["meeting_index"])
    return {"meetings": dtos, "count": len(dtos)}


@router.delete("/meeting")
def delete_alignment_meeting(
    cycleId: str,
    index: int = 1,
    meeting_repo=Depends(get_meeting_repo),
):
    """Delete an internal-alignment meeting (e.g. one the admin added by mistake).

    Cancels the underlying Teams event (best-effort so a Graph failure never blocks
    removal) and deletes the local record. Returns {deleted: bool, cancelled: bool}.
    If nothing was scheduled at that index yet, still returns 200 (nothing to do)."""
    meeting = next(
        (m for m in meeting_repo.get_for_cycle(cycleId)
         if m.get("meetingType") == "INTERNAL_ALIGNMENT"
         and int(m.get("alignmentIndex", 1)) == int(index)
         and m.get("status") != "cancelled"),
        None,
    )
    if not meeting:
        return {"deleted": False, "cancelled": False, "message": "No scheduled meeting at that index."}

    cancelled = False
    event_id = meeting.get("meetingId")
    token = _get_graph_token()
    if event_id and token:
        try:
            result = asyncio.run(GraphService(token).delete_event(event_id))
            cancelled = bool(result.get("deleted"))
        except Exception as e:  # best-effort — never block local removal
            logger.warning("ALIGNMENT: Graph cancel failed for %s: %s", event_id, e)

    # Guard: only delete by a real id. delete_by_id(None) would match every record
    # whose meetingId is None and wipe them all.
    if event_id:
        meeting_repo.delete_by_id("meetingId", event_id)
    logger.info("ALIGNMENT: deleted meeting index=%s (event=%s, cancelled=%s)", index, event_id, cancelled)
    return {"deleted": True, "cancelled": cancelled, "meeting_index": int(index)}


# ── Internal attendees endpoint ───────────────────────────────────────────────


@router.get("/attendees")
def get_alignment_attendees(
    cycleId: str,
    attendee_repo=Depends(get_attendee_repo),
):
    """Return internal stakeholders for the alignment meeting attendee list."""
    internal = _get_internal_attendees(attendee_repo, cycleId)
    return {"attendees": internal, "count": len(internal)}


class AddAttendeeRequest(BaseModel):
    cycle_id: str
    name: str
    email: str
    role: str = "VMO_COORDINATOR"
    organisation: str = ""
    is_key: bool = False


class RemoveAttendeeRequest(BaseModel):
    cycle_id: str
    attendee_id: str


@router.post("/attendees/add")
def add_alignment_attendee(
    cycleId: str,
    payload: AddAttendeeRequest,
    attendee_repo=Depends(get_attendee_repo),
):
    """Add an attendee to this cycle (internal stakeholder only)."""
    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    new_attendee = {
        "attendee_id": f"att_{uuid.uuid4().hex[:8]}",
        "cycle_id": cycleId,
        "stakeholder_id": f"s_{uuid.uuid4().hex[:8]}",
        "name": payload.name,
        "email": payload.email,
        "role": payload.role,
        "organisation": payload.organisation,
        "type": "Internal Stakeholder",
        "is_key": payload.is_key,
        "invite_status": "PENDING",
        "availability_submitted": False,
    }
    attendee_repo.insert(new_attendee)
    logger.info("ALIGNMENT: added attendee %s to cycle %s", payload.name, cycleId)
    return {"attendee": new_attendee, "message": f"Added {payload.name} to alignment meeting"}


@router.post("/attendees/remove")
def remove_alignment_attendee(
    cycleId: str,
    payload: RemoveAttendeeRequest,
    attendee_repo=Depends(get_attendee_repo),
):
    """Remove an attendee from this cycle's alignment meeting."""
    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    attendee = attendee_repo.get_by_attendee_id(payload.attendee_id)
    if not attendee:
        raise HTTPException(status_code=404, detail="Attendee not found")
    if attendee.get("cycle_id") != cycleId:
        raise HTTPException(status_code=400, detail="Attendee does not belong to this cycle")

    attendee_repo.delete_by_id("attendee_id", payload.attendee_id)
    # Cascade their scorecard submission so it can't dangle (same as the scheduling path).
    from app.api.routes.scorecard_v2 import _submissions_repo
    _submissions_repo().delete_by_field("attendee_id", payload.attendee_id)
    logger.info("ALIGNMENT: removed attendee %s from cycle %s", payload.attendee_id, cycleId)
    return {"message": f"Removed {attendee.get('name', '')} from alignment meeting", "attendee_id": payload.attendee_id}


def _strip_markdown_json(text: str) -> str:
    m = re.search(r"```(?:json)?\s*\n(.*?)```", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    m = re.search(r"(\[.*\]|\{.*\})", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    return text.strip()


def _fallback_extract(notes_text: str) -> list[dict]:
    """Keyword-based fallback when LLM is unavailable."""
    lines = [ln.strip() for ln in notes_text.strip().splitlines() if ln.strip()]
    actions: list[dict] = []
    counter = 1

    # Date pattern for due dates
    date_pat = re.compile(r"(\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})", re.IGNORECASE)

    for line in lines:
        lower = line.lower()
        # Look for action-indicating keywords
        if any(kw in lower for kw in ("i'll ", "i will ", "action:", "need to ", "should ", "to do:", "by ")):
            # Try to extract speaker name
            owner = "TBD"
            content = line
            m = re.match(r"^(\w[\w\s]*?):\s*(.+)$", line)
            if m:
                owner = m.group(1).strip()
                content = m.group(2).strip()

            # Try to extract a date
            due_date = None
            dm = date_pat.search(content)
            if dm:
                due_date = dm.group(1)

            actions.append({
                "action_id": f"a{counter}",
                "description": content,
                "owner": owner,
                "due_date": due_date,
                "source": "alignment",
                "status": "OPEN",
            })
            counter += 1

    return actions


# ── Agent-powered alignment endpoints ───────────────────────────────────────


class ScoreDiffRequest(BaseModel):
    cycle_id: str
    previous_cycle_id: Optional[str] = None


class AlignmentFlagsRequest(BaseModel):
    cycle_id: str


class WhatChangedRequest(BaseModel):
    cycle_id: str
    previous_cycle_id: Optional[str] = None


@router.post("/score-diff", response_model=AgentResponse)
def get_score_diff(cycleId: str, payload: ScoreDiffRequest):
    """Compare current cycle scorecard against a previous cycle to identify significant changes."""
    logger.info("ALIGNMENT: score diff — cycleId=%s, previous=%s", cycleId, payload.previous_cycle_id)

    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    agent = get_alignment_agent(cycle_id=cycleId)
    return agent.run(
        user_message="Compute score differences between cycles",
        context={
            "action": "get_score_diff",
            "params": {
                "current_cycle_id": cycleId,
                "previous_cycle_id": payload.previous_cycle_id,
            },
        },
    )


@router.post("/flags", response_model=AgentResponse)
def get_alignment_flags(cycleId: str, payload: AlignmentFlagsRequest):
    """Identify parameters where internal vs vendor scores diverge significantly."""
    logger.info("ALIGNMENT: flags — cycleId=%s", cycleId)

    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    agent = get_alignment_agent(cycle_id=cycleId)
    return agent.run(
        user_message="Identify alignment flags",
        context={
            "action": "get_alignment_flags",
            "params": {"cycle_id": cycleId},
        },
    )


class InsightsRequest(BaseModel):
    cycle_id: str


def _deterministic_insights(w: dict) -> list[dict]:
    """Runtime insights computed straight from the consolidated (weighted)
    scorecard: low consolidated scores + cross-team divergence. No hardcoding."""
    insights: list[dict] = []
    i = 0
    for cat in w.get("categories", []):
        cavg = cat.get("category_average")
        if cavg is not None and cavg < 3:
            i += 1
            insights.append({
                "insight_id": f"iw-{i}", "type": "low_score", "category": cat["key"],
                "message": f"{cat['label']}: consolidated {cavg:.1f}/5 — below target; prepare an improvement ask for the vendor.",
                "severity": "warning",
            })
        for m in cat.get("measures", []):
            avg = m.get("average")
            if avg is not None and avg < 3:
                i += 1
                insights.append({
                    "insight_id": f"iw-{i}", "type": "low_score", "category": cat["key"],
                    "parameter_key": m["key"], "parameter_label": m["label"],
                    "message": f"{m['label']}: consolidated {avg:.1f}/5 — flag for the vendor discussion.",
                    "severity": "warning",
                })
            scores = [v for v in (m.get("team_scores") or {}).values() if isinstance(v, (int, float))]
            if len(scores) >= 2:
                spread = max(scores) - min(scores)
                if spread >= 1:
                    i += 1
                    insights.append({
                        "insight_id": f"iw-{i}", "type": "high_variance", "category": cat["key"],
                        "parameter_key": m["key"], "parameter_label": m["label"],
                        "message": f"{m['label']}: internal teams differ by {spread:.1f} pts — reconcile into one position before the vendor meeting.",
                        "severity": "critical" if spread >= 2 else "warning",
                    })
    order = {"critical": 0, "warning": 1, "info": 2}
    insights.sort(key=lambda x: order.get(x["severity"], 3))
    return insights


def _trajectory_insights(current: dict, previous: dict) -> list[dict]:
    """Deterministic cross-cycle movement insights: how each theme's consolidated
    score moved versus the previous cycle. Numbers stay grounded (never LLM-guessed)."""
    prev_cat = {c["key"]: c for c in previous.get("categories", [])}
    out: list[dict] = []
    i = 0
    for cat in current.get("categories", []):
        cur = cat.get("category_average")
        prev = (prev_cat.get(cat["key"]) or {}).get("category_average")
        if cur is None or prev is None:
            continue
        delta = round(cur - prev, 1)
        if abs(delta) < 0.5:
            continue
        i += 1
        if delta > 0:
            direction, severity = "improved", "info"
        else:
            direction = "declined"
            severity = "critical" if delta <= -1 else "warning"
        out.append({
            "insight_id": f"it-{i}", "type": "trajectory", "category": cat["key"],
            "message": (
                f"{cat['label']}: {direction} {abs(delta):.1f} pt since last cycle "
                f"({prev:.1f} → {cur:.1f}/5)."
            ),
            "severity": severity,
        })
    return out


@router.post("/insights", response_model=AgentResponse)
def get_alignment_insights(cycleId: str, payload: InsightsRequest):
    """Generate alignment insights from the consolidated internal scorecard AND the
    previous cycle (runtime — never hardcoded): low scores, cross-team divergence, and
    cross-cycle trajectory. The LLM re-narrates with both cycles' scores + comments in
    context when enabled; otherwise the deterministic insights are returned as-is."""
    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    from app.api.routes.scorecard_v2 import _compile_weighted, find_previous_cycle_id, compact_scorecard_context
    weighted = _compile_weighted(cycleId)

    # Trajectory insights lead (most actionable for the alignment call), then the
    # current-cycle low-score / divergence insights.
    prev_id = find_previous_cycle_id(cycleId)
    prev_weighted = _compile_weighted(prev_id) if prev_id else None
    trajectory = _trajectory_insights(weighted, prev_weighted) if prev_weighted else []
    insights = trajectory + _deterministic_insights(weighted)

    llm = get_llm_service() if settings.enable_llm else None
    if llm and llm.is_enabled and insights:
        ctx = compact_scorecard_context(cycleId)
        prev_block = (
            f"Previous cycle ({ctx['previous']['label']}) scorecard + comments:\n"
            f"{json.dumps(ctx['previous'], indent=2, ensure_ascii=False)}\n\n"
            if ctx.get("previous") else
            "Previous cycle: none (this is the vendor's first cycle — do not invent a trend).\n\n"
        )
        prompt = (
            "You are preparing insights for the INTERNAL alignment call. Below are the "
            "current and previous consolidated scorecards (internal teams only; no vendor "
            "self-report), the teams' written comments, and a set of "
            "deterministically-computed insights.\n\n"
            f"Current cycle ({ctx['current']['label']}) scorecard + comments:\n"
            f"{json.dumps(ctx['current'], indent=2, ensure_ascii=False)}\n\n"
            f"{prev_block}"
            f"Computed insights (ground truth — keep the same facts, ids, types and severities):\n"
            f"{json.dumps(insights, indent=2)}\n\n"
            "Rewrite ONLY the 'message' of each insight to be sharper and more "
            "decision-useful, drawing on the trajectory (previous vs current) and the team "
            "comments where relevant. Do NOT change any number, id, severity, category or "
            "type, and do NOT add or remove items. "
            "Return ONLY a JSON array of the same objects with improved 'message' fields."
        )
        raw = llm.call_simple(prompt, system=ALIGNMENT_SYSTEM_PROMPT, max_tokens=1400)
        try:
            parsed = json.loads(_strip_markdown_json(raw))
            if isinstance(parsed, list) and len(parsed) == len(insights):
                # Keep our figures/ids/severities; take only the narrated message.
                for base, refined in zip(insights, parsed):
                    if isinstance(refined, dict) and refined.get("message"):
                        base["message"] = str(refined["message"])
        except json.JSONDecodeError:
            pass  # fall back to deterministic messages

    warnings = [] if weighted.get("submitted_count") else ["No scorecards submitted yet."]
    return AgentResponse(
        status="success",
        agent="alignment_agent",
        summary=(
            f"{len(insights)} alignment insight(s) from the consolidated internal scorecard"
            + (" and the previous cycle." if prev_weighted else ".")
        ),
        data={"insights": insights, "has_previous_cycle": bool(prev_weighted)},
        warnings=warnings,
        next_actions=["REVIEW_INSIGHTS"],
        requires_approval=False,
    )


@router.post("/what-changed", response_model=AgentResponse)
def get_what_changed(cycleId: str, payload: WhatChangedRequest):
    """Generate a 'What Changed' summary for the internal alignment meeting."""
    logger.info("ALIGNMENT: what-changed — cycleId=%s", cycleId)

    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    agent = get_alignment_agent(cycle_id=cycleId)
    return agent.run(
        user_message="Generate What Changed summary",
        context={
            "action": "generate_what_changed",
            "params": {
                "cycle_id": cycleId,
                "previous_cycle_id": payload.previous_cycle_id,
            },
        },
    )
