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


class ScorecardCommentRedactionTests(unittest.TestCase):
    def test_redacts_known_names_case_insensitively(self):
        comments = {"delivery": "john smith did not send the report."}

        actual = redact_scorecard_comments(comments, ["John Smith"])

        self.assertEqual(actual, {"delivery": "[PERSON NAME] did not send the report."})

    def test_redacts_full_name_with_minor_surname_variation(self):
        comments = {"delivery": "anup keserwani did not provide the monthly report."}

        actual = redact_scorecard_comments(comments, ["Anup", "Anup Kesarwani"])

        self.assertEqual(actual, {"delivery": "[PERSON NAME] did not provide the monthly report."})

    def test_redacts_likely_full_names(self):
        comments = {"delivery": "Jane Doe and Alex Brown confirmed the recovery plan."}

        actual = redact_scorecard_comments(comments)

        self.assertEqual(
            actual,
            {"delivery": "[PERSON NAME] and [PERSON NAME] confirmed the recovery plan."},
        )

    def test_preserves_non_name_content(self):
        comments = {"delivery": "The service level was below target for June."}

        actual = redact_scorecard_comments(comments)

        self.assertEqual(actual, comments)

    def test_ai_redaction_returns_only_valid_matching_comment_map(self):
        comments = {"delivery": "jane doe confirmed the recovery plan."}
        llm = FakeRedactionLLM('{"delivery": "[PERSON NAME] confirmed the recovery plan."}')

        actual = redact_scorecard_comments_with_ai(comments, llm)

        self.assertEqual(actual, {"delivery": "[PERSON NAME] confirmed the recovery plan."})

    def test_ai_redaction_rejects_invalid_comment_map(self):
        llm = FakeRedactionLLM('{"other_measure": "[PERSON NAME]"}')

        with self.assertRaises(CommentRedactionError):
            redact_scorecard_comments_with_ai({"delivery": "Jane Doe"}, llm)