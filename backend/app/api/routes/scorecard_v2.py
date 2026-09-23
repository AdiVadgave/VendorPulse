"""
Scorecard v2 — production weighted scorecard, collected via an in-app form
(no Google Forms). Responses are submitted straight to the backend and stored
as JSON. Emails (the form link) are sent via the service mailbox (Microsoft Graph).

Endpoints (prefix /api/scorecard):
  GET  /structure                     the weighted structure (themes/measures/weights)
  GET  /form-meta/{cycle_id}          vendor/quarter/year + structure for the form page
  POST /submit                        store one team's scorecard submission
  GET  /team-submissions/{cycle_id}   who has submitted (key internal stakeholders)
  GET  /weighted/{cycle_id}           compiled weighted scorecard (team columns + weighted overall)
  POST /dispatch-inapp                email the in-app form link (via Outlook)
  GET  /final/{cycle_id}              the admin-adjusted (final) scorecard, if saved
  POST /final/{cycle_id}              save the admin-adjusted scorecard
  DELETE /final/{cycle_id}            reset (delete) the admin-adjusted scorecard
"""
from __future__ import annotations

import io
import json
import logging
import uuid
from datetime import datetime, timezone, timedelta
from html import escape as html_escape
from typing import Optional


def _clean_subject(s: str) -> str:
    """Collapse CR/LF in a subject line (defensive — Graph sendMail is JSON, but keep
    subjects single-line regardless of edited/token-substituted input)."""
    return s.replace("\r", " ").replace("\n", " ").strip()

from fastapi import APIRouter, Body, HTTPException, Response
from pydantic import BaseModel, Field

from app.config import settings
from app.core.logging_config import sanitize_for_log
from app.core.workflow_engine import WORKFLOW_STATES, workflow_engine
from app.dependencies import (
    get_attendee_repo,
    get_cycle_repo,
    get_final_scorecard_repo,
    get_llm_service,
    get_scorecard_submission_repo,
    get_user_repo,
)
from app.services.email_templates import build_scorecard_email, build_reminder_email
from app.services.mail_provider import get_mail_provider, MailSendError
from app.services import reminder_service
from app.models.scheduling import ScorecardConfigUpdate
from app.utils.prompts import SCORECARD_COMMENT_SUMMARY_SYSTEM_PROMPT
from app.utils.pii_redaction import (
    CommentRedactionError,
    redact_scorecard_comments,
    redact_scorecard_comments_with_ai,
)
from app.utils.scorecard_recipients import is_key_internal_reviewer, is_scorecard_recipient
from app.utils.scorecard_structure import (
    SCORECARD_CATALOG,
    WEIGHTED_SCORECARD_STRUCTURE,
    build_config_from_selection,
    default_scorecard_config,
)

_RAG_VALUES = {"red", "amber", "green"}
_RAG_ORDER = {"red": 0, "amber": 1, "green": 2}
# Server-side bound on a submitted comment. Deliberately well above the form's own
# 1500-char textarea cap, so a reviewer typing in the UI can never be hard-failed here.
_COMMENT_MAX_CHARS = 4000


def _effective_config(cycle: dict) -> dict:
    """The cycle's scorecard config, or the default structure if unconfigured."""
    cfg = cycle.get("scorecard_config") or {}
    if cfg.get("categories"):
        return cfg
    return default_scorecard_config()


def _known_teams(cfg: dict) -> set[str]:
    """The teams the config was authored against (see ``teams_roster``).

    Empty for a legacy config written before the roster existed — every team then
    counts as unknown, which is the safe direction: a reviewer may be asked a
    measure needlessly, but is never silently left out of the scorecard."""
    roster = cfg.get("teams")
    return {t for t in roster if t} if isinstance(roster, list) else set()


def _measure_asks_team_strict(measure: dict, team: str) -> bool:
    """The plain rule: a measure with no ``teams`` list is unrestricted (everyone);
    one with a ``teams`` list is asked only of the teams it names."""
    teams = measure.get("teams")
    if not isinstance(teams, list):
        return True
    return team in teams


def _measure_asks_team(measure: dict, team: str, known: set[str], *, rescue: bool = False) -> bool:
    """Whether ``team`` is asked to score ``measure`` — the single rule the reviewer's
    form, the dispatch recipient list and the compiler must agree on.

    ``rescue`` is the off-roster fallback and is computed by ``_asks_predicate``, never
    guessed per measure: it applies ONLY when the strict rule would leave this team
    asked nothing at all AND the team is absent from the config's roster (i.e. it was
    marked Key after the config was saved, so no measure could possibly name it).

    Applying the fallback per measure instead would override every deliberate
    restriction — a measure the VMO scoped to one team would leak to every newcomer."""
    if rescue:
        return True
    return _measure_asks_team_strict(measure, team)


def _asks_predicate(cfg: dict, team: Optional[str]):
    """Return ``fn(measure) -> bool`` for whether ``team`` is asked that measure.

    Resolves the off-roster rescue once, against the whole config, so the decision is
    consistent across every measure: a brand-new reviewer must never be silently asked
    nothing, but an established team's explicit exclusions are always honoured."""
    if team is None:
        return lambda m: True
    cats = cfg.get("categories", [])
    asked_anything = any(
        _measure_asks_team_strict(m, team) for c in cats for m in c.get("measures", [])
    )
    rescue = not asked_anything and team not in _known_teams(cfg)
    return lambda m: _measure_asks_team(m, team, set(), rescue=rescue)


def _rag_consensus(values: list[str]) -> Optional[str]:
    """Consolidated RAG = the most conservative (worst) status provided."""
    vals = [v for v in values if v in _RAG_VALUES]
    if not vals:
        return None
    return min(vals, key=lambda v: _RAG_ORDER[v])

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scorecard", tags=["scorecard-v2"])


def _submissions_repo():
    """The scorecard-submission store, behind the repository layer (DI singleton)."""
    return get_scorecard_submission_repo()


def _final_repo():
    """The admin-adjusted final-scorecard store, behind the repository layer."""
    return get_final_scorecard_repo()


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
    # True when re-sending after a mistake — uses the formal correction email.
    reissue: bool = False
    # Optional edited draft (from the review dialog). When html_body_override is set
    # it is sent verbatim instead of the template; the tokens {{name}} and {{link}}
    # are substituted per recipient.
    subject_override: Optional[str] = None
    html_body_override: Optional[str] = None
    text_body_override: Optional[str] = None


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

    # Once the scorecard has been dispatched the configuration is locked — reviewers
    # are already filling forms against it, so changing measures/teams now would be
    # inconsistent. The UI also disables editing, this is the server-side guard.
    if cycle.get("scorecard_dispatched_at"):
        raise HTTPException(
            status_code=409,
            detail="The scorecard has already been dispatched — its configuration is locked and can no longer be changed.",
        )
    # The dispatch marker alone is NOT a sufficient lock. Reopening the last dispatched
    # team clears scorecard_dispatched_at, and a reviewer can also submit via a copied
    # link before any dispatch — in both cases stored answers exist against the current
    # measure set, and rewriting it here would silently re-scope scores that were already
    # given. A stored submission is the authoritative signal.
    if _submissions_repo().get_for_cycle(cycle_id):
        raise HTTPException(
            status_code=409,
            detail=(
                "Scorecards have already been submitted for this cycle — reopen the teams "
                "concerned (or redo the scorecard) before changing the configuration."
            ),
        )

    cfg = build_config_from_selection(
        payload.selected_measure_keys, payload.weights, payload.measure_teams, payload.teams
    )
    if not cfg["categories"]:
        raise HTTPException(status_code=400, detail="Select at least one measure to include in the scorecard.")

    # RAG measures are collected and displayed but never averaged, so a theme whose
    # selected measures are ALL RAG can never produce a category average — its weight
    # would silently drop out of the overall denominator and the VMO would read a
    # "100%" score that is really weighted over less. A pure-status theme is a
    # legitimate choice, so carry it at zero weight and leave it out of the 100% rule
    # rather than refusing to save it. Coerced server-side: the server is authoritative
    # here, exactly as it is for labels and measure types.
    def _is_scored_theme(c: dict) -> bool:
        return any(m.get("measure_type", "numeric") != "rag" for m in c["measures"])

    for c in cfg["categories"]:
        if not _is_scored_theme(c):
            c["weight"] = 0
    scored = [c for c in cfg["categories"] if _is_scored_theme(c)]
    if not scored:
        raise HTTPException(
            status_code=400,
            detail="Select at least one scored (non-RAG) measure — RAG measures are status only and do not produce a score.",
        )
    total = sum(c["weight"] for c in scored)
    if total != 100:
        # Name the status-only themes in the message. Otherwise a panel that still
        # counts them towards 100 reports a total the VMO cannot reconcile with the
        # one the server rejected, and there is nothing on screen explaining the gap.
        status_only = [c["label"] for c in cfg["categories"] if not _is_scored_theme(c)]
        hint = (
            f" {', '.join(status_only)} contains only RAG (status-only) measures, so it carries"
            " no weight — share its percentage across the scored themes."
            if status_only else " Adjust the per-theme weights."
        )
        raise HTTPException(
            status_code=400,
            detail=f"Theme weights must sum to 100 (got {total}).{hint}",
        )
    if any(c["weight"] <= 0 for c in scored):
        raise HTTPException(status_code=400, detail="Each included theme must have a weight greater than 0.")

    # Preserve any configured reminder schedule (stored alongside the measures config).
    existing = cycle.get("scorecard_config") or {}
    if existing.get("reminders"):
        cfg["reminders"] = existing["reminders"]
    now = datetime.now(timezone.utc).isoformat()
    updated = cycle_repo.update_by_id("cycle_id", cycle_id, {"scorecard_config": cfg, "updated_at": now})
    logger.info("save_scorecard_config — cycle=%s themes=%d measures=%d",
                sanitize_for_log(cycle_id), len(cfg["categories"]), sum(len(c["measures"]) for c in cfg["categories"]))
    return {"cycle_id": cycle_id, "config": cfg, "cycle": updated}


