"""Only the person who scheduled a meeting may reschedule or cancel it — for the SPR,
the internal-alignment and the vendor-prep meetings — and the Outlook event id of each
Teams meeting is stored so it can be cancelled. Alice schedules; Bob is a teammate who
sees the same cycle. Repositories are fakes; nothing touches the database or Graph."""
import copy
import unittest
from unittest import mock

from fastapi import HTTPException

from app.api.routes import alignment as alignment_routes
from app.api.routes import scheduling as scheduling_routes
from app.api.routes import vendor_prep as vendor_prep_routes
from app.core.auth import CurrentUser
from app.utils.meeting_owner import ensure_can_change_meeting, graph_event_id_for

ALICE = CurrentUser(sub="a", email="alice@shell.com", name="Alice")
BOB = CurrentUser(sub="b", email="bob@shell.com", name="Bob")
CYCLE = {"cycle_id": "c1", "vendor_name": "Acme", "quarter": "Q3", "year": 2026,
         "workflow_state": "INTERNAL_ALIGNMENT"}
ROSTER = [{"email": "alice@shell.com", "type": "Internal Stakeholder"},
          {"email": "carol@shell.com", "type": "Internal Stakeholder"}]
LINK = "https://teams.microsoft.com/l/meetup-join/abc"


class _Meetings:
    def __init__(self, rows=()):
        self.rows = [copy.deepcopy(r) for r in rows]

    def get_for_cycle(self, cycle_id):
        return [copy.deepcopy(r) for r in self.rows if r.get("cycle_id") == cycle_id]

    def insert(self, record):
        self.rows.append(copy.deepcopy(record))
        return record

    def replace_by_id(self, field, value, record):
        self.rows = [copy.deepcopy(record) if r.get(field) == value else r for r in self.rows]
        return record

    def delete_by_id(self, field, value):
        before = len(self.rows)
        self.rows = [r for r in self.rows if r.get(field) != value]
        return len(self.rows) < before

    def only(self):
        assert len(self.rows) == 1, self.rows
        return self.rows[0]


def _participants():
    return mock.Mock(get_for_meeting=lambda meeting_id: [])


def _existing(meeting_type, scheduled_by="alice@shell.com", **extra):
    row = {"meeting_id": "m1", "cycle_id": "c1", "meeting_type": meeting_type, "status": "scheduled",
           "alignment_index": 1, "teams_meeting_url": LINK, "graph_event_id": "AAMkOld",
           "scheduled_by": scheduled_by, "time_slot": {"date": "2026-11-20", "start_time": "09:00"}}
    row.update(extra)
    return row


