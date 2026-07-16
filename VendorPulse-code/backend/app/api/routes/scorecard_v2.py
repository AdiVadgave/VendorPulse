"""
Scorecard v2 — production weighted scorecard, collected via an in-app form
(no Google Forms). Responses are submitted straight to the backend and stored
as JSON. Emails (the form link) are still sent via Gmail.

Endpoints (prefix /api/scorecard):
  GET  /structure                     the weighted structure (themes/measures/weights)
  GET  /form-meta/{cycle_id}          vendor/quarter/year + structure for the form page
  POST /submit                        store one team's scorecard submission
  GET  /team-submissions/{cycle_id}   who has submitted (key internal stakeholders)
  GET  /weighted/{cycle_id}           compiled weighted scorecard (team columns + weighted overall)
  POST /dispatch-inapp                email the in-app form link (via Gmail)
  GET  /final/{cycle_id}              the admin-adjusted (final) scorecard, if saved
  POST /final/{cycle_id}              save the admin-adjusted scorecard
  DELETE /final/{cycle_id}            reset (delete) the admin-adjusted scorecard
"""
from __future__ import annotations

import io
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Body, HTTPException, Response
from pydantic import BaseModel, Field

from app.config import settings
from app.core.workflow_engine import WORKFLOW_STATES, workflow_engine
from app.dependencies import get_attendee_repo, get_cycle_repo, get_llm_service, get_user_repo
from app.repositories.base_repository import BaseRepository
from app.services.gmail_service import GmailSendError, build_scorecard_email, send_html_email
from app.models.scheduling import ScorecardConfigUpdate
from app.services.google_auth_service import is_authenticated
from app.utils.prompts import SCORECARD_COMMENT_SUMMARY_SYSTEM_PROMPT
from app.utils.scorecard_structure import (
    SCORECARD_CATALOG,
    WEIGHTED_SCORECARD_STRUCTURE,
    build_config_from_selection,
    default_scorecard_config,
)

_RAG_VALUES = {"red", "amber", "green"}
_RAG_ORDER = {"red": 0, "amber": 1, "green": 2}


def _effective_config(cycle: dict) -> dict:
    """The cycle's scorecard config, or the default structure if unconfigured."""
    cfg = cycle.get("scorecard_config") or {}
    if cfg.get("categories"):
        return cfg
    return default_scorecard_config()


def _rag_consensus(values: list[str]) -> Optional[str]:
    """Consolidated RAG = the most conservative (worst) status provided."""
    vals = [v for v in values if v in _RAG_VALUES]
    if not vals:
        return None
    return min(vals, key=lambda v: _RAG_ORDER[v])

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scorecard", tags=["scorecard-v2"])


def _submissions_repo() -> BaseRepository:
    return BaseRepository("scorecard_submissions.json", settings.data_dir)


def _final_repo() -> BaseRepository:
    return BaseRepository("scorecard_final.json", settings.data_dir)


# ── Models ───────────────────────────────────────────────────────────────────


class ScorecardSubmission(BaseModel):
    """A team's scorecard submission. Identity is the stable attendee_id — the
    email/name/team are snapshotted server-side from the attendee record, so a
    typo'd or edited email can never mis-attribute or duplicate a submission."""

    cycle_id: str
    attendee_id: str
    scores: dict[str, int] = Field(default_factory=dict, description="measure_key -> 1..5 (numeric measures)")
    rag_scores: dict[str, str] = Field(default_factory=dict, description="measure_key -> red|amber|green (RAG measures)")
    comments: dict[str, str] = Field(default_factory=dict, description="measure_key -> comment")
    skipped_measures: list[str] = Field(default_factory=list)
    skipped_themes: list[str] = Field(default_factory=list)


class InAppDispatchRecipient(BaseModel):
    attendee_id: str
    name: str
    email: str
    team: str = ""


class InAppDispatchRequest(BaseModel):
    cycle_id: str
    vendor_name: str
    quarter: str
    year: int
    form_base_url: str = Field(..., description="Frontend origin, e.g. http://localhost:5173")
    recipients: list[InAppDispatchRecipient] = Field(..., min_length=1)


# ── Structure / form meta ────────────────────────────────────────────────────


@router.get("/structure")
def get_structure():
    return {"structure": WEIGHTED_SCORECARD_STRUCTURE}


# ── Per-SPR configuration (catalog + selection) ──────────────────────────────


@router.get("/catalog")
def get_catalog():
    """The full menu of themes/measures a VMO can choose from for a scorecard."""
    return {"catalog": SCORECARD_CATALOG}


@router.get("/config/{cycle_id}")
def get_scorecard_config(cycle_id: str):
    """The effective scorecard configuration for a cycle (measures + weights)."""
    cycle = get_cycle_repo().get_by_cycle_id(cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycle_id}' not found")
    cfg = _effective_config(cycle)
    return {"cycle_id": cycle_id, "config": cfg, "configured": bool(cfg.get("configured"))}


