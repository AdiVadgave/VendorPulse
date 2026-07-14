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

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.core.workflow_engine import WORKFLOW_STATES, workflow_engine
from app.dependencies import get_attendee_repo, get_cycle_repo, get_user_repo
from app.repositories.base_repository import BaseRepository
from app.services.gmail_service import GmailSendError, build_scorecard_email, send_html_email
from app.models.scheduling import ScorecardConfigUpdate
from app.services.google_auth_service import is_authenticated
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
