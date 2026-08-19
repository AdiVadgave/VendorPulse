"""
VendorPrepAgent — Module D agent.

Uses call_simple() for one-shot LLM generation (briefs, pushback responses).
These are single-prompt tasks — no need for the multi-step tool-calling loop.

When LLM is enabled  -> call_simple() sends scorecard/pushback data to Azure OpenAI
When LLM is disabled -> deterministic fallback builds template-based output
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Optional

from app.agents.base_agent import BaseAgent
from app.models.common import AgentResponse
from app.utils.prompts import VENDOR_PREP_SYSTEM_PROMPT

if TYPE_CHECKING:
    from app.repositories.agent_run_repository import AgentRunRepository
    from app.services.llm_service import LLMService


class VendorPrepAgent(BaseAgent):
    agent_name = "vendor_prep_agent"

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
        return VENDOR_PREP_SYSTEM_PROMPT

    def get_tools(self) -> list[dict]:
        return []

    def execute_tool(self, tool_name: str, tool_input: dict) -> str:
        return json.dumps({"error": f"VendorPrepAgent uses call_simple(), not tool-calling"})

    # ------------------------------------------------------------------
    # Action dispatcher
    # ------------------------------------------------------------------

    def _deterministic_run(self, message: str, context: dict) -> dict:
        action = context.get("action", "")

        if action == "generate_vendor_brief":
            return self._deterministic_generate_brief(context)
        if action == "handle_pushback":
            return self._deterministic_handle_pushback(context)
        if action == "get_compiled_scorecard":
            scorecard = self._fetch_scorecard(self.cycle_id)
            return {
                "summary": "Compiled scorecard retrieved.",
                "data": scorecard,
                "warnings": [],
                "next_actions": ["GENERATE_BRIEF"],
                "requires_approval": False,
            }

        return {
            "summary": f"Unknown action: {action}",
            "data": None,
            "warnings": [f"Action '{action}' not recognised"],
            "next_actions": [],
            "requires_approval": False,
        }

    def _deterministic_generate_brief(self, context: dict) -> dict:
        params = context.get("params", {})
        vendor_name = params.get("vendor_name", "Vendor")

        scorecard = self._fetch_scorecard(self.cycle_id)
        previous = _fetch_previous_compact(self.cycle_id)

        if self._llm and self._llm.is_enabled:
            prompt = _build_brief_prompt(scorecard, vendor_name, self.cycle_id or "", previous)
            raw = self._llm.call_simple(prompt, system=VENDOR_PREP_SYSTEM_PROMPT, max_tokens=2048)
            try:
                brief = json.loads(_strip_markdown_json(raw))
            except json.JSONDecodeError:
                brief = _build_fallback_brief(scorecard, previous)
                brief["_llm_raw"] = raw
        else:
            brief = _build_fallback_brief(scorecard, previous)

        # Timestamps are stamped deterministically — never trust the LLM to generate
        # them (it fabricates/back-dates them). See Shell IRM 3.6.6 (hallucination).
        if isinstance(brief, dict):
            brief["generated_at"] = datetime.now(timezone.utc).isoformat()

        return {
            "summary": f"Vendor brief generated for {vendor_name}.",
            "data": {"brief": brief},
            "warnings": [],
            "next_actions": ["APPROVE_BRIEF"],
            "requires_approval": True,
        }

    def _deterministic_handle_pushback(self, context: dict) -> dict:
        params = context.get("params", {})
        pushback_id = params.get("pushback_id", "")
        description = params.get("description", "")
        category = params.get("category", "OTHER")
        needs_legal = params.get("needs_legal_review", False)

        if needs_legal:
            return {
                "summary": "Item flagged for legal review — AI responses excluded.",
                "data": {"pushback_id": pushback_id, "responses": []},
                "warnings": ["Legal review required. No AI-drafted responses generated."],
                "next_actions": ["LEGAL_REVIEW"],
                "requires_approval": False,
            }

        if self._llm and self._llm.is_enabled:
            # Ground the "factual" stance in real data so the model cannot invent
            # metrics to present to the vendor (Shell IRM 3.6.6 hallucination).
            scorecard = self._fetch_scorecard(self.cycle_id)
            prompt = _build_pushback_prompt(pushback_id, category, description, scorecard)
            raw = self._llm.call_simple(prompt, system=VENDOR_PREP_SYSTEM_PROMPT, max_tokens=1536)
            try:
                responses = json.loads(_strip_markdown_json(raw))
                if not isinstance(responses, list):
                    responses = responses.get("responses", [])
            except json.JSONDecodeError:
                responses = _build_fallback_pushback_responses(pushback_id, description)
        else:
            responses = _build_fallback_pushback_responses(pushback_id, description)

        return {
            "summary": f"3 response options drafted for pushback '{pushback_id}'.",
            "data": {"pushback_id": pushback_id, "responses": responses},
            "warnings": [],
            "next_actions": ["SELECT_RESPONSE"],
            "requires_approval": True,
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


def _fetch_previous_compact(cycle_id: Optional[str]) -> Optional[dict]:
    """The previous cycle's compact scorecard (scores + comments) for the same vendor,
    or None if this is the vendor's first cycle. Lazy import avoids a circular import."""
    if not cycle_id:
        return None
    try:
        from app.api.routes.scorecard_v2 import compact_scorecard_context
        return compact_scorecard_context(cycle_id).get("previous")
    except Exception:  # never let cross-cycle lookup break brief generation
        return None