# ── Team-scoped reopen (per-team, not the whole cycle) ────────────────────────


class ReopenTeamRequest(BaseModel):
    team: str


class TeamMeasuresRequest(BaseModel):
    team: str
    measure_keys: list[str] = Field(default_factory=list)


def _team_key(attendee: dict) -> str:
    """How a submission's team is identified — Shell department, else the name."""
    return (attendee.get("shell_department") or attendee.get("name") or "").strip()


def _respondent_team(attendee: dict) -> str:
    """The team a respondent is filtered by — deliberately the SAME derivation on
    read (form-meta) and write (submit), so the form can never render a measure
    that the submit then rejects as out of scope."""
    return _team_key(attendee)


@router.post("/config/{cycle_id}/reopen-team")
def reopen_scorecard_team(cycle_id: str, payload: ReopenTeamRequest):
    """Reopen the scorecard for a SINGLE team — e.g. a newly added feedback provider,
    or an existing team whose input must be redone. Discards only that team's
    submissions and removes that team's reviewers from the dispatched set, so the
    team's column unlocks for (re)configuration and can be re-sent to that team only.
    Every other team's config, submissions and lock are left untouched."""
    cycle_repo = get_cycle_repo()
    cycle = cycle_repo.get_by_cycle_id(cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycle_id}' not found")
    team = payload.team.strip()
    if not team:
        raise HTTPException(status_code=400, detail="A team is required.")

    attendees = get_attendee_repo().get_for_cycle(cycle_id)
    team_ids = {a.get("attendee_id") for a in attendees if _team_key(a) == team}
    team_emails = {
        (a.get("email") or "").strip().lower()
        for a in attendees if _team_key(a) == team and a.get("email")
    }

    repo = _submissions_repo()
    cleared = 0
    for s in repo.get_for_cycle(cycle_id):
        if s.get("attendee_id") in team_ids:
            repo.delete_by_id("submission_id", s.get("submission_id"))
            cleared += 1

    # Subtract this team's reviewers in ONE statement over the row's own column. The pool
    # is autocommit, so the previous read-modify-write here could erase an address that a
    # concurrent dispatch had just recorded — leaving that reviewer holding a live form
    # link while their team read as "open". Emptying the set also clears
    # scorecard_dispatched_at inside the same statement (otherwise save_scorecard_config
    # stays 409-locked for good), so the two halves can never be split by a racing writer.
    updated = cycle_repo.unmark_scorecard_dispatched(cycle_id, sorted(team_emails))

    # The frozen (admin-adjusted) snapshot is stale once a team's scores change.
    # Best-effort: the reopen itself has already committed (the pool is autocommit),
    # so never fail the request here. A missing snapshot is NOT an error —
    # delete_for_cycle returns False for that — so anything caught here is a real
    # DB fault and must be logged rather than swallowed.
    try:
        _final_repo().delete_for_cycle(cycle_id)
    except Exception as exc:  # noqa: BLE001 — best-effort cleanup
        logger.warning(
            "reopen_scorecard_team: could not drop the final snapshot for cycle=%s: %s",
            sanitize_for_log(cycle_id), exc,
        )

    logger.info("reopen_scorecard_team — cycle=%s team=%s cleared=%d", sanitize_for_log(cycle_id), sanitize_for_log(team), cleared)
    return {"cycle_id": cycle_id, "team": team, "submissions_cleared": cleared,
            "cycle": updated, "config": _effective_config(updated or cycle)}


@router.put("/config/{cycle_id}/team-measures")
def set_team_measures(cycle_id: str, payload: TeamMeasuresRequest):
    """Set which measures a SINGLE team is asked — allowed even after the scorecard is
    dispatched, but ONLY for a team that is still 'open' (none of its reviewers have
    been sent the scorecard yet). Existing/settled teams' assignments, the measure set
    and the weights are never changed. Reopen a settled team first (reopen-team)."""
    import copy

    cycle_repo = get_cycle_repo()
    cycle = cycle_repo.get_by_cycle_id(cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycle_id}' not found")
    team = payload.team.strip()
    if not team:
        raise HTTPException(status_code=400, detail="A team is required.")

    attendees = get_attendee_repo().get_for_cycle(cycle_id)
    team_emails = {
        (a.get("email") or "").strip().lower()
        for a in attendees if _team_key(a) == team and a.get("email")
    }
    dispatched = {(e or "").strip().lower() for e in (cycle.get("scorecard_dispatched_to") or [])}
    if team_emails & dispatched:
        raise HTTPException(
            status_code=409,
            detail=f"The scorecard has already been sent to {team} — reopen the team before changing its measures.",
        )
    # The email-based guard above misses a team whose recipient address was edited at
    # dispatch (or corrected afterwards) — it never appears in scorecard_dispatched_to,
    # so the team looks permanently "open". Narrowing its measures then leaves already
    # stored scores for measures the config no longer asks, still averaged into the
    # consolidated figures. A stored submission is the authoritative signal.
    team_ids = {a.get("attendee_id") for a in attendees if _team_key(a) == team}
    if any(s.get("attendee_id") in team_ids for s in _submissions_repo().get_for_cycle(cycle_id)):
        raise HTTPException(
            status_code=409,
            detail=f"{team} has already submitted — reopen the team before changing its measures.",
        )

    cfg = copy.deepcopy(_effective_config(cycle))
    # _effective_config falls back to the DEFAULT structure when the stored config has no
    # categories, which silently drops a reminder schedule saved before the scorecard was
    # configured (reminder_service stores it under the same JSONB key). Carry it across,
    # exactly as save_scorecard_config does.
    _existing = cycle.get("scorecard_config") or {}
    if _existing.get("reminders") and not cfg.get("reminders"):
        cfg["reminders"] = copy.deepcopy(_existing["reminders"])
    selected = set(payload.measure_keys)
    # The concrete set behind an "unrestricted" measure: the teams that can actually be
    # asked a scorecard (key, non-vendor) — not every attendee, so no phantom teams.
    reviewer_teams = {
        _team_key(a) for a in attendees
        if is_key_internal_reviewer(a) and _team_key(a)
    }
    known = _known_teams(cfg)
    for cat in cfg.get("categories", []):
        for m in cat.get("measures", []):
            teams = m.get("teams")
            if not isinstance(teams, list):
                # Unrestricted = everyone, so this team is already asked it. Dropping the
                # team needs an explicit list to drop from, else the edit is a silent no-op.
                if m["key"] in selected:
                    continue
                teams = reviewer_teams
            s = set(teams)
            if m["key"] in selected:
                s.add(team)
            else:
                # An off-roster team is implicitly asked every measure, so an explicit
                # deselection only sticks once the team is on the roster (below) — the
                # discard alone would be undone by _measure_asks_team's unknown-team rule.
                s.discard(team)
            m["teams"] = sorted(s)
    # Enrol ONLY the team just edited: from here on its assignments are deliberate, so
    # leaving it out of a measure means "not asked" rather than "joined after the config
    # was saved". Other off-roster teams must stay off-roster — enrolling them here would
    # freeze them as "asked nothing" without the VMO ever having configured them.
    cfg["teams"] = sorted(known | {team})
    cfg["configured"] = True
    now = datetime.now(timezone.utc).isoformat()
    updated = cycle_repo.update_by_id("cycle_id", cycle_id, {"scorecard_config": cfg, "updated_at": now})
    logger.info("set_team_measures — cycle=%s team=%s measures=%d", sanitize_for_log(cycle_id), sanitize_for_log(team), len(selected))
    return {"cycle_id": cycle_id, "team": team, "config": cfg, "cycle": updated}


