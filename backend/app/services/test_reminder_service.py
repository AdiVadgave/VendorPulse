"""Scorecard reminders: which tier fires when, what counts as sent, who the deadline-day
escalation goes to, and that concurrent scheduler runs (one per gunicorn worker) cannot
double-send. No database or mail: repositories, mail provider and pool are fakes."""
import copy
import unittest
from contextlib import contextmanager
from datetime import date, timedelta
from unittest import mock

from app.services import reminder_service as rs
from app.services.mail_provider import MailSendError

DEADLINE = date(2026, 11, 20)
COORDINATOR = "vmo.coordinator@shell.com"
SERVICE_MAILBOX = "Mobility-VendorPulse@shell.com"


def _reviewer(n: int) -> dict:
    return {
        "attendee_id": f"a{n}", "name": f"Reviewer {n}", "email": f"r{n}@shell.com",
        "is_key": True, "type": "Internal Stakeholder", "confirmation_status": "CONFIRMED",
    }


def _cycle(offsets=(5, 2, 0), sent=(), coordinator=None, reviewers=1) -> dict:
    return {
        "cycle_id": "c1", "vendor_name": "Acme", "quarter": "Q3", "year": 2026,
        "workflow_state": "SCORECARD_COLLECTION",
        "scorecard_dispatched_at": "2026-11-01T00:00:00+00:00",
        "scorecard_dispatched_to": [f"r{n}@shell.com" for n in range(1, reviewers + 1)],
        "scorecard_config": {"reminders": {
            "deadline": DEADLINE.isoformat(), "offsets": list(offsets), "sent": [str(o) for o in sent],
            "form_base_url": "https://vp.example", "coordinator_email": coordinator,
        }},
    }


class _Cycles:
    def __init__(self, cycle):
        self.cycle = cycle

    def get_by_cycle_id(self, cycle_id):
        return copy.deepcopy(self.cycle) if cycle_id == self.cycle["cycle_id"] else None

    def find_all(self):
        return [copy.deepcopy(self.cycle)]

    def set_scorecard_reminders(self, cycle_id, reminders):
        self.cycle["scorecard_config"]["reminders"] = copy.deepcopy(reminders)

    @property
    def sent(self):
        return self.cycle["scorecard_config"]["reminders"]["sent"]


class _Rows:
    def __init__(self, rows):
        self.rows = list(rows)

    def get_for_cycle(self, cycle_id):
        return list(self.rows)


class _Mail:
    def __init__(self, fail=False):
        self.fail = fail
        self.sent: list[tuple[str, str]] = []

    def send_html_email(self, *, to_email, subject, html_body, text_body=None):
        if self.fail:
            raise MailSendError("Graph unavailable")
        self.sent.append((to_email, subject))
        return {}


