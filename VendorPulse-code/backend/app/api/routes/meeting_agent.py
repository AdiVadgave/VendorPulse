"""
Module E — Meeting Agent routes.

POST /api/cycles/{cycleId}/meeting/minutes           Generate meeting minutes from notes
POST /api/cycles/{cycleId}/meeting/extract-actions    Extract action items from minutes text
POST /api/cycles/{cycleId}/meeting/parse-transcript   Parse a transcript into structured notes
POST /api/cycles/{cycleId}/meeting/minutes/approve    Approve generated meeting minutes
POST /api/cycles/{cycleId}/meeting/minutes/send       Send approved minutes to internal stakeholders
"""
from __future__ import annotations

import base64
import binascii
import io
import logging
import re
import zipfile
from datetime import datetime, timezone
from typing import Any
from xml.sax.saxutils import unescape

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies import (
    get_agent_run_repo,
    get_attendee_repo,
    get_meeting_agent,
    get_meeting_artifact_repo,
)
from app.models.common import AgentResponse
from app.models.meeting_agent import GenerateMinutesRequest, ParseTranscriptRequest
from app.services.email_templates import build_minutes_email
from app.services.mail_provider import get_mail_provider, MailSendError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cycles/{cycleId}/meeting", tags=["meeting-agent"])


@router.get("/artifact")
def get_meeting_artifact(
    cycleId: str,
    meeting_id: str = "",
    artifact_repo=Depends(get_meeting_artifact_repo),
):
    """Return the persisted parsed notes + generated minutes for a meeting, so the
    Meeting tab restores its state after a refresh (no re-parse / re-generate)."""
    mid = meeting_id or f"mtg-{cycleId}"
    artifact = artifact_repo.get(cycleId, mid)
    if not artifact:
        return {"meeting_id": mid, "notes": [], "minutes": None, "parsed_at": None}
    return {
        "meeting_id": mid,
        "notes": artifact.get("notes", []),
        "minutes": artifact.get("minutes"),
        "parsed_at": artifact.get("parsed_at"),
    }


@router.post("/minutes", response_model=AgentResponse)
def generate_minutes(
    cycleId: str,
    payload: GenerateMinutesRequest,
    artifact_repo=Depends(get_meeting_artifact_repo),
):
    """
    Generate formal meeting minutes from captured notes.
    Uses Azure OpenAI when ENABLE_LLM=true, otherwise returns deterministic minutes.
    """
    logger.info(
        "MEETING-AGENT: generate minutes — cycleId=%s, meetingId=%s, notes=%d",
        cycleId, payload.meeting_id, len(payload.notes),
    )

    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    agent = get_meeting_agent(cycle_id=cycleId)
    response = agent.run(
        user_message=f"Generate meeting minutes for meeting {payload.meeting_id}",
        context={
            "action": "generate_minutes",
            "params": {
                "meeting_id": payload.meeting_id,
                "notes": [n.model_dump() for n in payload.notes],
                "attendees": payload.attendees,
                "meeting_date": payload.meeting_date,
            },
        },
    )
    # Persist the generated minutes so the MoM survives a refresh.
    if response.status == "success" and isinstance(response.data, dict) and response.data.get("minutes"):
        artifact_repo.upsert(cycleId, payload.meeting_id, {
            "minutes": response.data["minutes"],
            "minutes_generated_at": datetime.now(timezone.utc).isoformat(),
        })
    logger.info("MEETING-AGENT: minutes generated — status=%s", response.status)
    return response


@router.post("/extract-actions", response_model=AgentResponse)
def extract_actions(
    cycleId: str,
    payload: dict,
):
    """
    Extract structured action items from meeting minutes text.
    """
    minutes_text = payload.get("minutes_text", "")
    if not minutes_text:
        raise HTTPException(status_code=400, detail="minutes_text is required")

    logger.info("MEETING-AGENT: extract actions — cycleId=%s, text_len=%d", cycleId, len(minutes_text))

    agent = get_meeting_agent(cycle_id=cycleId)
    response = agent.run(
        user_message="Extract action items from these meeting minutes",
        context={
            "action": "extract_actions",
            "params": {"minutes_text": minutes_text},
        },
    )
    logger.info("MEETING-AGENT: actions extracted — status=%s", response.status)
    return response


