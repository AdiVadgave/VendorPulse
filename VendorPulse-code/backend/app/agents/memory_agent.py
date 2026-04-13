"""
MemoryAgent — Module F agent.

Uses call_simple() for text generation (leadership briefs, trend narratives).
Trend detection and recurring issue identification are deterministic.

When LLM is enabled  -> call_simple() generates polished leadership briefing
When LLM is disabled -> deterministic fallback builds template-based output
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Optional

from app.agents.base_agent import BaseAgent
from app.models.common import AgentResponse
from app.utils.prompts import MEMORY_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from app.repositories.agent_run_repository import AgentRunRepository
    from app.repositories.cycle_repository import CycleRepository
    from app.services.llm_service import LLMService


class MemoryAgent(BaseAgent):
    agent_name = "memory_agent"

    def __init__(
        self,
        cycle_repo: "CycleRepository",
        scorecard_fetcher: Any,  # callable(cycle_id) -> compiled scorecard dict
        cycle_id: Optional[str] = None,
        llm_svc: Optional["LLMService"] = None,
        agent_run_repo: Optional["AgentRunRepository"] = None,
    ) -> None:
        super().__init__(cycle_id=cycle_id, llm_svc=llm_svc, agent_run_repo=agent_run_repo)
        self._cycle_repo = cycle_repo
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
        return MEMORY_SYSTEM_PROMPT

    def get_tools(self) -> list[dict]:
        return []

    def execute_tool(self, tool_name: str, tool_input: dict) -> str:
        return json.dumps({"error": "MemoryAgent uses call_simple(), not tool-calling"})

    # ------------------------------------------------------------------
    # Action dispatcher
    # ------------------------------------------------------------------

    def _deterministic_run(self, message: str, context: dict) -> dict:
        action = context.get("action", "")

        if action == "get_multi_cycle_scores":
            return self._get_multi_cycle_scores(context)
        if action == "detect_recurring_issues":
            return self._detect_recurring_issues(context)
        if action == "generate_leadership_brief":
            return self._generate_leadership_brief(context)
        if action == "get_vendor_trajectory":
            return self._get_vendor_trajectory(context)

        return {
            "summary": f"Unknown action: {action}",
            "data": None,
            "warnings": [f"Action '{action}' not recognised"],
            "next_actions": [],
            "requires_approval": False,
        }

    def _get_multi_cycle_scores(self, context: dict) -> dict:
        """Retrieve scorecard data across multiple cycles for a vendor."""
        params = context.get("params", {})
        vendor_name = params.get("vendor_name", "")

        # Find all cycles for this vendor
        all_cycles = self._cycle_repo.find_all()
        vendor_cycles = [
            c for c in all_cycles
            if c.get("vendor_name", "").lower() == vendor_name.lower()
        ]
        vendor_cycles.sort(key=lambda c: c.get("created_at", ""))

        cycle_scores: list[dict] = []
        for cycle in vendor_cycles:
            cid = cycle.get("cycle_id", "")
            try:
                scorecard = self._fetch_scorecard(cid)
                cycle_scores.append({
                    "cycle_id": cid,
                    "quarter": cycle.get("quarter", ""),
                    "year": cycle.get("year", ""),
                    "overall_internal_avg": scorecard.get("overall_internal_avg"),
                    "overall_vendor_avg": scorecard.get("overall_vendor_avg"),
                    "categories": [{
                        "label": c["category_label"],
                        "internal_avg": c.get("internal_avg"),
                        "vendor_avg": c.get("vendor_avg"),
                    } for c in scorecard.get("categories", [])],
                })
            except Exception:
                continue

        return {
            "summary": f"Retrieved scores for {len(cycle_scores)} cycles for {vendor_name}.",
            "data": {"vendor_name": vendor_name, "cycles": cycle_scores},
            "warnings": [],
            "next_actions": ["DETECT_RECURRING", "GENERATE_BRIEF"],
            "requires_approval": False,
        }

    def _detect_recurring_issues(self, context: dict) -> dict:
        """Identify categories that scored below 3.0 in 2+ consecutive cycles."""
        params = context.get("params", {})
        vendor_name = params.get("vendor_name", "")

        all_cycles = self._cycle_repo.find_all()
        vendor_cycles = [
            c for c in all_cycles
            if c.get("vendor_name", "").lower() == vendor_name.lower()
        ]
        vendor_cycles.sort(key=lambda c: c.get("created_at", ""))

        # Build per-category score history
        category_history: dict[str, list[dict]] = {}
        for cycle in vendor_cycles:
            cid = cycle.get("cycle_id", "")
            try:
                scorecard = self._fetch_scorecard(cid)
                for cat in scorecard.get("categories", []):
                    label = cat["category_label"]
                    category_history.setdefault(label, []).append({
                        "cycle_id": cid,
                        "quarter": cycle.get("quarter", ""),
                        "year": cycle.get("year", ""),
                        "internal_avg": cat.get("internal_avg"),
                    })
            except Exception:
                continue

        # Find recurring low scores
        recurring: list[dict] = []
        for label, history in category_history.items():
            consecutive_low = 0
            max_streak = 0
            for entry in history:
                avg = entry.get("internal_avg")
                if avg is not None and avg < 3.0:
                    consecutive_low += 1
                    max_streak = max(max_streak, consecutive_low)
                else:
                    consecutive_low = 0

            if max_streak >= 2:
                recurring.append({
                    "category": label,
                    "consecutive_low_cycles": max_streak,
                    "history": history,
                })

        return {
            "summary": f"Found {len(recurring)} recurring issues for {vendor_name}.",
            "data": {"recurring_issues": recurring, "vendor_name": vendor_name},
            "warnings": [f"{r['category']}: below 3.0 for {r['consecutive_low_cycles']} consecutive cycles" for r in recurring],
            "next_actions": ["CREATE_ISSUE_RECORD"],
            "requires_approval": False,
        }

    def _generate_leadership_brief(self, context: dict) -> dict:
        """Generate a concise leadership briefing card for a vendor."""
        params = context.get("params", {})
        vendor_name = params.get("vendor_name", "")
        cycle_id = params.get("cycle_id", self.cycle_id)

        # Gather data
        scorecard = self._fetch_scorecard(cycle_id) if cycle_id else {}
        all_cycles = self._cycle_repo.find_all()
        vendor_cycles = [
            c for c in all_cycles
            if c.get("vendor_name", "").lower() == vendor_name.lower()
        ]
        vendor_cycles.sort(key=lambda c: c.get("created_at", ""))

        # Determine trajectory
        scores: list[float] = []
        for cycle in vendor_cycles:
            try:
                sc = self._fetch_scorecard(cycle["cycle_id"])
                avg = sc.get("overall_internal_avg")
                if avg is not None:
                    scores.append(avg)
            except Exception:
                continue

        trajectory = "stable"
        if len(scores) >= 2:
            recent_trend = scores[-1] - scores[-2]
            if recent_trend >= 0.5:
                trajectory = "improving"
            elif recent_trend <= -0.5:
                trajectory = "declining"

        if self._llm and self._llm.is_enabled:
            scorecard_summary = json.dumps({
                "overall_internal_avg": scorecard.get("overall_internal_avg"),
                "overall_vendor_avg": scorecard.get("overall_vendor_avg"),
                "categories": [{
                    "label": c["category_label"],
                    "internal_avg": c.get("internal_avg"),
                    "vendor_avg": c.get("vendor_avg"),
                } for c in scorecard.get("categories", [])],
                "trajectory": trajectory,
                "total_cycles": len(vendor_cycles),
                "score_history": scores,
            }, indent=2)

            prompt = (
                f"Generate a leadership briefing card for vendor '{vendor_name}'.\n\n"
                f"Current cycle data:\n{scorecard_summary}\n\n"
                "Return a JSON object with:\n"
                "  vendor_name (string), trajectory (improving|stable|declining),\n"
                "  overall_score (float), total_cycles_reviewed (int),\n"
                "  strengths (array of max 4 strings),\n"
                "  concerns (array of max 4 strings),\n"
                "  recommendations (array of max 4 strings),\n"
                "  unresolved_from_prior (array of strings — issues from past cycles still open).\n"
                "Keep each item concise (1 sentence). Return ONLY the JSON."
            )
            raw = self._llm.call_simple(prompt, system=MEMORY_SYSTEM_PROMPT, max_tokens=1024)
            try:
                brief = json.loads(_strip_markdown_json(raw))
            except json.JSONDecodeError:
                brief = _build_fallback_brief(vendor_name, scorecard, trajectory, scores, len(vendor_cycles))
        else:
            brief = _build_fallback_brief(vendor_name, scorecard, trajectory, scores, len(vendor_cycles))

        return {
            "summary": f"Leadership brief generated for {vendor_name}.",
            "data": {"leadership_brief": brief},
            "warnings": [],
            "next_actions": ["REVIEW_BRIEF"],
            "requires_approval": False,
        }

    def _get_vendor_trajectory(self, context: dict) -> dict:
        """Determine if a vendor is improving, stable, or declining."""
        params = context.get("params", {})
        vendor_name = params.get("vendor_name", "")

        all_cycles = self._cycle_repo.find_all()
        vendor_cycles = [
            c for c in all_cycles
            if c.get("vendor_name", "").lower() == vendor_name.lower()
        ]
        vendor_cycles.sort(key=lambda c: c.get("created_at", ""))

        scores: list[dict] = []
        for cycle in vendor_cycles:
            try:
                sc = self._fetch_scorecard(cycle["cycle_id"])
                avg = sc.get("overall_internal_avg")
                if avg is not None:
                    scores.append({
                        "cycle_id": cycle["cycle_id"],
                        "quarter": cycle.get("quarter", ""),
                        "year": cycle.get("year", ""),
                        "overall_avg": avg,
                    })
            except Exception:
                continue

        trajectory = "stable"
        if len(scores) >= 2:
            recent = scores[-1]["overall_avg"] - scores[-2]["overall_avg"]
            if recent >= 0.5:
                trajectory = "improving"
            elif recent <= -0.5:
                trajectory = "declining"

        return {
            "summary": f"{vendor_name} trajectory: {trajectory} ({len(scores)} cycles).",
            "data": {
                "vendor_name": vendor_name,
                "trajectory": trajectory,
                "score_history": scores,
            },
            "warnings": [],
            "next_actions": [],
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


def _build_fallback_brief(
    vendor_name: str,
    scorecard: dict,
    trajectory: str,
    score_history: list[float],
    total_cycles: int,
) -> dict:
    categories = scorecard.get("categories", [])
    overall = scorecard.get("overall_internal_avg") or 0

    strengths = []
    concerns = []
    for cat in categories:
        avg = cat.get("internal_avg")
        if avg is not None:
            if avg >= 4.0:
                strengths.append(f"{cat['category_label']}: strong at {avg}/5")
            elif avg < 3.0:
                concerns.append(f"{cat['category_label']}: below target at {avg}/5")

    recommendations = []
    if concerns:
        recommendations.append(f"Focus improvement plan on {concerns[0].split(':')[0]}")
    if trajectory == "declining":
        recommendations.append("Schedule executive escalation meeting within 2 weeks")
    if trajectory == "improving":
        recommendations.append("Continue current engagement model — positive momentum")

    return {
        "vendor_name": vendor_name,
        "trajectory": trajectory,
        "overall_score": round(overall, 2),
        "total_cycles_reviewed": total_cycles,
        "strengths": strengths[:4],
        "concerns": concerns[:4],
        "recommendations": recommendations[:4],
        "unresolved_from_prior": [],
    }
