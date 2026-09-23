"""
Scorecard reminder engine.

Sends scorecard reminders to reviewers who have not yet submitted, on a
coordinator-chosen deadline with configurable T-minus offsets (e.g. 5 / 2 / 0
days before). On the deadline day (offset 0) it also escalates to the VMO
Coordinator. All mail goes through the service mailbox (Mail.Send) via
`mail_provider`.

Settings + idempotency are stored inside the cycle's `scorecard_config` JSONB
(key: "reminders") so no schema change is needed:

    scorecard_config.reminders = {
        "deadline": "2026-08-15",       # ISO date, coordinator-chosen
        "offsets": [5, 2, 0],           # editable days-before-deadline
        "form_base_url": "http://…",    # frontend origin for the form link
        "coordinator_email": "vmo@…",   # where the T-0 escalation goes (optional)
        "sent": ["5", "2"],             # offsets already dispatched (per deadline)
    }

That column also holds the measures, weights and the `teams` roster, so every write
from here goes through `_write_reminders` — see the caveat documented there.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from html import escape as _html_escape
from typing import Optional

from app.config import settings
from app.dependencies import (
    get_attendee_repo,
    get_cycle_repo,
    get_scorecard_submission_repo,
)
from app.core.workflow_engine import WORKFLOW_STATES
from app.services.email_templates import build_reminder_email, build_escalation_email
from app.services.mail_provider import get_mail_provider, MailSendError
from app.utils.scorecard_recipients import is_scorecard_recipient

logger = logging.getLogger(__name__)

# Reminders follow the DISPATCH marker, not the workflow state. The cycle reaches
# SCORECARD_REQUEST_SENT the moment the coordinator clicks "Proceed to scorecard" —
# before any scorecard mail exists — so keying off the state chased reviewers about
# a scorecard nobody had sent them. Conversely a team reopened after the tracker
# auto-advanced the cycle to SCORECARD_COMPILED still has to be chased, so the state
# is used only as a ceiling.
_MAX_STATE_IDX = WORKFLOW_STATES.index("SCORECARD_COMPILED")
DEFAULT_OFFSETS = [5, 2, 0]


def _is_collecting(cycle: dict) -> bool:
    """Whether a cycle is inside the window where reminders make sense."""
    if not cycle.get("scorecard_dispatched_at"):
        return False
    ws = cycle.get("workflow_state") or ""
    idx = WORKFLOW_STATES.index(ws) if ws in WORKFLOW_STATES else -1
    return idx <= _MAX_STATE_IDX


def _tone_label(days_left: int) -> str:
    if days_left <= 0:
        return "Final Reminder"
    if days_left <= 2:
        return "Deadline Notice"
    return "Reminder"


def get_settings(cycle: dict) -> dict:
    cfg = cycle.get("scorecard_config") or {}
    reminders = dict(cfg.get("reminders") or {})
    reminders.setdefault("deadline", None)
    reminders.setdefault("offsets", DEFAULT_OFFSETS)
    reminders.setdefault("form_base_url", None)
    reminders.setdefault("coordinator_email", None)
    reminders.setdefault("sent", [])
    return reminders


def _write_reminders(cycle_repo, cycle_id: str, cycle: dict, reminders: dict) -> None:
    """Persist ONLY ``scorecard_config -> reminders``.

    The reminder settings share the `scorecard_config` JSONB with the categories,
    measures, weights and the `teams` roster. Writing the whole column back from a
    snapshot read a moment earlier silently reverts any interleaved measure/team
    save (a lost update — both requests return 200), which is how a team can vanish
    from every measure's `teams` list and stop being asked for a scorecard.

    So prefer a server-side single-key merge when the repository exposes one
    (``set_scorecard_reminders(cycle_id, reminders)``, a thin wrapper over
    ``jsonb_set``) and fall back to the historical read-modify-write otherwise, so
    this module never needs raw SQL of its own. CycleRepository now implements it;
    the probe stays so a repository that does not (tests, a future store) still works.
    """
    targeted = getattr(cycle_repo, "set_scorecard_reminders", None)
    if callable(targeted):
        targeted(cycle_id, reminders)
        return
    cfg = dict(cycle.get("scorecard_config") or {})
    cfg["reminders"] = reminders
    cycle_repo.update_by_id("cycle_id", cycle_id, {"scorecard_config": cfg})


def save_settings(
    cycle_id: str,
    *,
    deadline: Optional[str],
    offsets: list[int],
    form_base_url: Optional[str] = None,
    coordinator_email: Optional[str] = None,
) -> dict:
    cycle_repo = get_cycle_repo()
    cycle = cycle_repo.get_by_cycle_id(cycle_id)
    if cycle is None:
        raise ValueError(f"Cycle '{cycle_id}' not found")
    reminders = dict((cycle.get("scorecard_config") or {}).get("reminders") or {})
    # Changing the deadline resets which offsets have been sent.
    if reminders.get("deadline") != deadline:
        reminders["sent"] = []
    reminders["deadline"] = deadline
    reminders["offsets"] = sorted({int(o) for o in offsets}, reverse=True)
    if form_base_url:
        reminders["form_base_url"] = form_base_url.rstrip("/")
    # Only touched when a value is actually supplied: "send reminder now" re-saves
    # deadline/offsets just to persist the form base URL and must not blank this.
    if coordinator_email is not None:
        reminders["coordinator_email"] = coordinator_email.strip().lower() or None
    _write_reminders(cycle_repo, cycle_id, cycle, reminders)
    return reminders


def _mark_sent(cycle_id: str, offset: int) -> None:
    cycle_repo = get_cycle_repo()
    cycle = cycle_repo.get_by_cycle_id(cycle_id)
    if cycle is None:
        return
    reminders = dict((cycle.get("scorecard_config") or {}).get("reminders") or {})
    sent = list(reminders.get("sent") or [])
    if str(offset) not in sent:
        sent.append(str(offset))
    reminders["sent"] = sent
    _write_reminders(cycle_repo, cycle_id, cycle, reminders)


def pending_respondents(cycle_id: str) -> list[dict]:
    """Reviewers who were actually SENT a scorecard and have not yet submitted one.

    Uses the shared `is_scorecard_recipient` rule rather than re-deriving it, so the
    reminder engine can never chase somebody `/dispatch-inapp` refuses to mail (an
    attendee who declined attendance) — that divergence had the submission tracker
    reporting "all responses collected" while this list kept nagging the same person.

    It also chases only addresses recorded in `scorecard_dispatched_to`: you cannot
    ask for a submission from a reviewer who was never sent a link (nothing
    dispatched yet, or their team was just reopened for editing)."""
    cycle = get_cycle_repo().get_by_cycle_id(cycle_id) or {}
    if not cycle.get("scorecard_dispatched_at"):
        return []  # nothing has been sent yet, so nobody can be late
    dispatched = {(e or "").strip().lower() for e in (cycle.get("scorecard_dispatched_to") or []) if e}
    attendees = get_attendee_repo().get_for_cycle(cycle_id)
    key_internal = [a for a in attendees if is_scorecard_recipient(a)]
    submissions = get_scorecard_submission_repo().get_for_cycle(cycle_id)
    submitted_ids = {s.get("attendee_id") for s in submissions if s.get("attendee_id")}
    out: list[dict] = []
    for a in key_internal:
        email = (a.get("email") or "").strip()
        if not email or a.get("attendee_id") in submitted_ids:
            continue
        # An empty set means a legacy cycle dispatched before the recipient list was
        # recorded — fall back to the old behaviour rather than muting its reminders.
        if dispatched and email.lower() not in dispatched:
            continue
        out.append({"attendee_id": a.get("attendee_id"), "name": a.get("name", ""), "email": email})
    return out


def _coordinators(cycle: dict, pending_ids: set) -> list[dict]:
    """Escalation recipients for the T-0 blast, in order of preference.

    Stakeholder roles were removed, so there is no role-tagged coordinator any more.
    This used to return *every* key internal reviewer, i.e. a superset of `pending` —
    so each late reviewer got an escalation addressed to them listing themselves as
    delinquent, and every reviewer was handed the names and email addresses of all
    the others. Instead: the coordinator address configured on the reminder settings;
    else the key reviewers who are NOT themselves late (nobody is escalated about
    themselves); else the service mailbox, so a blown deadline is never silent."""
    configured = (get_settings(cycle).get("coordinator_email") or "").strip()
    if configured:
        return [{"name": "VMO Coordinator", "email": configured}]
    cycle_id = cycle.get("cycle_id")
    attendees = get_attendee_repo().get_for_cycle(cycle_id)
    others = [
        {"name": a.get("name", ""), "email": (a.get("email") or "").strip()}
        for a in attendees
        if is_scorecard_recipient(a)
        and a.get("attendee_id") not in pending_ids
        and (a.get("email") or "").strip()
    ]
    if others:
        return others
    # Commonest case while nobody has submitted yet: pending == every reviewer, so
    # both branches above are empty. Fall back to the service mailbox rather than let
    # the escalation silently evaporate exactly when it matters most.
    fallback = (settings.graph_mail_sender or "").strip()
    if fallback:
        return [{"name": "VMO Coordinator", "email": fallback}]
    logger.error("T-0 escalation for cycle=%s has no recipient — configure a coordinator email", cycle_id)
    return []


def _form_link(base_url: Optional[str], cycle_id: str, attendee_id: str) -> str:
    base = (base_url or "").rstrip("/")
    return f"{base}/scorecard?cycle={cycle_id}&attendee={attendee_id}"


def _parse_deadline(deadline: Optional[str]) -> Optional[date]:
    if not deadline:
        return None
    try:
        return datetime.fromisoformat(deadline[:10]).date()
    except ValueError:
        return None


def send_tier(
    cycle: dict,
    offset: int,
    *,
    base_url: Optional[str],
    days_left: int,
    escalate: bool = True,
    subject_override: Optional[str] = None,
    html_override: Optional[str] = None,
    text_override: Optional[str] = None,
) -> dict:
    """Send the reminder for one offset to all pending reviewers; escalate at offset 0.

    When ``html_override`` is set (coordinator edited the draft) it is sent to the
    reviewers verbatim, substituting {{name}}/{{link}} per recipient. The T-0
    escalation to coordinators always uses its own template; `escalate=False`
    suppresses it, because a manual send is not a scheduled tier and must not
    re-broadcast the escalation on every click."""
    cycle_id = cycle.get("cycle_id")
    vendor = cycle.get("vendor_name", "")
    quarter = cycle.get("quarter", "")
    year = cycle.get("year")
    deadline = get_settings(cycle).get("deadline") or ""
    pending = pending_respondents(cycle_id)

    sent, failed = 0, 0
    for p in pending:
        link = _form_link(base_url or get_settings(cycle).get("form_base_url"), cycle_id, p["attendee_id"])
        if html_override:
            default_subject = f"Reminder — {vendor} QBR Scorecard ({quarter} {year})"
            safe_name = _html_escape(p["name"])
            subject = (subject_override or default_subject).replace("{{name}}", p["name"]).replace("\r", " ").replace("\n", " ").strip()
            html_body = html_override.replace("{{name}}", safe_name).replace("{{link}}", link)
            text_body = (text_override or "").replace("{{name}}", p["name"]).replace("{{link}}", link) or None
        else:
            email = build_reminder_email(
                attendee_name=p["name"], vendor_name=vendor, quarter=quarter, year=year,
                form_url=link, deadline=deadline, days_left=days_left, tone_label=_tone_label(days_left),
            )
            subject, html_body, text_body = email["subject"], email["html_body"], email["text_body"]
        try:
            get_mail_provider().send_html_email(
                to_email=p["email"], subject=subject,
                html_body=html_body, text_body=text_body,
            )
            sent += 1
        except MailSendError as exc:
            failed += 1
            logger.warning("reminder send failed cycle=%s to=%s: %s", cycle_id, p["email"], exc)

    escalated = 0
    if escalate and days_left <= 0 and pending:
        for c in _coordinators(cycle, {p["attendee_id"] for p in pending}):
            esc = build_escalation_email(
                coordinator_name=c["name"], vendor_name=vendor, quarter=quarter, year=year,
                deadline=deadline, pending=pending,
            )
            try:
                get_mail_provider().send_html_email(
                    to_email=c["email"], subject=esc["subject"],
                    html_body=esc["html_body"], text_body=esc["text_body"],
                )
                escalated += 1
            except MailSendError as exc:
                logger.warning("escalation send failed cycle=%s to=%s: %s", cycle_id, c["email"], exc)

    logger.info("reminder tier cycle=%s offset=%s pending=%d sent=%d failed=%d escalated=%d",
                cycle_id, offset, len(pending), sent, failed, escalated)
    return {"offset": offset, "pending": len(pending), "sent": sent, "failed": failed, "escalated": escalated}


def run_due(cycle: dict, *, today: date, base_url: Optional[str] = None) -> list[dict]:
    """Fire any offsets whose day is exactly today and that haven't been sent yet."""
    settings_ = get_settings(cycle)
    deadline = _parse_deadline(settings_.get("deadline"))
    if deadline is None:
        return []
    sent_offsets = set(str(o) for o in (settings_.get("sent") or []))
    results = []
    for offset in settings_.get("offsets") or DEFAULT_OFFSETS:
        offset = int(offset)
        fire_day = deadline.fromordinal(deadline.toordinal() - offset)  # deadline - offset days
        if today == fire_day and str(offset) not in sent_offsets:
            days_left = (deadline - today).days
            res = send_tier(cycle, offset, base_url=base_url or settings_.get("form_base_url"), days_left=days_left)
            _mark_sent(cycle.get("cycle_id"), offset)
            results.append(res)
    return results