def _filter_structure_for_team(
    categories: list[dict], team: str | None, cfg: dict | None = None
) -> list[dict]:
    """Return only the measures a given team is asked to score, per
    ``_asks_predicate``. Themes left with no measures are dropped. With no
    team (team is None) nothing is filtered."""
    if team is None:
        return categories
    asks = _asks_predicate(cfg if cfg is not None else {"categories": categories}, team)
    out: list[dict] = []
    for cat in categories:
        kept = [m for m in cat.get("measures", []) if asks(m)]
        if kept:
            out.append({**cat, "measures": kept})
    return out


@router.get("/form-meta/{cycle_id}")
def get_form_meta(cycle_id: str, attendee: str = ""):
    cycle = get_cycle_repo().get_by_cycle_id(cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycle_id}' not found")

    respondent = None
    respondent_team: str | None = None
    att = get_attendee_repo().find_by_id("attendee_id", attendee) if attendee else None
    if att and att.get("cycle_id") == cycle_id:
        respondent_team = _respondent_team(att)
        respondent = {
            "attendee_id": att.get("attendee_id"),
            "name": att.get("name", ""),
            "email": att.get("email", ""),
            "team": respondent_team,
        }
    else:
        # The link didn't resolve to a reviewer (the frontend shows "does not match a
        # known reviewer"). This is NOT a timeout — the request succeeded. Log the
        # precise reason so an intermittent report can be diagnosed. The usual cause is
        # the reviewer being removed and re-added after the link was sent (which mints a
        # new attendee_id, invalidating the old link), or the link's `attendee` query
        # param being dropped/truncated when the email link was opened.
        if not attendee:
            reason = "no attendee id in the link (attendee param missing/empty)"
        elif att is None:
            reason = "attendee_id not found — likely removed & re-added since the link was sent (new id)"
        else:
            reason = f"attendee belongs to a different cycle ({att.get('cycle_id')})"
        logger.warning(
            "form-meta: link did not resolve to a reviewer — cycle=%s attendee=%s reason=%s",
            sanitize_for_log(cycle_id), sanitize_for_log(attendee), sanitize_for_log(reason),
        )

    # Show each respondent only the measures assigned to their team.
    _cfg = _effective_config(cycle)
    structure = _filter_structure_for_team(_cfg["categories"], respondent_team, _cfg)

    # The vendor's most recent prior cycle that has consolidated scores, so reviewers
    # can consult the previous scorecard (all teams) while filling this one in.
    prev_id = find_previous_cycle_id(cycle_id)
    prev_label = None
    if prev_id:
        prev = get_cycle_repo().get_by_cycle_id(prev_id)
        if prev:
            prev_label = f"{prev.get('quarter', '')} {prev.get('year', '') or ''}".strip() or None

    return {
        "cycle_id": cycle_id,
        "vendor_name": cycle.get("vendor_name", ""),
        "cycle_type": cycle.get("cycle_type", "SPR"),
        "quarter": cycle.get("quarter", ""),
        "year": cycle.get("year"),
        "structure": structure,
        "respondent": respondent,
        "previous_cycle_id": prev_id,
        "previous_label": prev_label,
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

    # The form renders only the measures this respondent's team is asked (form-meta
    # filters with exactly this call). Re-check on WRITE: the VMO can narrow a team's
    # measures while a reviewer has the form open, and _compile_weighted reads a stored
    # score for every configured measure with no team check — so an out-of-scope score
    # would otherwise move the measure, category and weighted overall with nothing to
    # flag it. Reject rather than drop: a reload regenerates the form from the identical
    # filter, whereas a silent drop plus the one-submission-per-attendee guard below
    # would record the reviewer as "submitted" with a gutted scorecard.
    _cfg = _effective_config(cycle)
    allowed = {
        m["key"]
        for cat in _filter_structure_for_team(
            _cfg["categories"], _respondent_team(att), _cfg
        )
        for m in cat.get("measures", [])
    }
    if not allowed:
        raise HTTPException(
            status_code=409,
            detail="Your team has not been assigned any scorecard measures. Please contact the VMO coordinator.",
        )
    stale = (set(payload.scores) | set(payload.rag_scores) | set(payload.comments)) - allowed
    if stale:
        raise HTTPException(
            status_code=409,
            detail="This form is out of date — the measures for your team have changed. Please reload the page and submit again.",
        )

    # Validate provided numeric scores are 1..5.
    for mkey, val in payload.scores.items():
        if not isinstance(val, int) or not (1 <= val <= 5):
            raise HTTPException(status_code=400, detail=f"Score for '{mkey}' must be an integer 1..5")
    # Validate RAG statuses.
    for mkey, val in payload.rag_scores.items():
        if val not in _RAG_VALUES:
            raise HTTPException(status_code=400, detail=f"RAG status for '{mkey}' must be red, amber or green")
    # Bound the comment text. The textarea already caps at 1500 chars, so this can only
    # fire on a hand-rolled payload — it keeps the row and the AI redaction call bounded.
    for mkey, text in payload.comments.items():
        if len(text or "") > _COMMENT_MAX_CHARS:
            raise HTTPException(
                status_code=400,
                detail=f"The comment for '{mkey}' is too long (max {_COMMENT_MAX_CHARS} characters).",
            )

    now = datetime.now(timezone.utc).isoformat()
    repo = _submissions_repo()
    existing = repo.get_by_cycle_and_attendee(payload.cycle_id, payload.attendee_id)
    # One submission per attendee per cycle — a reviewer cannot fill it twice.
    if existing:
        raise HTTPException(
            status_code=409,
            detail="A scorecard has already been submitted for this reviewer in this cycle.",
        )

    attendee_repo = get_attendee_repo()
    known_names = {
        attendee.get("name", "")
        for attendee in attendee_repo.get_for_cycle(payload.cycle_id)
        if attendee.get("name")
    }
    known_names.update(
        user.get("name", "")
        for user in get_user_repo().find_all()
        if user.get("name")
    )
    try:
        ai_redacted_comments = redact_scorecard_comments_with_ai(
            payload.comments,
            get_llm_service(),
        )
    except Exception as exc:  # noqa: BLE001 — deliberately broad; see below
        # The Azure OpenAI SDK raises APIConnectionError / RateLimitError /
        # AuthenticationError, which derive from OpenAIError -> Exception and NOT from
        # RuntimeError, and main.py registers no global handler — so an outage or a 429
        # escaped as a bare 500 with a stack trace instead of the honest "nothing was
        # saved" 503 below. Nothing is swallowed: the fault is logged with its
        # traceback and the submission is still refused. The kind is logged too, so an
        # infrastructure incident is distinguishable from the redactor refusing a
        # comment it could not clean.
        kind = "redaction refused" if isinstance(exc, CommentRedactionError) else type(exc).__name__
        logger.error(
            "scorecard submit blocked because AI comment redaction failed (%s): %s",
            kind, exc, exc_info=True,
        )
        raise HTTPException(
            status_code=503,
            detail="Scorecard comments could not be redacted. No submission was saved; please try again.",
        ) from exc
    redacted_comments = redact_scorecard_comments(ai_redacted_comments, known_names)

    # Snapshot identity from the attendee record (authoritative — never trust the client).
    record = {
        "submission_id": f"sub_{uuid.uuid4().hex}",
        "cycle_id": payload.cycle_id,
        "attendee_id": payload.attendee_id,
        "respondent_email": (att.get("email") or "").lower(),
        "respondent_name": att.get("name", ""),
        "team": att.get("shell_department") or att.get("name", ""),
        "scores": payload.scores,
        "rag_scores": payload.rag_scores,
        "comments": redacted_comments,
        "skipped_measures": payload.skipped_measures,
        "skipped_themes": payload.skipped_themes,
        "submitted_at": now,
    }
    # The check-then-insert above straddles the AI redaction call — seconds of wall
    # clock on an autocommit pool — so two tabs (or a double click) could both pass it
    # and write two silently double-counted columns. ON CONFLICT DO NOTHING makes the
    # database the arbiter, so the loser is reported as the duplicate it is.
    if not repo.insert_if_absent(record):
        raise HTTPException(
            status_code=409,
            detail="A scorecard has already been submitted for this reviewer in this cycle.",
        )

    # Advance workflow SCORECARD_REQUEST_SENT -> SCORECARD_COLLECTION on first submission.
    try:
        if workflow_engine.can_transition(cycle.get("workflow_state", ""), "SCORECARD_COLLECTION"):
            workflow_engine.advance(cycle, cycle_repo, now)
    except Exception as exc:  # best-effort
        logger.warning("submit_scorecard: workflow advance skipped: %s", exc)

    logger.info("scorecard submit — cycle=%s attendee=%s scores=%d", sanitize_for_log(payload.cycle_id), sanitize_for_log(payload.attendee_id), len(payload.scores))
    return {"status": "submitted", "submission_id": record["submission_id"], "submitted_at": now}


@router.get("/submitted-check/{cycle_id}")
def submitted_check(cycle_id: str, attendee: str = ""):
    """Return whether the given attendee has already submitted for this cycle."""
    if not attendee:
        return {"submitted": False}
    found = _submissions_repo().get_by_cycle_and_attendee(cycle_id, attendee) is not None
    return {"submitted": found}


# ── Submission tracker ───────────────────────────────────────────────────────


@router.get("/team-submissions/{cycle_id}")
def get_team_submissions(cycle_id: str):
    """Tracker of key internal-stakeholder teams and whether each has submitted."""
    attendee_repo = get_attendee_repo()
    attendees = attendee_repo.get_for_cycle(cycle_id)
    # The SAME population _compile_weighted scores over, not the send-eligible subset:
    # declining a MEETING invite is a separate act from owing a scorecard. Excluding
    # declined reviewers here hid people whose submitted scores were nonetheless a
    # column in the consolidated scorecard — and hid the only UI route to delete or
    # re-request that submission.
    key_internal = [a for a in attendees if is_key_internal_reviewer(a)]

    # A team the config asks nothing of can never submit — POST /submit 409s it — so
    # it must not be chased and must not be counted as pending. Counting it would hold
    # `pending` above zero for ever, and CycleDetail's `pending === 0` auto-advance
    # gate would never fire: a false "incomplete" that becomes a permanent stall.
    cycle = get_cycle_repo().get_by_cycle_id(cycle_id)
    _cfg = _effective_config(cycle) if cycle else default_scorecard_config()
    _cfg_cats = _cfg.get("categories") or []

    submissions = _submissions_repo().get_for_cycle(cycle_id)
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
            # Listed, but flagged: dispatch refuses to email them, so the UI must not
            # offer "Request fill" on this row.
            "declined": att.get("confirmation_status") == "DECLINED",
            # Whether the scorecard asks this team anything at all — the same
            # `_measure_asks_team` roster contract the form and the dispatch use, so an
            # off-roster reviewer (implicitly asked everything) stays assigned.
            "assigned": bool(_filter_structure_for_team(_cfg_cats, _team_key(att), _cfg)),
        })

    submitted = sum(1 for t in tracker if t["submitted"])
    # A declined — or unassigned — reviewer who has NOT submitted is listed but not
    # chased: counting them would hold `pending` above zero for ever and the cycle would
    # never reach "all responses collected". Anyone who DID submit counts in both
    # regardless, so the tracker always agrees with the consolidated scorecard (which
    # scores every submission it finds, including a legacy one from a team the config
    # has since stopped asking). `submitted + pending == total` is preserved by
    # construction — the progress bar and the all-collected badge both rely on it.
    total = sum(1 for t in tracker if t["submitted"] or (t["assigned"] and not t["declined"]))
    return {
        "cycle_id": cycle_id,
        "total": total,
        "submitted": submitted,
        "pending": total - submitted,
        "tracker": tracker,
    }