class AlignmentOwnershipTests(unittest.TestCase):
    def schedule(self, meetings, user, **body):
        payload = alignment_routes.ManualAlignmentMeetingRequest(
            start_time="2026-11-20T09:00:00Z", meeting_url=body.pop("meeting_url", LINK), **body,
        )
        with mock.patch.object(alignment_routes, "list_meeting_attendees", lambda *a, **k: ROSTER):
            return alignment_routes.schedule_alignment_meeting_manual(
                "c1", payload, cycle_repo=mock.Mock(get_by_cycle_id=lambda cid: dict(CYCLE)),
                attendee_repo=mock.Mock(), meeting_repo=meetings, participant_repo=mock.Mock(),
                ma_repo=mock.Mock(), seed_repo=mock.Mock(), user=user,
            )

    def delete(self, meetings, user):
        return alignment_routes.delete_alignment_meeting(
            "c1", index=1, meeting_repo=meetings, participant_repo=mock.Mock(), user=user,
        )

    def test_scheduling_records_the_outlook_id_and_the_scheduler(self):
        meetings = _Meetings()
        res = self.schedule(meetings, ALICE, graph_event_id="AAMkNew")
        row = meetings.only()
        self.assertEqual((row["graph_event_id"], row["scheduled_by"]), ("AAMkNew", "alice@shell.com"))
        self.assertEqual((res["graph_event_id"], res["scheduled_by"]), ("AAMkNew", "alice@shell.com"))

    def test_a_teammate_cannot_reschedule_it(self):
        meetings = _Meetings([_existing("INTERNAL_ALIGNMENT")])
        with self.assertRaises(HTTPException) as ctx:
            self.schedule(meetings, BOB, graph_event_id="AAMkBob")
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("alice@shell.com", ctx.exception.detail)
        self.assertEqual(meetings.only()["graph_event_id"], "AAMkOld")

    def test_a_teammate_cannot_delete_it(self):
        meetings = _Meetings([_existing("INTERNAL_ALIGNMENT")])
        with self.assertRaises(HTTPException) as ctx:
            self.delete(meetings, BOB)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(len(meetings.rows), 1)

    def test_the_scheduler_can_delete_it(self):
        meetings = _Meetings([_existing("INTERNAL_ALIGNMENT")])
        self.assertEqual(self.delete(meetings, ALICE), {"deleted": True, "meeting_index": 1})
        self.assertEqual(meetings.rows, [])

    def test_rescheduling_keeps_the_id_only_for_the_same_teams_meeting(self):
        meetings = _Meetings([_existing("INTERNAL_ALIGNMENT")])
        self.schedule(meetings, ALICE)                                   # moved, same link
        self.assertEqual(meetings.only()["graph_event_id"], "AAMkOld")
        self.schedule(meetings, ALICE, meeting_url="https://teams.microsoft.com/l/other")
        self.assertIsNone(meetings.only()["graph_event_id"])             # a different meeting

    def test_an_older_meeting_with_no_scheduler_stays_open_and_is_claimed(self):
        meetings = _Meetings([_existing("INTERNAL_ALIGNMENT", scheduled_by=None)])
        self.schedule(meetings, BOB)
        self.assertEqual(meetings.only()["scheduled_by"], "bob@shell.com")

    def test_the_meeting_list_exposes_the_id_and_the_scheduler(self):
        meetings = _Meetings([_existing("INTERNAL_ALIGNMENT")])
        listed = alignment_routes.list_alignment_meetings("c1", meeting_repo=meetings, participant_repo=_participants())
        m = listed["meetings"][0]
        self.assertEqual((m["graph_event_id"], m["scheduled_by"]), ("AAMkOld", "alice@shell.com"))


class VendorPrepOwnershipTests(unittest.TestCase):
    def schedule(self, meetings, user, **body):
        payload = vendor_prep_routes.VPManualScheduleRequest(
            start_time="2026-11-25T09:00:00Z", meeting_url=LINK, **body,
        )
        attendees = mock.Mock(get_for_cycle=lambda cid: ROSTER)
        with mock.patch.object(vendor_prep_routes, "list_meeting_attendees", lambda *a, **k: ROSTER):
            return vendor_prep_routes.schedule_vendor_prep_meeting_manual(
                "c1", payload, cycle_repo=mock.Mock(get_by_cycle_id=lambda cid: dict(CYCLE)),
                attendee_repo=attendees, meeting_repo=meetings, participant_repo=mock.Mock(),
                ma_repo=mock.Mock(), seed_repo=mock.Mock(), user=user,
            )

    def test_scheduling_records_the_outlook_id_and_the_scheduler(self):
        meetings = _Meetings()
        self.schedule(meetings, ALICE, graph_event_id="AAMkPrep")
        row = meetings.only()
        self.assertEqual((row["graph_event_id"], row["scheduled_by"]), ("AAMkPrep", "alice@shell.com"))

    def test_only_the_scheduler_can_reschedule_or_cancel(self):
        meetings = _Meetings([_existing("VENDOR_PREP")])
        with self.assertRaises(HTTPException) as ctx:
            self.schedule(meetings, BOB)
        self.assertEqual(ctx.exception.status_code, 403)
        with self.assertRaises(HTTPException):
            vendor_prep_routes.delete_vendor_prep_meeting("c1", meeting_repo=meetings, participant_repo=mock.Mock(), user=BOB)
        self.assertEqual(len(meetings.rows), 1)
        res = vendor_prep_routes.delete_vendor_prep_meeting("c1", meeting_repo=meetings, participant_repo=mock.Mock(), user=ALICE)
        self.assertTrue(res["deleted"])
        self.assertEqual(meetings.rows, [])