@router.put("/config/{cycle_id}")
def save_scorecard_config(cycle_id: str, payload: ScorecardConfigUpdate):
    """Save the VMO's scorecard selection (measures + per-theme weights).

    Weights of the *included* themes must sum to 100. Labels/descriptions/types
    are resolved authoritatively from the catalog."""
    cycle_repo = get_cycle_repo()
    cycle = cycle_repo.get_by_cycle_id(cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycle_id}' not found")

    cfg = build_config_from_selection(payload.selected_measure_keys, payload.weights)
    if not cfg["categories"]:
        raise HTTPException(status_code=400, detail="Select at least one measure to include in the scorecard.")

    total = sum(c["weight"] for c in cfg["categories"])
    if total != 100:
        raise HTTPException(
            status_code=400,
            detail=f"Theme weights must sum to 100 (got {total}). Adjust the per-theme weights.",
        )
    if any(c["weight"] <= 0 for c in cfg["categories"]):
        raise HTTPException(status_code=400, detail="Each included theme must have a weight greater than 0.")

    now = datetime.now(timezone.utc).isoformat()
    updated = cycle_repo.update_by_id("cycle_id", cycle_id, {"scorecard_config": cfg, "updated_at": now})
    logger.info("save_scorecard_config — cycle=%s themes=%d measures=%d",
                cycle_id, len(cfg["categories"]), sum(len(c["measures"]) for c in cfg["categories"]))
    return {"cycle_id": cycle_id, "config": cfg, "cycle": updated}


@router.get("/form-meta/{cycle_id}")
def get_form_meta(cycle_id: str, attendee: str = ""):
    cycle = get_cycle_repo().get_by_cycle_id(cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycle_id}' not found")

    respondent = None
    if attendee:
        att = get_attendee_repo().find_by_id("attendee_id", attendee)
        if att and att.get("cycle_id") == cycle_id:
            respondent = {
                "attendee_id": att.get("attendee_id"),
                "name": att.get("name", ""),
                "email": att.get("email", ""),
                "team": att.get("shell_department") or att.get("name", ""),
            }

    return {
        "cycle_id": cycle_id,
        "vendor_name": cycle.get("vendor_name", ""),
        "cycle_type": cycle.get("cycle_type", "SPR"),
        "quarter": cycle.get("quarter", ""),
        "year": cycle.get("year"),
        "structure": _effective_config(cycle)["categories"],
        "respondent": respondent,
    }


# ── Submit ───────────────────────────────────────────────────────────────────


def _get_cycle_attendee(cycle_id: str, attendee_id: str) -> dict | None:
    att = get_attendee_repo().find_by_id("attendee_id", attendee_id)
    if att and att.get("cycle_id") == cycle_id:
        return att
    return None


@router.post("/submit")
def submit_scorecard(payload: ScorecardSubmission):
    """Store one team's scorecard submission, keyed by the stable attendee_id."""
    cycle_repo = get_cycle_repo()
    cycle = cycle_repo.get_by_cycle_id(payload.cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail=f"Cycle '{payload.cycle_id}' not found")

    att = _get_cycle_attendee(payload.cycle_id, payload.attendee_id)
    if att is None:
        raise HTTPException(status_code=404, detail="Attendee not found in this cycle")

    # Validate provided numeric scores are 1..5.
    for mkey, val in payload.scores.items():
        if not isinstance(val, int) or not (1 <= val <= 5):
            raise HTTPException(status_code=400, detail=f"Score for '{mkey}' must be an integer 1..5")
    # Validate RAG statuses.
    for mkey, val in payload.rag_scores.items():
        if val not in _RAG_VALUES:
            raise HTTPException(status_code=400, detail=f"RAG status for '{mkey}' must be red, amber or green")

    now = datetime.now(timezone.utc).isoformat()
    repo = _submissions_repo()
    existing = next(
        (r for r in repo.find_all()
         if r.get("cycle_id") == payload.cycle_id and r.get("attendee_id") == payload.attendee_id),
        None,
    )
    # One submission per attendee per cycle — a reviewer cannot fill it twice.
    if existing:
        raise HTTPException(
            status_code=409,
            detail="A scorecard has already been submitted for this reviewer in this cycle.",
        )

    # Snapshot identity from the attendee record (authoritative — never trust the client).
    record = {
        "submission_id": f"sub_{uuid.uuid4().hex[:8]}",
        "cycle_id": payload.cycle_id,
        "attendee_id": payload.attendee_id,
        "respondent_email": (att.get("email") or "").lower(),
        "respondent_name": att.get("name", ""),
        "team": att.get("shell_department") or att.get("name", ""),
        "scores": payload.scores,
        "rag_scores": payload.rag_scores,
        "comments": payload.comments,
        "skipped_measures": payload.skipped_measures,
        "skipped_themes": payload.skipped_themes,
        "submitted_at": now,
    }
    repo.insert(record)

    # Advance workflow SCORECARD_REQUEST_SENT -> SCORECARD_COLLECTION on first submission.
    try:
        if workflow_engine.can_transition(cycle.get("workflow_state", ""), "SCORECARD_COLLECTION"):
            workflow_engine.advance(cycle, cycle_repo, now)
    except Exception as exc:  # best-effort
        logger.warning("submit_scorecard: workflow advance skipped: %s", exc)

    logger.info("scorecard submit — cycle=%s attendee=%s scores=%d", payload.cycle_id, payload.attendee_id, len(payload.scores))
    return {"status": "submitted", "submission_id": record["submission_id"], "submitted_at": now}


