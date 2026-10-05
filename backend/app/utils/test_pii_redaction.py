import unittest

from app.utils.pii_redaction import (
    CommentRedactionError,
    redact_scorecard_comments,
    redact_scorecard_comments_with_ai,
)


class FakeRedactionLLM:
    is_enabled = True

    def __init__(self, response: str):
        self.response = response

    def call_simple(self, prompt: str, system: str, max_tokens: int) -> str:
        return self.response


def _names(*detected: str) -> str:
    """A detection response for the single measure the tests below use."""
    inner = ", ".join(f'"{name}"' for name in detected)
    return '{"delivery": {"names": [' + inner + "]}}"


class ScorecardCommentRedactionTests(unittest.TestCase):
    """Deterministic (directory + heuristic) redaction."""

    def test_redacts_known_names_case_insensitively(self):
        comments = {"delivery": "john smith did not send the report."}

        actual = redact_scorecard_comments(comments, ["John Smith"])

        self.assertEqual(actual, {"delivery": "TEAM did not send the report."})

    def test_redacts_full_name_with_minor_surname_variation(self):
        comments = {"delivery": "anup keserwani did not provide the monthly report."}

        actual = redact_scorecard_comments(comments, ["Anup", "Anup Kesarwani"])

        self.assertEqual(actual, {"delivery": "TEAM did not provide the monthly report."})

    def test_redacts_likely_full_names(self):
        comments = {"delivery": "Jane Doe and Alex Brown confirmed the recovery plan."}

        actual = redact_scorecard_comments(comments)

        self.assertEqual(actual, {"delivery": "TEAM and TEAM confirmed the recovery plan."})

    def test_preserves_non_name_content(self):
        comments = {"delivery": "The service level was below target for June."}

        actual = redact_scorecard_comments(comments)

        self.assertEqual(actual, comments)

    def test_leaves_existing_business_use_of_team_untouched(self):
        """Example G — TEAM is the placeholder, so the word must not be re-redacted."""
        comments = {"delivery": "The TEAM needs to improve its reporting process."}

        self.assertEqual(redact_scorecard_comments(comments), comments)
        self.assertEqual(redact_scorecard_comments(comments, ["TEAM"]), comments)

    def test_redacts_punctuation_hyphens_accents_and_possessives(self):
        """Example I — hyphen, apostrophe and accent, with the possessive preserved."""
        comments = {"delivery": "Élodie-Anne O'Neil and John Doe's team improved."}

        actual = redact_scorecard_comments(comments, ["Élodie-Anne O'Neil", "John Doe"])

        self.assertEqual(actual, {"delivery": "TEAM and TEAM's team improved."})


