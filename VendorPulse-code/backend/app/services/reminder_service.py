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
        "sent": ["5", "2"],             # offsets already dispatched (per deadline)
    }
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Optional

from app.dependencies import (
    get_attendee_repo,
    get_cycle_repo,
    get_scorecard_submission_repo,
)
from app.core.workflow_engine import WORKFLOW_STATES
from app.services.email_templates import build_reminder_email, build_escalation_email
from app.services.mail_provider import get_mail_provider, MailSendError

logger = logging.getLogger(__name__)

# Cycles are only reminded while they are collecting scorecards.
_ACTIVE_STATES = {"SCORECARD_REQUEST_SENT", "SCORECARD_COLLECTION"}
DEFAULT_OFFSETS = [5, 2, 0]


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
    reminders.setdefault("sent", [])
    return reminders


def save_settings(
    cycle_id: str,
    *,
    deadline: Optional[str],
    offsets: list[int],
    form_base_url: Optional[str] = None,
) -> dict:
    cycle_repo = get_cycle_repo()
    cycle = cycle_repo.get_by_cycle_id(cycle_id)
    if cycle is None:
        raise ValueError(f"Cycle '{cycle_id}' not found")
    cfg = dict(cycle.get("scorecard_config") or {})
    reminders = dict(cfg.get("reminders") or {})
    # Changing the deadline resets which offsets have been sent.
    if reminders.get("deadline") != deadline:
        reminders["sent"] = []
    reminders["deadline"] = deadline
    reminders["offsets"] = sorted({int(o) for o in offsets}, reverse=True)
    if form_base_url:
        reminders["form_base_url"] = form_base_url.rstrip("/")
    cfg["reminders"] = reminders
    cycle_repo.update_by_id("cycle_id", cycle_id, {"scorecard_config": cfg})
    return reminders


def _mark_sent(cycle_id: str, offset: int) -> None:
    cycle_repo = get_cycle_repo()
    cycle = cycle_repo.get_by_cycle_id(cycle_id)
    if cycle is None:
        return
    cfg = dict(cycle.get("scorecard_config") or {})
    reminders = dict(cfg.get("reminders") or {})
    sent = list(reminders.get("sent") or [])
    if str(offset) not in sent:
        sent.append(str(offset))
    reminders["sent"] = sent
    cfg["reminders"] = reminders
    cycle_repo.update_by_id("cycle_id", cycle_id, {"scorecard_config": cfg})


def pending_respondents(cycle_id: str) -> list[dict]:
    """Key internal (non-vendor) reviewers who have not yet submitted a scorecard."""
    attendees = [a for a in get_attendee_repo().find_all() if a.get("cycle_id") == cycle_id]
    key_internal = [a for a in attendees if a.get("is_key") and a.get("type") != "Vendor"]
    submissions = get_scorecard_submission_repo().get_for_cycle(cycle_id)
    submitted_ids = {s.get("attendee_id") for s in submissions if s.get("attendee_id")}
    return [
        {"attendee_id": a.get("attendee_id"), "name": a.get("name", ""), "email": (a.get("email") or "").strip()}
        for a in key_internal
        if a.get("attendee_id") not in submitted_ids and (a.get("email") or "").strip()
    ]


def _coordinators(cycle_id: str) -> list[dict]:
    attendees = [a for a in get_attendee_repo().find_all() if a.get("cycle_id") == cycle_id]
    return [
        {"name": a.get("name", ""), "email": (a.get("email") or "").strip()}
        for a in attendees
        if "COORDINATOR" in str(a.get("role", "")).upper() and (a.get("email") or "").strip()
    ]


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
    subject_override: Optional[str] = None,
    html_override: Optional[str] = None,
    text_override: Optional[str] = None,
) -> dict:
    """Send the reminder for one offset to all pending reviewers; escalate at offset 0.

    When ``html_override`` is set (coordinator edited the draft) it is sent to the
    reviewers verbatim, substituting {{name}}/{{link}} per recipient. The T-0
    escalation to coordinators always uses its own template."""
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
            subject = (subject_override or default_subject).replace("{{name}}", p["name"])
            html_body = html_override.replace("{{name}}", p["name"]).replace("{{link}}", link)
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
    if days_left <= 0 and pending:
        for c in _coordinators(cycle_id):
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
    edited draft (html_override) is sent verbatim with per-recipient tokens."""
    settings_ = get_settings(cycle)
    deadline = _parse_deadline(settings_.get("deadline"))
    today = datetime.now(timezone.utc).date()
    days_left = (deadline - today).days if deadline else 5
    return send_tier(
        cycle, days_left, base_url=base_url or settings_.get("form_base_url"), days_left=days_left,
        subject_override=subject_override, html_override=html_override, text_override=text_override,
    )


def run_all_due(today: Optional[date] = None) -> dict:
    """Scheduler entry point — evaluate every actively-collecting cycle."""
    today = today or datetime.now(timezone.utc).date()
    cycles = [c for c in get_cycle_repo().find_all() if c.get("workflow_state") in _ACTIVE_STATES]
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