@router.get("/submitted-check/{cycle_id}")
def submitted_check(cycle_id: str, attendee: str = ""):
    """Return whether the given attendee has already submitted for this cycle."""
    if not attendee:
        return {"submitted": False}
    found = any(
        s.get("cycle_id") == cycle_id and s.get("attendee_id") == attendee
        for s in _submissions_repo().find_all()
    )
    return {"submitted": found}


# ── Submission tracker ───────────────────────────────────────────────────────


@router.get("/team-submissions/{cycle_id}")
def get_team_submissions(cycle_id: str):
    """Tracker of key internal-stakeholder teams and whether each has submitted."""
    attendee_repo = get_attendee_repo()
    attendees = [a for a in attendee_repo.find_all() if a.get("cycle_id") == cycle_id]
    key_internal = [
        a for a in attendees
        if a.get("is_key") and a.get("type", "Internal Stakeholder") == "Internal Stakeholder"
    ]

    submissions = [s for s in _submissions_repo().find_all() if s.get("cycle_id") == cycle_id]
    # Submissions are keyed by the stable attendee_id — no fragile email matching.
    subs_by_attendee = {s.get("attendee_id"): s for s in submissions if s.get("attendee_id")}

    tracker = []
    for att in key_internal:
        aid = att.get("attendee_id")
        sub = subs_by_attendee.get(aid)
        tracker.append({
            "attendee_id": aid,
            "name": att.get("name"),
            "email": att.get("email"),
            "team": att.get("shell_department") or att.get("name"),
            "submitted": sub is not None,
            "submitted_at": sub.get("submitted_at") if sub else None,
        })

    submitted = sum(1 for t in tracker if t["submitted"])
    return {
        "cycle_id": cycle_id,
        "total": len(tracker),
        "submitted": submitted,
        "pending": len(tracker) - submitted,
        "tracker": tracker,
    }


@router.delete("/submission/{cycle_id}/{attendee_id}")
def delete_submission(cycle_id: str, attendee_id: str):
    """Delete an attendee's scorecard submission for this cycle.

    Lets the VMO re-open a scorecard at any time (e.g. it was filled in error, or the
    attendee should redo it) — after deletion the `/submit` duplicate guard no longer
    fires, so that attendee can submit again. Consolidated figures recompute from the
    remaining submissions. Returns {deleted, attendee_id}."""
    repo = _submissions_repo()
    matches = [
        s for s in repo.find_all()
        if s.get("cycle_id") == cycle_id and s.get("attendee_id") == attendee_id
    ]
    if not matches:
        raise HTTPException(status_code=404, detail="No submission found for this attendee")
    for s in matches:
        repo.delete_by_id("submission_id", s.get("submission_id"))
    logger.info("SCORECARD: deleted %d submission(s) for attendee=%s cycle=%s", len(matches), attendee_id, cycle_id)
    return {"deleted": True, "attendee_id": attendee_id, "count": len(matches)}


# ── Weighted compiled scorecard ──────────────────────────────────────────────


def _compile_weighted(cycle_id: str) -> dict:
    cycle = get_cycle_repo().get_by_cycle_id(cycle_id)
    config = _effective_config(cycle) if cycle else default_scorecard_config()

    attendee_repo = get_attendee_repo()
    attendees = [a for a in attendee_repo.find_all() if a.get("cycle_id") == cycle_id]
    key_internal = [
        a for a in attendees
        if a.get("is_key") and a.get("type", "Internal Stakeholder") == "Internal Stakeholder"
    ]

    all_submissions = [s for s in _submissions_repo().find_all() if s.get("cycle_id") == cycle_id]
    subs_by_attendee = {s.get("attendee_id"): s for s in all_submissions if s.get("attendee_id")}

    # Columns = key internal attendees who have submitted (stable attendee_id).
    # Order follows the attendee list for a consistent, predictable layout.
    submitting = [a for a in key_internal if a.get("attendee_id") in subs_by_attendee]
    teams = [
        {
            "attendee_id": a.get("attendee_id"),
            "email": (a.get("email") or "").lower(),
            "name": a.get("name", ""),
            "team": a.get("shell_department") or a.get("name", ""),
        }
        for a in submitting
    ]

    categories = []
    weighted_num = 0.0
    weighted_den = 0.0

    for cat in config["categories"]:
        measures_out = []
        measure_avgs: list[float] = []
        for m in cat["measures"]:
            mkey = m["key"]
            measure_type = m.get("measure_type", "numeric")
            team_scores: dict[str, Optional[int]] = {}
            team_rag: dict[str, Optional[str]] = {}
            comments: dict[str, str] = {}
            provided: list[int] = []
            rag_values: list[str] = []
            for a in submitting:
                aid = a.get("attendee_id")
                s = subs_by_attendee[aid]
                if measure_type == "rag":
                    rag = (s.get("rag_scores") or {}).get(mkey)
                    if rag in _RAG_VALUES:
                        team_rag[aid] = rag
                        rag_values.append(rag)
                    else:
                        team_rag[aid] = None
                    team_scores[aid] = None
                else:
                    score = (s.get("scores") or {}).get(mkey)
                    if isinstance(score, int) and 1 <= score <= 5:
                        team_scores[aid] = score
                        provided.append(score)
                    else:
                        team_scores[aid] = None
                comment = (s.get("comments") or {}).get(mkey)
                if comment:
                    comments[aid] = comment

            # RAG measures are collected and displayed but never averaged.
            avg = round(sum(provided) / len(provided), 2) if provided else None
            if measure_type != "rag" and avg is not None:
                measure_avgs.append(avg)

            measures_out.append({
                "key": mkey,
                "label": m["label"],
                "description": m.get("description", ""),
                "measure_type": measure_type,
                "team_scores": team_scores,
                "team_rag": team_rag,
                "rag_consensus": _rag_consensus(rag_values) if measure_type == "rag" else None,
                "average": avg,
                "comments": comments,
            })

        cat_avg = round(sum(measure_avgs) / len(measure_avgs), 2) if measure_avgs else None
        if cat_avg is not None:
            weighted_num += cat_avg * cat["weight"]
            weighted_den += cat["weight"]

        categories.append({
            "key": cat["key"],
            "label": cat["label"],
            "weight": cat["weight"],
            "measures": measures_out,
            "category_average": cat_avg,
        })

    overall = round(weighted_num / weighted_den, 2) if weighted_den else None

    return {
        "cycle_id": cycle_id,
        "teams": teams,
        "categories": categories,
        "overall_score": overall,
        "submitted_count": len(teams),
    }


