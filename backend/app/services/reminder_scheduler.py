"""
In-app daily scheduler for scorecard reminders.

Runs once a day (while the backend is up) and fires any scorecard reminders that
are due today via `reminder_service.run_all_due()`. APScheduler is imported
defensively: if it isn't installed the app still boots and the manual "Send
reminder now" button + endpoint keep working — only the automated firing is off.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_scheduler = None  # type: ignore[var-annotated]


def start_reminder_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
    except Exception:
        logger.warning(
            "APScheduler not installed — automated scorecard reminders are OFF "
            "(manual 'Send reminder now' still works). Run `pip install apscheduler` to enable."
        )
        return

    from app.services.reminder_service import run_all_due

    def _job() -> None:
        try:
            run_all_due()
        except Exception as exc:  # noqa: BLE001
            logger.warning("scorecard reminder job error: %s", exc)

    sched = BackgroundScheduler(daemon=True, timezone="UTC")
    # Daily at 08:00 UTC. Every worker starts one of these; run_all_due takes a
    # database lock so only one run proceeds, and a missed run is caught up by the
    # next one (see reminder_service.run_due).
    sched.add_job(_job, "cron", hour=8, minute=0, id="scorecard_reminders", replace_existing=True)
    sched.start()
    _scheduler = sched
    logger.info("Scorecard reminder scheduler started (daily 08:00 UTC).")


def stop_reminder_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        try:
            _scheduler.shutdown(wait=False)
        except Exception:  # noqa: BLE001
            pass
        _scheduler = None