def _recompute_final_aggregates(final: dict) -> None:
    """Recompute the snapshot's stored aggregates, in place, from its own cells.

    Exactly the rule `_compile_weighted` and the Finalize grid use: a measure
    averages its non-null numeric cells, a theme averages its measures' averages,
    and the overall is the weight-weighted mean of the theme averages (RAG measures
    carry no score and are excluded throughout). A cell stored as an explicit null is
    a deliberate "not applicable" and simply does not contribute.

    Needed whenever cells are removed: otherwise `overall_score`, `average` and
    `category_average` keep counting a reviewer whose column is gone, and every
    consumer of the stored figure — the export's "Overall (adjusted)" above all —
    prints a number that cannot be reconciled with the cells beside it."""
    num = 0.0
    den = 0.0
    for cat in final.get("categories") or []:
        if not isinstance(cat, dict):
            continue
        measure_avgs: list[float] = []
        for m in cat.get("measures") or []:
            if not isinstance(m, dict):
                continue
            if m.get("measure_type") == "rag":
                m["average"] = None
                continue
            vals = [
                v for v in ((m.get("team_scores") or {}).values())
                # bool is an int subclass — exclude it, a True cell is not a score of 1.
                if isinstance(v, (int, float)) and not isinstance(v, bool)
            ]
            avg = round(sum(vals) / len(vals), 2) if vals else None
            m["average"] = avg
            if avg is not None:
                measure_avgs.append(avg)
        cat_avg = round(sum(measure_avgs) / len(measure_avgs), 2) if measure_avgs else None
        cat["category_average"] = cat_avg
        weight = cat.get("weight")
        if cat_avg is not None and isinstance(weight, (int, float)) and not isinstance(weight, bool):
            num += cat_avg * weight
            den += weight
    final["overall_score"] = round(num / den, 2) if den else None


def strip_attendee_from_final(cycle_id: str, attendee_id: str) -> None:
    """Remove one attendee's column from the frozen (admin-adjusted) snapshot.

    The Finalize grid seeds itself with the snapshot laid OVER the consolidated
    figures, so a reviewer who is gone from the consolidation but still present in
    the snapshot keeps feeding every measure/category/overall average from a cell
    the grid no longer renders — invisible and uncorrectable short of a full Reset.

    Pruning just this attendee (rather than dropping the whole snapshot, as
    reopen-team and redo do) keeps every OTHER team's manual adjustment intact.
    Best-effort by design: a malformed or absent snapshot must never block the
    delete that has already committed."""
    try:
        fin = _final_repo().get_for_cycle(cycle_id)
        if not fin:
            return
        touched = False
        for cat in fin.get("categories") or []:
            for m in cat.get("measures") or []:
                for field in ("team_scores", "team_rag", "comments"):
                    d = m.get(field)
                    if isinstance(d, dict) and attendee_id in d:
                        d.pop(attendee_id, None)
                        touched = True
        if touched:
            # Pruning the cells is only half the job — the stored aggregates were
            # computed WITH this reviewer. Re-derive them from what is left, or the
            # export's "Overall (adjusted)" still includes a deleted submission.
            # `computed_at` is deliberately NOT refreshed: this is a repair of the
            # existing freeze, not a new one, so the staleness check stays honest.
            _recompute_final_aggregates(fin)
            _final_repo().upsert(cycle_id, fin)
    except Exception as exc:  # noqa: BLE001 — best-effort; never block the caller
        logger.warning(
            "strip_attendee_from_final: could not prune attendee=%s from the snapshot for cycle=%s: %s",
            sanitize_for_log(attendee_id), sanitize_for_log(cycle_id), exc,
        )


@router.delete("/submission/{cycle_id}/{attendee_id}")
def delete_submission(cycle_id: str, attendee_id: str):
    """Delete an attendee's scorecard submission for this cycle.

    Lets the VMO re-open a scorecard at any time (e.g. it was filled in error, or the
    attendee should redo it) — after deletion the `/submit` duplicate guard no longer
    fires, so that attendee can submit again. Consolidated figures recompute from the
    remaining submissions. Returns {deleted, attendee_id}."""
    repo = _submissions_repo()
    removed = repo.delete_for_cycle_attendee(cycle_id, attendee_id)
    if not removed:
        raise HTTPException(status_code=404, detail="No submission found for this attendee")
    # Their column is gone from the consolidation — strip it from the frozen snapshot
    # too, or it keeps scoring in the Finalize view with no cell to clear it from.
    strip_attendee_from_final(cycle_id, attendee_id)
    logger.info("SCORECARD: deleted %d submission(s) for attendee=%s cycle=%s", removed, sanitize_for_log(attendee_id), sanitize_for_log(cycle_id))
    return {"deleted": True, "attendee_id": attendee_id, "count": removed}


