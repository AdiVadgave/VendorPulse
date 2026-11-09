"""Route-level checks for workflow fixes: reminder status and settings, when a scorecard
may still be submitted, how approved minutes are stored and who may receive them, and
the manual-meeting workflow advance. Repositories are fakes; nothing touches the
database, the LLM or mail."""
import copy
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from fastapi import HTTPException

from app.api.routes import meeting_agent as minutes_routes
from app.api.routes import scheduling as scheduling_routes
from app.api.routes import scorecard_v2
from app.api.routes import vendor_prep as vendor_prep_routes
from app.services import reminder_service


def _today():
    return datetime.now(timezone.utc).date()


def _cycle(**overrides) -> dict:
    cycle = {
        "cycle_id": "c1", "vendor_name": "Acme", "quarter": "Q3", "year": 2026,
        "workflow_state": "SCORECARD_COLLECTION", "scorecard_config": {},
    }
    cycle.update(overrides)
    return cycle


def _with_reminders(deadline, sent=(), coordinator=None) -> dict:
    return _cycle(scorecard_config={"reminders": {
        "deadline": deadline.isoformat(), "offsets": [5, 2, 0], "sent": list(sent),
        "coordinator_email": coordinator,
    }})


class _CycleRepo:
    def __init__(self, *reads):
        """Each get_by_cycle_id returns the next read (the last one repeats)."""
        self.reads = [copy.deepcopy(r) for r in reads]
        self.advanced: list[str] = []
        self.reminders = None

    def get_by_cycle_id(self, cycle_id):
        return copy.deepcopy(self.reads[0] if len(self.reads) == 1 else self.reads.pop(0))

    def set_scorecard_reminders(self, cycle_id, reminders):
        self.reminders = reminders

    def mark_teams_meeting_scheduled(self, *a, **k):
        pass

    def update_by_id(self, *a, **k):
        pass

    def advance_workflow_state(self, cycle_id, new_state, updated_at):
        self.advanced.append(new_state)
        return {"cycle_id": cycle_id, "workflow_state": new_state}


def _reviewer(**overrides) -> dict:
    att = {"attendee_id": "a1", "cycle_id": "c1", "name": "Reviewer One", "email": "r1@shell.com",
           "is_key": True, "type": "Internal Stakeholder"}
    att.update(overrides)
    return att


class ReminderStatusTests(unittest.TestCase):
    def status(self, cycle):
        with mock.patch.object(reminder_service, "pending_respondents", return_value=[]):
            return {t["offset"]: t["status"] for t in scorecard_v2._reminder_status(cycle)["tiers"]}

    def test_only_the_tier_the_next_run_sends_is_due(self):
        """Deadline tomorrow: T-2 is the current window, T-5 was superseded."""
        tiers = self.status(_with_reminders(_today() + timedelta(days=1)))
        self.assertEqual(tiers, {5: "skipped", 2: "due", 0: "scheduled"})

    def test_unsent_tiers_are_skipped_once_the_deadline_has_passed(self):
        tiers = self.status(_with_reminders(_today() - timedelta(days=1), sent=["5"]))
        self.assertEqual(tiers, {5: "sent", 2: "skipped", 0: "skipped"})


class ReminderSettingsTests(unittest.TestCase):
    def put(self, body: dict, stored_coordinator="old.vmo@shell.com"):
        repo = _CycleRepo(_with_reminders(_today() + timedelta(days=9), coordinator=stored_coordinator))
        payload = scorecard_v2.ReminderSettingsUpdate(**body)
        with mock.patch.object(scorecard_v2, "get_cycle_repo", lambda: repo), \
             mock.patch.object(reminder_service, "get_cycle_repo", lambda: repo), \
             mock.patch.object(reminder_service, "pending_respondents", return_value=[]):
            scorecard_v2.put_reminders("c1", payload)
        return repo.reminders

    def test_blanking_the_escalation_address_clears_it(self):
        saved = self.put({"deadline": "2026-12-01", "offsets": [5, 2, 0], "coordinator_email": None})
        self.assertIsNone(saved["coordinator_email"])

    def test_omitting_the_escalation_address_keeps_it(self):
        saved = self.put({"deadline": "2026-12-01", "offsets": [5, 2, 0]})
        self.assertEqual(saved["coordinator_email"], "old.vmo@shell.com")


