"""
AlignmentAgent — Module C agent.

Uses call_simple() for text generation (What Changed summary, action extraction).
Score diff and alignment flag detection are fully deterministic.

When LLM is enabled  -> call_simple() generates polished summaries
When LLM is disabled -> deterministic fallback builds template text
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Optional

from app.agents.base_agent import BaseAgent
from app.models.common import AgentResponse
from app.utils.prompts import ALIGNMENT_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from app.repositories.agent_run_repository import AgentRunRepository
    from app.services.llm_service import LLMService


class AlignmentAgent(BaseAgent):
    agent_name = "alignment_agent"

    def __init__(
        self,
        scorecard_fetcher: Any,  # callable(cycle_id) -> compiled scorecard dict
        cycle_id: Optional[str] = None,
        llm_svc: Optional["LLMService"] = None,
        agent_run_repo: Optional["AgentRunRepository"] = None,
    ) -> None:
        super().__init__(cycle_id=cycle_id, llm_svc=llm_svc, agent_run_repo=agent_run_repo)
        self._fetch_scorecard = scorecard_fetcher

    # ------------------------------------------------------------------
    # Override run() — always use the direct path, never tool-calling loop.
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
    # BaseAgent interface (kept for compatibility)
    # ------------------------------------------------------------------

    def get_system_prompt(self) -> str:
        return ALIGNMENT_SYSTEM_PROMPT

    def get_tools(self) -> list[dict]:
        return []

    def execute_tool(self, tool_name: str, tool_input: dict) -> str:
        return json.dumps({"error": "AlignmentAgent uses call_simple(), not tool-calling"})

    # ------------------------------------------------------------------
    # Action dispatcher
    # ------------------------------------------------------------------

    def _deterministic_run(self, message: str, context: dict) -> dict:
        action = context.get("action", "")

        if action == "get_score_diff":
            return self._get_score_diff(context)
        if action == "get_alignment_flags":
            return self._get_alignment_flags(context)
        if action == "generate_what_changed":
            return self._generate_what_changed(context)
        if action == "extract_actions":
            return self._extract_actions(context)

        return {
            "summary": f"Unknown action: {action}",
            "data": None,
            "warnings": [f"Action '{action}' not recognised"],
            "next_actions": [],
            "requires_approval": False,
        }

    def _get_score_diff(self, context: dict) -> dict:
        """Compare current cycle scorecard against a previous cycle."""
        params = context.get("params", {})
        current_cycle_id = params.get("current_cycle_id", self.cycle_id)
        previous_cycle_id = params.get("previous_cycle_id")

        current = self._fetch_scorecard(current_cycle_id)
        previous = self._fetch_scorecard(previous_cycle_id) if previous_cycle_id else None

        deltas: list[dict] = []
        for cat in current.get("categories", []):
            current_avg = cat.get("internal_avg")
            prev_avg = None
            if previous:
                for pcat in previous.get("categories", []):
                    if pcat["category"] == cat["category"]:
                        prev_avg = pcat.get("internal_avg")
                        break

            delta = None
            significant = False
            if current_avg is not None and prev_avg is not None:
                delta = round(current_avg - prev_avg, 2)
                significant = abs(delta) >= 1.0

            deltas.append({
                "category": cat["category"],
                "category_label": cat["category_label"],
                "current_avg": current_avg,
                "previous_avg": prev_avg,
                "delta": delta,
                "significant": significant,
            })

        significant_count = sum(1 for d in deltas if d["significant"])
        return {
            "summary": f"Score diff computed: {significant_count} significant changes (delta >= 1.0).",
            "data": {"deltas": deltas, "significant_count": significant_count},
            "warnings": [f"{d['category_label']}: delta {d['delta']:+.2f}" for d in deltas if d["significant"]],
            "next_actions": ["REVIEW_DIFFS", "GENERATE_WHAT_CHANGED"],
            "requires_approval": False,
        }

    def _get_alignment_flags(self, context: dict) -> dict:
        """Identify parameters where internal vs vendor scores diverge by >= 1.5 points."""
        params = context.get("params", {})
        cycle_id = params.get("cycle_id", self.cycle_id)

        scorecard = self._fetch_scorecard(cycle_id)
        flags: list[dict] = []

        for cat in scorecard.get("categories", []):
            for param in cat.get("parameters", []):
                i_avg = param.get("internal_avg")
                v_avg = param.get("vendor_avg")
                if i_avg is not None and v_avg is not None:
                    spread = round(abs(i_avg - v_avg), 2)
                    if spread >= 1.5:
                        flags.append({
                            "parameter": param["parameter_label"],
                            "category": cat["category_label"],
                            "internal_avg": i_avg,
                            "vendor_avg": v_avg,
                            "spread": spread,
                            "direction": "internal_lower" if i_avg < v_avg else "vendor_lower",
                        })

        return {
            "summary": f"Found {len(flags)} alignment flags (spread >= 1.5 points).",
            "data": {"flags": flags},
            "warnings": [f"{f['parameter']}: spread {f['spread']} ({f['direction']})" for f in flags],
            "next_actions": ["REVIEW_FLAGS"],
            "requires_approval": False,
        }

    def _generate_what_changed(self, context: dict) -> dict:
        """Generate a 'What Changed' summary for the internal alignment meeting."""
        params = context.get("params", {})
        cycle_id = params.get("cycle_id", self.cycle_id)
        previous_cycle_id = params.get("previous_cycle_id")

        scorecard = self._fetch_scorecard(cycle_id)

        # Build context for the summary
        categories = scorecard.get("categories", [])
        overall_avg = scorecard.get("overall_internal_avg")

        if self._llm and self._llm.is_enabled:
            scorecard_text = json.dumps({
                "overall_internal_avg": overall_avg,
                "overall_vendor_avg": scorecard.get("overall_vendor_avg"),
                "categories": [{
                    "label": c["category_label"],
                    "internal_avg": c.get("internal_avg"),
                    "vendor_avg": c.get("vendor_avg"),
                } for c in categories],
            }, indent=2)

            prompt = (
                f"Generate a concise 'What Changed' summary for cycle {cycle_id}.\n\n"
                f"Current scorecard data:\n{scorecard_text}\n\n"
                "Write 3-5 bullet points in plain language, suitable for an internal alignment meeting.\n"
                "Focus on: significant changes, gaps between internal and vendor scores, areas needing discussion.\n\n"
                "Return a JSON object with:\n"
                "  bullets (array of strings — one per bullet point),\n"
                "  headline (one-sentence summary).\n"
                "Return ONLY the JSON, no markdown or explanation."
            )
            raw = self._llm.call_simple(prompt, system=ALIGNMENT_SYSTEM_PROMPT, max_tokens=1024)
            try:
                result = json.loads(_strip_markdown_json(raw))
            except json.JSONDecodeError:
                result = _build_fallback_what_changed(categories, overall_avg)
        else:
            result = _build_fallback_what_changed(categories, overall_avg)

        return {
            "summary": result.get("headline", "What Changed summary generated."),
            "data": {"what_changed": result},
            "warnings": [],
            "next_actions": ["REVIEW_SUMMARY"],
            "requires_approval": False,
        }

    def _extract_actions(self, context: dict) -> dict:
        """Extract action items from alignment meeting notes (delegates to LLM or fallback)."""
        params = context.get("params", {})
        notes_text = params.get("notes_text", "")

        if self._llm and self._llm.is_enabled:
            prompt = (
                "Extract all action items from the following internal alignment meeting notes.\n"
                "Return a JSON array where each item has:\n"
                "  action_id (generate a short id like 'a1','a2'...),\n"
                "  description, owner, due_date (YYYY-MM-DD or null),\n"
                '  source: "alignment", status: "OPEN"\n\n'
                f"Notes:\n{notes_text}\n\n"
                "Return ONLY the JSON array, no markdown or explanation."
            )
            raw = self._llm.call_simple(prompt, system=ALIGNMENT_SYSTEM_PROMPT, max_tokens=1024)
            try:
                parsed = json.loads(_strip_markdown_json(raw))
                actions = parsed if isinstance(parsed, list) else parsed.get("actions", [])
            except json.JSONDecodeError:
                actions = _fallback_extract_actions(notes_text)
        else:
            actions = _fallback_extract_actions(notes_text)

        for a in actions:
            a.setdefault("action_id", f"a-{uuid.uuid4().hex[:6]}")
            a.setdefault("source", "alignment")
            a.setdefault("status", "OPEN")
            a.setdefault("owner", "TBD")
            a.setdefault("due_date", None)

        return {
            "summary": f"Extracted {len(actions)} action items from alignment notes.",
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
    m = re.search(r"```(?:json)?\s*\n(.*?)```", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    m = re.search(r"(\[.*\]|\{.*\})", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    return text.strip()


def _build_fallback_what_changed(categories: list[dict], overall_avg: float | None) -> dict:
    bullets: list[str] = []
    for cat in categories:
        i_avg = cat.get("internal_avg")
        v_avg = cat.get("vendor_avg")
        label = cat["category_label"]

        if i_avg is not None:
            bullets.append(f"{label}: internal average {i_avg}/5" + (f", vendor average {v_avg}/5" if v_avg else ""))

        if i_avg is not None and v_avg is not None:
            gap = round(abs(i_avg - v_avg), 2)
            if gap >= 1.0:
                direction = "below" if i_avg < v_avg else "above"
                bullets.append(f"  → Notable gap: internal scores {direction} vendor by {gap} points")

    headline = f"Overall internal average: {overall_avg}/5" if overall_avg else "Scorecard summary generated."
    return {"headline": headline, "bullets": bullets[:5]}


def _fallback_extract_actions(notes_text: str) -> list[dict]:
    """Keyword-based fallback when LLM is unavailable."""
    lines = [ln.strip() for ln in notes_text.strip().splitlines() if ln.strip()]
    actions: list[dict] = []
    counter = 1

    date_pat = re.compile(
        r"(\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})",
        re.IGNORECASE,
    )

    for line in lines:
        lower = line.lower()
        if any(kw in lower for kw in ("i'll ", "i will ", "action:", "need to ", "should ", "to do:", "by ")):
            owner = "TBD"
            content = line
            m = re.match(r"^(\w[\w\s]*?):\s*(.+)$", line)
            if m:
                owner = m.group(1).strip()
                content = m.group(2).strip()

            due_date = None
            dm = date_pat.search(content)
            if dm:
                due_date = dm.group(1)

            actions.append({
                "action_id": f"a{counter}",
                "description": content,
                "owner": owner,
                "due_date": due_date,
                "source": "alignment",
                "status": "OPEN",
            })
            counter += 1

    return actions
