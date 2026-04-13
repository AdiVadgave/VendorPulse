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
from app.dependencies import get_llm_service, get_cycle_repo, get_attendee_repo, get_alignment_agent
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
            "  description (the action to be taken),\n"
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
        if a.get("email") and a.get("stakeholder_type", "INTERNAL") != "VENDOR"
    ]
    if not internal_emails:
        internal_emails = [a.get("email") for a in attendees if a.get("email")]
    return [e.strip().lower() for e in internal_emails if e]


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

        if conflict_names:
            continue

        confidence_raw = suggestion.get("confidenceLevel") or suggestion.get("confidence")
        base_score = 85 if str(confidence_raw).lower() == "high" else 70 if str(confidence_raw).lower() == "medium" else 55
        score = max(30, base_score - len(tentative_names) * 5)

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
):
    """
    Create a Teams meeting for internal alignment using a selected slot.
    Invites all internal stakeholders.
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
    subject = f"Internal Alignment — {vendor_name} ({quarter} {year})"

    try:
        duration_hours = float(payload.duration_minutes) / 60.0
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

    logger.info("ALIGNMENT: meeting scheduled — event_id=%s, attendees=%d", result.get("id"), len(internal_emails))

    return {
        "message": "Internal alignment meeting created",
        "event_id": result.get("id"),
        "teams_meeting_url": result.get("onlineMeetingUrl"),
        "web_link": result.get("webLink"),
        "attendee_count": len(internal_emails),
        "attendee_emails": internal_emails,
    }


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