@router.post("/parse-transcript", response_model=AgentResponse)
def parse_transcript(
    cycleId: str,
    payload: ParseTranscriptRequest,
    artifact_repo=Depends(get_meeting_artifact_repo),
):
    """
    Parse a raw meeting transcript into structured notes.
    Uses Azure OpenAI to identify questions, decisions, objections, actions, etc.
    """
    logger.info(
        "MEETING-AGENT: parse transcript — cycleId=%s, meetingId=%s, len=%d",
        cycleId, payload.meeting_id, len(payload.transcript),
    )

    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    agent = get_meeting_agent(cycle_id=cycleId)
    response = agent.run(
        user_message=(
            f"Parse this meeting transcript into structured notes:\n\n{payload.transcript}"
        ),
        context={
            "action": "parse_transcript",
            "params": {
                "meeting_id": payload.meeting_id,
                "transcript": payload.transcript,
            },
        },
    )
    # Persist the parsed notes so the Meeting tab shows "already parsed" after refresh.
    if response.status == "success" and isinstance(response.data, dict):
        artifact_repo.upsert(cycleId, payload.meeting_id, {
            "notes": response.data.get("notes", []),
            "parsed_at": datetime.now(timezone.utc).isoformat(),
        })
    logger.info("MEETING-AGENT: transcript parsed — status=%s", response.status)
    return response


# ── Transcript file upload (.docx / .vtt) → plain text ───────────────────────
# Extracts the transcript text from an uploaded Word document or a WebVTT caption
# file (e.g. a Teams meeting transcript export) using the Python standard library
# only — no third-party dependency. The coordinator reviews/edits the extracted
# text in the transcript box before parsing, so extraction just needs to be clean,
# not perfect.

# Hard cap so a stray large upload can't exhaust memory.
_MAX_TRANSCRIPT_FILE_BYTES = 15 * 1024 * 1024  # 15 MB


