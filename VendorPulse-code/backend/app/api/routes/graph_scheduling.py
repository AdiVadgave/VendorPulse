"""
Graph scheduling routes — integrate Microsoft Graph API for real calendar-based slot finding and meeting creation.

Endpoints:
  POST /api/cycles/{cycleId}/scheduling/graph/find-times   Find real slots via Graph findMeetingTimes
  POST /api/cycles/{cycleId}/scheduling/graph/send-invite   Create Teams meeting + send invites
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from collections import Counter, defaultdict
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException

from app.config import Settings, settings
from app.core.workflow_engine import WorkflowStateError, WorkflowViolationError, workflow_engine
from app.dependencies import get_cycle_repo, get_attendee_repo, get_slot_repo
from app.services.graph_service import GraphService
from app.utils.demo_attendees import get_attendee_name
from pydantic import BaseModel, Field

router = APIRouter(tags=["graph-scheduling"])

# Use uvicorn's logger so messages show up with the default FastAPI/Uvicorn log config.
logger = logging.getLogger("uvicorn.error")
logger.setLevel(logging.INFO)
logger.propagate = True


# ──────────────────────────────────────────────────────────────────────────────
# Request/Response models
# ──────────────────────────────────────────────────────────────────────────────


class FindTimesRequest(BaseModel):
    """Request body for Graph findMeetingTimes."""

    organiser_email: str = Field(..., description="Email of the meeting organiser")
    date_range_start: str = Field(..., description="YYYY-MM-DD")
    date_range_end: str = Field(..., description="YYYY-MM-DD")
    duration_hours: float = Field(0.5, description="Meeting duration (0.5 for 30 min, 1.0 for 1 hour)")
    use_specific_attendees: Optional[list[str]] = Field(
        None,
        description="Deprecated in Graph-only mode. Must match cycle attendees when provided."
    )
    time_zone: str = Field("UTC", description="Timezone for meeting")
    debug: bool = Field(False, description="Include debug summary and log Graph response (sanitized)")


class SendInviteRequest(BaseModel):
    """Request body for creating Teams meeting."""

    slot_id: str = Field(..., description="The slot_proposals.json slot_id to convert to Teams meeting")
    organiser_email: str = Field(..., description="Email of the meeting organiser")


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────


def _get_cycle_or_404(cycle_id: str, cycle_repo):
    """Fetch cycle or raise 404."""
    cycle = cycle_repo.get_by_cycle_id(cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycle_id}' not found")
    return cycle


def _get_graph_access_token() -> str:
    """
    Read Graph token from .env at request time.

    This avoids stale in-memory tokens when GRAPH_ACCESS_TOKEN is updated
    while the server process is still running.
    """
    fresh_settings = Settings()
    token = fresh_settings.graph_access_token or settings.graph_access_token
    token = token.strip() if token else ""

    if token.lower().startswith("bearer "):
        token = token[7:].strip()

    return token


def _decode_jwt_without_verification(token: str) -> dict | None:
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


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _is_valid_email(value: str) -> bool:
    return bool(_EMAIL_RE.match((value or "").strip()))


def _token_owner_email(token: str) -> str:
    claims = _decode_jwt_without_verification(token) or {}
    owner = claims.get("preferred_username") or claims.get("upn") or claims.get("email") or ""
    return str(owner).strip().lower()


@router.get("/api/graph/token-info")
def graph_token_info():
    """Return non-sensitive info about the configured Graph access token.

    Helps debug errors like ErrorAccessDenied by showing whether the token is
    delegated (scp) vs app-only (roles) and which scopes are present.
    """
    token = _get_graph_access_token()
    if not token:
        return {"token_present": False}

    claims = _decode_jwt_without_verification(token) or {}

    scp = claims.get("scp") or ""
    scopes = [s for s in str(scp).split(" ") if s]
    roles = claims.get("roles") or []

    exp = claims.get("exp")
    now = int(datetime.now(timezone.utc).timestamp())
    expires_in_seconds = int(exp - now) if isinstance(exp, int) else None

    is_delegated = bool(scopes)
    is_app_only = bool(roles) and not is_delegated

    return {
        "token_present": True,
        "token_type": "delegated" if is_delegated else ("app_only" if is_app_only else "unknown"),
        "aud": claims.get("aud"),
        "tid": claims.get("tid"),
        "app_id": claims.get("appid"),
        "user": claims.get("preferred_username") or claims.get("upn"),
        "expires_in_seconds": expires_in_seconds,
        "scopes": scopes,
        "roles": roles,
        "mail_send_present": "Mail.Send" in scopes,
        "mail_read_present": ("Mail.Read" in scopes) or ("Mail.ReadWrite" in scopes),
        "mail_readwrite_present": "Mail.ReadWrite" in scopes,
        "notes": [
            "This endpoint does not validate the token signature.",
            "For /me/messages draft+send you need a delegated token with Mail.ReadWrite + Mail.Send.",
        ],
    }


# ──────────────────────────────────────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────────────────────────────────────


@router.post("/api/cycles/{cycleId}/scheduling/graph/find-times")
def find_meeting_times_graph(
    cycleId: str,
    payload: FindTimesRequest,
    cycle_repo=Depends(get_cycle_repo),
    attendee_repo=Depends(get_attendee_repo),
    slot_repo=Depends(get_slot_repo),
):
    """
    Find real meeting times using Microsoft Graph findMeetingTimes.
    
    Returns SlotProposal objects (compatible with existing /rank-slots response).
    """
    # Fetch cycle
    cycle = _get_cycle_or_404(cycleId, cycle_repo)

    # Check workflow state
    try:
        workflow_engine.assert_at_least(cycle, "ATTENDEE_REFRESH_SENT")
    except WorkflowStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    # Initialize Graph service using latest token from .env.
    graph_access_token = _get_graph_access_token()
    if not graph_access_token:
        raise HTTPException(
            status_code=500,
            detail="GRAPH_ACCESS_TOKEN is not set in .env",
        )

    graph_service = GraphService(graph_access_token)

    # Get attendees
    attendees = attendee_repo.get_for_cycle(cycleId)
    if not attendees:
        raise HTTPException(status_code=400, detail="No attendees found for this cycle")

    # Build attendee email list from cycle attendees only.
    attendee_emails = [a.get("email") for a in attendees if a.get("email")]

    # Normalize emails. Note: Graph /me is the organiser for findMeetingTimes;
    # do not inject organiser_email into the attendee list.
    organiser_email = payload.organiser_email.strip().lower()
    token_owner = _token_owner_email(graph_access_token)
    if not token_owner:
        raise HTTPException(
            status_code=401,
            detail="Could not determine token owner identity from GRAPH_ACCESS_TOKEN claims",
        )
    if organiser_email != token_owner:
        raise HTTPException(
            status_code=400,
            detail=(
                "Organiser must match token owner in dev mode. "
                f"Provided organiser='{organiser_email}', token owner='{token_owner}'."
            ),
        )

    attendee_emails = [e.strip().lower() for e in attendee_emails if e]

    if payload.use_specific_attendees:
        requested = sorted(e.strip().lower() for e in payload.use_specific_attendees if e)
        canonical = sorted(attendee_emails)
        if requested != canonical:
            raise HTTPException(
                status_code=400,
                detail="use_specific_attendees is not allowed to differ from cycle attendees in Graph-only mode",
            )

    invalid = [e for e in attendee_emails if not _is_valid_email(e)]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid attendee email(s): {invalid}",
        )

    if not attendee_emails:
        raise HTTPException(status_code=400, detail="No attendee emails found")

    logger.info(
        "Graph find-times request: cycle=%s organiser=%s attendees=%s start=%s end=%s duration_hours=%s tz=%s debug=%s",
        cycleId,
        payload.organiser_email,
        [e for e in attendee_emails if e],
        payload.date_range_start,
        payload.date_range_end,
        payload.duration_hours,
        payload.time_zone,
        payload.debug,
    )

    # Call Graph findMeetingTimes (synchronous wrapper)
    try:
        import asyncio
        result = asyncio.run(graph_service.find_meeting_times(
            attendee_emails=attendee_emails,
            date_range_start=payload.date_range_start,
            date_range_end=payload.date_range_end,
            duration_hours=payload.duration_hours,
            time_zone=payload.time_zone,
            max_candidates=10,
            # In dev mode, token owner is always organiser and must be enforced.
            is_organizer_optional=False,
            require_all_attendees=True,
            activity_domain="work",
        ))
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        raise HTTPException(status_code=500, detail=f"Graph API error: {str(e)}\n{error_detail}")

    # Check for API errors
    if "error" in result:
        status_code = int(result.get("status_code") or 400)
        code = result.get("code")
        detail = result.get("detail")
        message = result.get("error")

        if status_code == 401:
            guidance = (
                "Graph token is invalid or expired. Refresh GRAPH_ACCESS_TOKEN in backend/.env "
                "from Graph Explorer (with Calendars.ReadWrite delegated permission)."
            )
            full_detail = f"{message}. {detail}. {guidance}" if detail else f"{message}. {guidance}"
        else:
            code_suffix = f" (code: {code})" if code else ""
            detail_suffix = f" - {detail}" if detail else ""
            full_detail = f"{message}{code_suffix}{detail_suffix}"

        raise HTTPException(status_code=status_code, detail=full_detail)

    # Transform Graph response to SlotProposal
    suggestions = result.get("meetingTimeSuggestions", [])
    empty_suggestions_reason = result.get("emptySuggestionsReason") if isinstance(result, dict) else None
    slot_proposals = []
    blocker_counts: dict[str, Counter] = defaultdict(Counter)

    graph_http_meta = (result.get("_http") if isinstance(result, dict) else None) or {}
    logger.info(
        "Graph find-times response: cycle=%s suggestions=%s status=%s request_id=%s",
        cycleId,
        len(suggestions) if isinstance(suggestions, list) else 0,
        graph_http_meta.get("status_code"),
        graph_http_meta.get("request_id"),
    )

    def _to_display_tz(value: str) -> str:
        v = (value or "").strip()
        up = v.upper()
        if up in ("IST", "UTC", "GMT"):
            return up
        if "INDIA" in up:
            return "IST"
        if "GMT" in up:
            return "GMT"
        return "UTC"

    def _to_iana_zone(value: str) -> str:
        v = (value or "").strip()
        up = v.upper()
        if up == "IST" or "INDIA" in up:
            return "Asia/Kolkata"
        if up == "UTC":
            return "UTC"
        if up == "GMT" or "GMT" in up:
            return "Europe/London"
        return "UTC"

    def _fixed_offset_minutes(value: str) -> int:
        """Fallback offsets when zoneinfo data is unavailable."""
        up = (value or "").strip().upper()
        if up == "IST" or "INDIA" in up:
            return 330
        # Treat GMT as zero offset for deterministic fallback.
        if up == "GMT" or "GMT" in up:
            return 0
        return 0

    def _local_to_utc_iso(local_dt_str: str, source_tz: str) -> str:
        """Convert Graph local wall-clock (no offset) to UTC ISO string with 'Z'."""
        if not local_dt_str:
            return ""
        # Graph often returns fractional seconds with 7 digits (e.g. ".0000000")
        # which Python's fromisoformat does not accept.
        normalized = str(local_dt_str).strip()
        if "." in normalized:
            normalized = normalized.split(".", 1)[0]
        try:
            naive = datetime.fromisoformat(normalized)
        except Exception:
            return local_dt_str

        try:
            from zoneinfo import ZoneInfo

            tz = ZoneInfo(_to_iana_zone(source_tz))
            aware = naive.replace(tzinfo=tz)
            utc_dt = aware.astimezone(timezone.utc)
            return utc_dt.replace(tzinfo=None).isoformat(timespec="seconds") + "Z"
        except Exception:
            # Fallback conversion using fixed offsets for known zones.
            minutes = _fixed_offset_minutes(source_tz)
            utc_naive = naive - timedelta(minutes=minutes)
            return utc_naive.isoformat(timespec="seconds") + "Z"

    def _to_requested_tz_iso(local_dt_str: str, source_tz: str, requested_tz: str) -> str:
        """Convert Graph local wall-clock value to requested timezone ISO (debug helper)."""
        if not local_dt_str:
            return ""
        normalized = str(local_dt_str).strip()
        if "." in normalized:
            normalized = normalized.split(".", 1)[0]
        try:
            naive = datetime.fromisoformat(normalized)
        except Exception:
            return local_dt_str

        try:
            from zoneinfo import ZoneInfo

            source = ZoneInfo(_to_iana_zone(source_tz))
            target = ZoneInfo(_to_iana_zone(requested_tz))
            aware = naive.replace(tzinfo=source)
            local = aware.astimezone(target)
            return local.isoformat(timespec="seconds")
        except Exception:
            src_mins = _fixed_offset_minutes(source_tz)
            dst_mins = _fixed_offset_minutes(requested_tz)
            utc_naive = naive - timedelta(minutes=src_mins)
            local_naive = utc_naive + timedelta(minutes=dst_mins)
            sign = "+" if dst_mins >= 0 else "-"
            abs_mins = abs(dst_mins)
            hh = abs_mins // 60
            mm = abs_mins % 60
            return f"{local_naive.isoformat(timespec='seconds')}{sign}{hh:02d}:{mm:02d}"

    # Persist — clear old proposals first so the UI doesn't mix stale results.
    slot_repo.clear_for_cycle(cycleId)

    filtered_conflicts = 0
    processed = 0
    for idx, suggestion in enumerate(suggestions):
        processed += 1
        # Graph returns time in meetingTimeSlot.start.dateTime
        meeting_slot = suggestion.get("meetingTimeSlot", {})
        start_info = meeting_slot.get("start", {})

        local_start_str = start_info.get("dateTime", "")
        graph_tz = start_info.get("timeZone") or payload.time_zone
        display_tz = _to_display_tz(payload.time_zone or graph_tz)
        proposed_time = _local_to_utc_iso(local_start_str, graph_tz)

        # Compute attendee availability from Graph response
        availability = suggestion.get("attendeeAvailability", []) or []
        availability_by_email: dict[str, str] = {}
        for item in availability:
            attendee = (item or {}).get("attendee") or {}
            email_obj = (attendee.get("emailAddress") or {})
            email = (email_obj.get("address") or "").strip().lower()
            status = (item or {}).get("availability") or "unknown"
            if email:
                availability_by_email[email] = str(status).lower()

        attending_names: list[str] = []
        tentative_names: list[str] = []
        conflict_names: list[str] = []

        def _is_free(status: str) -> bool:
            s = (status or "").strip().lower()
            # Graph returns: free | tentative | busy | oof | workingElsewhere | unknown
            return s == "free"

        def _is_tentative(status: str) -> bool:
            s = (status or "").strip().lower()
            return s == "tentative"

        for email in attendee_emails:
            e = (email or "").strip().lower()
            status = availability_by_email.get(e, "unknown")
            name = get_attendee_name(e) or e
            if _is_free(status):
                attending_names.append(name)
            elif _is_tentative(status):
                tentative_names.append(name)
            else:
                conflict_names.append(name)
                blocker_counts[e][status] += 1

        # Hard conflicts still remove the slot. Tentative attendees remain eligible,
        # but they are ranked below fully free attendees.
        # Organiser availability is enforced by Graph when isOrganizerOptional=False.
        organiser_available = True
        if conflict_names:
            filtered_conflicts += 1
            continue

        confidence = str(suggestion.get("confidenceLevel") or suggestion.get("confidence") or "low").lower()
        base_score = 100.0 if confidence == "high" else 80.0 if confidence == "medium" else 60.0
        tentative_penalty = len(tentative_names) * 15.0
        # Prefer higher attendance, then higher confidence; penalize tentatives so
        # completely free slots sort above tentative ones.
        computed_score = max(0.0, min(100.0, base_score - tentative_penalty))

        # Build SlotProposal
        slot_id = f"slot_{uuid.uuid4().hex[:8]}"
        slot_proposal = {
            "slot_id": slot_id,
            "cycle_id": cycleId,
            "proposed_time": proposed_time,
            "proposed_time_zone": display_tz,
            "duration_minutes": int(payload.duration_hours * 60),
            "organiser_available": organiser_available,
            "exec_sponsor_available": True,
            "rank_score": computed_score,
            "is_approved": False,
            "attendance_count": len(attending_names) + len(tentative_names),
            "total_attendees": len(attendee_emails),
            "conflict_count": len(conflict_names),
            "attending": attending_names,
            "tentative": tentative_names,
            "conflicts": conflict_names,
        }
        slot_proposals.append(slot_proposal)

        # Persist to slot_proposals.json using repository
        slot_repo.insert(slot_proposal)

    # Best-first ordering for UI consistency
    slot_proposals.sort(key=lambda s: (-float(s.get("rank_score") or 0), s.get("proposed_time") or ""))

    no_slots_reason = empty_suggestions_reason or ""
    if not slot_proposals:
        if len(suggestions) > 0 and blocker_counts:
            blocker_bits: list[str] = []
            ranked_blockers = sorted(
                blocker_counts.items(),
                key=lambda item: (-sum(item[1].values()), item[0]),
            )
            for email, counts in ranked_blockers[:3]:
                status_counts = ", ".join(
                    f"{status} x{count}"
                    for status, count in counts.most_common()
                )
                blocker_bits.append(f"{email} was {status_counts}")
            no_slots_reason = (
                "No common meeting slots because one or more attendees were not free in every Graph suggestion: "
                + "; ".join(blocker_bits)
            )
        elif not no_slots_reason:
            no_slots_reason = "Graph returned no suggestions in the selected window."

    # Align workflow with deterministic path: slot discovery means
    # availability has effectively been collected for this cycle.
    now = datetime.now(timezone.utc).isoformat()
    if workflow_engine.can_transition(cycle.get("workflow_state", ""), "AVAILABILITY_COLLECTED"):
        workflow_engine.advance(cycle, cycle_repo, now)

    response_payload = {
        "message": (
            f"Found {len(slot_proposals)} real meeting slots via Graph"
            if len(slot_proposals) > 0
            else (
                "No common meeting slots found via Graph"
                + (f": {no_slots_reason}" if no_slots_reason else "")
            )
        ),
        "slot_proposals": slot_proposals,
        "attendee_count": len(attendee_emails),
        "attendee_emails_used": attendee_emails,
        "organiser_email_used": organiser_email,
        "graph_summary": {
            "suggestions_received": len(suggestions) if isinstance(suggestions, list) else 0,
            "empty_suggestions_reason": empty_suggestions_reason,
            "no_slots_reason": no_slots_reason,
            "suggestions_processed": processed,
            "suggestions_filtered_conflicts": filtered_conflicts,
            "slots_returned": len(slot_proposals),
            "graph_http": graph_http_meta,
        },
    }

    logger.info(
        "Graph find-times final: cycle=%s slots_returned=%s filtered_conflicts=%s",
        cycleId,
        len(slot_proposals),
        filtered_conflicts,
    )

    if payload.debug:
        try:
            me_profile = asyncio.run(graph_service.get_me_profile())
        except Exception as exc:
            me_profile = {"error": f"Failed to fetch /me profile: {str(exc)}"}

        # Provide a small, sanitized preview to help debug 0-slot scenarios.
        preview = []
        if isinstance(suggestions, list):
            for s in suggestions[:3]:
                mt = (s or {}).get("meetingTimeSlot") or {}
                st = (mt.get("start") or {})
                avail = (s or {}).get("attendeeAvailability") or []
                preview.append(
                    {
                        "start": {
                            "dateTime": st.get("dateTime"),
                            "timeZone": st.get("timeZone"),
                            "requestedTimeZoneDateTime": _to_requested_tz_iso(
                                st.get("dateTime"),
                                st.get("timeZone") or payload.time_zone,
                                payload.time_zone,
                            ),
                            "requestedTimeZone": payload.time_zone,
                        },
                        "confidence": (s or {}).get("confidenceLevel") or (s or {}).get("confidence"),
                        "attendeeAvailability": avail,
                        "suggestionReason": (s or {}).get("suggestionReason"),
                    }
                )

        response_payload["graph_debug"] = {
            "me_profile": {
                "displayName": (me_profile or {}).get("displayName"),
                "mail": (me_profile or {}).get("mail"),
                "userPrincipalName": (me_profile or {}).get("userPrincipalName"),
                "_http": (me_profile or {}).get("_http"),
                "error": (me_profile or {}).get("error") or (me_profile or {}).get("detail"),
            },
            "suggestions_preview": preview,
            "raw_keys": list(result.keys()) if isinstance(result, dict) else None,
            "empty_suggestions_reason": empty_suggestions_reason,
            "no_slots_reason": no_slots_reason,
        }

        # Log the same preview so it is visible in server logs.
        logger.info(
            "Graph find-times debug: cycle=%s me=%s preview=%s",
            cycleId,
            {
                "displayName": (me_profile or {}).get("displayName"),
                "mail": (me_profile or {}).get("mail"),
                "userPrincipalName": (me_profile or {}).get("userPrincipalName"),
                "_http": (me_profile or {}).get("_http"),
                "error": (me_profile or {}).get("error") or (me_profile or {}).get("detail"),
            },
            preview,
        )

    return response_payload


@router.post("/api/cycles/{cycleId}/scheduling/graph/send-invite")
def send_meeting_invite_graph(
    cycleId: str,
    payload: SendInviteRequest,
    cycle_repo=Depends(get_cycle_repo),
    attendee_repo=Depends(get_attendee_repo),
    slot_repo=Depends(get_slot_repo),
):
    """
    Create a real Teams meeting event and send invites to all cycle attendees.
    
    Takes an approved slot_id and converts it to a real Teams meeting via Graph.
    """
    # Fetch cycle
    cycle = _get_cycle_or_404(cycleId, cycle_repo)

    # Check workflow state
    try:
        workflow_engine.assert_at_least(cycle, "AVAILABILITY_COLLECTED")
    except WorkflowStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    # Initialize Graph service using latest token from .env.
    graph_access_token = _get_graph_access_token()
    if not graph_access_token:
        raise HTTPException(
            status_code=500,
            detail="GRAPH_ACCESS_TOKEN is not set in .env",
        )

    graph_service = GraphService(graph_access_token)

    token_owner = _token_owner_email(graph_access_token)
    organiser_email = payload.organiser_email.strip().lower()
    if not token_owner:
        raise HTTPException(
            status_code=401,
            detail="Could not determine token owner identity from GRAPH_ACCESS_TOKEN claims",
        )
    if organiser_email != token_owner:
        raise HTTPException(
            status_code=400,
            detail=(
                "Organiser must match token owner in dev mode. "
                f"Provided organiser='{organiser_email}', token owner='{token_owner}'."
            ),
        )

    # Fetch the slot
    slot = slot_repo.get_by_slot_id(payload.slot_id)

    if not slot:
        raise HTTPException(status_code=404, detail=f"Slot '{payload.slot_id}' not found")

    if not slot.get("is_approved"):
        raise HTTPException(status_code=400, detail="Slot must be approved before sending invites")

    # Get attendees
    attendees = attendee_repo.get_for_cycle(cycleId)
    attendee_emails = [a.get("email") for a in attendees if a.get("email")]

    invalid = [e for e in attendee_emails if not _is_valid_email(str(e))]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid attendee email(s): {invalid}",
        )

    if not attendee_emails:
        raise HTTPException(status_code=400, detail="No attendee emails found")

    # Build meeting subject
    subject = f"Vendor Meeting — {cycle.get('vendor_name', 'TBD')} ({cycle.get('quarter', '')} {cycle.get('year', '')})"

    # Create event (synchronous wrapper)
    try:
        import asyncio
        duration_minutes = slot.get("duration_minutes", 30)
        duration_hours = float(duration_minutes) / 60.0
        result = asyncio.run(graph_service.create_event(
            subject=subject,
            attendee_emails=attendee_emails,
            start_time=slot.get("proposed_time"),
            duration_hours=duration_hours,
            organiser_email=organiser_email,
            is_online_meeting=True,
            time_zone=slot.get("proposed_time_zone") or "UTC",
        ))
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        raise HTTPException(status_code=500, detail=f"Graph API error: {str(e)}\n{error_detail}")

    # Check for API errors
    if "error" in result:
        status_code = int(result.get("status_code") or 400)
        code = result.get("code")
        detail = result.get("detail")
        message = result.get("error")

        if status_code == 401:
            guidance = (
                "Graph token is invalid or expired. Refresh GRAPH_ACCESS_TOKEN in backend/.env "
                "from Graph Explorer (with Calendars.ReadWrite delegated permission)."
            )
            full_detail = f"{message}. {detail}. {guidance}" if detail else f"{message}. {guidance}"
        else:
            code_suffix = f" (code: {code})" if code else ""
            detail_suffix = f" - {detail}" if detail else ""
            full_detail = f"{message}{code_suffix}{detail_suffix}"

        raise HTTPException(status_code=status_code, detail=full_detail)

    now = datetime.now(timezone.utc).isoformat()
    if workflow_engine.can_transition(cycle.get("workflow_state", ""), "MEETING_SCHEDULED"):
        workflow_engine.transition_to(cycle, "MEETING_SCHEDULED", cycle_repo, now)

    return {
        "message": "Teams meeting created and invites sent",
        "event_id": result.get("id"),
        "teams_meeting_url": result.get("onlineMeetingUrl"),
        "web_link": result.get("webLink"),
        "slot_id": payload.slot_id,
    }