@router.get("/weighted/{cycle_id}")
def get_weighted_scorecard(cycle_id: str):
    return _compile_weighted(cycle_id)


# ── Cross-cycle context (current + previous cycle, for LLM narration) ─────────


_QUARTER_NUM = {"Q1": 1, "Q2": 2, "Q3": 3, "Q4": 4}


def _cycle_sort_key(cycle: dict) -> tuple[int, int]:
    try:
        year = int(cycle.get("year") or 0)
    except (TypeError, ValueError):
        year = 0  # tolerate a non-numeric year rather than 500 the whole request
    return (year, _QUARTER_NUM.get(cycle.get("quarter", ""), 0))


def find_previous_cycle_id(cycle_id: str) -> Optional[str]:
    """The most recent prior cycle for the SAME vendor (by year, then quarter),
    strictly before this cycle and carrying at least one scorecard submission.
    Returns None when there is no such cycle (first cycle for the vendor)."""
    cycle = get_cycle_repo().get_by_cycle_id(cycle_id)
    if not cycle:
        return None
    cur_key = _cycle_sort_key(cycle)
    siblings = [
        c for c in get_cycle_repo().find_all()
        if c.get("vendor_id") == cycle.get("vendor_id")
        and c.get("cycle_id") != cycle_id
        and _cycle_sort_key(c) < cur_key
    ]
    siblings.sort(key=_cycle_sort_key, reverse=True)
    for c in siblings:
        # Only use a prior cycle that actually has consolidated data to compare against.
        if _compile_weighted(c["cycle_id"]).get("submitted_count"):
            return c["cycle_id"]
    return None


def _compact_scorecard(weighted: dict, cycle: Optional[dict]) -> dict:
    """A compact, LLM-friendly view of a compiled weighted scorecard: per-theme and
    per-measure consolidated scores, RAG consensus and the raw team comments."""
    cats = []
    for cat in weighted.get("categories", []):
        measures = []
        for m in cat.get("measures", []):
            comments = [c.strip() for c in (m.get("comments") or {}).values() if (c or "").strip()]
            measures.append({
                "measure": m["label"],
                "type": m.get("measure_type", "numeric"),
                "consolidated_score": m.get("average"),
                "rag": m.get("rag_consensus"),
                "comments": comments,
            })
        cats.append({
            "theme": cat["label"],
            "weight": cat.get("weight"),
            "consolidated_score": cat.get("category_average"),
            "measures": measures,
        })
    label = ""
    if cycle:
        label = f"{cycle.get('quarter', '')} {cycle.get('year', '')}".strip()
    return {
        "label": label or weighted.get("cycle_id", ""),
        "overall_score": weighted.get("overall_score"),
        "team_count": weighted.get("submitted_count"),
        "categories": cats,
    }


def compact_scorecard_context(cycle_id: str) -> dict:
    """Current + previous cycle scorecards (compact, with comments) for cross-cycle
    LLM narration. `previous` is None when this is the vendor's first cycle."""
    cycle = get_cycle_repo().get_by_cycle_id(cycle_id)
    current = _compact_scorecard(_compile_weighted(cycle_id), cycle)
    prev_id = find_previous_cycle_id(cycle_id)
    previous = None
    if prev_id:
        prev_cycle = get_cycle_repo().get_by_cycle_id(prev_id)
        previous = _compact_scorecard(_compile_weighted(prev_id), prev_cycle)
    return {"current": current, "previous": previous}