def send_now(
    cycle: dict,
    *,
    base_url: Optional[str] = None,
    subject_override: Optional[str] = None,
    html_override: Optional[str] = None,
    text_override: Optional[str] = None,
) -> dict:
    """Manual 'send reminder now' — reminds all currently-pending reviewers immediately.

    Uses days-left from the deadline (if set) for the copy; does not consume a
    scheduled offset, so the automated T-5/T-2/T-0 still fire independently. An
    edited draft (html_override) is sent verbatim with per-recipient tokens.

    Never escalates: the draft the coordinator approves is the reminder only, and
    this button is unthrottled, so once the deadline had passed every click fired
    another full escalation blast the UI never reported. The scheduled T-0 tier
    still escalates, exactly once per deadline, via `_mark_sent`."""
    settings_ = get_settings(cycle)
    deadline = _parse_deadline(settings_.get("deadline"))
    today = datetime.now(timezone.utc).date()
    days_left = (deadline - today).days if deadline else 5
    return send_tier(
        cycle, days_left, base_url=base_url or settings_.get("form_base_url"), days_left=days_left,
        escalate=False,
        subject_override=subject_override, html_override=html_override, text_override=text_override,
    )


def run_all_due(today: Optional[date] = None) -> dict:
    """Scheduler entry point — evaluate every actively-collecting cycle."""
    today = today or datetime.now(timezone.utc).date()
    cycles = [c for c in get_cycle_repo().find_all() if _is_collecting(c)]
    fired = []
    for cycle in cycles:
        try:
            res = run_due(cycle, today=today)
            if res:
                fired.append({"cycle_id": cycle.get("cycle_id"), "tiers": res})
        except Exception as exc:  # noqa: BLE001 — never let one cycle kill the run
            logger.warning("reminder run failed for cycle=%s: %s", cycle.get("cycle_id"), exc)
    logger.info("reminder scheduler run — %d active cycle(s), %d fired", len(cycles), len(fired))
    return {"active_cycles": len(cycles), "fired": fired}
