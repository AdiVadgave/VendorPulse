"""
MeetingAgent — Module E agent.

Uses call_simple() for one-shot LLM generation (minutes, action extraction).
These are single-prompt tasks — no need for the multi-step tool-calling loop.

When LLM is enabled  -> call_simple() sends notes to Azure OpenAI, gets structured JSON back
When LLM is disabled -> deterministic fallback builds template-based output
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from app.agents.base_agent import BaseAgent
from app.models.common import AgentResponse
from app.utils.prompts import MEETING_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

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
        meeting_date = params.get("meeting_date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))

        grouped = _group_notes_by_type(notes)

        if self._llm and self._llm.is_enabled:
            prompt = _build_minutes_prompt(meeting_id, meeting_date, attendees, grouped, self.cycle_id or "")
            raw = self._llm.call_simple(prompt, system=MEETING_SYSTEM_PROMPT, max_tokens=2048)
            try:
                minutes = json.loads(_strip_markdown_json(raw))
            except json.JSONDecodeError:
                minutes = _build_fallback_minutes(meeting_id, meeting_date, attendees, grouped, self.cycle_id or "")
                minutes["_llm_raw"] = raw
        else:
            minutes = _build_fallback_minutes(meeting_id, meeting_date, attendees, grouped, self.cycle_id or "")

        return {
            "summary": "Meeting minutes generated.",
            "data": {"minutes": minutes},
            "warnings": [],
            "next_actions": ["APPROVE_MINUTES"],
            "requires_approval": True,
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
            logger.info("EXTRACT-ACTIONS: LLM raw response (%d chars): %s", len(raw), raw[:500])
            stripped = _strip_markdown_json(raw)
            logger.info("EXTRACT-ACTIONS: after strip: %s", stripped[:500])
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

import re

def _strip_markdown_json(text: str) -> str:
    """Extract JSON from LLM responses that may include prose and markdown fences."""
    # Find a ```json ... ``` or ``` ... ``` block anywhere in the text
    m = re.search(r"```(?:json)?\s*\n(.*?)```", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    # No fences — try to find raw JSON (array or object) in the text
    m = re.search(r"(\[.*\]|\{.*\})", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    return text.strip()


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
        "  action_items (array of {{description, owner, due_date}}),\n"
        "  generated_at (ISO timestamp).\n"
        "Return ONLY the JSON, no markdown or explanation."
    )


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

    return {
        "minutes_id": str(uuid.uuid4()),
        "meeting_id": meeting_id,
        "cycle_id": cycle_id,
        "meeting_date": meeting_date,
        "attendees": attendees,
        "executive_summary": f"Governance meeting held on {meeting_date} with {len(attendees)} attendees.",
        "agenda_summaries": [{"topic": "General Discussion", "summary": "Meeting notes captured."}],
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
                "owner": a.get("raised_by", "TBD"),
                "due_date": "",
            }
            for a in actions
        ],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
