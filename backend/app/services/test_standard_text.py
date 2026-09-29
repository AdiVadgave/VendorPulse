"""
Pins the Shell-approved invite and email texts.

These strings are signed off by the business. They are duplicated in
frontend/src/lib/standardText.ts because the browser drafts some invites itself, so the
two can drift — and a drift means Shell stakeholders receive wording nobody approved.
This module is the reference; the assertions below are the wording, written out in full
so a change to standard_text.py cannot pass silently.
"""
import unittest

from app.services import standard_text as T

VENDOR, QUARTER, YEAR = "Zensar", "Q1", 2026
EN_DASH = "–"


class CyclePeriodTests(unittest.TestCase):
    def test_each_quarter_maps_to_its_months(self):
        self.assertEqual(T.cycle_period("Q1", 2026), ("Jan 2026", "Mar 2026"))
        self.assertEqual(T.cycle_period("Q2", 2026), ("Apr 2026", "Jun 2026"))
        self.assertEqual(T.cycle_period("Q3", 2026), ("Jul 2026", "Sep 2026"))
        self.assertEqual(T.cycle_period("Q4", 2026), ("Oct 2026", "Dec 2026"))

    def test_unknown_quarter_degrades_to_the_year_rather_than_a_broken_title(self):
        self.assertEqual(T.cycle_period("", 2026), ("2026", "2026"))
        self.assertEqual(T.cycle_period("Q9", 2026), ("2026", "2026"))


class TitleTests(unittest.TestCase):
    def test_separator_after_spr_is_an_en_dash_and_between_months_a_hyphen(self):
        title = T.spr_title(VENDOR, QUARTER, YEAR)
        self.assertEqual(title, f"Shell/Zensar SPR {EN_DASH} Jan 2026 - Mar 2026")
        self.assertIn(EN_DASH, title)

    def test_prefixed_titles(self):
        for prefix in ("Internal Alignment 1", "Internal Alignment 2", "Prep Call", "Scorecard"):
            self.assertEqual(
                T.spr_title(VENDOR, QUARTER, YEAR, prefix),
                f"{prefix} | Shell/Zensar SPR {EN_DASH} Jan 2026 - Mar 2026",
            )


class BodyTests(unittest.TestCase):
    def test_spr_invite_body(self):
        self.assertEqual(
            T.spr_invite_body("Colleague", VENDOR, QUARTER, YEAR),
            "Dear Colleague,\n\n"
            "You are invited to the Shell/Zensar SPR, covering the Jan 2026 - Mar 2026 period.\n\n"
            "The preceding preparation sessions will be scheduled shortly, and any additional "
            "details relevant to this call will be shared by the meeting organiser through a "
            "separate email.\n\n"
            "Thank you.\nMobility Vendor Pulse Scheduling Agent",
        )

    def test_alignment_session_one_carries_the_important_line(self):
        body = T.alignment_invite_body("Colleague", VENDOR, QUARTER, YEAR, 1)
        self.assertEqual(
            body,
            "Dear Colleague,\n\n"
            "You are invited to the Internal Alignment Session 1 for the Shell/Zensar SPR "
            "covering the Jan 2026 - Mar 2026 period.\n\n"
            "Any additional details relevant to this call will be shared by the meeting "
            "organiser through a separate email.\n\n"
            "IMPORTANT: Kindly submit your scores and comments before this meeting by using "
            "the link previously shared, even if you cannot attend.\n\n"
            "Thank you.\nMobility Vendor Pulse Scheduling Agent",
        )

    def test_later_alignment_sessions_drop_the_important_line(self):
        # By session 2 the scorecard has been collected, so the "submit your scores"
        # instruction would be wrong.
        body = T.alignment_invite_body("Colleague", VENDOR, QUARTER, YEAR, 2)
        self.assertIn("Internal Alignment Session 2", body)
        self.assertNotIn("IMPORTANT", body)

    def test_vendor_prep_body(self):
        self.assertEqual(
            T.vendor_prep_invite_body("Colleague", VENDOR, QUARTER, YEAR),
            "Dear Colleague,\n\n"
            "You are invited to the Prep Call for the Shell/Zensar SPR covering the "
            "Jan 2026 - Mar 2026 period.\n\n"
            "The main objective of this session is to present and discuss the SPR scorecard.\n\n"
            "Any additional details relevant to this call will be shared by the meeting "
            "organiser through a separate email.\n\n"
            "Thank you.\nMobility Vendor Pulse Scheduling Agent",
        )

    def test_scorecard_body_signs_off_as_the_agent_not_the_scheduling_agent(self):
        body = T.scorecard_request_body("Colleague", VENDOR, QUARTER, YEAR)
        self.assertTrue(body.endswith("Thank you.\nMobility Vendor Pulse Agent"))
        self.assertNotIn("Scheduling Agent", body)
        self.assertIn("You have been identified as a performance reviewer", body)

    def test_meeting_invites_sign_off_as_the_scheduling_agent(self):
        for body in (
            T.spr_invite_body("C", VENDOR, QUARTER, YEAR),
            T.alignment_invite_body("C", VENDOR, QUARTER, YEAR, 1),
            T.vendor_prep_invite_body("C", VENDOR, QUARTER, YEAR),
        ):
            self.assertTrue(body.endswith("Thank you.\nMobility Vendor Pulse Scheduling Agent"))


class ScorecardEmailTests(unittest.TestCase):
    def test_no_1_to_5_scale_or_category_list(self):
        """The business asked for both to be removed from the scorecard request."""
        from app.services.email_templates import build_scorecard_email

        email = build_scorecard_email(
            attendee_name="Colleague", attendee_email="c@shell.com", vendor_name=VENDOR,
            cycle_id="c_1", quarter=QUARTER, year=YEAR, form_url="https://example/form",
        )
        blob = email["html_body"] + email["text_body"]
        for banned in ("1-5", "1–5", "Poor", "Excellent", "Scorecard Categories",
                       "Risk &amp; Compliance", "Commercial Excellence"):
            self.assertNotIn(banned, blob, f"{banned!r} must not appear in the scorecard email")

    def test_subject_is_the_approved_title(self):
        from app.services.email_templates import build_scorecard_email

        email = build_scorecard_email(
            attendee_name="C", attendee_email="c@shell.com", vendor_name=VENDOR,
            cycle_id="c_1", quarter=QUARTER, year=YEAR, form_url="https://example/form",
        )
        self.assertEqual(
            email["subject"], f"Scorecard | Shell/Zensar SPR {EN_DASH} Jan 2026 - Mar 2026"
        )


if __name__ == "__main__":
    unittest.main()