# ── Weighted compiled scorecard ──────────────────────────────────────────────


def _compile_weighted(cycle_id: str) -> dict:
    cycle = get_cycle_repo().get_by_cycle_id(cycle_id)
    config = _effective_config(cycle) if cycle else default_scorecard_config()

    attendee_repo = get_attendee_repo()
    attendees = attendee_repo.get_for_cycle(cycle_id)
    key_internal = [a for a in attendees if is_key_internal_reviewer(a)]

    all_submissions = _submissions_repo().get_for_cycle(cycle_id)
    subs_by_attendee = {s.get("attendee_id"): s for s in all_submissions if s.get("attendee_id")}

    # Columns = key internal attendees who have submitted (stable attendee_id).
    # Order follows the attendee list for a consistent, predictable layout.
    submitting = [a for a in key_internal if a.get("attendee_id") in subs_by_attendee]
    # Column label is the TEAM (Shell department). When an attendee has no
    # department set we show "Unassigned" rather than leaking their personal name
    # as if it were a team (set the Dept in the Attendees step to show the real team).
    _raw_labels = [a.get("shell_department") or "Unassigned" for a in submitting]

    def _column_label(i: int, a: dict) -> str:
        """There is one column per SUBMITTING REVIEWER, not per team, so two people
        in the same department (or two with none, both "Unassigned") would otherwise
        produce two indistinguishable headers — in the table, the team selector and
        the exported workbook alike. Qualify only the ambiguous ones, so a personal
        name is never shown where the team name already identifies the column."""
        lbl = _raw_labels[i]
        if _raw_labels.count(lbl) == 1:
            return lbl
        who = a.get("name") or (a.get("email") or "")
        return f"{lbl} — {who}".strip(" —")

    teams = [
        {
            "attendee_id": a.get("attendee_id"),
            "email": (a.get("email") or "").lower(),
            "name": a.get("name", ""),
            "team": _raw_labels[i],
            # Config identity — the same string `measures[].teams` and the dispatch
            # panel use, so a column can be mapped back to the restriction (or the
            # reopen/lock unit) that produced it. NOT a display label.
            "team_key": _team_key(a),
            "label": _column_label(i, a),
        }
        for i, a in enumerate(submitting)
    ]

    categories = []
    weighted_num = 0.0
    weighted_den = 0.0
    # One predicate per submitting reviewer, resolved ONCE against the whole config so
    # the off-roster rescue is decided consistently for all of that reviewer's measures
    # (see `_asks_predicate`). Recomputing it per measure would let a measure the VMO
    # scoped to one team leak to every newly-added reviewer.
    _asks = {a.get("attendee_id"): _asks_predicate(config, _team_key(a)) for a in submitting}

    for cat in config["categories"]:
        measures_out = []
        measure_avgs: list[float] = []
        for m in cat["measures"]:
            mkey = m["key"]
            measure_type = m.get("measure_type", "numeric")
            team_scores: dict[str, Optional[int]] = {}
            team_rag: dict[str, Optional[str]] = {}
            comments: dict[str, str] = {}
            # Why a cell is blank matters, and today all three reasons collapse to null:
            # never on this team's form, explicitly marked N/A, or simply unanswered.
            # The UIs then assert the wrong one as fact. Report it instead of guessing.
            team_status: dict[str, str] = {}
            provided: list[int] = []
            rag_values: list[str] = []
            for a in submitting:
                aid = a.get("attendee_id")
                s = subs_by_attendee[aid]
                if not _asks[aid](m):
                    # TERMINAL. The cell renders as "never assigned" and the export
                    # prints it blank, so the score behind it must not reach the
                    # average — otherwise the Overall the VMO signs off cannot be
                    # reproduced from the cells on screen. A stored score can outlive
                    # its assignment (the VMO narrows a measure, or corrects a
                    # reviewer's department, after they submitted), so this is
                    # reachable on real data, not just in theory. The comment is
                    # dropped for the same reason: it would appear under a measure
                    # that reviewer's team was never shown.
                    team_status[aid] = "not_asked"
                    team_scores[aid] = None
                    team_rag[aid] = None
                    continue
                if mkey in (s.get("skipped_measures") or []) or cat["key"] in (s.get("skipped_themes") or []):
                    team_status[aid] = "na"
                else:
                    team_status[aid] = "scored"
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
                "team_status": team_status,
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


def _has_key_submissions(cycle_id: str) -> bool:
    """Whether a cycle holds at least one submission from a still-key internal
    reviewer — exactly the population `_compile_weighted` counts, but without
    compiling. A cycle can hold submission rows whose attendees were later un-keyed,
    retyped to Vendor or deleted, and those compile to an empty scorecard, so a bare
    "has any submission row" test would point reviewers at a blank previous cycle."""
    key_ids = {
        a.get("attendee_id")
        for a in get_attendee_repo().get_for_cycle(cycle_id)
        if is_key_internal_reviewer(a)
    }
    return any(
        s.get("attendee_id") in key_ids
        for s in _submissions_repo().get_for_cycle(cycle_id)
    )


def find_previous_cycle_id(cycle_id: str) -> Optional[str]:
    """The most recent prior cycle for the SAME vendor (by year, then quarter),
    strictly before this cycle and carrying at least one scorecard submission.
    Returns None when there is no such cycle (first cycle for the vendor)."""
    cycle = get_cycle_repo().get_by_cycle_id(cycle_id)
    if not cycle:
        return None
    cur_key = _cycle_sort_key(cycle)
    # Index-backed when we have a vendor. cycles.vendor_id is nullable and
    # `WHERE vendor_id = NULL` matches nothing, so a legacy vendor-less cycle must
    # keep the full scan or it would lose its previous-scorecard link entirely.
    vendor_id = cycle.get("vendor_id")
    pool = get_cycle_repo().get_by_vendor(vendor_id) if vendor_id else get_cycle_repo().find_all()
    siblings = [
        c for c in pool
        if c.get("vendor_id") == vendor_id
        and c.get("cycle_id") != cycle_id
        and _cycle_sort_key(c) < cur_key
    ]
    siblings.sort(key=_cycle_sort_key, reverse=True)
    for c in siblings:
        # Only use a prior cycle that actually has consolidated data to compare against.
        # This runs on /form-meta — the page every reviewer opens from their email — so
        # it must not fully compile each candidate cycle just to answer yes/no.
        if _has_key_submissions(c["cycle_id"]):
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

    object_start = text.find("{")
    object_end = text.rfind("}")
    array_start = text.find("[")
    array_end = text.rfind("]")
    candidates: list[str] = []
    if object_start != -1 and object_end > object_start:
        candidates.append(text[object_start : object_end + 1].strip())
    if array_start != -1 and array_end > array_start:
        candidates.append(text[array_start : array_end + 1].strip())
    if candidates:
        return max(candidates, key=len)

    return text.strip()


def _collect_comments(weighted: dict) -> tuple[list[dict], int]:
    """Per-measure comments (only measures that have any). Returns (measures, total).

    Each item: {measure_key, theme, measure, consolidated_score, entries:[{team, score, comment}]}.
    Each entry carries the team's own score (numeric 1-5 or RAG label) next to its
    comment so the summary can compare what a team SAID against what it SCORED. Teams
    that submitted no comment for the measure are surfaced separately (`teams_no_feedback`)
    so the summary can note "No feedback from <team>" instead of inventing a view."""
    # `label` disambiguates two reviewers who share a department — otherwise the LLM is
    # handed several contradictory comment sets all labelled with the same team name and
    # narrates them as that many separate teams agreeing.
    team_name = {
        t["attendee_id"]: (t.get("label") or t.get("team") or t.get("name") or t.get("email") or "Team")
        for t in weighted.get("teams", [])
    }
    measures: list[dict] = []
    total = 0
    for cat in weighted.get("categories", []):
        for m in cat.get("measures", []):
            comments = m.get("comments") or {}
            team_scores = m.get("team_scores") or {}
            team_rag = m.get("team_rag") or {}

            def _score_of(aid: str):
                """This team's own rating for the measure: numeric score, else RAG label."""
                if isinstance(team_scores.get(aid), int):
                    return team_scores[aid]
                return team_rag.get(aid)

            entries = [
                {"team": team_name.get(aid, aid), "score": _score_of(aid), "comment": txt.strip()}
                for aid, txt in comments.items()
                if (txt or "").strip()
            ]
            if entries:
                commented_aids = {aid for aid, txt in comments.items() if (txt or "").strip()}
                # dict.fromkeys de-duplicates while preserving order: labels can repeat
                # when a department has several reviewers, and listing one team twice
                # reads to the LLM as two teams that both stayed silent.
                teams_no_feedback = list(dict.fromkeys(
                    team_name.get(aid, aid)
                    for aid in team_name
                    if aid not in commented_aids and _score_of(aid) is not None
                ))
                measures.append({
                    "measure_key": m["key"],
                    "theme": cat["label"],
                    "measure": m["label"],
                    "consolidated_score": m.get("average"),
                    "entries": entries,
                    "teams_no_feedback": teams_no_feedback,
                })
                total += len(entries)
    return measures, total