class SprOwnershipTests(unittest.TestCase):
    def repo(self, **cycle_fields):
        cycle = {**CYCLE, "workflow_state": "MEETING_SCHEDULED", **cycle_fields}
        repo = mock.Mock()
        repo.get_by_cycle_id.side_effect = lambda cid: dict(cycle)
        repo.clear_teams_meeting.side_effect = lambda cid: {**cycle, "teams_meeting_scheduled_at": None}
        return repo

    def reschedule(self, repo, user):
        return scheduling_routes.set_manual_meeting(
            "c1", scheduling_routes.ManualMeetingRequest(start_time="2026-12-01T10:00:00Z", event_id="AAMkSpr"),
            cycle_repo=repo, meeting_repo=mock.Mock(get_for_cycle=lambda cid: []), user=user,
        )

    def test_scheduling_records_the_scheduler(self):
        repo = self.repo()
        self.reschedule(repo, ALICE)
        self.assertEqual(repo.mark_teams_meeting_scheduled.call_args.kwargs["scheduled_by"], "alice@shell.com")

    def test_a_teammate_cannot_reschedule_the_spr(self):
        repo = self.repo(teams_meeting_scheduled_at="2026-11-30T10:00:00+00:00", teams_meeting_scheduled_by="alice@shell.com")
        with self.assertRaises(HTTPException) as ctx:
            self.reschedule(repo, BOB)
        self.assertEqual(ctx.exception.status_code, 403)
        repo.mark_teams_meeting_scheduled.assert_not_called()

    def test_an_older_spr_with_no_scheduler_can_be_moved_and_is_claimed(self):
        repo = self.repo(teams_meeting_scheduled_at="2026-11-30T10:00:00+00:00")
        self.reschedule(repo, BOB)
        self.assertEqual(repo.mark_teams_meeting_scheduled.call_args.kwargs["scheduled_by"], "bob@shell.com")

    def test_only_the_scheduler_can_cancel_the_spr(self):
        repo = self.repo(teams_meeting_scheduled_at="2026-11-30T10:00:00+00:00", teams_meeting_scheduled_by="alice@shell.com")
        with self.assertRaises(HTTPException) as ctx:
            scheduling_routes.cancel_spr_meeting("c1", cycle_repo=repo, user=BOB)
        self.assertEqual(ctx.exception.status_code, 403)
        repo.clear_teams_meeting.assert_not_called()
        self.assertTrue(scheduling_routes.cancel_spr_meeting("c1", cycle_repo=repo, user=ALICE)["cancelled"])
        repo.clear_teams_meeting.assert_called_once_with("c1")

    def test_cancelling_when_nothing_is_scheduled_is_a_no_op(self):
        repo = self.repo()
        self.assertFalse(scheduling_routes.cancel_spr_meeting("c1", cycle_repo=repo, user=BOB)["cancelled"])
        repo.clear_teams_meeting.assert_not_called()


class RuleTests(unittest.TestCase):
    def test_the_scheduler_check_ignores_case(self):
        ensure_can_change_meeting("Alice@Shell.com", ALICE, "cancel")  # no exception
        ensure_can_change_meeting(None, BOB, "cancel")                 # nobody recorded → open

    def test_graph_event_id_for(self):
        old = {"teams_meeting_url": LINK, "graph_event_id": "AAMkOld"}
        self.assertEqual(graph_event_id_for("AAMkNew", old, LINK), "AAMkNew")
        self.assertEqual(graph_event_id_for(None, old, LINK), "AAMkOld")
        self.assertIsNone(graph_event_id_for(None, old, "https://teams.microsoft.com/l/other"))
        self.assertIsNone(graph_event_id_for("  ", None, LINK))


if __name__ == "__main__":
    unittest.main()
