"""
LLM-powered inference endpoints for VendorPulse.

Requires ENABLE_LLM=true and valid provider credentials in .env.

Endpoints:
  POST /api/cycles/{cycleId}/alignment/extract-actions   — extract action items from notes
  POST /api/cycles/{cycleId}/vendor-prep/generate-brief  — generate AI vendor brief
  POST /api/cycles/{cycleId}/vendor-prep/pushback/draft  — draft 3 pushback response options
  POST /api/cycles/{cycleId}/meeting/generate-minutes    — generate formal meeting minutes
  POST /api/analytics/leadership-brief                   — generate cross-cycle leadership brief
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.dependencies import get_llm_service
from app.services.llm_service import LLMService

router = APIRouter(prefix="/api", tags=["llm"])


def _require_llm(llm: LLMService) -> LLMService:
    if not llm.is_enabled:
        raise HTTPException(
            status_code=503,
            detail=(
                "LLM is not enabled. Set ENABLE_LLM=true and valid provider credentials "
                "in backend/.env, then restart the server."
            ),
        )
    return llm


def _parse_llm_json(raw: str) -> Any:
    """Strip markdown fences if present, then parse JSON."""
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first line (```json or ```) and last line (```)
        inner = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
        text = inner.strip()
    return json.loads(text)


# ── 1. Extract action items from alignment notes ──────────────────────────────


class ExtractActionsRequest(BaseModel):
    notes: str


@router.post("/cycles/{cycleId}/alignment/extract-actions")
def extract_actions(
    cycleId: str,
    payload: ExtractActionsRequest,
    llm: LLMService = Depends(get_llm_service),
):
    _require_llm(llm)
    if not payload.notes.strip():
        raise HTTPException(status_code=400, detail="Notes cannot be empty.")

    system = (
        "You are a governance meeting assistant. Extract ALL action items from meeting notes. "
        "Return ONLY a valid JSON array — no explanation, no markdown. "
        "Each element: {\"description\": string, \"owner\": string, \"due_date\": \"YYYY-MM-DD\" or null}. "
        "If a name is unclear, use the closest reasonable name. "
        "If no date is mentioned for an item, set due_date to null."
    )
    prompt = f"Meeting notes:\n\n{payload.notes}\n\nExtract action items as JSON array:"

    try:
        raw = llm.call_simple(prompt=prompt, system=system, max_tokens=1024)
        items = _parse_llm_json(raw)
        if not isinstance(items, list):
            raise ValueError("Expected a JSON array")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM parsing failed: {exc}. Raw: {raw!r}")

    actions = [
        {
            "action_id": f"llm-{uuid.uuid4().hex[:8]}",
            "description": item.get("description", ""),
            "owner": item.get("owner", "TBD"),
            "due_date": item.get("due_date"),
            "source": "alignment",
            "status": "OPEN",
        }
        for item in items
        if item.get("description")
    ]
    return {"cycle_id": cycleId, "actions": actions, "count": len(actions)}


# ── 2. Generate vendor brief ──────────────────────────────────────────────────


class CategoryInput(BaseModel):
    category_label: str
    internal_avg: Optional[float] = None
    vendor_avg: Optional[float] = None


class GenerateBriefRequest(BaseModel):
    vendor_name: str
    categories: list[CategoryInput]
    overall_internal_avg: Optional[float] = None
    overall_vendor_avg: Optional[float] = None
    key_recommendations: list[str] = []


@router.post("/cycles/{cycleId}/vendor-prep/generate-brief")
def generate_vendor_brief(
    cycleId: str,
    payload: GenerateBriefRequest,
    llm: LLMService = Depends(get_llm_service),
):
    _require_llm(llm)

    # Compute overall score
    i_avg = payload.overall_internal_avg or 0.0
    v_avg = payload.overall_vendor_avg or 0.0
    overall = round((i_avg + v_avg) / 2, 2) if (i_avg and v_avg) else (i_avg or v_avg)
    overall_trend = "improving" if overall >= 3.5 else "declining" if overall < 2.5 else "stable"

    # Build scorecard summary for the LLM
    scorecard_lines = []
    for cat in payload.categories:
        i = cat.internal_avg or 0
        v = cat.vendor_avg or 0
        avg = round((i + v) / 2, 2) if (i and v) else (i or v)
        gap = round(abs(i - v), 2)
        scorecard_lines.append(
            f"- {cat.category_label}: avg={avg}/5, internal={i}/5, vendor={v}/5, gap={gap}"
        )
    scorecard_text = "\n".join(scorecard_lines)
    recs_text = "\n".join(f"- {r}" for r in payload.key_recommendations) if payload.key_recommendations else "None"

    system = (
        "You are a vendor governance analyst for an enterprise governance review. "
        "Generate a vendor brief based on compiled scorecard data. "
        "Return ONLY a valid JSON object — no markdown, no explanation. "
        "Schema: {"
        "\"category_ratings\": [{\"category\": string, \"score\": number, \"rationale\": string, \"trend\": \"up\"|\"down\"|\"flat\"}], "
        "\"key_concerns\": [string, ...], "
        "\"positive_areas\": [string, ...]"
        "}. "
        "rationale should be 1-2 concise professional sentences explaining the score and any notable issues. "
        "key_concerns: up to 5 items highlighting risks, gaps, or low scores. "
        "positive_areas: up to 5 items highlighting strong performance. "
        "Be specific, factual, and professional."
    )
    prompt = (
        f"Vendor: {payload.vendor_name}\n"
        f"Overall Score: {overall}/5 (Internal: {i_avg}, Vendor: {v_avg})\n\n"
        f"Category Scores:\n{scorecard_text}\n\n"
        f"Stakeholder Recommendations:\n{recs_text}\n\n"
        "Generate the vendor brief JSON:"
    )

    try:
        raw = llm.call_simple(prompt=prompt, system=system, max_tokens=1500)
        parsed = _parse_llm_json(raw)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM parsing failed: {exc}. Raw: {raw!r}")

    # Attach computed numerics
    cat_ratings = parsed.get("category_ratings", [])
    for i_cat, cat in enumerate(payload.categories):
        i_s = cat.internal_avg or 0
        v_s = cat.vendor_avg or 0
        avg_score = round((i_s + v_s) / 2, 2) if (i_s and v_s) else (i_s or v_s)
        if i_cat < len(cat_ratings):
            cat_ratings[i_cat]["score"] = avg_score
            if "trend" not in cat_ratings[i_cat]:
                cat_ratings[i_cat]["trend"] = "up" if avg_score >= 3.5 else "down" if avg_score < 2.5 else "flat"
        else:
            cat_ratings.append({
                "category": cat.category_label,
                "score": avg_score,
                "rationale": "Score derived from compiled scorecard data.",
                "trend": "up" if avg_score >= 3.5 else "down" if avg_score < 2.5 else "flat",
            })

    return {
        "cycle_id": cycleId,
        "brief": {
            "overall_score": overall,
            "overall_trend": overall_trend,
            "category_ratings": cat_ratings,
            "key_concerns": parsed.get("key_concerns", [])[:5],
            "positive_areas": parsed.get("positive_areas", [])[:5],
            "open_actions": 0,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    }


# ── 3. Draft pushback response options ───────────────────────────────────────


class PushbackDraftRequest(BaseModel):
    pushback_id: str
    description: str
    category: str
    raised_by: str
    vendor_name: str
    scorecard_summary: Optional[str] = None


@router.post("/cycles/{cycleId}/vendor-prep/pushback/draft")
def draft_pushback_responses(
    cycleId: str,
    payload: PushbackDraftRequest,
    llm: LLMService = Depends(get_llm_service),
):
    _require_llm(llm)

    system = (
        "You are a vendor governance expert helping draft professional responses to vendor objections. "
        "Generate exactly 3 response options: factual, neutral, and escalation. "
        "Return ONLY a valid JSON array — no markdown, no explanation. "
        "Each element: {\"stance\": \"factual\"|\"neutral\"|\"escalation\", \"content\": string}. "
        "factual: data-driven, cites evidence, professional and firm. "
        "neutral: balanced, acknowledges vendor perspective, open to discussion. "
        "escalation: firm, clear consequences, appropriate for repeated issues. "
        "All responses must be professional, concise (2-3 sentences), and appropriate for executive governance."
    )
    context = f"\nScorecard context: {payload.scorecard_summary}" if payload.scorecard_summary else ""
    prompt = (
        f"Vendor: {payload.vendor_name}\n"
        f"Objection Category: {payload.category.replace('_', ' ').title()}\n"
        f"Raised By: {payload.raised_by}\n"
        f"Objection: {payload.description}{context}\n\n"
        "Draft 3 response options as JSON array:"
    )

    try:
        raw = llm.call_simple(prompt=prompt, system=system, max_tokens=800)
        items = _parse_llm_json(raw)
        if not isinstance(items, list):
            raise ValueError("Expected a JSON array")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM parsing failed: {exc}. Raw: {raw!r}")

    responses = [
        {
            "response_id": f"llm-{uuid.uuid4().hex[:8]}",
            "pushback_id": payload.pushback_id,
            "stance": item.get("stance", "neutral"),
            "content": item.get("content", ""),
            "is_selected": False,
        }
        for item in items
        if item.get("content")
    ]
    return {"cycle_id": cycleId, "pushback_id": payload.pushback_id, "responses": responses}


# ── 4. Parse meeting transcript into structured notes ────────────────────────


class ParseTranscriptRequest(BaseModel):
    transcript: str


@router.post("/cycles/{cycleId}/meeting/parse-transcript")
def parse_transcript(
    cycleId: str,
    payload: ParseTranscriptRequest,
    llm: LLMService = Depends(get_llm_service),
):
    _require_llm(llm)
    if not payload.transcript.strip():
        raise HTTPException(status_code=400, detail="Transcript cannot be empty.")

    system = (
        "You are a meeting analyst parsing a governance review transcript into structured notes. "
        "Classify every meaningful statement into one of these types: "
        "QUESTION (a question raised), OBJECTION (a dispute or pushback), "
        "DECISION (a decision agreed upon), APPRECIATION (positive recognition), ACTION (a task assigned or committed to). "
        "Return ONLY a valid JSON array — no markdown, no explanation. "
        "Each element: {\"note_type\": string, \"content\": string, \"raised_by\": string, \"timestamp\": string}. "
        "note_type must be one of: QUESTION, OBJECTION, DECISION, APPRECIATION, ACTION. "
        "content: the statement rephrased concisely in third-person (e.g. 'Vendor disputes SLA breach score for February.'). "
        "raised_by: the speaker name extracted from the transcript. "
        "timestamp: extract time if present in the transcript (e.g. '10:05'), otherwise use empty string. "
        "Skip small-talk, filler, and statements that do not fit any type. "
        "Capture every question, every objection, every decision, every appreciation, and every action item."
    )
    prompt = f"Transcript:\n\n{payload.transcript}\n\nParse into structured notes JSON array:"

    try:
        raw = llm.call_simple(prompt=prompt, system=system, max_tokens=2000)
        items = _parse_llm_json(raw)
        if not isinstance(items, list):
            raise ValueError("Expected a JSON array")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM parsing failed: {exc}. Raw: {raw!r}")

    valid_types = {"QUESTION", "OBJECTION", "DECISION", "APPRECIATION", "ACTION"}
    notes = [
        {
            "note_id": f"tr-{uuid.uuid4().hex[:8]}",
            "meeting_id": f"m-{cycleId}",
            "note_type": item.get("note_type", "QUESTION").upper(),
            "content": item.get("content", ""),
            "raised_by": item.get("raised_by", "Unknown"),
            "timestamp": item.get("timestamp", ""),
        }
        for item in items
        if item.get("content") and item.get("note_type", "").upper() in valid_types
    ]
    return {"cycle_id": cycleId, "notes": notes, "count": len(notes)}


# ── 5. Generate meeting minutes ───────────────────────────────────────────────


class MeetingNoteInput(BaseModel):
    note_type: str
    content: str
    raised_by: str
    timestamp: str


class GenerateMinutesRequest(BaseModel):
    notes: list[MeetingNoteInput]
    vendor_name: str
    quarter: str
    year: int


@router.post("/cycles/{cycleId}/meeting/generate-minutes")
def generate_meeting_minutes(
    cycleId: str,
    payload: GenerateMinutesRequest,
    llm: LLMService = Depends(get_llm_service),
):
    _require_llm(llm)
    if not payload.notes:
        raise HTTPException(status_code=400, detail="No meeting notes provided.")

    # Format notes for LLM
    notes_text = "\n".join(
        f"[{n.note_type}] {n.raised_by}: {n.content}"
        for n in payload.notes
    )

    system = (
        "You are a professional meeting minutes writer for executive governance reviews. "
        "Generate formal meeting minutes from captured notes. "
        "Return ONLY a valid JSON object — no markdown, no explanation. "
        "Schema: {"
        "\"executive_summary\": string, "
        "\"key_decisions\": [string, ...], "
        "\"agenda_summaries\": [{\"topic\": string, \"summary\": string}, ...], "
        "\"action_items\": [{\"description\": string, \"owner\": string, \"due_date\": string}, ...], "
        "\"attendees\": [string, ...]"
        "}. "
        "executive_summary: 2-3 sentences summarising the meeting outcomes. "
        "key_decisions: list of concrete decisions made. "
        "agenda_summaries: group notes by topic (Performance, Commercial, Risk, etc.). "
        "action_items: extract all ACTION-type items plus any commitments mentioned. "
        "attendees: extract unique names from raised_by fields. "
        "Use professional, formal language appropriate for executive governance documentation."
    )
    prompt = (
        f"Meeting: {payload.vendor_name} {payload.quarter} {payload.year} EGB/QBR Governance Review\n"
        f"Date: {datetime.now(timezone.utc).strftime('%d %B %Y')}\n\n"
        f"Captured Notes:\n{notes_text}\n\n"
        "Generate formal meeting minutes as JSON:"
    )

    try:
        raw = llm.call_simple(prompt=prompt, system=system, max_tokens=2000)
        parsed = _parse_llm_json(raw)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM parsing failed: {exc}. Raw: {raw!r}")

    minutes = {
        "minutes_id": f"min-{uuid.uuid4().hex[:8]}",
        "meeting_id": f"m-{cycleId}",
        "cycle_id": cycleId,
        "meeting_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "attendees": parsed.get("attendees", []),
        "executive_summary": parsed.get("executive_summary", ""),
        "agenda_summaries": parsed.get("agenda_summaries", []),
        "key_decisions": parsed.get("key_decisions", []),
        "qa_log": [],
        "action_items": parsed.get("action_items", []),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    return {"cycle_id": cycleId, "minutes": minutes}


# ── 5. Generate leadership brief ─────────────────────────────────────────────


class CycleTrendInput(BaseModel):
    cycle_label: str
    scores: dict  # category -> score


class RecurringIssueInput(BaseModel):
    description: str
    occurrences: int
    status: str


class GenerateLeadershipBriefRequest(BaseModel):
    vendor_id: str
    vendor_name: str
    trend_cycles: list[CycleTrendInput] = []
    recurring_issues: list[RecurringIssueInput] = []
    overall_trajectory: str = "stable"  # improving | stable | declining


@router.post("/analytics/leadership-brief")
def generate_leadership_brief(
    payload: GenerateLeadershipBriefRequest,
    llm: LLMService = Depends(get_llm_service),
):
    _require_llm(llm)

    # Format trend data
    trend_lines = []
    for cycle in payload.trend_cycles[-4:]:  # Last 4 cycles max
        scores_str = ", ".join(f"{k}: {v}" for k, v in cycle.scores.items())
        trend_lines.append(f"- {cycle.cycle_label}: {scores_str}")
    trend_text = "\n".join(trend_lines) if trend_lines else "No historical cycle data available."

    issues_text = "\n".join(
        f"- {i.description} (seen {i.occurrences}x, {i.status})"
        for i in payload.recurring_issues
    ) if payload.recurring_issues else "No recurring issues identified."

    system = (
        "You are a strategic vendor governance advisor generating an executive leadership brief. "
        "Be concise, factual, and focused on actionable insights. "
        "Return ONLY a valid JSON object — no markdown, no explanation. "
        "Schema: {"
        "\"trajectory_summary\": string, "
        "\"recurring_issues\": [string, ...], "
        "\"prior_commitments\": [string, ...], "
        "\"recommended_focus\": [string, ...]"
        "}. "
        "trajectory_summary: 2-3 sentences on performance direction and key drivers. "
        "recurring_issues: up to 4 bullet-point issues that keep appearing. "
        "prior_commitments: up to 4 commitments the vendor made in previous cycles. "
        "recommended_focus: up to 4 numbered focus areas for the upcoming review. "
        "Use executive-level language — senior leaders will read this directly."
    )
    prompt = (
        f"Vendor: {payload.vendor_name}\n"
        f"Overall Trajectory: {payload.overall_trajectory.title()}\n\n"
        f"Performance Trend (last cycles):\n{trend_text}\n\n"
        f"Known Recurring Issues:\n{issues_text}\n\n"
        "Generate leadership brief JSON:"
    )

    try:
        raw = llm.call_simple(prompt=prompt, system=system, max_tokens=1000)
        parsed = _parse_llm_json(raw)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM parsing failed: {exc}. Raw: {raw!r}")

    return {
        "brief": {
            "vendor_id": payload.vendor_id,
            "vendor_name": payload.vendor_name,
            "trajectory": payload.overall_trajectory,
            "trajectory_summary": parsed.get("trajectory_summary", ""),
            "recurring_issues": parsed.get("recurring_issues", [])[:4],
            "prior_commitments": parsed.get("prior_commitments", [])[:4],
            "recommended_focus": parsed.get("recommended_focus", [])[:4],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
    }