class SubmissionGateTests(unittest.TestCase):
    def submit(self, cycle, attendee):
        payload = scorecard_v2.ScorecardSubmission(cycle_id="c1", attendee_id="a1")
        attendees = mock.Mock(find_by_id=lambda field, value: attendee)
        with mock.patch.object(scorecard_v2, "get_cycle_repo", lambda: _CycleRepo(cycle)), \
             mock.patch.object(scorecard_v2, "get_attendee_repo", lambda: attendees):
            scorecard_v2.submit_scorecard(payload)

    def test_submissions_close_once_the_review_meeting_is_done(self):
        for state in ("POST_MEETING_COMPLETE", "ARCHIVED"):
            with self.subTest(state=state), self.assertRaises(HTTPException) as ctx:
                self.submit(_cycle(workflow_state=state), _reviewer())
            self.assertEqual(ctx.exception.status_code, 409)
            self.assertIn("closed", ctx.exception.detail)

    def test_only_key_reviewers_may_submit(self):
        with self.assertRaises(HTTPException) as ctx:
            self.submit(_cycle(), _reviewer(is_key=False))
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("not currently listed", ctx.exception.detail)

    def test_collection_and_later_prep_stages_stay_open(self):
        for state in ("SCORECARD_COLLECTION", "SCORECARD_COMPILED", "INTERNAL_ALIGNMENT", "VENDOR_PREP"):
            with self.subTest(state=state):
                self.assertIsNone(scorecard_v2._submission_block_reason(_cycle(workflow_state=state), _reviewer()))

    def test_form_meta_explains_before_the_form_is_filled(self):
        attendees = mock.Mock(find_by_id=lambda field, value: _reviewer())
        with mock.patch.object(scorecard_v2, "get_cycle_repo", lambda: _CycleRepo(_cycle(workflow_state="ARCHIVED"))), \
             mock.patch.object(scorecard_v2, "get_attendee_repo", lambda: attendees), \
             mock.patch.object(scorecard_v2, "find_previous_cycle_id", return_value=None):
            meta = scorecard_v2.get_form_meta("c1", attendee="a1")
        self.assertIn("closed", meta["closed_reason"])
        self.assertIsNotNone(meta["respondent"])


class MinutesTests(unittest.TestCase):
    def test_approval_stores_the_minutes_as_approved(self):
        artifacts = mock.Mock()
        edited = {"executive_summary": "Edited by the coordinator", "action_items": []}
        with mock.patch.object(minutes_routes, "get_meeting_artifact_repo", lambda: artifacts):
            minutes_routes.approve_minutes(
                "c1", minutes_routes.ApproveMinutesRequest(meeting_id="mtg-c1", minutes=edited)
            )
        cycle_id, meeting_id, patch = artifacts.upsert.call_args.args
        self.assertEqual((cycle_id, meeting_id), ("c1", "mtg-c1"))
        self.assertEqual(patch["minutes"], edited)
        self.assertIn("minutes_approved_at", patch)

    def test_approval_without_minutes_leaves_the_stored_minutes_alone(self):
        artifacts = mock.Mock()
        with mock.patch.object(minutes_routes, "get_meeting_artifact_repo", lambda: artifacts):
            minutes_routes.approve_minutes("c1", minutes_routes.ApproveMinutesRequest(meeting_id="mtg-c1"))
        self.assertNotIn("minutes", artifacts.upsert.call_args.args[2])

    def test_spr_minutes_never_go_to_people_who_declined(self):
        attendees = mock.Mock(get_for_cycle=lambda cycle_id: [
            {"name": "Going", "email": "going@shell.com", "type": "Internal Stakeholder"},
            {"name": "Declined", "email": "declined@shell.com", "type": "Internal Stakeholder",
             "confirmation_status": "DECLINED"},
        ])
        with mock.patch.object(minutes_routes, "get_attendee_repo", lambda: attendees):
            candidates, _ = minutes_routes._resolve_minutes_candidates("c1", "mtg-c1")
        self.assertEqual([c["email"] for c in candidates], ["going@shell.com"])


class VendorPrepInviteTests(unittest.TestCase):
    def test_people_added_only_to_the_meeting_roster_are_recorded_as_invited(self):
        attendees = mock.Mock(get_for_cycle=lambda cycle_id: [{"email": "cycle.member@shell.com"}])
        chosen = vendor_prep_routes._resolve_invite_emails(
            ["cycle.member@shell.com", "sme.added@shell.com", "stranger@elsewhere.com"],
            attendees, "c1", roster_emails=["cycle.member@shell.com", "sme.added@shell.com"],
        )
        self.assertEqual(chosen, ["cycle.member@shell.com", "sme.added@shell.com"])

    def test_no_selection_defaults_to_the_meeting_roster(self):
        attendees = mock.Mock(get_for_cycle=lambda cycle_id: [{"email": "a@shell.com"}, {"email": "declined@shell.com"}])
        self.assertEqual(
            vendor_prep_routes._resolve_invite_emails(None, attendees, "c1", roster_emails=["a@shell.com"]),
            ["a@shell.com"],
        )


class ManualMeetingTests(unittest.TestCase):
    def test_steps_are_counted_from_the_fresh_read(self):
        """The cycle moved on between the route's first read and the advance. Counting
        steps from the stale read over-advanced it past MEETING_SCHEDULED."""
        repo = _CycleRepo(_cycle(workflow_state="CYCLE_CREATED"), _cycle(workflow_state="MEETING_SCHEDULED"))
        meetings = mock.Mock(get_for_cycle=lambda cycle_id: [])
        scheduling_routes.set_manual_meeting(
            "c1",
            scheduling_routes.ManualMeetingRequest(start_time="2026-12-01T10:00:00Z"),
            cycle_repo=repo, meeting_repo=meetings,
        )
        self.assertEqual(repo.advanced, [])


if __name__ == "__main__":
    unittest.main()
