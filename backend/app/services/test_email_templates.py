"""The scorecard request email must carry the approved response guidance verbatim.

These five points are business-approved wording. They are pinned character-for-character
so a well-meaning edit to the template cannot quietly reword them, and so the plain-text
part can never drift from the HTML part.
"""
import unittest

from app.services.email_templates import build_reminder_email, build_scorecard_email


GUIDANCE_POINTS = [
    "Include only business points, themes, or action areas.",
    "Exclude names, initials, departments, titles, and any other direct or indirect "
    "personal references.",
    "Submit within 3 business days, or forward to your delegate immediately.",
    "When providing comments, do not include personal names or identifying information; "
    "keep all responses objective, role-based, and compliant with EU AI Act requirements.",
    "If this isn't meant for you, reply promptly to flag it for redirection.",
]


def _email(reissue: bool = False) -> dict[str, str]:
    return build_scorecard_email(
        attendee_name="Reviewer",
        attendee_email="reviewer@shell.com",
        vendor_name="Acme",
        cycle_id="c_test",
        quarter="Q3",
        year=2026,
        form_url="https://example.invalid/scorecard/c_test",
        reissue=reissue,
    )


def _readable(html: str) -> str:
    """HTML-escaped entities back to the characters a recipient actually reads."""
    return html.replace("&#39;", "'").replace("&amp;", "&")


class ScorecardEmailGuidanceTests(unittest.TestCase):
    def test_all_five_points_present_in_html_body(self):
        html = _readable(_email()["html_body"])
        for point in GUIDANCE_POINTS:
            self.assertIn(point, html, f"missing from HTML body: {point}")

    def test_all_five_points_present_in_text_body(self):
        text = _email()["text_body"]
        for point in GUIDANCE_POINTS:
            self.assertIn(point, text, f"missing from plain-text body: {point}")

    def test_guidance_is_numbered_one_to_five_in_text_body(self):
        text = _email()["text_body"]
        self.assertIn("Response Guidance:", text)
        for number, point in enumerate(GUIDANCE_POINTS, start=1):
            self.assertIn(f"{number}. {point}", text)

    def test_guidance_appears_in_order_in_both_bodies(self):
        for body in (_readable(_email()["html_body"]), _email()["text_body"]):
            positions = [body.index(point) for point in GUIDANCE_POINTS]
            self.assertEqual(positions, sorted(positions))

    def test_guidance_present_on_a_reissued_request_too(self):
        """The 'redo scorecard' flow sends the same default request email."""
        email = _email(reissue=True)
        html, text = _readable(email["html_body"]), email["text_body"]
        for point in GUIDANCE_POINTS:
            self.assertIn(point, html)
            self.assertIn(point, text)

    def test_guidance_appears_exactly_once_per_body(self):
        email = _email()
        html, text = _readable(email["html_body"]), email["text_body"]
        for point in GUIDANCE_POINTS:
            self.assertEqual(html.count(point), 1, f"duplicated in HTML: {point}")
            self.assertEqual(text.count(point), 1, f"duplicated in text: {point}")

    def test_existing_personal_data_notice_is_retained(self):
        """The guidance is additional. It does not replace the standing privacy notice."""
        email = _email()
        self.assertIn("Personal Data", email["html_body"])
        self.assertIn("PERSONAL DATA", email["text_body"])

    def test_reminder_email_is_deliberately_unchanged(self):
        """Scope: the requirement covers the scorecard REQUEST email only."""
        reminder = build_reminder_email(
            attendee_name="Reviewer",
            vendor_name="Acme",
            quarter="Q3",
            year=2026,
            form_url="https://example.invalid/scorecard/c_test",
            deadline="2026-07-10",
            days_left=2,
            tone_label="Reminder",
        )
        self.assertNotIn("Response Guidance", reminder["html_body"])
        self.assertNotIn("Response Guidance", reminder["text_body"])