def _fallback_measure_summary(entries: list[dict]) -> str:
    """Deterministic per-measure bullets (the raw comments) when the LLM is off.

    Prefixes each team's own score (numeric or RAG) so the baseline still pairs what a
    team said with how it scored."""
    def _line(e: dict) -> str:
        score = e.get("score")
        tag = f" [{score}]" if score not in (None, "") else ""
        return f"- {e['team']}{tag}: {e['comment']}"
    return "\n".join(_line(e) for e in entries)


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
                {
                    "measure_key": c["measure_key"],
                    "measure": c["measure"],
                    "theme": c["theme"],
                    "consolidated_score": c["consolidated_score"],
                    "teams_no_feedback": c["teams_no_feedback"],
                    "comments": c["entries"],
                }
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
                sanitize_for_log(cycle_id), total, team_count, len(measures_out), llm_used)
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


# Control characters are not representable in XML 1.0 at all — not even escaped — so a
# single stray one (reviewers paste from Word/Outlook, which carry ,  and friends)
# makes Excel refuse to open the whole workbook with "unreadable content". Strip them,
# keeping the three whitespace characters XML does allow.
_XL_ILLEGAL = {c: None for c in range(0x20) if c not in (0x09, 0x0A, 0x0D)}
_XL_ILLEGAL.update({c: None for c in range(0x7F, 0xA0)})


def _xl_esc(v: str) -> str:
    return (
        v.translate(_XL_ILLEGAL)
        .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    )


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
    # `label` first: the workbook is the one surface with no tooltip, so two reviewers
    # from the same department must not produce two identical score/comment columns.
    team_labels = [(t.get("label") or t.get("team") or t.get("name") or t.get("email") or "Team") for t in teams]
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

    # 20, not 14: a disambiguated label ("IDTM — A. Reviewer") needs the extra room.
    base_widths = [22, 30, *([20] * n_teams), 11, 11, 11]

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

    sheets = [sheet1, sheet2]

    # Sheet 3 — the admin-adjusted (final) snapshot, when one has been saved.
    # Without it the VMO signs off adjusted numbers on screen and then exports the
    # UN-adjusted ones as the official scorecard. Appended rather than merged: sheets
    # 1 and 2 stay the untouched, auditable record of what was actually submitted.
    # Wholly best-effort — `scorecard_final.categories` is unvalidated client JSON and
    # must never be able to break the export of the other two sheets.
    try:
        final = _final_repo().get_for_cycle(cycle_id)
    except Exception as exc:  # noqa: BLE001 — the snapshot is optional
        logger.warning("scorecard export: could not read the final snapshot for cycle=%s: %s",
                       sanitize_for_log(cycle_id), exc)
        final = None
    if final:
        try:
            adj = {
                (cat or {}).get("key"): {
                    (m or {}).get("key"): m for m in ((cat or {}).get("measures") or [])
                }
                for cat in (final.get("categories") or [])
            }
            frozen_at = final.get("computed_at") or final.get("updated_at") or ""
            later = [
                s for s in _submissions_repo().get_for_cycle(cycle_id)
                if frozen_at and (s.get("submitted_at") or "") > frozen_at
            ]

            def adj_cell(cat: dict, m: dict, aid: str):
                """The adjusted value, falling back to what was submitted — a team the
                snapshot never captured renders its consolidated score, not a blank.

                Keyed on key PRESENCE, not on non-null, matching the grid's own rule:
                a cell the VMO deliberately blanked is persisted as an explicit null
                ("not applicable") and was already excluded from the stored
                "Overall (adjusted)" below. A non-null test silently restored the
                submitted score for exactly those cells, so the sheet could not be
                reconciled with its own overall."""
                if m.get("measure_type") == "rag":
                    # The grid never adjusts a status: it copies `team_rag` verbatim and
                    # stores an all-null `team_scores` row for a RAG measure, so the
                    # presence rule would blank every status cell here.
                    return score_cell(m, aid)
                am = (adj.get(cat.get("key")) or {}).get(m.get("key"))
                ts = (am or {}).get("team_scores") or {}
                if aid in ts:
                    v = ts[aid]
                    return v if v is not None else ""
                return score_cell(m, aid)

            # The metadata rows stay ABOVE the column header (so _xl_sheet's bold
            # row-1 style lands on "STALE …" rather than on "Theme"). Deliberate: a
            # staleness warning buried under the data is worse than an unbolded header,
            # and _xl_sheet must not be restructured for one sheet's cosmetics.
            rows3: list[list] = []
            if later:
                rows3.append([f"STALE — {len(later)} submission(s) arrived after this snapshot was saved"])
            rows3.append(["Adjusted snapshot saved", frozen_at])
            rows3.append(["Adjustment note", final.get("note") or ""])
            rows3.append([])
            rows3.append(["Theme", "Measure", *team_labels, "Weight %"])
            for cat in weighted["categories"]:
                for m in cat["measures"]:
                    rows3.append([
                        cat["label"], m["label"],
                        *[adj_cell(cat, m, aid) for aid in team_ids],
                        cat.get("weight"),
                    ])
            # Recompute the total FROM THE CELLS THIS SHEET ACTUALLY PRINTS, rather than
            # echoing the stored one. `adj_cell` falls back to the live consolidated score
            # for any reviewer the snapshot never captured (deleted then re-submitted,
            # un-keyed then re-keyed), so the printed grid can legitimately contain people
            # the stored overall was never computed over — and the sheet then cannot be
            # reconciled with its own total. This mirrors FinalizeScorecardTable, which
            # already recomputes from the same merged matrix rather than trusting the
            # stored figure.
            merged_cats = []
            fallback_aids: set[str] = set()
            for cat in weighted["categories"]:
                mm = []
                for m in cat["measures"]:
                    ts: dict = {}
                    if m.get("measure_type") != "rag":
                        for aid in team_ids:
                            am = (adj.get(cat.get("key")) or {}).get(m.get("key"))
                            stored = (am or {}).get("team_scores") or {}
                            if aid not in stored:
                                fallback_aids.add(aid)
                            v = adj_cell(cat, m, aid)
                            ts[aid] = v if isinstance(v, (int, float)) and not isinstance(v, bool) else None
                    mm.append({"key": m.get("key"), "measure_type": m.get("measure_type"), "team_scores": ts})
                merged_cats.append({"key": cat.get("key"), "weight": cat.get("weight"), "measures": mm})
            merged = {"categories": merged_cats}
            _recompute_final_aggregates(merged)

            rows3.append([])
            rows3.append(["Overall (adjusted)", "", *([""] * n_teams),
                          merged.get("overall_score")])
            if fallback_aids:
                # Name them: without this the un-key/re-key case is invisible, because the
                # STALE banner only fires when a submission postdates the freeze.
                _lbl = {t.get("attendee_id"): (t.get("label") or t.get("team") or "") for t in teams}
                rows3.append([
                    "Note",
                    "Not in the saved snapshot — submitted scores shown: "
                    + ", ".join(sorted(_lbl.get(a, a) for a in fallback_aids)),
                ])
            sheets.append({
                "name": "Final (Adjusted)",
                "rows": rows3,
                "col_widths": [22, 30, *([20] * n_teams), 11],
            })
        except Exception as exc:  # noqa: BLE001 — never lose the whole export to a bad snapshot
            logger.warning("scorecard export: skipped the adjusted sheet for cycle=%s: %s",
                           sanitize_for_log(cycle_id), exc)

    return _build_xlsx(sheets)


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


# ── In-app dispatch (service mailbox sends the form link) ────────────────────


