"""What the meeting and vendor-prep agents hand back to the UI: minutes the Meeting tab
can always render, transcript notes under the requested meeting id, a vendor brief that
never invents a 0/5 score, and pushback drafts the response cards can display and save.
The LLM is a fake; no network, database or mail."""
import json
import unittest
from datetime import datetime, timezone

from app.agents.meeting_agent import MeetingAgent, _normalize_minutes
from app.agents.vendor_prep_agent import (
    VendorPrepAgent,
    _build_fallback_brief,
    _normalize_category_trends,
    _normalize_pushback_responses,
)


class FakeLLM:
    is_enabled = True

    def __init__(self, reply: str):
        self.reply = reply

    def call_simple(self, prompt, system="", max_tokens=1024):
        return self.reply


def _meeting_agent(llm=None) -> MeetingAgent:
    return MeetingAgent(meeting_repo=None, cycle_id="c1", llm_svc=llm)


NOTES = [
    {"note_type": "DECISION", "content": "Vendor to restore 95% OTD.", "raised_by": "Chair"},
    {"note_type": "OBJECTION", "content": "Vendor objected to the late-delivery penalty.", "raised_by": "Vendor"},
    {"note_type": "APPRECIATION", "content": "Thanks for the quick incident response.", "raised_by": "Chair"},
]


class MinutesTests(unittest.TestCase):
    def generate(self, llm=None, meeting_date=None):
        result = _meeting_agent(llm)._deterministic_generate_minutes({"params": {
            "meeting_id": "mtg-c1", "notes": NOTES, "attendees": ["Chair", "Vendor"],
            "meeting_date": meeting_date,
        }})
        return result["data"]["minutes"]

    def test_missing_meeting_date_defaults_to_today_not_none(self):
        minutes = self.generate()
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        self.assertEqual(minutes["meeting_date"], today)
        self.assertNotIn("None", minutes["executive_summary"])

    def test_fallback_minutes_keep_objections_and_appreciation(self):
        topics = {a["topic"]: a["summary"] for a in self.generate()["agenda_summaries"]}
        self.assertIn("late-delivery penalty", topics["Objections raised"])
        self.assertIn("incident response", topics["Appreciation"])

    def test_wrapped_or_partial_llm_minutes_are_normalised(self):
        reply = json.dumps({"minutes": {
            "executive_summary": "Good meeting.",
            "action_items": [{"description": "Send RCA"}, {"owner": "nobody"}],
            "meeting_id": "invented", "generated_at": "1999-01-01",
        }})
        minutes = self.generate(FakeLLM(reply), meeting_date="2026-11-03")
        self.assertEqual(minutes["executive_summary"], "Good meeting.")
        self.assertEqual(minutes["action_items"], [{"description": "Send RCA", "owner": "TBD", "due_date": ""}])
        for key in ("agenda_summaries", "key_decisions", "qa_log"):
            self.assertEqual(minutes[key], [])
        self.assertEqual(minutes["attendees"], ["Chair", "Vendor"])
        self.assertEqual((minutes["meeting_id"], minutes["cycle_id"], minutes["meeting_date"]),
                         ("mtg-c1", "c1", "2026-11-03"))
        self.assertNotEqual(minutes["generated_at"], "1999-01-01")

    def test_a_reply_that_is_not_minutes_falls_back(self):
        minutes = self.generate(FakeLLM('{"error": "model overloaded"}'))
        self.assertIn("_llm_raw", minutes)
        self.assertTrue(minutes["executive_summary"].startswith("Governance meeting held on"))

    def test_normalize_rejects_non_objects(self):
        self.assertIsNone(_normalize_minutes([1, 2], meeting_id="m", cycle_id="c", meeting_date="d", attendees=[]))