# Score band used across the pre-meeting briefing / insights (1–5 scale).
_LOW_SCORE = 3.0
_TREND_DELTA = 0.25  # min overall/theme movement to call a trend (not noise)


@router.get("/briefing/{cycle_id}")
def scorecard_briefing(cycle_id: str):
    """Pre-meeting trend briefing — computed live from THIS cycle's consolidated
    scorecard and the previous cycle's (both from stored submissions; nothing here
    is hardcoded). Powers the meeting tab's briefing card."""
    ctx = compact_scorecard_context(cycle_id)
    cur, prev = ctx["current"], ctx["previous"]

    cur_themes = {
        c["theme"]: c["consolidated_score"]
        for c in cur.get("categories", []) if c.get("consolidated_score") is not None
    }
    prev_themes = {
        c["theme"]: c["consolidated_score"]
        for c in (prev.get("categories", []) if prev else []) if c.get("consolidated_score") is not None
    }
    overall = cur.get("overall_score")
    prev_overall = prev.get("overall_score") if prev else None

    # Trend of the overall consolidated score vs the previous cycle.
    trend = "stable"
    if overall is not None and prev_overall is not None:
        d = overall - prev_overall
        trend = "improving" if d >= _TREND_DELTA else "declining" if d <= -_TREND_DELTA else "stable"

    # Per-theme movement (only where both cycles have a score).
    deltas = {t: round(s - prev_themes[t], 2) for t, s in cur_themes.items() if t in prev_themes}
    most_improved = None
    most_concerning = None
    if deltas:
        mi_theme, mi_delta = max(deltas.items(), key=lambda kv: kv[1])
        mc_theme, mc_delta = min(deltas.items(), key=lambda kv: kv[1])
        if mi_delta > 0:
            most_improved = mi_theme
        if mc_delta < 0:
            most_concerning = mc_theme
    # Fallback for "most concerning": the lowest-scoring theme this cycle.
    if most_concerning is None and cur_themes:
        most_concerning = min(cur_themes.items(), key=lambda kv: kv[1])[0]

    # Recurring issues: themes below target in BOTH cycles (or just this one if no prior).
    if prev_themes:
        recurring = [t for t, s in cur_themes.items() if s < _LOW_SCORE and prev_themes.get(t, 5) < _LOW_SCORE]
    else:
        recurring = [t for t, s in cur_themes.items() if s < _LOW_SCORE]

    # Likely vendor challenge areas: lowest / declining themes (real, max 3).
    challenges = [
        t for t, s in sorted(cur_themes.items(), key=lambda kv: kv[1])
        if s < _LOW_SCORE or deltas.get(t, 0) <= -0.5
    ][:3]

    return {
        "cycle_id": cycle_id,
        "overall_score": overall,
        "trend": trend,
        "most_improved": most_improved,
        "most_concerning": most_concerning,
        "recurring_issue_count": len(recurring),
        "predicted_challenges": challenges,
        "has_previous_cycle": prev is not None,
        "team_count": cur.get("team_count") or 0,
    }


# ── Consolidated comment summary (LLM-narrated, deterministic fallback) ───────