def _extract_docx(data: bytes) -> str:
    """Pull readable text out of a .docx (a zip of OOXML). Paragraphs become lines."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            xml = z.read("word/document.xml").decode("utf-8", "ignore")
    except (zipfile.BadZipFile, KeyError) as exc:
        raise HTTPException(status_code=400, detail="Couldn't read the .docx file — it may be corrupt or not a Word document.") from exc
    # Paragraph and line breaks become newlines; tabs are preserved.
    xml = xml.replace("</w:p>", "\n")
    xml = re.sub(r"<w:tab\b[^>]*/?>", "\t", xml)
    xml = re.sub(r"<w:br\b[^>]*/?>", "\n", xml)
    # Drop every remaining tag, then decode XML entities.
    text = unescape(re.sub(r"<[^>]+>", "", xml))
    lines = [ln.rstrip() for ln in text.split("\n")]
    # Collapse runs of 3+ blank lines down to a single blank line.
    out: list[str] = []
    blank = 0
    for ln in lines:
        if ln.strip():
            blank = 0
            out.append(ln)
        else:
            blank += 1
            if blank == 1:
                out.append("")
    return "\n".join(out).strip()


def _extract_vtt(data: bytes) -> str:
    """Pull spoken text out of a WebVTT file, keeping speaker labels where present.

    Teams exports tag each cue as <v Speaker Name>text</v>; we render those as
    "Speaker Name: text". Cue numbers, timestamps, NOTE blocks and the WEBVTT
    header are dropped, and consecutive duplicate lines (rolling captions) collapsed."""
    raw = data.decode("utf-8-sig", "ignore")
    out: list[str] = []
    last: str | None = None
    for line in raw.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.upper().startswith("WEBVTT") or s.startswith("NOTE"):
            continue
        if "-->" in s:            # timestamp cue line
            continue
        if re.fullmatch(r"\d+", s):  # numeric cue identifier
            continue
        m = re.search(r"<v\s+([^>]+)>(.*?)</v>", s)
        if m:
            speaker = m.group(1).strip()
            spoken = re.sub(r"<[^>]+>", "", m.group(2)).strip()
            formatted = f"{speaker}: {spoken}" if spoken else ""
        else:
            formatted = re.sub(r"<[^>]+>", "", s).strip()
        formatted = unescape(formatted)
        if formatted and formatted != last:
            out.append(formatted)
            last = formatted
    return "\n".join(out).strip()


class TranscriptFileRequest(BaseModel):
    """A transcript file uploaded as base64 (keeps the JSON API — no multipart dep)."""
    filename: str
    content_b64: str


@router.post("/extract-transcript-file")
def extract_transcript_file(cycleId: str, payload: TranscriptFileRequest):
    """Extract transcript text from an uploaded .docx or .vtt file (sent base64-encoded).

    Returns the plain text so the frontend can drop it into the transcript box for
    the coordinator to review and edit before parsing."""
    name = (payload.filename or "").strip()
    lower = name.lower()
    if not (lower.endswith(".docx") or lower.endswith(".vtt")):
        raise HTTPException(status_code=400, detail="Unsupported file type. Attach a .docx or .vtt transcript.")

    # Base64 can carry a data: URI prefix (e.g. "data:...;base64,") — strip it.
    b64 = payload.content_b64.split(",", 1)[-1] if "," in payload.content_b64 else payload.content_b64
    try:
        data = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Couldn't decode the uploaded file.") from exc

    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(data) > _MAX_TRANSCRIPT_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File is too large (max 15 MB).")

    text = _extract_docx(data) if lower.endswith(".docx") else _extract_vtt(data)
    if not text:
        raise HTTPException(status_code=422, detail="No readable text found in the file.")

    logger.info("MEETING-AGENT: transcript file extracted — cycleId=%s file=%s chars=%d", cycleId, name, len(text))
    return {"text": text, "filename": name, "chars": len(text)}


# ── Approval endpoint ───────────────────────────────────────────────────────


class ApproveMinutesRequest(BaseModel):
    run_id: str
    approved_by: str = "coordinator"


@router.post("/minutes/approve")
def approve_minutes(cycleId: str, payload: ApproveMinutesRequest):
    """Mark generated meeting minutes as approved and finalised."""
    logger.info("MEETING-AGENT: approve minutes — cycleId=%s, run_id=%s", cycleId, payload.run_id)

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

    logger.info("MEETING-AGENT: minutes approved — run_id=%s, by=%s", payload.run_id, payload.approved_by)
    return {
        "status": "approved",
        "run_id": payload.run_id,
        "approved_by": payload.approved_by,
        "approved_at": now,
    }


# ── Send minutes endpoint ───────────────────────────────────────────────────


class SendMinutesRequest(BaseModel):
    run_id: str
    minutes: dict[str, Any]



@router.post("/minutes/send")
def send_minutes(cycleId: str, payload: SendMinutesRequest):
    """
    Send approved meeting minutes to all internal stakeholders via the service
    mailbox (Microsoft Graph). Uses the attendee's `email` as the delivery address.
    """
    logger.info("MEETING-AGENT: send minutes — cycleId=%s, run_id=%s", cycleId, payload.run_id)

    attendee_repo = get_attendee_repo()

    all_attendees = attendee_repo.get_for_cycle(cycleId)
    # Minutes go to internal stakeholders (everyone who is NOT a vendor). Treating
    # null/missing type as internal is robust to legacy data where `type` is unset.
    internal = [
        a for a in all_attendees
        if (a.get("type") or "").lower() != "vendor" and (a.get("email") or "").strip()
    ]

    if not internal:
        raise HTTPException(
            status_code=404,
            detail=f"No internal stakeholders with an email address found for cycle '{cycleId}'"
        )

    minutes = payload.minutes

    sent_to = []
    failed = []

    for attendee in internal:
        email_addr = attendee["email"].strip()
        name = attendee.get("name", email_addr)

        email_content = build_minutes_email(
            attendee_name=name,
            vendor_name=minutes.get("vendor_name", ""),
            quarter=minutes.get("quarter", ""),
            year=minutes.get("year", 0),
            minutes=minutes,
        )

        try:
            get_mail_provider().send_html_email(
                to_email=email_addr,
                subject=email_content["subject"],
                html_body=email_content["html_body"],
                text_body=email_content["text_body"],
            )
            sent_to.append({"name": name, "email": email_addr})
            logger.info("MEETING-AGENT: minutes sent to %s (%s)", name, email_addr)
        except MailSendError as exc:
            logger.warning("MEETING-AGENT: failed to send to %s — %s", email_addr, exc)
            failed.append({"name": name, "email": email_addr, "error": str(exc)})

    if not sent_to and failed:
        first_error = failed[0]["error"]
        raise HTTPException(
            status_code=503,
            detail=f"Mail send failed via the service mailbox. Error: {first_error}"
        )

    logger.info(
        "MEETING-AGENT: minutes dispatch complete — cycleId=%s, sent=%d, failed=%d",
        cycleId, len(sent_to), len(failed),
    )

    return {
        "status": "sent",
        "run_id": payload.run_id,
        "sent_to": sent_to,
        "count": len(sent_to),
        "failed": failed,
        "sent_at": datetime.now(timezone.utc).isoformat(),
    }