def _build_brief_prompt(
    scorecard: dict, vendor_name: str, cycle_id: str, previous: Optional[dict] = None
) -> str:
    categories_text = json.dumps(scorecard.get("categories", []), indent=2)
    comments_text = json.dumps(scorecard.get("comments", {}), indent=2)
    recs = scorecard.get("key_recommendations", [])

    if previous:
        prev_block = (
            f"PREVIOUS cycle ({previous.get('label', 'prior')}) — overall consolidated "
            f"score {previous.get('overall_score')}. Per-theme scores + comments:\n"
            f"{json.dumps(previous.get('categories', []), indent=2, ensure_ascii=False)}\n\n"
            "Derive every 'trend' by comparing this cycle's consolidated score to the "
            "previous cycle's for the same theme (and the overall_trend from the two "
            "overall scores).\n\n"
        )
    else:
        prev_block = (
            "PREVIOUS cycle: none (this is the vendor's first cycle). Set overall_trend "
            "and every category trend to 'stable' — do NOT guess a direction.\n\n"
        )

    return (
        f"Generate a vendor brief for {vendor_name} (cycle: {cycle_id}).\n\n"
        "The scores below are the CONSOLIDATED INTERNAL assessment from Shell's "
        "stakeholder teams (a weighted scorecard). There is no vendor self-report.\n\n"
        f"CURRENT cycle — overall consolidated score: {scorecard.get('overall_internal_avg')}\n\n"
        f"Current category scores (use 'internal_avg' as the consolidated score):\n{categories_text}\n\n"
        f"Current comments:\n{comments_text}\n\n"
        f"{prev_block}"
        f"Key recommendations: {recs}\n\n"
        "Return a valid JSON object with these exact keys:\n"
        "  overall_score (float 0-5), overall_trend (improving|declining|stable),\n"
        "  category_ratings (array of {category, score, rationale, trend}),\n"
        "  key_concerns (max 5 strings), positive_areas (max 5 strings),\n"
        "  open_actions (int).\n"
        "Base ALL scores and figures strictly on the data above — do NOT invent or "
        "estimate any numbers, percentages, or dates. (generated_at is set by the system.)\n"
        "Return ONLY the JSON, no markdown or explanation."
    )


