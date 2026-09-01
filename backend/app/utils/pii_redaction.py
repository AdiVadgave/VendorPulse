"""Narrow PII redaction helpers for persisted scorecard comments."""
from __future__ import annotations

from difflib import SequenceMatcher
import json
import re
from collections.abc import Iterable

from app.utils.prompts import SCORECARD_COMMENT_REDACTION_SYSTEM_PROMPT


_PERSON_NAME_PLACEHOLDER = "[PERSON NAME]"
_PERSON_NAME = re.compile(
    r"\b[A-Z][a-z]{1,}(?:[-'][A-Z][a-z]{1,})?\s+[A-Z][a-z]{1,}(?:[-'][A-Z][a-z]{1,})?\b"
)


class CommentRedactionError(ValueError):
    """Raised when AI comment redaction cannot produce a safe stored value."""


def redact_scorecard_comments_with_ai(comments: dict[str, str], llm) -> dict[str, str]:
    """Use the approved LLM to remove personal data before comments are persisted."""
    if not comments:
        return {}
    if not llm or not llm.is_enabled:
        raise CommentRedactionError("AI comment redaction is unavailable.")

    raw = llm.call_simple(
        json.dumps(comments, ensure_ascii=False),
        system=SCORECARD_COMMENT_REDACTION_SYSTEM_PROMPT,
        max_tokens=2048,
    )
    response = raw.strip()
    if response.startswith("```") and response.endswith("```"):
        response = re.sub(r"^```(?:json)?\s*|\s*```$", "", response).strip()

    try:
        redacted = json.loads(response)
    except (TypeError, json.JSONDecodeError) as exc:
        raise CommentRedactionError("AI comment redaction returned invalid JSON.") from exc

    if (
        not isinstance(redacted, dict)
        or set(redacted) != set(comments)
        or not all(isinstance(comment, str) for comment in redacted.values())
    ):
        raise CommentRedactionError("AI comment redaction returned an invalid comment map.")
    return redacted


def _redact_known_full_name_variations(text: str, known_names: Iterable[str]) -> str:
    """Redact a full directory name when its surname has a minor spelling variation."""
    redacted = text
    for name in known_names:
        parts = name.split()
        if len(parts) < 2:
            continue
        first_name, last_name = parts[0], parts[-1]
        candidate_pattern = re.compile(
            rf"\b{re.escape(first_name)}\s+([A-Za-z][A-Za-z'-]+)\b",
            flags=re.IGNORECASE,
        )

        def replace_candidate(match: re.Match[str]) -> str:
            surname = match.group(1)
            similarity = SequenceMatcher(None, surname.casefold(), last_name.casefold()).ratio()
            return _PERSON_NAME_PLACEHOLDER if similarity >= 0.88 else match.group(0)

        redacted = candidate_pattern.sub(replace_candidate, redacted)
    return redacted


def redact_person_names(text: str, known_names: Iterable[str] = ()) -> str:
    """Replace known and likely full personal names with a stable marker."""
    names = sorted({name.strip() for name in known_names if name and name.strip()}, key=len, reverse=True)
    redacted = _redact_known_full_name_variations(text, names)
    for name in names:
        redacted = re.sub(re.escape(name), _PERSON_NAME_PLACEHOLDER, redacted, flags=re.IGNORECASE)
    return _PERSON_NAME.sub(_PERSON_NAME_PLACEHOLDER, redacted)


def redact_scorecard_comments(comments: dict[str, str], known_names: Iterable[str] = ()) -> dict[str, str]:
    """Return scorecard comments with personal names removed before storage."""
    return {
        measure_key: redact_person_names(comment, known_names)
        for measure_key, comment in comments.items()
    }