class AiCommentRedactionTests(unittest.TestCase):
    """The model identifies spans; this module replaces them in the ORIGINAL text."""

    def test_full_name(self):
        """Example A."""
        comments = {"delivery": "John Smith needs to improve the handover process."}

        actual = redact_scorecard_comments_with_ai(comments, FakeRedactionLLM(_names("John Smith")))

        self.assertEqual(actual, {"delivery": "TEAM needs to improve the handover process."})

    def test_first_name_only(self):
        """Example B."""
        comments = {"delivery": "John needs to improve communication."}

        actual = redact_scorecard_comments_with_ai(comments, FakeRedactionLLM(_names("John")))

        self.assertEqual(actual, {"delivery": "TEAM needs to improve communication."})

    def test_two_different_names(self):
        """Example C."""
        comments = {"delivery": "John Smith and Jane Doe need to improve communication."}

        actual = redact_scorecard_comments_with_ai(
            comments, FakeRedactionLLM(_names("John Smith", "Jane Doe"))
        )

        self.assertEqual(actual, {"delivery": "TEAM and TEAM need to improve communication."})

    def test_same_name_twice_keeps_both_occurrences(self):
        """Example D — the original symptom. Must NOT collapse to a single TEAM."""
        comments = {"delivery": "John Smith and John Smith discussed the issue."}

        actual = redact_scorecard_comments_with_ai(comments, FakeRedactionLLM(_names("John Smith")))

        self.assertEqual(actual, {"delivery": "TEAM and TEAM discussed the issue."})

    def test_single_name_is_not_duplicated(self):
        """The reported bug inverted: one mention in, one mention out, whatever the model says."""
        comments = {"delivery": "John Smith needs to improve."}

        actual = redact_scorecard_comments_with_ai(comments, FakeRedactionLLM(_names("John Smith")))

        self.assertEqual(actual, {"delivery": "TEAM needs to improve."})
        self.assertEqual(actual["delivery"].count("TEAM"), 1)

    def test_possessive_full_name(self):
        """Example E."""
        comments = {"delivery": "John Smith's team needs additional support."}

        actual = redact_scorecard_comments_with_ai(comments, FakeRedactionLLM(_names("John Smith")))

        self.assertEqual(actual, {"delivery": "TEAM's team needs additional support."})

    def test_possessive_first_name_with_curly_apostrophe(self):
        """Example F."""
        comments = {"delivery": "John’s department performed well."}

        actual = redact_scorecard_comments_with_ai(comments, FakeRedactionLLM(_names("John")))

        self.assertEqual(actual, {"delivery": "TEAM’s department performed well."})

    def test_existing_business_use_of_team_is_untouched(self):
        """Example G — nothing detected, nothing changed."""
        comments = {"delivery": "The TEAM needs to improve its reporting process."}

        actual = redact_scorecard_comments_with_ai(comments, FakeRedactionLLM('{"delivery": {"names": []}}'))

        self.assertEqual(actual, comments)

    def test_punctuation_and_multiple_names(self):
        """Example H."""
        comments = {"delivery": "Alex Brown, John Smith, and Jane Doe attended the meeting."}

        actual = redact_scorecard_comments_with_ai(
            comments, FakeRedactionLLM(_names("Alex Brown", "John Smith", "Jane Doe"))
        )

        self.assertEqual(actual, {"delivery": "TEAM, TEAM, and TEAM attended the meeting."})

    def test_hyphenated_apostrophe_and_accented_names(self):
        """Example I via the AI path."""
        comments = {"delivery": "Élodie-Anne O'Neil's team handled the issue."}

        actual = redact_scorecard_comments_with_ai(
            comments, FakeRedactionLLM(_names("Élodie-Anne O'Neil"))
        )

        self.assertEqual(actual, {"delivery": "TEAM's team handled the issue."})

    def test_rejects_rewritten_comment_instead_of_detections(self):
        """Example J — a model that returns prose is refused, not stored."""
        llm = FakeRedactionLLM('{"delivery": "TEAM and TEAM needs to improve."}')

        with self.assertRaises(CommentRedactionError):
            redact_scorecard_comments_with_ai({"delivery": "John Smith needs to improve."}, llm)

    def test_model_cannot_append_a_sentence(self):
        """Example J, second form — the extra sentence can never reach storage."""
        comments = {"delivery": "John Smith needs to improve."}
        llm = FakeRedactionLLM(
            '{"delivery": "TEAM needs to improve. The team should create a remediation plan."}'
        )

        with self.assertRaises(CommentRedactionError):
            redact_scorecard_comments_with_ai(comments, llm)

    def test_rejects_names_absent_from_the_original_comment(self):
        """Example K — an invented detection blocks the submission."""
        llm = FakeRedactionLLM(_names("Alex Brown"))

        with self.assertRaises(CommentRedactionError):
            redact_scorecard_comments_with_ai({"delivery": "Jane Doe confirmed the recovery plan."}, llm)

    def test_rejects_invalid_comment_map(self):
        llm = FakeRedactionLLM('{"other_measure": {"names": []}}')

        with self.assertRaises(CommentRedactionError):
            redact_scorecard_comments_with_ai({"delivery": "Jane Doe"}, llm)

    def test_rejects_unknown_detection_category(self):
        llm = FakeRedactionLLM('{"delivery": {"nicknames": ["Jane"]}}')

        with self.assertRaises(CommentRedactionError):
            redact_scorecard_comments_with_ai({"delivery": "Jane Doe"}, llm)

    def test_rejects_non_string_detections(self):
        llm = FakeRedactionLLM('{"delivery": {"names": [42]}}')

        with self.assertRaises(CommentRedactionError):
            redact_scorecard_comments_with_ai({"delivery": "Jane Doe"}, llm)

    def test_still_redacts_contact_details_not_just_names(self):
        """Email/phone/id/username coverage predates this change and must survive it."""
        comments = {
            "delivery": "Contact j.doe@shell.com or 555-0100, id EMP12345, user jdoe99."
        }
        llm = FakeRedactionLLM(
            '{"delivery": {"names": [], "emails": ["j.doe@shell.com"], "phones": ["555-0100"],'
            ' "employee_ids": ["EMP12345"], "usernames": ["jdoe99"]}}'
        )

        actual = redact_scorecard_comments_with_ai(comments, llm)

        self.assertEqual(
            actual,
            {
                "delivery": "Contact [EMAIL ADDRESS] or [PHONE NUMBER], "
                "id [EMPLOYEE ID], user [USERNAME]."
            },
        )

    def test_directory_names_redact_even_when_the_model_misses_them(self):
        """Requirement 9 — the directory is a second deterministic source."""
        comments = {"delivery": "Jane Doe approved the plan."}

        actual = redact_scorecard_comments_with_ai(
            comments, FakeRedactionLLM('{"delivery": {"names": []}}'), ["Jane Doe"]
        )

        self.assertEqual(actual, {"delivery": "TEAM approved the plan."})

    def test_longest_name_wins_so_no_surname_is_left_behind(self):
        comments = {"delivery": "John Smith and John met the vendor."}

        actual = redact_scorecard_comments_with_ai(
            comments, FakeRedactionLLM(_names("John", "John Smith"))
        )

        self.assertEqual(actual, {"delivery": "TEAM and TEAM met the vendor."})

    def test_redaction_unavailable_when_llm_disabled(self):
        class Disabled:
            is_enabled = False

        with self.assertRaises(CommentRedactionError):
            redact_scorecard_comments_with_ai({"delivery": "Jane Doe"}, Disabled())