def _strip_markdown_json(text: str) -> str:
    """Pull a JSON array/object out of an LLM response that may wrap it in fences."""
    import re
    m = re.search(r"```(?:json)?\s*\n(.*?)```", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    m = re.search(r"(\[.*\]|\{.*\})", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    return text.strip()


def _collect_comments(weighted: dict) -> tuple[list[dict], int]:
    """Per-measure comments (only measures that have any). Returns (measures, total).

    Each item: {measure_key, theme, measure, entries:[{team, comment}]}."""
    team_name = {
        t["attendee_id"]: (t.get("team") or t.get("name") or t.get("email") or "Team")
        for t in weighted.get("teams", [])
    }
    measures: list[dict] = []
    total = 0
    for cat in weighted.get("categories", []):
        for m in cat.get("measures", []):
            entries = [
                {"team": team_name.get(aid, aid), "comment": txt.strip()}
                for aid, txt in (m.get("comments") or {}).items()
                if (txt or "").strip()
            ]
            if entries:
                measures.append({
                    "measure_key": m["key"],
                    "theme": cat["label"],
                    "measure": m["label"],
                    "entries": entries,
                })
                total += len(entries)
    return measures, total


def _fallback_measure_summary(entries: list[dict]) -> str:
    """Deterministic per-measure bullets (the raw comments) when the LLM is off."""
    return "\n".join(f"- {e['team']}: {e['comment']}" for e in entries)


def _compute_summaries(weighted: dict) -> tuple[dict[str, str], bool, list[dict], int]:
    """Per-measure comment summaries. Returns (summaries, llm_used, collected, total).

    Shared by the comment-summary endpoint and the Excel export so both stay in
    sync. Deterministic baseline = the raw comments; the LLM (when enabled) turns
    each measure's comments into point-wise bullets."""
    collected, total = _collect_comments(weighted)
    summaries: dict[str, str] = {c["measure_key"]: _fallback_measure_summary(c["entries"]) for c in collected}
    llm_used = False
    if total:
        llm = get_llm_service() if settings.enable_llm else None
        if llm and llm.is_enabled:
            payload = [
                {"measure_key": c["measure_key"], "measure": c["measure"], "theme": c["theme"], "comments": c["entries"]}
                for c in collected
            ]
            prompt = (
                "Summarise the following scorecard comments PER MEASURE. Each measure lists "
                "the comments from Shell's internal teams, labelled by team.\n\n"
                f"{json.dumps(payload, indent=2, ensure_ascii=False)}\n\n"
                "Return the JSON array now, exactly as specified — one summary per measure_key."
            )
            try:
                raw = llm.call_simple(prompt, system=SCORECARD_COMMENT_SUMMARY_SYSTEM_PROMPT, max_tokens=1200)
                parsed = json.loads(_strip_markdown_json(raw))
                if isinstance(parsed, list):
                    for item in parsed:
                        if isinstance(item, dict):
                            mk, sm = item.get("measure_key"), item.get("summary")
                            if mk in summaries and isinstance(sm, str) and sm.strip():
                                summaries[mk] = sm.strip()
                    llm_used = True
            except Exception as exc:  # keep the raw-comment fallback on parse/LLM error
                logger.warning("comment-summary: LLM failed, using raw-comment fallback: %s", exc)
    return summaries, llm_used, collected, total


@router.post("/comment-summary/{cycle_id}")
def scorecard_comment_summary(cycle_id: str):
    """Per-measure summary of the teams' scorecard comments for the consolidated view.

    Uses the same LLM wiring as the Alignment / Vendor Prep modules
    (ENABLE_LLM + get_llm_service). Falls back to the raw comments per measure when
    the LLM is disabled or errors."""
    weighted = _compile_weighted(cycle_id)
    summaries, llm_used, collected, total = _compute_summaries(weighted)
    team_count = len(weighted.get("teams", []))
    now = datetime.now(timezone.utc).isoformat()

    measures_out = [
        {
            "measure_key": c["measure_key"],
            "theme": c["theme"],
            "measure": c["measure"],
            "comment_count": len(c["entries"]),
            "summary": summaries[c["measure_key"]],
        }
        for c in collected
    ]

    logger.info("comment-summary — cycle=%s comments=%d teams=%d measures=%d llm=%s",
                cycle_id, total, team_count, len(measures_out), llm_used)
    return {
        "cycle_id": cycle_id,
        "measures": measures_out,
        "comment_count": total,
        "team_count": team_count,
        "llm_used": llm_used,
        "generated_at": now,
    }


# ── Excel export (two sheets: team-comments + AI-summary, both with the scorecard) ──
# Written with the standard library only (zip + minimal OOXML) so the export never
# depends on a third-party package (e.g. openpyxl) being present in the runtime.


def _xl_col(n: int) -> str:
    """1-based column index -> Excel column letters (1->A, 27->AA)."""
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def _xl_esc(v: str) -> str:
    return v.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _xl_cell(ref: str, value, style: Optional[int] = None) -> str:
    s = f' s="{style}"' if style is not None else ""
    if value is None or value == "":
        return f'<c r="{ref}"{s}/>'
    if isinstance(value, bool):
        value = str(value)
    if isinstance(value, (int, float)):
        return f'<c r="{ref}"{s}><v>{value}</v></c>'
    return f'<c r="{ref}"{s} t="inlineStr"><is><t xml:space="preserve">{_xl_esc(str(value))}</t></is></c>'


def _xl_sheet(rows: list[list], col_widths: list, wrap_cols: set[int]) -> str:
    HEADER_STYLE, WRAP_STYLE = 1, 2
    cols = ""
    width_parts = [
        f'<col min="{i}" max="{i}" width="{w}" customWidth="1"/>'
        for i, w in enumerate(col_widths, start=1) if w
    ]
    if width_parts:
        cols = "<cols>" + "".join(width_parts) + "</cols>"
    body = []
    for r_idx, row in enumerate(rows, start=1):
        cells = []
        for c_idx, val in enumerate(row, start=1):
            style = HEADER_STYLE if r_idx == 1 else (WRAP_STYLE if c_idx in wrap_cols else None)
            cells.append(_xl_cell(f"{_xl_col(c_idx)}{r_idx}", val, style))
        body.append(f'<row r="{r_idx}">' + "".join(cells) + "</row>")
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + cols
        + "<sheetData>" + "".join(body) + "</sheetData>"
        + "</worksheet>"
    )


_XL_STYLES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
    '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
    '<fills count="2"><fill><patternFill patternType="none"/></fill>'
    '<fill><patternFill patternType="gray125"/></fill></fills>'
    '<borders count="1"><border/></borders>'
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    '<cellXfs count="3">'
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">'
    '<alignment wrapText="1" vertical="top"/></xf>'
    '</cellXfs>'
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    '</styleSheet>'
)


