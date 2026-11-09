"""Narrow PII redaction helpers for persisted scorecard comments."""
from __future__ import annotations

from difflib import SequenceMatcher
import json
import re
from collections.abc import Iterable

from app.utils.prompts import SCORECARD_COMMENT_REDACTION_SYSTEM_PROMPT


_PERSON_NAME_PLACEHOLDER = "TEAM"

# The model reports WHAT it found, per category; this module decides what the stored
# text becomes. Keeping the non-name categories is deliberate: dropping them to a
# names-only schema would silently stop redacting emails, phone numbers, employee ids
# and usernames, which this path has always removed.
_DETECTION_PLACEHOLDERS: dict[str, str] = {
    "names": _PERSON_NAME_PLACEHOLDER,
    "emails": "[EMAIL ADDRESS]",
    "phones": "[PHONE NUMBER]",
    "employee_ids": "[EMPLOYEE ID]",
    "usernames": "[USERNAME]",
}
# A capitalised word pair — the SHAPE of a full name. On its own it also matches
# "Service Desk", "Change Management" or "Microsoft Azure", so it only redacts when one
# of its words is a first name or surname from the directory (see redact_person_names).
_PERSON_NAME = re.compile(
    r"\b[A-Z][a-z]{1,}(?:[-'][A-Z][a-z]{1,})?\s+[A-Z][a-z]{1,}(?:[-'][A-Z][a-z]{1,})?\b"
)
# Straight and curly apostrophes, which a model often normalises when echoing a name.
_APOSTROPHES = "'’‘"


class CommentRedactionError(ValueError):
    """Raised when AI comment redaction cannot produce a safe stored value."""


def _token_pattern(token: str) -> re.Pattern[str]:
    """Match `token` as a whole token, case-insensitively.

    Word-character lookarounds are used rather than a word boundary so that a trailing
    possessive still matches: in "John Smith's team" the character after the name is an
    apostrophe, which is not a word character, so the name is replaced while the "'s" and
    the rest of the sentence are left exactly as the reviewer wrote them. The lookarounds
    are Unicode-aware, so accented and hyphenated names behave the same way.

    Any run of whitespace matches any other, and any apostrophe matches any other: the
    model echoes a detected name as plain text, so "John<NBSP>Smith" pasted from Outlook,
    a name split across a line break, or "O’Neil" returned as "O'Neil" must still match
    the comment. Otherwise the grounding check rejected the detection on every attempt
    and the reviewer could never submit.
    """
    def word(w: str) -> str:
        return "".join(f"[{_APOSTROPHES}]" if ch in _APOSTROPHES else re.escape(ch) for ch in w)

    words = token.split()
    if not words:
        return re.compile(r"(?!)")  # an empty token must match nothing, not everywhere
    body = r"\s+".join(word(w) for w in words)
    return re.compile(rf"(?<!\w){body}(?!\w)", flags=re.IGNORECASE)


def _replace_detections(text: str, detections: Iterable[tuple[str, str]]) -> str:
    """Replace each detected span in `text` with its placeholder, in place.

    Longest first, so "John Smith" is replaced as one name rather than leaving a stray
    surname behind. Every occurrence of a detected span is replaced, which preserves the
    reviewer's occurrence count: "John and John" becomes "TEAM and TEAM", never a single
    collapsed mention. Nothing else about the string is touched.
    """
    redacted = text
    seen: set[str] = set()
    ordered = sorted(
        ((token.strip(), placeholder) for token, placeholder in detections if token and token.strip()),
        key=lambda pair: len(pair[0]),
        reverse=True,
    )
    for token, placeholder in ordered:
        key = token.casefold()
        if key in seen:
            continue
        seen.add(key)
        # Never "redact" a placeholder: an existing business use of the word TEAM is the
        # reviewer's own wording and must survive untouched.
        if key in {value.casefold() for value in _DETECTION_PLACEHOLDERS.values()}:
            continue
        redacted = _token_pattern(token).sub(placeholder, redacted)
    return redacted


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


def _detect_batch_with_ai(batch: dict[str, str], llm) -> dict[str, list[tuple[str, str]]]:
    """Ask the model WHICH spans identify a person; never what the comment should say.

    Returns, per measure key, the (detected span, placeholder) pairs to apply. Every
    span is checked against the original comment first, so a hallucinated detection
    fails the submission rather than being applied to text that never contained it.
    """
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
        # Groups made explicit: `|` binds loosest, so this is (leading fence) OR
        # (trailing fence) -- which is the intent, now stated rather than implied.
        response = re.sub(r"(?:^```(?:json)?\s*)|(?:\s*```$)", "", response).strip()

    try:
        redacted = json.loads(response)
    except (TypeError, json.JSONDecodeError) as exc:
        raise CommentRedactionError("AI comment redaction returned invalid JSON.") from exc

    if not isinstance(redacted, dict) or set(redacted) != set(batch):
        raise CommentRedactionError("AI comment redaction returned an invalid comment map.")

    detections: dict[str, list[tuple[str, str]]] = {}
    for measure_key, result in redacted.items():
        # A bare string here means the model returned a REWRITTEN comment instead of
        # listing what it found. Accepting that is precisely the failure this function
        # exists to prevent, so it is refused rather than stored.
        if not isinstance(result, dict) or not set(result) <= set(_DETECTION_PLACEHOLDERS):
            raise CommentRedactionError("AI comment redaction returned an invalid detection map.")
        found: list[tuple[str, str]] = []
        for field, placeholder in _DETECTION_PLACEHOLDERS.items():
            values = result.get(field, [])
            if not isinstance(values, list) or not all(
                isinstance(value, str) and value.strip() for value in values
            ):
                raise CommentRedactionError("AI comment redaction returned invalid detections.")
            for value in values:
                token = value.strip()
                # Grounding check: the model may only point at text that is really
                # there. Nothing is logged about it — the span is the reviewer's own
                # words and may be a person's name.
                if not _token_pattern(token).search(batch[measure_key]):
                    raise CommentRedactionError(
                        "AI comment redaction returned a detection not present in the comment."
                    )
                found.append((token, placeholder))
        detections[measure_key] = found
    return detections


