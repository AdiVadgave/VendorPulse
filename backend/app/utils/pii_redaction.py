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


# The model has to echo back every comment it was given, so its output is roughly as
# long as its input. A single call with a fixed cap silently truncates a full
# 14-measure scorecard mid-JSON, and the caller turns that into a 503 the reviewer can
# never clear by retrying. Batch the map instead, and size the cap to the batch.
_REDACTION_BATCH_CHARS = 4000
_REDACTION_MAX_TOKENS = 8192


def _batch_comments(comments: dict[str, str]) -> list[dict[str, str]]:
    """Split the comment map into chunks whose JSON payload stays inside the budget.

    A single comment longer than the budget still goes out on its own: splitting one
    comment's text would break the key-for-key echo the validation below relies on.
    """
    batches: list[dict[str, str]] = []
    current: dict[str, str] = {}
    current_len = 0
    for key, comment in comments.items():
        entry_len = len(key) + len(comment) + 8  # quotes, colon, comma
        if current and current_len + entry_len > _REDACTION_BATCH_CHARS:
            batches.append(current)
            current, current_len = {}, 0
        current[key] = comment
        current_len += entry_len
    if current:
        batches.append(current)
    return batches


def _redact_batch_with_ai(batch: dict[str, str], llm) -> dict[str, str]:
    """Redact one batch, validating the model echoed back exactly the keys it was given."""
    payload = json.dumps(batch, ensure_ascii=False)
    # Placeholders ("[PERSON NAME]") are not materially shorter than the text they
    # replace, so the output budget has to scale with the input rather than sit at a
    # fixed 2048 that a real scorecard overruns.
    max_tokens = min(_REDACTION_MAX_TOKENS, 1024 + len(payload))

    raw = llm.call_simple(
        payload,
        system=SCORECARD_COMMENT_REDACTION_SYSTEM_PROMPT,
        max_tokens=max_tokens,
    )
    response = (raw or "").strip()
    if response.startswith("```") and response.endswith("```"):
        response = re.sub(r"^```(?:json)?\s*|\s*```$", "", response).strip()

    try:
        redacted = json.loads(response)
    except (TypeError, json.JSONDecodeError) as exc:
        raise CommentRedactionError("AI comment redaction returned invalid JSON.") from exc

    if (
        not isinstance(redacted, dict)
        or set(redacted) != set(batch)
        or not all(isinstance(comment, str) for comment in redacted.values())
    ):
        raise CommentRedactionError("AI comment redaction returned an invalid comment map.")
    return redacted


def redact_scorecard_comments_with_ai(comments: dict[str, str], llm) -> dict[str, str]:
    """Use the approved LLM to remove personal data before comments are persisted."""
    if not comments:
        return {}
    if not llm or not llm.is_enabled:
        raise CommentRedactionError("AI comment redaction is unavailable.")

    redacted: dict[str, str] = {}
    for batch in _batch_comments(comments):
        try:
            redacted.update(_redact_batch_with_ai(batch, llm))
        except CommentRedactionError:
            # A truncated or malformed completion is usually transient, so give it one
            # more attempt before dead-ending a reviewer mid-submission. Deliberately
            # NOT falling back to the regex-only pass: that strips names but not
            # emails, phone numbers or employee ids, so it would persist exactly the
            # PII this block exists to keep out of the database.
            redacted.update(_redact_batch_with_ai(batch, llm))

    # The caller persists this map, so it must cover exactly the comments it was given
    # — never a partial result from a batch that quietly dropped keys.
    if set(redacted) != set(comments):
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