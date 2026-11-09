"""
MeetingAgent — Module E agent.

Uses call_simple() for one-shot LLM generation (minutes, action extraction).
These are single-prompt tasks — no need for the multi-step tool-calling loop.

When LLM is enabled  -> call_simple() sends notes to the LLM (APIM gateway), gets structured JSON back
When LLM is disabled -> deterministic fallback builds template-based output
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import TYPE_CHECKING, Iterable, Optional

from app.agents.base_agent import BaseAgent
from app.core.logging_config import sanitize_for_log
from app.models.common import AgentResponse
from app.utils.prompts import MEETING_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

# Output budgets. The parsed transcript is one JSON object per notable statement, so a
# one-hour meeting (~40 notes) overran the old 2048 cap; the cut-off JSON then failed to
# parse and the notes silently came from the keyword fallback instead. A cap only bounds
# what the model may write — tokens are billed as used.
_TRANSCRIPT_MAX_TOKENS = 8192
_MINUTES_MAX_TOKENS = 4096

if TYPE_CHECKING:
    from app.repositories.agent_run_repository import AgentRunRepository
    from app.repositories.meeting_repository import MeetingRepository
    from app.services.llm_service import LLMService


class MeetingAgent(BaseAgent):
    agent_name = "meeting_agent"

    def __init__(
        self,
        meeting_repo: "MeetingRepository",
        cycle_id: Optional[str] = None,
        llm_svc: Optional["LLMService"] = None,
        agent_run_repo: Optional["AgentRunRepository"] = None,
    ) -> None:
        super().__init__(cycle_id=cycle_id, llm_svc=llm_svc, agent_run_repo=agent_run_repo)
        self._meetings = meeting_repo

    # ------------------------------------------------------------------
    # Override run() — always use the direct path, never tool-calling loop.
    # These are one-shot generation tasks: data in -> structured JSON out.
    # ------------------------------------------------------------------

    def run(self, user_message: str = "", context: Optional[dict] = None) -> AgentResponse:
        ctx = context or {}
        input_payload = {"user_message": user_message, "context": ctx}
        run_record = self._log_run_start(input_payload)

        try:
            result = self._deterministic_run(user_message, ctx)
            response = self._build_response("success", result)
            response.run_id = self._run_id
            self._log_run_complete(run_record, "SUCCESS", response)
            return response
        except Exception as exc:
            error_response = self._build_error_response(str(exc))
            error_response.run_id = self._run_id
            self._log_run_complete(run_record, "FAILED", error_response, str(exc))
            return error_response

    # ------------------------------------------------------------------
    # BaseAgent interface (kept for compatibility, not used in run())
    # ------------------------------------------------------------------

    def get_system_prompt(self) -> str:
        return MEETING_SYSTEM_PROMPT

    def get_tools(self) -> list[dict]:
        return []

    def execute_tool(self, tool_name: str, tool_input: dict) -> str:
        return json.dumps({"error": f"MeetingAgent uses call_simple(), not tool-calling"})

    # ------------------------------------------------------------------
    # Action dispatcher
    # ------------------------------------------------------------------

    def _deterministic_run(self, message: str, context: dict) -> dict:
        action = context.get("action", "")

        if action == "generate_minutes":
            return self._deterministic_generate_minutes(context)
        if action == "parse_transcript":
            return self._deterministic_parse_transcript(context)
        if action == "extract_actions":
            return self._deterministic_extract_actions(context)
        if action == "get_meeting_context":
            result = json.loads(self._exec_get_meeting_context(context.get("params", {})))
            return {
                "summary": "Meeting context retrieved.",
                "data": result,
                "warnings": [],
                "next_actions": ["GENERATE_MINUTES"],
                "requires_approval": False,
            }

        return {
            "summary": f"Unknown action: {action}",
            "data": None,
            "warnings": [f"Action '{action}' not recognised"],
            "next_actions": [],
            "requires_approval": False,
        }

    def _deterministic_generate_minutes(self, context: dict) -> dict:
        """Use the LLM's call_simple() to generate minutes from notes without tool-calling."""
        params = context.get("params", {})
        notes = params.get("notes", [])
        meeting_id = params.get("meeting_id", "")
        attendees = params.get("attendees", [])
        # `or`, not a .get() default: the route always passes the key, as None when the
        # browser sends no date, which printed "Governance meeting held on None".
        meeting_date = params.get("meeting_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        cycle_id = self.cycle_id or ""

        grouped = _group_notes_by_type(notes)

        minutes = None
        if self._llm and self._llm.is_enabled:
            prompt = _build_minutes_prompt(meeting_id, meeting_date, attendees, grouped, cycle_id)
            raw = self._llm.call_simple(prompt, system=MEETING_SYSTEM_PROMPT, max_tokens=_MINUTES_MAX_TOKENS)
            try:
                minutes = _normalize_minutes(
                    json.loads(_strip_markdown_json(raw)),
                    meeting_id=meeting_id, cycle_id=cycle_id, meeting_date=meeting_date, attendees=attendees,
                )
            except json.JSONDecodeError:
                minutes = None
            if minutes is None:
                minutes = _build_fallback_minutes(meeting_id, meeting_date, attendees, grouped, cycle_id)
                minutes["_llm_raw"] = raw
        else:
            minutes = _build_fallback_minutes(meeting_id, meeting_date, attendees, grouped, cycle_id)

        return {
            "summary": "Meeting minutes generated.",
            "data": {"minutes": minutes},
            "warnings": [],
            "next_actions": ["APPROVE_MINUTES"],
            "requires_approval": True,
        }

    def _deterministic_parse_transcript(self, context: dict) -> dict:
        """Parse a raw meeting transcript into structured notes using LLM or deterministic fallback."""
        params = context.get("params", {})
        meeting_id = params.get("meeting_id", "")
        transcript = params.get("transcript", "")
        # The day the meeting took place — what "today" / "11 April" in it refer to. The
        # route passes the scheduled date when it knows it.
        meeting_day = _valid_date(params.get("meeting_date")) or datetime.now(timezone.utc).date()
        known_names = [n for n in (params.get("known_names") or []) if isinstance(n, str) and n.strip()]
        warnings: list[str] = []

        if self._llm and self._llm.is_enabled:
            prompt = (
                "Parse the following meeting transcript into structured notes.\n"
                "For each notable statement, classify it as EXACTLY ONE of these five values "
                "(uppercase, no slashes, no alternatives, no other words): "
                "QUESTION, OBJECTION, DECISION, APPRECIATION, ACTION.\n"
                "Do not invent new categories. Skip statements that don't fit any of the five.\n\n"
                f"Transcript:\n{transcript}\n\n"
                "Return a JSON array of objects, each with:\n"
                f"  note_id (generate a short id like 'n1','n2'...), meeting_id (use '{meeting_id}'),\n"
                "  note_type (MUST be one of: QUESTION, OBJECTION, DECISION, APPRECIATION, ACTION),\n"
                "  content (the substance of the statement), raised_by (speaker name),\n"
                "  timestamp (HH:MM from the transcript if available, else empty string),\n"
                "  owner (ACTION notes only: the person, team or company the action is ASSIGNED\n"
                "    to — in 'Action: Alex to send the report' it is Alex, not the speaker; in\n"
                "    'Raj, that is an action for you' it is Raj. Use the speaker only when they take\n"
                "    the action on themselves, e.g. 'I will send it'. Empty string when nobody is\n"
                "    named — never guess),\n"
                "  due_date (ACTION notes only: the deadline as YYYY-MM-DD, only when one is stated.\n"
                f"    The meeting took place on {meeting_day.isoformat()}: 'today' or 'close of business'\n"
                "    means that date, and a day + month means that year. Empty string otherwise).\n"
                "When one statement assigns several actions, return one ACTION note per action,\n"
                "each with its own owner and due_date.\n"
                "Return ONLY the JSON array, no markdown or explanation."
            )
            raw = self._llm.call_simple(prompt, system=MEETING_SYSTEM_PROMPT, max_tokens=_TRANSCRIPT_MAX_TOKENS)
            logger.info(
                "PARSE-TRANSCRIPT: LLM raw response (%d chars): %s",
                len(raw),
                sanitize_for_log(raw[:500]),
            )
            try:
                notes = json.loads(_strip_markdown_json(raw))
                if not isinstance(notes, list):
                    notes = notes.get("notes", [])
                logger.info("PARSE-TRANSCRIPT: parsed %d notes", len(notes))
            except json.JSONDecodeError as e:
                logger.warning("PARSE-TRANSCRIPT: JSON parse failed: %s", e)
                notes = _build_fallback_parsed_notes(transcript, meeting_id)
                warnings.append(
                    "The AI reply could not be read, so a simpler keyword parser was used. "
                    "Check the extracted notes before generating minutes."
                )
        else:
            notes = _build_fallback_parsed_notes(transcript, meeting_id)

        notes = _normalize_parsed_notes(notes, meeting_id, meeting_day=meeting_day, known_names=known_names)

        return {
            "summary": f"Parsed {len(notes)} notes from transcript.",
            "data": {"notes": notes},
            "warnings": warnings,
            "next_actions": ["GENERATE_MINUTES"],
            "requires_approval": False,
        }

    def _deterministic_extract_actions(self, context: dict) -> dict:
        params = context.get("params", {})
        minutes_text = params.get("minutes_text", "")

        logger.info("EXTRACT-ACTIONS: llm=%s, llm_enabled=%s, text_len=%d",
                     self._llm is not None,
                     self._llm.is_enabled if self._llm else False,
                     len(minutes_text))

        if self._llm and self._llm.is_enabled:
            prompt = (
                "Extract all action items from the following meeting minutes.\n"
                "Return a JSON array where each item has: description, owner, due_date.\n"
                "If no due date is mentioned, use an empty string.\n\n"
                f"{minutes_text}"
            )
            raw = self._llm.call_simple(prompt, system=MEETING_SYSTEM_PROMPT, max_tokens=1024)
            logger.info(
                "EXTRACT-ACTIONS: LLM raw response (%d chars): %s",
                len(raw),
                sanitize_for_log(raw[:500]),
            )
            stripped = _strip_markdown_json(raw)
            logger.info("EXTRACT-ACTIONS: after strip: %s", sanitize_for_log(stripped[:500]))
            try:
                actions = json.loads(stripped)
                logger.info("EXTRACT-ACTIONS: parsed %d actions", len(actions))
            except json.JSONDecodeError as e:
                logger.warning("EXTRACT-ACTIONS: JSON parse failed: %s", e)
                actions = []
        else:
            logger.info("EXTRACT-ACTIONS: LLM not available, returning empty")
            actions = []

        return {
            "summary": f"Extracted {len(actions)} action items.",
            "data": {"actions": actions},
            "warnings": [],
            "next_actions": ["REVIEW_ACTIONS"],
            "requires_approval": False,
        }


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _strip_markdown_json(text: str) -> str:
    """Extract JSON from LLM responses that may include prose and markdown fences."""
    # Find a ```json ... ``` or ``` ... ``` block anywhere in the text
    m = re.search(r"```(?:json)?\s*\n(.*?)```", text, re.DOTALL)
    if m:
        return m.group(1).strip()

    # No fences — deterministically extract a likely JSON object/array span.
    object_start = text.find("{")
    object_end = text.rfind("}")
    array_start = text.find("[")
    array_end = text.rfind("]")
    candidates: list[str] = []
    if object_start != -1 and object_end > object_start:
        candidates.append(text[object_start : object_end + 1].strip())
    if array_start != -1 and array_end > array_start:
        candidates.append(text[array_start : array_end + 1].strip())
    if candidates:
        return max(candidates, key=len)

    return text.strip()


VALID_NOTE_TYPES = {"QUESTION", "OBJECTION", "DECISION", "APPRECIATION", "ACTION"}


def _coerce_note_type(raw_type: str, content: str = "") -> str:
    """Map a possibly-invalid LLM note_type to one of the five allowed values."""
    if not isinstance(raw_type, str):
        raw_type = ""
    candidate = raw_type.strip().upper()

    if candidate in VALID_NOTE_TYPES:
        return candidate

    # Handle compound/slash/alternative forms (e.g. "RESPONSE/EXPLANATION",
    # "QUESTION OR COMMENT"); pick the first allowed token that appears.
    tokens = re.split(r"[\s/|,;&\-]+", candidate)
    for tok in tokens:
        if tok in VALID_NOTE_TYPES:
            return tok

    # Substring heuristics for stems like "OBJECT", "APPREC", "DECIS", "ACT", "QUEST"
    stems = [
        ("ACTION", ("ACTION", "TODO", "TASK", "FOLLOW")),
        ("DECISION", ("DECIS", "AGREED", "RESOLVED", "APPROVED")),
        ("OBJECTION", ("OBJECT", "CONCERN", "DISAGREE", "DISPUTE", "ISSUE", "RISK")),
        ("APPRECIATION", ("APPREC", "THANK", "PRAISE", "RECOGNI")),
        ("QUESTION", ("QUEST", "ASK", "CLARIF", "INQUIR")),
    ]
    haystack = f"{candidate} {content.upper()}"
    for valid, stem_list in stems:
        if any(stem in haystack for stem in stem_list):
            return valid

    # Last resort — route uncategorised statements into QUESTION so they still
    # appear in the Q&A log rather than blowing up Pydantic validation.
    return "QUESTION"


# ── Action owner + due date ──────────────────────────────────────────────────
# An ACTION note's owner is whoever the action is ASSIGNED to. The chair usually reads
# the actions out, so taking the speaker made almost every action the chair's.

_PLACEHOLDER_OWNERS = {"", "tbd", "unknown", "none", "n/a", "na", "unassigned", "nobody"}
# "Action: Alex to escalate…" / "Action item: Shell delivery team to review…"
_ACTION_ASSIGNEE = re.compile(r"\baction(?:\s+item)?\s*:\s*(.+?)\s+to\s+[a-z]", re.IGNORECASE)
# Words that start an instruction rather than name someone ("Action: Send the deck to Bob").
_IMPERATIVES = {
    "send", "share", "provide", "review", "prepare", "update", "circulate", "schedule",
    "confirm", "follow", "set", "create", "check", "raise", "submit", "escalate", "draft",
    "arrange", "book", "organise", "organize", "investigate", "agree", "issue", "add",
}
_MONTHS = {
    name: number
    for number, full in enumerate(
        ("january", "february", "march", "april", "may", "june", "july",
         "august", "september", "october", "november", "december"), start=1)
    for name in (full, full[:3])
}
_MONTHS["sept"] = 9
_ISO_DATE = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
# Optional trailing year: "11 April 2027" / "April 11, 2027".
_DAY_MONTH = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\b(?:,?\s+(\d{4})\b)?")
_MONTH_DAY = re.compile(r"\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4})\b)?")
_SAME_DAY = re.compile(r"\b(?:today|close of business|end of (?:the )?day|eod|cob)\b", re.IGNORECASE)
_NEXT_DAY = re.compile(r"\btomorrow\b", re.IGNORECASE)


def _valid_date(value) -> Optional[date]:
    """A YYYY-MM-DD (or ISO timestamp) string as a date; None for anything else."""
    if not isinstance(value, str) or not re.match(r"^\d{4}-\d{2}-\d{2}", value.strip()):
        return None
    try:
        return date.fromisoformat(value.strip()[:10])
    except ValueError:
        return None


def _stated_due_date(text: str, meeting_day: date) -> Optional[str]:
    """The deadline a statement spells out, as YYYY-MM-DD, or None.

    Explicit forms only — an ISO date, "11 April" / "April 11" (with its year if given,
    else the meeting's year — or the next one when that would be months before the
    meeting, e.g. "10 January" said in December), and "today" / "close of business" /
    "tomorrow" relative to the meeting.
    When a statement holds several, the first one mentioned wins: it belongs to the
    first action in it."""
    found: list[tuple[int, date]] = []
    for m in _ISO_DATE.finditer(text):
        d = _valid_date(m.group(0))
        if d:
            found.append((m.start(), d))
    for pattern, day_at, month_at in ((_DAY_MONTH, 1, 2), (_MONTH_DAY, 2, 1)):
        for m in pattern.finditer(text):
            month = _MONTHS.get(m.group(month_at).lower())
            if not month:
                continue
            try:
                if m.group(3):
                    d = date(int(m.group(3)), month, int(m.group(day_at)))
                else:
                    d = date(meeting_day.year, month, int(m.group(day_at)))
                    if d < meeting_day - timedelta(days=60):
                        d = date(d.year + 1, month, d.day)
            except ValueError:
                continue
            found.append((m.start(), d))
    for pattern, offset in ((_SAME_DAY, 0), (_NEXT_DAY, 1)):
        m = pattern.search(text)
        if m:
            found.append((m.start(), meeting_day + timedelta(days=offset)))
    return min(found)[1].isoformat() if found else None


def _owner_from_text(content: str) -> Optional[str]:
    """The assignee in a statement of the form "Action: <who> to <do something>"."""
    m = _ACTION_ASSIGNEE.search(content)
    if not m:
        return None
    who = m.group(1).strip(" ,.;:")
    words = who.split()
    if not words or len(words) > 5 or not words[0][:1].isupper() or words[0].lower() in _IMPERATIVES:
        return None
    return who


def _grounded_owner(raw, content: str, speaker: str) -> Optional[str]:
    """The model's owner, kept only if it is grounded in the statement.

    It must be the speaker (who took the action on themselves) or a name that appears in
    the statement itself — so the model cannot invent an owner."""
    owner = " ".join(str(raw or "").split()).strip(" ,.;:")
    if owner.lower() in _PLACEHOLDER_OWNERS:
        return None
    if speaker and owner.casefold() == speaker.casefold():
        return speaker
    text = content.casefold()
    for probe in (owner, owner.split()[0]):
        if re.search(rf"(?<!\w){re.escape(probe.casefold())}(?!\w)", text):
            return owner
    return None


def _first_name(name: str) -> str:
    """First name from "First Last" or the directory's "Last, First M ORG" form."""
    rest = name.split(",", 1)[1] if "," in name else name
    parts = rest.split()
    return parts[0] if parts else ""


def _match_known_name(owner: str, known_names: Iterable[str]) -> str:
    """The attendee's full name for an owner given by name ("Raj" → "Raj Kumar").

    Only an exact full-name match, or a first name that exactly one attendee has; teams
    and companies ("Zensar", "Shell delivery team") are left as written."""
    names = [n.strip() for n in known_names if n and n.strip()]
    folded = owner.casefold()
    for name in names:
        if name.casefold() == folded:
            return name
    if len(owner.split()) == 1:
        matches = {name for name in names if _first_name(name).casefold() == folded}
        if len(matches) == 1:
            return matches.pop()
    return owner


def _normalize_parsed_notes(
    notes: list[dict],
    meeting_id: str,
    *,
    meeting_day: Optional[date] = None,
    known_names: Iterable[str] = (),
) -> list[dict]:
    """Ensure every note returned from parse-transcript satisfies the MeetingNote schema.

    ACTION notes also get `owner` (who it is assigned to — grounded in the statement,
    resolved to an attendee's full name where possible, else None) and `due_date`
    (a stated deadline, else None). Other notes carry neither."""
    meeting_day = meeting_day or datetime.now(timezone.utc).date()
    known_names = list(known_names)
    normalized: list[dict] = []
    for idx, note in enumerate(notes, start=1):
        if not isinstance(note, dict):
            continue
        original = note.get("note_type", "")
        content = note.get("content", "") or ""
        coerced = _coerce_note_type(original, content)
        if coerced != original:
            logger.info(
                "PARSE-TRANSCRIPT: coerced note_type %r -> %r",
                sanitize_for_log(original), sanitize_for_log(coerced),
            )
        speaker = note.get("raised_by", "Unknown") or "Unknown"
        owner = due_date = None
        if coerced == "ACTION":
            owner = _grounded_owner(note.get("owner"), content, speaker) or _owner_from_text(content)
            if owner:
                owner = _match_known_name(owner, known_names)
            # The statement's own words first; the model's date only if they name none.
            stated = _stated_due_date(content, meeting_day)
            model_date = _valid_date(note.get("due_date"))
            due_date = stated or (model_date.isoformat() if model_date else None)
        normalized.append({
            "note_id": note.get("note_id") or f"n{idx}",
            # The requested id wins over whatever the model echoed back: minutes are
            # generated under the notes' meeting id, so a drifted id stored them where the
            # approve/send/reload calls (which use the requested id) never look.
            "meeting_id": meeting_id or note.get("meeting_id") or "",
            "note_type": coerced,
            "content": content,
            "raised_by": speaker,
            "timestamp": note.get("timestamp", "") or "",
            "owner": owner,
            "due_date": due_date,
        })
    return normalized


def _group_notes_by_type(notes: list[dict]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = {}
    for note in notes:
        ntype = note.get("note_type", "OTHER")
        grouped.setdefault(ntype, []).append(note)
    return grouped


def _build_minutes_prompt(
    meeting_id: str,
    meeting_date: str,
    attendees: list[str],
    grouped_notes: dict,
    cycle_id: str,
) -> str:
    notes_text = json.dumps(grouped_notes, indent=2)
    return (
        f"Generate formal meeting minutes for governance meeting {meeting_id} "
        f"(cycle: {cycle_id}, date: {meeting_date}).\n"
        f"Attendees: {', '.join(attendees) if attendees else 'Not specified'}\n\n"
        f"Captured notes grouped by type:\n{notes_text}\n\n"
        "Return a valid JSON object with these exact keys:\n"
        "  minutes_id (generate a UUID), meeting_id, cycle_id, meeting_date,\n"
        "  attendees (array of names), executive_summary (string),\n"
        "  agenda_summaries (array of {{topic, summary}}),\n"
        "  key_decisions (array of strings),\n"
        "  qa_log (array of {{question, raised_by, response}}),\n"
        "  action_items (array of {{description, owner, due_date}} — take owner and due_date\n"
        "    from each ACTION note; never use whoever merely read the action out as its owner;\n"
        "    'TBD' / empty string when the note has none),\n"
        "  generated_at (ISO timestamp).\n"
        "Return ONLY the JSON, no markdown or explanation."
    )


def _normalize_minutes(
    minutes,
    *,
    meeting_id: str,
    cycle_id: str,
    meeting_date: str,
    attendees: list[str],
) -> Optional[dict]:
    """Coerce the model's minutes into the shape the UI and the email renderer read.

    Returns None when the reply is not a minutes object at all, so the caller uses the
    deterministic minutes instead. Saved as-is, a reply wrapped in {"minutes": {...}},
    a missing list or an action item without an owner blanked the Meeting tab (it maps
    over these lists) and made Send fail, with no way to regenerate them."""
    if isinstance(minutes, dict) and len(minutes) == 1:
        inner = next(iter(minutes.values()))
        if isinstance(inner, dict):
            minutes = inner
    content_keys = ("executive_summary", "agenda_summaries", "key_decisions", "qa_log", "action_items")
    if not isinstance(minutes, dict) or not any(k in minutes for k in content_keys):
        return None

    def items(key: str) -> list:
        value = minutes.get(key)
        return value if isinstance(value, list) else []

    def text(value, default: str = "") -> str:
        return value.strip() if isinstance(value, str) and value.strip() else default

    return {
        **minutes,
        "minutes_id": text(minutes.get("minutes_id")) or str(uuid.uuid4()),
        "attendees": [a.strip() for a in items("attendees") if isinstance(a, str) and a.strip()] or list(attendees),
        "executive_summary": text(minutes.get("executive_summary")),
        "agenda_summaries": [
            {"topic": text(a.get("topic")), "summary": text(a.get("summary"))}
            for a in items("agenda_summaries") if isinstance(a, dict)
        ],
        "key_decisions": [d.strip() for d in items("key_decisions") if isinstance(d, str) and d.strip()],
        "qa_log": [
            {
                "question": text(q.get("question")),
                "raised_by": text(q.get("raised_by"), "Unknown"),
                "response": text(q.get("response")),
            }
            for q in items("qa_log") if isinstance(q, dict)
        ],
        "action_items": [
            {
                "description": text(a.get("description")),
                "owner": text(a.get("owner"), "TBD"),
                "due_date": text(a.get("due_date")),
            }
            for a in items("action_items") if isinstance(a, dict) and text(a.get("description"))
        ],
        # Known values, never the model's: it echoes or invents ids, dates and timestamps.
        "meeting_id": meeting_id,
        "cycle_id": cycle_id,
        "meeting_date": meeting_date,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _build_fallback_minutes(
    meeting_id: str,
    meeting_date: str,
    attendees: list[str],
    grouped_notes: dict,
    cycle_id: str,
) -> dict:
    """Build deterministic minutes when LLM is unavailable."""
    decisions = [n["content"] for n in grouped_notes.get("DECISION", [])]
    questions = grouped_notes.get("QUESTION", [])
    actions = grouped_notes.get("ACTION", [])
    # Objections and appreciation are part of the record too (the vendor's objections
    # especially); they used to be dropped from these minutes entirely.
    agenda = [{"topic": "General Discussion", "summary": "Meeting notes captured."}]
    for note_type, topic in (("OBJECTION", "Objections raised"), ("APPRECIATION", "Appreciation")):
        items = [n.get("content", "") for n in grouped_notes.get(note_type, []) if n.get("content")]
        if items:
            agenda.append({"topic": topic, "summary": "; ".join(items)})

    return {
        "minutes_id": str(uuid.uuid4()),
        "meeting_id": meeting_id,
        "cycle_id": cycle_id,
        "meeting_date": meeting_date,
        "attendees": attendees,
        "executive_summary": f"Governance meeting held on {meeting_date} with {len(attendees)} attendees.",
        "agenda_summaries": agenda,
        "key_decisions": decisions,
        "qa_log": [
            {
                "question": q["content"],
                "raised_by": q.get("raised_by", "Unknown"),
                "response": "Recorded during meeting.",
            }
            for q in questions
        ],
        "action_items": [
            {
                "description": a["content"],
                # The assignee, never the speaker (usually the chair reading it out).
                "owner": a.get("owner") or "TBD",
                "due_date": a.get("due_date") or "",
            }
            for a in actions
        ],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _build_fallback_parsed_notes(transcript: str, meeting_id: str) -> list[dict]:
    """Deterministic transcript parser — uses keyword heuristics when LLM is unavailable."""
    lines = [ln.strip() for ln in transcript.strip().splitlines() if ln.strip()]
    notes: list[dict] = []
    counter = 1

    action_kw = ("action:", "action item:", "todo:")
    decision_kw = ("decision:", "agreed:", "resolved:")
    question_kw = ("?",)
    objection_kw = ("dispute", "disagree", "object", "concern", "issue")
    appreciation_kw = ("thank", "appreciate", "well done", "recogni")

    for line in lines:
        # Try to extract speaker and timestamp from "[HH:MM]" or "Name [HH:MM]:"
        speaker = "Unknown"
        timestamp = ""
        content = line

        m = re.match(r"^(.+?)\s*\[(\d{1,2}:\d{2})\]\s*:\s*(.+)$", line)
        if m:
            speaker = m.group(1).strip()
            timestamp = m.group(2)
            content = m.group(3).strip()

        lower = content.lower()

        # "Please do. Action: …" — the action can follow a reply in the same turn.
        if any(lower.startswith(kw) for kw in action_kw) or re.search(r"\baction(?:\s+item)?\s*:", lower):
            note_type = "ACTION"
        elif any(lower.startswith(kw) for kw in decision_kw):
            note_type = "DECISION"
        elif any(kw in lower for kw in objection_kw):
            note_type = "OBJECTION"
        elif any(kw in lower for kw in appreciation_kw):
            note_type = "APPRECIATION"
        elif any(content.rstrip().endswith(kw) for kw in question_kw):
            note_type = "QUESTION"
        else:
            continue  # Skip lines that don't match any category

        notes.append({
            "note_id": f"n{counter}",
            "meeting_id": meeting_id,
            "note_type": note_type,
            "content": content,
            "raised_by": speaker,
            "timestamp": timestamp,
        })
        counter += 1

    return notes