def _build_xlsx(sheets: list[dict]) -> bytes:
    """sheets: [{name, rows, col_widths, wrap_cols}] -> .xlsx bytes (stdlib only)."""
    import zipfile

    content_types = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    ]
    for i in range(len(sheets)):
        content_types.append(
            f'<Override PartName="/xl/worksheets/sheet{i + 1}.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        )
    content_types.append("</Types>")

    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        '</Relationships>'
    )

    sheet_tags = "".join(
        f'<sheet name="{_xl_esc(s["name"])[:31]}" sheetId="{i + 1}" r:id="rId{i + 1}"/>'
        for i, s in enumerate(sheets)
    )
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets>{sheet_tags}</sheets></workbook>'
    )

    rels = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">']
    for i in range(len(sheets)):
        rels.append(
            f'<Relationship Id="rId{i + 1}" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
            f'Target="worksheets/sheet{i + 1}.xml"/>'
        )
    rels.append(
        f'<Relationship Id="rId{len(sheets) + 1}" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    )
    rels.append("</Relationships>")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", "".join(content_types))
        z.writestr("_rels/.rels", root_rels)
        z.writestr("xl/workbook.xml", workbook)
        z.writestr("xl/_rels/workbook.xml.rels", "".join(rels))
        z.writestr("xl/styles.xml", _XL_STYLES)
        for i, s in enumerate(sheets):
            z.writestr(
                f"xl/worksheets/sheet{i + 1}.xml",
                _xl_sheet(s["rows"], s.get("col_widths", []), s.get("wrap_cols", set())),
            )
    return buf.getvalue()


def _scorecard_workbook(cycle_id: str) -> bytes:
    """Build a two-sheet .xlsx: (1) scorecard + team-wise comments, (2) scorecard
    + per-measure AI summary. Both share the consolidated score matrix."""
    weighted = _compile_weighted(cycle_id)
    summaries, _llm_used, _collected, _total = _compute_summaries(weighted)
    teams = weighted.get("teams", [])
    team_ids = [t.get("attendee_id") for t in teams]
    team_labels = [(t.get("team") or t.get("name") or t.get("email") or "Team") for t in teams]
    n_teams = len(teams)

    def score_cell(m: dict, aid: str):
        if m.get("measure_type") == "rag":
            v = (m.get("team_rag") or {}).get(aid)
            return v.capitalize() if v else ""
        v = (m.get("team_scores") or {}).get(aid)
        return v if isinstance(v, (int, float)) else ""

    def avg_cell(m: dict):
        if m.get("measure_type") == "rag":
            c = m.get("rag_consensus")
            return c.capitalize() if c else ""
        return m.get("average") if m.get("average") is not None else ""

    def cat_avg_cell(cat: dict):
        return cat.get("category_average") if cat.get("category_average") is not None else ""

    base_widths = [22, 30, *([14] * n_teams), 11, 11, 11]

    # Sheet 1 — scorecard + team-wise comments.
    rows1 = [["Theme", "Measure", *team_labels, "Avg", "Cat Avg", "Weight %",
              *[f"{lbl} — comment" for lbl in team_labels]]]
    for cat in weighted["categories"]:
        for m in cat["measures"]:
            rows1.append([
                cat["label"], m["label"],
                *[score_cell(m, aid) for aid in team_ids],
                avg_cell(m), cat_avg_cell(cat), cat.get("weight"),
                *[(m.get("comments") or {}).get(aid, "") for aid in team_ids],
            ])
    rows1.append([])
    rows1.append(["Overall (weighted average of theme averages)", "",
                  *([""] * n_teams), weighted.get("overall_score")])
    comment_cols = set(range(6 + n_teams, 6 + 2 * n_teams))  # 1-based comment columns
    sheet1 = {
        "name": "Scorecard & Comments",
        "rows": rows1,
        "col_widths": [*base_widths, *([55] * n_teams)],
        "wrap_cols": comment_cols,
    }

    # Sheet 2 — scorecard + per-measure AI summary.
    rows2 = [["Theme", "Measure", *team_labels, "Avg", "Cat Avg", "Weight %", "AI Summary"]]
    for cat in weighted["categories"]:
        for m in cat["measures"]:
            rows2.append([
                cat["label"], m["label"],
                *[score_cell(m, aid) for aid in team_ids],
                avg_cell(m), cat_avg_cell(cat), cat.get("weight"),
                summaries.get(m["key"], ""),
            ])
    rows2.append([])
    rows2.append(["Overall (weighted average of theme averages)", "",
                  *([""] * n_teams), weighted.get("overall_score")])
    summary_col = 6 + n_teams  # 1-based AI Summary column
    sheet2 = {
        "name": "Scorecard & AI Summary",
        "rows": rows2,
        "col_widths": [*base_widths, 70],
        "wrap_cols": {summary_col},
    }

    return _build_xlsx([sheet1, sheet2])


@router.get("/export/{cycle_id}")
def export_scorecard(cycle_id: str):
    """Download the consolidated scorecard as a two-sheet Excel workbook."""
    cycle = get_cycle_repo().get_by_cycle_id(cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycle_id}' not found")

    data = _scorecard_workbook(cycle_id)
    vendor = (cycle.get("vendor_name") or "vendor").replace(" ", "_")
    fname = f"SPR_Scorecard_{vendor}_{cycle.get('quarter', '')}_{cycle.get('year', '')}.xlsx"
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


def weighted_as_compiled(cycle_id: str) -> dict:
    """Adapt the weighted (internal-only) scorecard into the legacy compiled
    shape that the downstream agents (Vendor Prep, etc.) consume.

    There is no vendor self-report anymore — scorecards are collected from
    internal-stakeholder teams only — so vendor_* fields are null/0 and the
    'internal' figures carry the consolidated team assessment.
    """
    w = _compile_weighted(cycle_id)
    categories = []
    for cat in w["categories"]:
        params = [
            {
                "parameter_key": m["key"],
                "parameter_label": m["label"],
                "internal_avg": m["average"],
                "vendor_avg": None,
                "internal_count": sum(1 for v in m["team_scores"].values() if v is not None),
                "vendor_count": 0,
            }
            for m in cat["measures"]
            if m.get("measure_type", "numeric") != "rag"
        ]
        categories.append({
            "category": cat["key"],
            "category_label": cat["label"],
            "internal_avg": cat["category_average"],
            "vendor_avg": None,
            "parameters": params,
        })

    comments: dict[str, dict] = {}
    for cat in w["categories"]:
        texts = [
            f"{m['label']}: {c}"
            for m in cat["measures"]
            for c in m["comments"].values()
            if c
        ]
        if texts:
            comments[cat["key"]] = {"internal": texts, "vendor": []}

    return {
        "cycle_id": cycle_id,
        "internal_respondents": w["submitted_count"],
        "vendor_respondents": 0,
        "overall_internal_avg": w["overall_score"],
        "overall_vendor_avg": None,
        "categories": categories,
        "comments": comments,
        "key_recommendations": [],
    }


# ── In-app dispatch (Gmail sends the form link) ──────────────────────────────


@router.post("/dispatch-inapp")
def dispatch_inapp(payload: InAppDispatchRequest):
    """Email the in-app scorecard form link to each recipient via Gmail.

    Recipient emails are used exactly as provided (editable), so a tester can
    send several links to their own inbox.
    """
    if not is_authenticated():
        raise HTTPException(
            status_code=401,
            detail="Google account not connected (Gmail send). Visit /auth/google to authenticate.",
        )

    cycle_repo = get_cycle_repo()
    cycle = cycle_repo.get_by_cycle_id(payload.cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail=f"Cycle '{payload.cycle_id}' not found")

    base = payload.form_base_url.rstrip("/")
    results = []
    sent = 0
    for r in payload.recipients:
        email = r.email.strip()
        if not email or not r.attendee_id:
            continue
        link = f"{base}/scorecard?cycle={payload.cycle_id}&attendee={r.attendee_id}"
        email_data = build_scorecard_email(
            attendee_name=r.name,
            attendee_email=email,
            vendor_name=payload.vendor_name,
            cycle_id=payload.cycle_id,
            quarter=payload.quarter,
            year=payload.year,
            form_url=link,
        )
        try:
            res = send_html_email(
                to_email=email,
                subject=email_data["subject"],
                html_body=email_data["html_body"],
                text_body=email_data["text_body"],
            )
            results.append({"name": r.name, "email": email, "status": "sent", "message_id": res.get("id")})
            sent += 1
        except GmailSendError as exc:
            results.append({"name": r.name, "email": email, "status": "failed", "error": str(exc)})

    if sent > 0:
        now = datetime.now(timezone.utc).isoformat()
        cycle_repo.mark_scorecard_dispatched(payload.cycle_id, now, [r["email"] for r in results if r["status"] == "sent"])
        try:
            ws_idx = WORKFLOW_STATES.index(cycle.get("workflow_state", ""))
            if ws_idx < WORKFLOW_STATES.index("SCORECARD_REQUEST_SENT"):
                workflow_engine.transition_to(cycle, "SCORECARD_REQUEST_SENT", cycle_repo, now)
        except Exception as exc:
            logger.warning("dispatch-inapp: workflow advance failed: %s", exc)

    return {"total": len(payload.recipients), "sent": sent, "failed": len(payload.recipients) - sent, "results": results}


# ── Final (admin-adjusted) scorecard ─────────────────────────────────────────


@router.get("/final/{cycle_id}")
def get_final_scorecard(cycle_id: str):
    rec = _final_repo().find_by_id("cycle_id", cycle_id)
    return {"cycle_id": cycle_id, "final": rec}


@router.post("/final/{cycle_id}")
def save_final_scorecard(cycle_id: str, payload: dict = Body(...)):
    """Save the admin-adjusted (final) scorecard. Overwrites any prior copy."""
    now = datetime.now(timezone.utc).isoformat()
    repo = _final_repo()
    record = {
        "cycle_id": cycle_id,
        "categories": payload.get("categories", []),
        "overall_score": payload.get("overall_score"),
        "note": payload.get("note", ""),
        "updated_at": now,
    }
    if repo.find_by_id("cycle_id", cycle_id):
        repo.replace_by_id("cycle_id", cycle_id, record)
    else:
        repo.insert(record)
    return {"status": "saved", "final": record}


@router.delete("/final/{cycle_id}")
def reset_final_scorecard(cycle_id: str):
    """Reset (delete) the admin-adjusted scorecard so it reverts to consolidated."""
    _final_repo().delete_by_id("cycle_id", cycle_id)
    return {"status": "reset", "cycle_id": cycle_id}