@router.post("/dispatch-inapp")
def dispatch_inapp(payload: InAppDispatchRequest):
    """Email the in-app scorecard form link to each recipient via the service
    mailbox (Microsoft Graph).

    Recipient emails are used exactly as provided (editable), so a tester can
    send several links to their own inbox.
    """
    cycle_repo = get_cycle_repo()
    cycle = cycle_repo.get_by_cycle_id(payload.cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail=f"Cycle '{payload.cycle_id}' not found")

    # A recipient we may not email is SKIPPED, not fatal. Rejecting the whole batch
    # meant one reviewer who declined attendance blocked the scorecard reaching
    # everyone else — with no way to tell from this screen who was at fault, and no
    # recovery but un-keying them in a step that is locked by now.
    # `is_scorecard_recipient` is the single send-eligibility rule (see
    # app/utils/scorecard_recipients.py). An attendee_id that resolves to nothing is
    # left sendable, exactly as before — that is a link problem, not an eligibility one.
    # The roster contract, read once: `_measure_asks_team` (via _filter_structure_for_team)
    # is THE rule for "is this team asked anything", so an off-roster reviewer — implicitly
    # asked everything — is never skipped here.
    _cfg = _effective_config(cycle)
    _cfg_cats = _cfg.get("categories") or []

    sendable: list[InAppDispatchRecipient] = []
    skipped: list[dict] = []
    for recipient in payload.recipients:
        attendee = _get_cycle_attendee(payload.cycle_id, recipient.attendee_id)
        if attendee is not None and not is_scorecard_recipient(attendee):
            reason = (
                "Declined attendance"
                if attendee.get("confirmation_status") == "DECLINED"
                else "No longer a key internal reviewer"
            )
            skipped.append({"name": recipient.name, "email": recipient.email,
                            "status": "skipped", "error": reason, "message_id": None})
            continue
        # Defence in depth: a team assigned no measure would open a form with nothing
        # on it and be refused by /submit. Skip it — never hard-fail the batch, which
        # would stop the scorecard reaching everyone else.
        if attendee is not None and not _filter_structure_for_team(
            _cfg_cats, _team_key(attendee), _cfg
        ):
            skipped.append({"name": recipient.name, "email": recipient.email,
                            "status": "skipped", "message_id": None,
                            "error": "No scorecard measures are assigned to this team"})
            continue
        sendable.append(recipient)
    if not sendable:
        raise HTTPException(
            status_code=400,
            detail="None of the selected recipients can be sent a scorecard (they have declined attendance or are no longer key reviewers).",
        )

    # An edited body MUST keep the {{link}} token, otherwise recipients get an email
    # with no way to reach their scorecard (and the cycle would still lock as dispatched).
    if payload.html_body_override and "{{link}}" not in payload.html_body_override:
        raise HTTPException(
            status_code=400,
            detail="The edited email must keep the {{link}} placeholder so each recipient can open their scorecard form.",
        )

    base = payload.form_base_url.rstrip("/")
    # Seeded with the skips so the UI can name who was left out, and why.
    results: list[dict] = list(skipped)
    sent = 0
    for r in sendable:
        email = r.email.strip()
        if not email or not r.attendee_id:
            continue
        link = f"{base}/scorecard?cycle={payload.cycle_id}&attendee={r.attendee_id}"
        if payload.html_body_override:
            # Coordinator edited the draft — send it verbatim, substituting the
            # per-recipient tokens {{name}} (HTML-escaped) and {{link}}.
            default_subject = f"{payload.vendor_name} — QBR Scorecard Input Request ({payload.quarter} {payload.year})"
            safe_name = html_escape(r.name)
            subject = _clean_subject((payload.subject_override or default_subject).replace("{{name}}", r.name))
            html_body = payload.html_body_override.replace("{{name}}", safe_name).replace("{{link}}", link)
            text_body = (payload.text_body_override or "").replace("{{name}}", r.name).replace("{{link}}", link) or None
        else:
            email_data = build_scorecard_email(
                attendee_name=r.name,
                attendee_email=email,
                vendor_name=payload.vendor_name,
                cycle_id=payload.cycle_id,
                quarter=payload.quarter,
                year=payload.year,
                form_url=link,
                reissue=payload.reissue,
            )
            subject = email_data["subject"]
            html_body = email_data["html_body"]
            text_body = email_data["text_body"]
        try:
            res = get_mail_provider().send_html_email(
                to_email=email,
                subject=subject,
                html_body=html_body,
                text_body=text_body,
            )
            # Every row carries the same keys whatever its status, so the panel can read
            # one shape instead of probing for the fields a given outcome happens to set.
            results.append({"name": r.name, "email": email, "status": "sent",
                            "message_id": res.get("id"), "error": None})
            sent += 1
        except MailSendError as exc:
            results.append({"name": r.name, "email": email, "status": "failed",
                            "error": str(exc), "message_id": None})

    if sent > 0:
        now = datetime.now(timezone.utc).isoformat()
        cycle_repo.mark_scorecard_dispatched(payload.cycle_id, now, [r["email"] for r in results if r["status"] == "sent"])
        try:
            ws_idx = WORKFLOW_STATES.index(cycle.get("workflow_state", ""))
            if ws_idx < WORKFLOW_STATES.index("SCORECARD_REQUEST_SENT"):
                workflow_engine.transition_to(cycle, "SCORECARD_REQUEST_SENT", cycle_repo, now)
        except Exception as exc:
            logger.warning("dispatch-inapp: workflow advance failed: %s", exc)

    # A skip is not a failure — counting it as one would paint the send red when it
    # did everything that could be done.
    return {"total": len(payload.recipients), "sent": sent, "skipped": len(skipped),
            "failed": len(sendable) - sent, "results": results}


@router.get("/dispatch-preview/{cycle_id}")
def dispatch_preview(cycle_id: str, reissue: bool = False):
    """The default scorecard email draft (subject + HTML + text) so the UI can seed
    an editable preview. Uses {{name}} and {{link}} tokens where the per-recipient
    name and form link are substituted at send time."""
    cycle = get_cycle_repo().get_by_cycle_id(cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycle_id}' not found")
    email_data = build_scorecard_email(
        attendee_name="{{name}}",
        attendee_email="",
        vendor_name=cycle.get("vendor_name", ""),
        cycle_id=cycle_id,
        quarter=cycle.get("quarter", ""),
        year=cycle.get("year") or 0,
        form_url="{{link}}",
        reissue=reissue,
    )
    return {
        "subject": email_data["subject"],
        "html_body": email_data["html_body"],
        "text_body": email_data["text_body"],
    }


@router.post("/redo/{cycle_id}")
def redo_scorecard(cycle_id: str):
    """Reopen scorecard collection after a mistake.

    Discards every submission collected so far and clears the dispatched marker,
    so the VMO can reconfigure the scorecard and send it again. Because the old
    submissions are removed, only the freshly-collected (latest) scorecard is
    considered. The next dispatch should be sent with ``reissue=true`` so
    reviewers receive the formal correction notice."""
    cycle_repo = get_cycle_repo()
    cycle = cycle_repo.get_by_cycle_id(cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycle_id}' not found")

    # Redo is only meaningful while the scorecard is still being collected. Once the
    # cycle has moved on to Alignment / Vendor-Prep / Meeting, purging submissions
    # would leave those downstream stages operating on an empty scorecard — refuse.
    ws = cycle.get("workflow_state", "")
    ws_idx = WORKFLOW_STATES.index(ws) if ws in WORKFLOW_STATES else -1
    if ws_idx > WORKFLOW_STATES.index("SCORECARD_COMPILED"):
        raise HTTPException(
            status_code=409,
            detail="The cycle has already progressed past scorecard collection — it can no longer be redone.",
        )

    cleared = _submissions_repo().delete_by_field("cycle_id", cycle_id)
    updated = cycle_repo.clear_scorecard_dispatch(cycle_id)
    # Drop the frozen (admin-adjusted) snapshot too — it is stale once submissions reset.
    # Done AFTER the dispatch marker is cleared: a fault here must not leave submissions
    # purged with scorecard_dispatched_at still set, which would keep the config locked
    # on a 409. A missing snapshot is not an error (delete_for_cycle returns False), so
    # anything caught here is a real DB fault — log it rather than swallow it.
    try:
        _final_repo().delete_for_cycle(cycle_id)
    except Exception as exc:  # noqa: BLE001 — best-effort; never block the redo
        logger.warning(
            "redo_scorecard: could not drop the final snapshot for cycle=%s: %s",
            sanitize_for_log(cycle_id), exc,
        )
    logger.info("redo_scorecard — cycle=%s discarded %d submissions, dispatch reopened", sanitize_for_log(cycle_id), cleared)
    return {"cycle_id": cycle_id, "reopened": True, "submissions_cleared": cleared, "cycle": updated}


# ── Automated scorecard reminders ────────────────────────────────────────────