class ReminderTests(unittest.TestCase):
    def setUp(self):
        self.mail = _Mail()

    @contextmanager
    def env(self, cycle, reviewers=1, submitted=()):
        self.cycles = _Cycles(cycle)
        attendees = _Rows(_reviewer(n) for n in range(1, reviewers + 1))
        submissions = _Rows({"attendee_id": a} for a in submitted)
        with mock.patch.multiple(
            rs,
            get_cycle_repo=lambda: self.cycles,
            get_attendee_repo=lambda: attendees,
            get_scorecard_submission_repo=lambda: submissions,
            get_mail_provider=lambda: self.mail,
        ), mock.patch.object(rs.settings, "graph_mail_sender", SERVICE_MAILBOX):
            yield

    def run_on(self, day: date):
        return rs.run_due(self.cycles.get_by_cycle_id("c1"), today=day)

    def recipients(self):
        return [to for to, _ in self.mail.sent]

    # ── which tier fires ────────────────────────────────────────────────────

    def test_a_tier_fires_on_its_own_day(self):
        with self.env(_cycle()):
            self.run_on(DEADLINE - timedelta(days=5))
            self.assertEqual(self.recipients(), ["r1@shell.com"])
            self.assertEqual(self.cycles.sent, ["5"])

    def test_a_missed_tier_is_caught_up_and_superseded_tiers_are_skipped(self):
        """Deadline saved one day out: T-5 and T-2 have both passed. Only T-2 (the tier
        whose window we are in) goes out — once — and T-5 is never sent late."""
        with self.env(_cycle()):
            res = self.run_on(DEADLINE - timedelta(days=1))
            self.assertEqual([r["offset"] for r in res], [2])
            self.assertEqual(self.recipients(), ["r1@shell.com"])
            self.assertEqual(self.cycles.sent, ["2"])
            self.assertEqual(self.run_on(DEADLINE - timedelta(days=1)), [])  # same day again
            self.assertEqual(len(self.mail.sent), 1)

    def test_nothing_fires_before_the_first_tier_or_after_the_deadline(self):
        with self.env(_cycle()):
            self.assertEqual(self.run_on(DEADLINE - timedelta(days=6)), [])
            self.assertEqual(self.run_on(DEADLINE + timedelta(days=1)), [])
            self.assertEqual(self.mail.sent, [])

    def test_current_tier(self):
        offsets = [5, 2, 0]
        self.assertIsNone(rs.current_tier(offsets, DEADLINE, DEADLINE - timedelta(days=6)))
        self.assertEqual(rs.current_tier(offsets, DEADLINE, DEADLINE - timedelta(days=5)), 5)
        self.assertEqual(rs.current_tier(offsets, DEADLINE, DEADLINE - timedelta(days=3)), 5)
        self.assertEqual(rs.current_tier(offsets, DEADLINE, DEADLINE - timedelta(days=1)), 2)
        self.assertEqual(rs.current_tier(offsets, DEADLINE, DEADLINE), 0)
        self.assertIsNone(rs.current_tier(offsets, DEADLINE, DEADLINE + timedelta(days=1)))

    # ── what counts as sent ─────────────────────────────────────────────────

    def test_a_tier_where_every_send_failed_is_not_marked_sent_and_is_retried(self):
        self.mail.fail = True
        with self.env(_cycle()):
            res = self.run_on(DEADLINE - timedelta(days=5))
            self.assertEqual((res[0]["sent"], res[0]["failed"]), (0, 1))
            self.assertEqual(self.cycles.sent, [])
            self.mail.fail = False
            self.run_on(DEADLINE - timedelta(days=4))  # next daily run, same window
            self.assertEqual(self.recipients(), ["r1@shell.com"])
            self.assertEqual(self.cycles.sent, ["5"])

    def test_a_tier_with_nobody_pending_is_marked_without_mailing(self):
        with self.env(_cycle(), submitted=["a1"]):
            self.run_on(DEADLINE - timedelta(days=5))
            self.assertEqual(self.mail.sent, [])
            self.assertEqual(self.cycles.sent, ["5"])

    # ── the deadline-day escalation ─────────────────────────────────────────

    def test_deadline_day_tier_escalates_to_the_coordinator(self):
        with self.env(_cycle(coordinator=COORDINATOR)):
            self.run_on(DEADLINE)
            self.assertEqual(self.recipients(), ["r1@shell.com", COORDINATOR])

    def test_a_caught_up_earlier_tier_on_the_deadline_day_does_not_escalate(self):
        """No T-0 tier configured: a missed T-2 caught up on the deadline day reminds
        the reviewer but must not send an escalation nobody asked for."""
        with self.env(_cycle(offsets=(5, 2), coordinator=COORDINATOR)):
            res = self.run_on(DEADLINE)
            self.assertEqual(self.recipients(), ["r1@shell.com"])
            self.assertEqual(res[0]["escalated"], 0)

    def test_escalation_never_goes_to_peer_reviewers(self):
        """No coordinator email: reviewer 2 has submitted, reviewer 1 is late. The
        escalation (which lists the late reviewers) goes to the service mailbox, never
        to reviewer 2."""
        with self.env(_cycle(reviewers=2), reviewers=2, submitted=["a2"]):
            self.run_on(DEADLINE)
            self.assertEqual(self.recipients(), ["r1@shell.com", SERVICE_MAILBOX])


class _Conn:
    def __init__(self, acquired):
        self.acquired = acquired
        self.statements: list[str] = []

    def execute(self, sql, params=None):
        self.statements.append(sql)
        return mock.Mock(fetchone=lambda: (self.acquired,))


class _Pool:
    def __init__(self, conn):
        self.conn = conn

    @contextmanager
    def connection(self):
        yield self.conn


class RunLockTests(unittest.TestCase):
    """Every gunicorn worker starts a scheduler, so run_all_due fires once per worker at
    08:00 UTC. Only the worker holding the advisory lock may run."""

    def test_skips_when_another_worker_holds_the_lock(self):
        conn = _Conn(acquired=False)
        with mock.patch.object(rs, "get_pool", lambda: _Pool(conn)), \
             mock.patch.object(rs, "get_cycle_repo") as repo, \
             mock.patch.object(rs, "run_due") as run_due:
            result = rs.run_all_due(today=DEADLINE)
        self.assertTrue(result.get("skipped"))
        repo.assert_not_called()
        run_due.assert_not_called()
        self.assertFalse(any("unlock" in s for s in conn.statements))

    def test_runs_and_releases_the_lock(self):
        conn = _Conn(acquired=True)
        cycles = _Cycles(_cycle())
        with mock.patch.object(rs, "get_pool", lambda: _Pool(conn)), \
             mock.patch.object(rs, "get_cycle_repo", lambda: cycles), \
             mock.patch.object(rs, "run_due", return_value=[{"offset": 5}]) as run_due:
            result = rs.run_all_due(today=DEADLINE)
        run_due.assert_called_once()
        self.assertEqual(result["fired"], [{"cycle_id": "c1", "tiers": [{"offset": 5}]}])
        self.assertTrue(any("pg_advisory_unlock" in s for s in conn.statements))

    def test_releases_the_lock_even_when_the_run_fails(self):
        conn = _Conn(acquired=True)
        broken = mock.Mock(find_all=mock.Mock(side_effect=RuntimeError("db hiccup")))
        with mock.patch.object(rs, "get_pool", lambda: _Pool(conn)), \
             mock.patch.object(rs, "get_cycle_repo", lambda: broken):
            with self.assertRaises(RuntimeError):
                rs.run_all_due(today=DEADLINE)
        self.assertTrue(any("pg_advisory_unlock" in s for s in conn.statements))


if __name__ == "__main__":
    unittest.main()