class TranscriptTests(unittest.TestCase):
    def parse(self, reply):
        return _meeting_agent(FakeLLM(reply))._deterministic_parse_transcript(
            {"params": {"meeting_id": "mtg-c1", "transcript": "Chair [09:00]: Action: send the RCA."}}
        )

    def test_notes_carry_the_requested_meeting_id(self):
        reply = json.dumps([{"note_id": "n1", "meeting_id": "m1", "note_type": "ACTION",
                             "content": "Send the RCA", "raised_by": "Chair"}])
        result = self.parse(reply)
        self.assertEqual(result["data"]["notes"][0]["meeting_id"], "mtg-c1")
        self.assertEqual(result["warnings"], [])

    def test_an_unreadable_reply_is_flagged_not_silent(self):
        result = self.parse('[{"note_id": "n1", "content": "cut off mid-')
        self.assertEqual(len(result["warnings"]), 1)
        self.assertTrue(result["data"]["notes"])  # keyword fallback still ran


SCORECARD = {
    "overall_internal_avg": 3.4,
    "categories": [
        {"category_label": "Delivery", "internal_avg": 4.2},
        {"category_label": "HSSE", "internal_avg": None},
        {"category_label": "Cost", "internal_avg": 2.6},
    ],
}
PREVIOUS = {"overall_score": 3.5, "categories": [
    {"theme": "Delivery", "consolidated_score": 3.6},
    {"theme": "HSSE", "consolidated_score": 4.2},
    {"theme": "Cost", "consolidated_score": 2.6},
]}


class VendorBriefTests(unittest.TestCase):
    def test_an_unscored_theme_is_not_reported_as_zero(self):
        brief = _build_fallback_brief(SCORECARD, PREVIOUS)
        self.assertNotIn("HSSE", [r["category"] for r in brief["category_ratings"]])
        self.assertFalse(any("HSSE" in c for c in brief["key_concerns"]))
        self.assertFalse(any("0/5" in c for c in brief["key_concerns"]))

    def test_theme_trends_use_up_down_flat(self):
        trends = {r["category"]: r["trend"] for r in _build_fallback_brief(SCORECARD, PREVIOUS)["category_ratings"]}
        self.assertEqual(trends, {"Delivery": "up", "Cost": "flat"})
        self.assertEqual({r["trend"] for r in _build_fallback_brief(SCORECARD)["category_ratings"]}, {"flat"})

    def test_llm_theme_trends_are_mapped(self):
        brief = {"category_ratings": [{"trend": "Improving"}, {"trend": "declining"}, {"trend": "stable"}, {"trend": "?"}]}
        _normalize_category_trends(brief)
        self.assertEqual([r["trend"] for r in brief["category_ratings"]], ["up", "down", "flat", "flat"])


class PushbackTests(unittest.TestCase):
    def test_stances_are_normalised_and_ids_assigned(self):
        drafts = _normalize_pushback_responses([
            {"stance": "Escalation", "content": "Per the SLA, the score stands."},  # capitalised
            {"stance": "diplomatic", "content": "Let's review together."},          # unknown
            {"stance": "escalation", "content": "Duplicate stance."},                # repeat
            {"stance": "neutral", "content": "   "},                                 # empty
        ], "pb1")
        self.assertEqual([d["stance"] for d in drafts], ["escalation", "factual", "neutral"])
        self.assertTrue(all(d["pushback_id"] == "pb1" and d["response_id"] and d["is_selected"] is False for d in drafts))
        self.assertEqual(len({d["response_id"] for d in drafts}), 3)

    def test_agent_falls_back_when_no_usable_draft_comes_back(self):
        agent = VendorPrepAgent(
            lambda cycle_id: {}, cycle_id="c1", llm_svc=FakeLLM('[{"stance": "factual", "content": ""}]'),
        )
        result = agent._deterministic_handle_pushback({"params": {"pushback_id": "pb1", "description": "x"}})
        self.assertEqual([r["stance"] for r in result["data"]["responses"]], ["factual", "neutral", "escalation"])
        self.assertTrue(result["summary"].startswith("3 response options"))


if __name__ == "__main__":
    unittest.main()