class ReminderSettingsUpdate(BaseModel):
    deadline: Optional[str] = Field(default=None, description="ISO date (YYYY-MM-DD) reviewers must submit by")
    offsets: list[int] = Field(default_factory=lambda: [5, 2, 0], description="Days before the deadline to remind")
    form_base_url: Optional[str] = Field(default=None, description="Frontend origin used to build the form link")
    # Where the T-0 escalation goes. Without this field `reminder_service._coordinators`
    # could never see a configured address, so its first (and only targeted) branch was
    # dead code and every escalation fell through to "reviewers who are not late" or the
    # service mailbox. `save_settings` leaves a stored value alone when this is omitted.
    coordinator_email: Optional[str] = Field(default=None, description="Where the final (T-0) escalation is sent")


class ReminderSendNowRequest(BaseModel):
    form_base_url: Optional[str] = None
    # Optional edited draft (from the review dialog); {{name}}/{{link}} substituted per recipient.
    subject_override: Optional[str] = None
    html_body_override: Optional[str] = None
    text_body_override: Optional[str] = None


def _reminder_status(cycle: dict) -> dict:
    s = reminder_service.get_settings(cycle)
    pending = reminder_service.pending_respondents(cycle.get("cycle_id"))
    today = datetime.now(timezone.utc).date()
    dl = None
    if s.get("deadline"):
        try:
            dl = datetime.fromisoformat(str(s["deadline"])[:10]).date()
        except ValueError:
            dl = None
    sent = {str(o) for o in (s.get("sent") or [])}
    tiers = []
    for off in s.get("offsets") or []:
        off = int(off)
        fire = (dl - timedelta(days=off)) if dl else None
        if str(off) in sent:
            status = "sent"
        elif fire is not None and fire <= today:
            status = "due"
        else:
            status = "scheduled"
        tiers.append({"offset": off, "fire_date": fire.isoformat() if fire else None, "status": status})
    return {
        "cycle_id": cycle.get("cycle_id"),
        "deadline": s.get("deadline"),
        "offsets": s.get("offsets"),
        "form_base_url": s.get("form_base_url"),
        # Echoed back so the settings form can show what is stored — otherwise the VMO
        # has no way to tell whether an escalation address was ever saved.
        "coordinator_email": s.get("coordinator_email"),
        "pending": len(pending),
        "pending_names": [p["name"] for p in pending],
        "tiers": tiers,
    }


@router.get("/reminders/{cycle_id}")
def get_reminders(cycle_id: str):
    cycle = get_cycle_repo().get_by_cycle_id(cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycle_id}' not found")
    return _reminder_status(cycle)


@router.put("/reminders/{cycle_id}")
def put_reminders(cycle_id: str, payload: ReminderSettingsUpdate):
    if not payload.offsets:
        raise HTTPException(status_code=400, detail="Add at least one reminder offset (days before the deadline).")
    if any(o < 0 for o in payload.offsets):
        raise HTTPException(status_code=400, detail="Reminder offsets must be 0 or more days before the deadline.")
    try:
        reminder_service.save_settings(
            cycle_id, deadline=payload.deadline, offsets=payload.offsets, form_base_url=payload.form_base_url,
            coordinator_email=payload.coordinator_email,
        )
    except ValueError as exc:
        logger.warning("reminder settings update failed for cycle=%s: %s", sanitize_for_log(cycle_id), exc)
        raise HTTPException(status_code=404, detail=f"Cycle '{cycle_id}' not found")
    cycle = get_cycle_repo().get_by_cycle_id(cycle_id)
    return _reminder_status(cycle)


@router.post("/reminders/send-now/{cycle_id}")
def send_reminders_now(cycle_id: str, payload: ReminderSendNowRequest = Body(default=ReminderSendNowRequest())):
    cycle = get_cycle_repo().get_by_cycle_id(cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycle_id}' not found")
    # Nobody can be late for a form they were never sent, so `pending_respondents`
    # returns [] until the scorecard is dispatched. Without this guard the button
    # "succeeds" with pending == 0 and the panel reports the flatly wrong
    # "Everyone has already submitted".
    if not cycle.get("scorecard_dispatched_at"):
        raise HTTPException(
            status_code=409,
            detail="The scorecard has not been dispatched yet — send it before reminding reviewers.",
        )
    if payload and payload.html_body_override and "{{link}}" not in payload.html_body_override:
        raise HTTPException(
            status_code=400,
            detail="The edited reminder must keep the {{link}} placeholder so each reviewer can open their scorecard form.",
        )
    # Persist the form base URL so the automated scheduler can build links too.
    if payload and payload.form_base_url:
        s = reminder_service.get_settings(cycle)
        reminder_service.save_settings(
            cycle_id, deadline=s.get("deadline"), offsets=s.get("offsets"), form_base_url=payload.form_base_url,
        )
        cycle = get_cycle_repo().get_by_cycle_id(cycle_id)
    result = reminder_service.send_now(
        cycle,
        base_url=payload.form_base_url if payload else None,
        subject_override=payload.subject_override if payload else None,
        html_override=payload.html_body_override if payload else None,
        text_override=payload.text_body_override if payload else None,
    )
    return result


@router.get("/reminders/preview/{cycle_id}")
def reminder_preview(cycle_id: str):
    """The default reminder email draft (subject + HTML + text) for an editable
    preview. {{name}}/{{link}} tokens are substituted per recipient at send time."""
    cycle = get_cycle_repo().get_by_cycle_id(cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycle_id}' not found")
    s = reminder_service.get_settings(cycle)
    deadline = s.get("deadline") or ""
    today = datetime.now(timezone.utc).date()
    days_left = 5
    if deadline:
        try:
            days_left = (datetime.fromisoformat(str(deadline)[:10]).date() - today).days
        except ValueError:
            pass
    email_data = build_reminder_email(
        attendee_name="{{name}}",
        vendor_name=cycle.get("vendor_name", ""),
        quarter=cycle.get("quarter", ""),
        year=cycle.get("year") or 0,
        form_url="{{link}}",
        deadline=deadline,
        days_left=days_left,
        tone_label=reminder_service._tone_label(days_left),
    )
    return {
        "subject": email_data["subject"],
        "html_body": email_data["html_body"],
        "text_body": email_data["text_body"],
    }


# ── Final (admin-adjusted) scorecard ─────────────────────────────────────────


@router.get("/final/{cycle_id}")
def get_final_scorecard(cycle_id: str):
    rec = _final_repo().get_for_cycle(cycle_id)
    # The snapshot is a deliberate point-in-time freeze, so it is never auto-deleted —
    # that would silently discard the VMO's adjustments and their note. Flag it instead,
    # so the UI can offer the existing Reset rather than quietly overlaying an outdated
    # number on top of scores that have since changed.
    stale = False
    if rec:
        # computed_at is a later, additive column: legacy rows only carry updated_at.
        frozen = rec.get("computed_at") or rec.get("updated_at")
        if frozen:
            stale = any(
                (s.get("submitted_at") or "") > frozen
                for s in _submissions_repo().get_for_cycle(cycle_id)
            )
    return {"cycle_id": cycle_id, "final": rec, "stale": stale}


@router.post("/final/{cycle_id}")
def save_final_scorecard(cycle_id: str, payload: dict = Body(...)):
    """Save the admin-adjusted (final) scorecard. Overwrites any prior copy.

    This is an explicit point-in-time snapshot — `computed_at` records when it was
    frozen. The live consolidated view (`_compile_weighted`) remains the source of
    truth and always recomputes from submissions; this snapshot can go stale by design."""
    # The write is a FULL row replace and the table keeps no history, so a payload
    # missing `categories` would blank the whole snapshot — and its note and overall —
    # with nothing to recover from. Every legitimate save sends the matrix, so require
    # it rather than defaulting to an empty one.
    if not isinstance(payload.get("categories"), list):
        raise HTTPException(
            status_code=400,
            detail="A final scorecard must include its `categories` — a partial save would erase the saved snapshot.",
        )
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "cycle_id": cycle_id,
        "categories": payload["categories"],
        "overall_score": payload.get("overall_score"),
        "note": payload.get("note", ""),
        "computed_at": now,
        "updated_at": now,
    }
    _final_repo().upsert(cycle_id, record)
    return {"status": "saved", "final": record}


@router.delete("/final/{cycle_id}")
def reset_final_scorecard(cycle_id: str):
    """Reset (delete) the admin-adjusted scorecard so it reverts to consolidated."""
    _final_repo().delete_for_cycle(cycle_id)
    return {"status": "reset", "cycle_id": cycle_id}