def _build_pushback_prompt(
    pushback_id: str, category: str, description: str, scorecard: dict | None = None
) -> str:
    evidence = json.dumps((scorecard or {}).get("categories", []), indent=2)
    return (
        f"A vendor has raised a pushback (ID: {pushback_id}).\n"
        f"Category: {category}\n"
        f"Description: {description}\n\n"
        f"Scorecard evidence (the ONLY data you may cite):\n{evidence}\n\n"
        "Draft 3 response options with different stances:\n"
        "1. factual — data-driven rebuttal citing ONLY the scorecard evidence above\n"
        "2. neutral — acknowledge the concern, seek middle ground\n"
        "3. escalation — firm position citing contractual/SLA obligations\n\n"
        "CRITICAL: do NOT invent, estimate, or fabricate any metrics, percentages, or "
        "figures. Cite only numbers present in the evidence above; if a specific number "
        "is not provided, speak qualitatively instead.\n\n"
        "Return a JSON array of 3 objects, each with:\n"
        "  response_id (generate a UUID), pushback_id, stance, content, is_selected (false).\n"
        "Keep each response 2-4 sentences, professional and non-confrontational.\n"
        "Return ONLY the JSON array, no markdown or explanation."
    )


def _build_fallback_brief(scorecard: dict, previous: Optional[dict] = None) -> dict:
    """Build a deterministic brief when LLM is unavailable.

    When a previous cycle exists, trends are the REAL movement in the consolidated
    score (not guessed from the absolute value); otherwise everything is 'stable'."""
    categories = scorecard.get("categories", [])
    overall_avg = scorecard.get("overall_internal_avg") or 0

    # Map previous theme label -> consolidated score for real trend deltas.
    prev_overall = previous.get("overall_score") if previous else None
    prev_by_theme: dict[str, float] = {}
    if previous:
        for pc in previous.get("categories", []):
            if pc.get("consolidated_score") is not None:
                prev_by_theme[pc.get("theme")] = pc["consolidated_score"]

    def _trend(cur: float, prev: Optional[float]) -> str:
        if prev is None:
            return "stable"
        delta = cur - prev
        if delta >= 0.25:
            return "improving"
        if delta <= -0.25:
            return "declining"
        return "stable"

    if prev_overall is not None:
        trend = _trend(overall_avg, prev_overall)
    elif overall_avg >= 3.5:
        trend = "improving"
    elif overall_avg >= 2.5:
        trend = "stable"
    else:
        trend = "declining"

    category_ratings = []
    concerns = []
    positives = []

    for cat in categories:
        avg = cat.get("internal_avg") or 0
        label = cat["category_label"]
        prev_score = prev_by_theme.get(label)
        cat_trend = _trend(avg, prev_score) if prev_score is not None else "flat"
        declined = prev_score is not None and avg - prev_score <= -0.5
        if avg >= 4.0:
            positives.append(f"{label}: strong at {avg}/5")
        elif avg < 3.0:
            # One concern line per category: fold the decline into the below-target line.
            trend_note = f" (down from {prev_score}/5 last cycle)" if declined else ""
            concerns.append(f"{label}: below target at {avg}/5{trend_note}")
        elif declined:
            concerns.append(f"{label}: down {abs(round(avg - prev_score, 1))} pt vs last cycle ({prev_score}→{avg}/5)")

        category_ratings.append({
            "category": label,
            "score": avg,
            "rationale": (
                f"Consolidated internal score: {avg}/5"
                + (f" (was {prev_score}/5 last cycle)" if prev_score is not None else "")
            ),
            "trend": cat_trend,
        })

    return {
        "overall_score": round(overall_avg, 2),
        "overall_trend": trend,
        "category_ratings": category_ratings,
        "key_concerns": concerns[:5],
        "positive_areas": positives[:5],
        "open_actions": 0,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _build_fallback_pushback_responses(pushback_id: str, description: str) -> list[dict]:
    """Build deterministic placeholder responses when LLM is unavailable."""
    stances = [
        ("factual", "Based on the scorecard data, the metrics indicate the current assessment is data-supported. We can review specific data points together."),
        ("neutral", "We acknowledge this concern and propose a joint review to find common ground on the assessment criteria."),
        ("escalation", "Per our service agreement, the current scores reflect documented performance. We recommend a formal review meeting to address discrepancies."),
    ]
    return [
        {
            "response_id": str(uuid.uuid4()),
            "pushback_id": pushback_id,
            "stance": stance,
            "content": content,
            "is_selected": False,
        }
        for stance, content in stances
    ]