def redact_scorecard_comments_with_ai(
    comments: dict[str, str],
    llm,
    known_names: Iterable[str] = (),
) -> dict[str, str]:
    """Remove personal data before comments are persisted, without rewriting them.

    The model never supplies the stored text. It only reports which spans of the
    reviewer's own words identify a person; this function applies the replacements to
    the original string. So a model that summarises, reorders, invents a sentence or
    duplicates a mention cannot change what is saved, and a detection it made up is
    rejected outright. `known_names` adds the attendee/user directory as a deterministic
    second source — it is not assumed to be complete.
    """
    if not comments:
        return {}
    if not llm or not llm.is_enabled:
        raise CommentRedactionError("AI comment redaction is unavailable.")

    detections: dict[str, list[tuple[str, str]]] = {}
    for batch in _batch_comments(comments):
        try:
            detections.update(_detect_batch_with_ai(batch, llm))
        except CommentRedactionError:
            # A truncated or malformed completion is usually transient, so give it one
            # more attempt before dead-ending a reviewer mid-submission. Deliberately
            # NOT falling back to the regex-only pass: that strips names but not
            # emails, phone numbers or employee ids, so it would persist exactly the
            # PII this block exists to keep out of the database.
            detections.update(_detect_batch_with_ai(batch, llm))

    # The caller persists this map, so it must cover exactly the comments it was given
    # — never a partial result from a batch that quietly dropped keys.
    if set(detections) != set(comments):
        raise CommentRedactionError("AI comment redaction returned an invalid comment map.")

    directory = [(name, _PERSON_NAME_PLACEHOLDER) for name in _full_names(known_names)]
    return {
        measure_key: _replace_detections(comment, [*directory, *detections[measure_key]])
        for measure_key, comment in comments.items()
    }


def _full_names(names: Iterable[str]) -> list[str]:
    """Directory names with at least a first name and a surname.

    A one-word directory entry is not matched as a whole token: users recorded as just
    "Will", "June" or "Mark" turned "the vendor will deliver the June invoice" into "the
    vendor TEAM deliver the TEAM invoice". A first name on its own is left to the AI
    detection, which judges it in context; it still anchors the full-name check below."""
    return [name for name in names if len(name.split()) >= 2]


def _fold_name(word: str) -> str:
    return word.casefold().replace("’", "'").replace("‘", "'")


def _name_anchors(names: Iterable[str]) -> set[str]:
    """First names and surnames from the directory, normalised for comparison."""
    anchors: set[str] = set()
    for name in names:
        parts = name.split()
        if parts:
            anchors.add(_fold_name(parts[0]))
            anchors.add(_fold_name(parts[-1]))
    return anchors


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
    """Replace known and likely full personal names with a stable marker.

    "Likely" means a capitalised word pair with a directory first name or surname in it
    ("Jane Doe" when the directory has a Jane). Every capitalised pair used to be
    replaced, which permanently rewrote ordinary business wording in every stored
    comment — "Service Desk missed two P1 SLAs; Change Management was weak" was saved as
    "TEAM Desk missed two P1 SLAs; TEAM was weak". Names with no directory link at all
    are the AI detection's job, which runs before this on every submission."""
    names = sorted({name.strip() for name in known_names if name and name.strip()}, key=len, reverse=True)
    redacted = _redact_known_full_name_variations(text, names)
    # Shared with the AI path so a directory name and a detected name redact identically
    # — whole-token, every occurrence, possessive suffix left intact.
    redacted = _replace_detections(redacted, [(name, _PERSON_NAME_PLACEHOLDER) for name in _full_names(names)])
    anchors = _name_anchors(names)
    if not anchors:
        return redacted

    def likely_person(match: re.Match[str]) -> str:
        words = match.group(0).split()
        if _fold_name(words[0]) in anchors or _fold_name(words[-1]) in anchors:
            return _PERSON_NAME_PLACEHOLDER
        return match.group(0)

    return _PERSON_NAME.sub(likely_person, redacted)


def redact_scorecard_comments(comments: dict[str, str], known_names: Iterable[str] = ()) -> dict[str, str]:
    """Return scorecard comments with personal names removed before storage."""
    return {
        measure_key: redact_person_names(comment, known_names)
        for measure_key, comment in comments.items()
    }