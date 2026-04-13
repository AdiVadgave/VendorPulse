"""
ScorecardAgent — Module B agent.

Uses call_simple() for optional text generation (reminder drafts).
Core logic (dispatch, validate, compile) is fully deterministic — no LLM needed.

When LLM is enabled  -> call_simple() generates polished reminder text
When LLM is disabled -> deterministic fallback uses template text
"""
from __future__ import annotations

import json
import logging
import math
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Optional

from app.agents.base_agent import BaseAgent
from app.models.common import AgentResponse
from app.utils.prompts import SCORECARD_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from app.repositories.agent_run_repository import AgentRunRepository
    from app.services.llm_service import LLMService


class ScorecardAgent(BaseAgent):
    agent_name = "scorecard_agent"

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
        return SCORECARD_SYSTEM_PROMPT

    def get_tools(self) -> list[dict]:
        return []

    def execute_tool(self, tool_name: str, tool_input: dict) -> str:
        return json.dumps({"error": "ScorecardAgent uses call_simple(), not tool-calling"})

    # ------------------------------------------------------------------
    # Action dispatcher
    # ------------------------------------------------------------------

    def _deterministic_run(self, message: str, context: dict) -> dict:
        action = context.get("action", "")

        if action == "validate_submission":
            return self._validate_submission(context)
        if action == "flag_outliers":
            return self._flag_outliers(context)
        if action == "generate_reminder":
            return self._generate_reminder(context)
        if action == "get_submission_summary":
            return self._get_submission_summary(context)

        return {
            "summary": f"Unknown action: {action}",
            "data": None,
            "warnings": [f"Action '{action}' not recognised"],
            "next_actions": [],
            "requires_approval": False,
        }

    def _validate_submission(self, context: dict) -> dict:
        """Validate a single scorecard submission against business rules."""
        params = context.get("params", {})
        scores = params.get("scores", {})  # {parameter_key: score_value}
        comments = params.get("comments", {})  # {category_key: comment_text}

        errors: list[str] = []
        warnings: list[str] = []

        for key, value in scores.items():
            if not isinstance(value, (int, float)):
                errors.append(f"{key}: score must be numeric, got '{value}'")
                continue
            if value < 1 or value > 5:
                errors.append(f"{key}: score {value} is out of range (1-5)")
            elif value in (1, 5):
                comment_category = _param_to_category(key)
                if comment_category and not comments.get(comment_category):
                    errors.append(f"{key}: extreme score ({value}) requires a comment")

        return {
            "summary": f"Validated submission: {len(errors)} errors, {len(warnings)} warnings.",
            "data": {
                "valid": len(errors) == 0,
                "errors": errors,
                "warnings": warnings,
                "score_count": len(scores),
            },
            "warnings": warnings,
            "next_actions": ["COMPILE_SCORECARD"] if len(errors) == 0 else ["FIX_ERRORS"],
            "requires_approval": False,
        }

    def _flag_outliers(self, context: dict) -> dict:
        """Flag statistical outliers in compiled scorecard data."""
        params = context.get("params", {})
        cycle_id = params.get("cycle_id", self.cycle_id)

        scorecard = self._fetch_scorecard(cycle_id)
        categories = scorecard.get("categories", [])
        outliers: list[dict] = []

        for cat in categories:
            for param in cat.get("parameters", []):
                all_scores = []
                for s in param.get("internal_scores", []):
                    all_scores.append({"name": s["name"], "score": s["score"], "type": "internal"})
                for s in param.get("vendor_scores", []):
                    all_scores.append({"name": s["name"], "score": s["score"], "type": "vendor"})

                if len(all_scores) < 3:
                    continue

                values = [s["score"] for s in all_scores]
                mean = sum(values) / len(values)
                variance = sum((v - mean) ** 2 for v in values) / len(values)
                std = math.sqrt(variance) if variance > 0 else 0

                if std == 0:
                    continue

                for s in all_scores:
                    z = abs(s["score"] - mean) / std
                    if z > 1.5:
                        outliers.append({
                            "parameter": param["parameter_label"],
                            "category": cat["category_label"],
                            "respondent": s["name"],
                            "score": s["score"],
                            "mean": round(mean, 2),
                            "z_score": round(z, 2),
                            "type": s["type"],
                        })

        return {
            "summary": f"Found {len(outliers)} statistical outliers.",
            "data": {"outliers": outliers},
            "warnings": [f"{o['respondent']}: {o['parameter']} score {o['score']} (z={o['z_score']})" for o in outliers[:5]],
            "next_actions": ["REVIEW_OUTLIERS"],
            "requires_approval": False,
        }

    def _generate_reminder(self, context: dict) -> dict:
        """Generate a reminder message for pending scorecard submissions."""
        params = context.get("params", {})
        attendee_name = params.get("attendee_name", "Stakeholder")
        vendor_name = params.get("vendor_name", "Vendor")
        reminder_tier = params.get("reminder_tier", "T-5")  # T-5, T-2, or T-0
        deadline = params.get("deadline", "")

        if self._llm and self._llm.is_enabled:
            prompt = (
                f"Write a {reminder_tier} reminder email for a pending vendor scorecard submission.\n"
                f"Recipient: {attendee_name}\n"
                f"Vendor being reviewed: {vendor_name}\n"
                f"Deadline: {deadline}\n"
                f"Tier: {reminder_tier} ({'gentle first nudge' if reminder_tier == 'T-5' else 'firm follow-up' if reminder_tier == 'T-2' else 'final urgent reminder'})\n\n"
                "Return a JSON object with: subject (string), body (string).\n"
                "Keep it professional, 3-5 sentences. Return ONLY the JSON."
            )
            raw = self._llm.call_simple(prompt, system=SCORECARD_SYSTEM_PROMPT, max_tokens=512)
            try:
                reminder = json.loads(_strip_markdown_json(raw))
            except json.JSONDecodeError:
                reminder = _build_fallback_reminder(attendee_name, vendor_name, reminder_tier, deadline)
        else:
            reminder = _build_fallback_reminder(attendee_name, vendor_name, reminder_tier, deadline)

        return {
            "summary": f"Generated {reminder_tier} reminder for {attendee_name}.",
            "data": {"reminder": reminder},
            "warnings": [],
            "next_actions": ["SEND_REMINDER"],
            "requires_approval": True,
        }

    def _get_submission_summary(self, context: dict) -> dict:
        """Get a summary of submission status for a cycle."""
        params = context.get("params", {})
        submitted_count = params.get("submitted", 0)
        total_count = params.get("total", 0)
        pending_names = params.get("pending_names", [])

        return {
            "summary": f"{submitted_count}/{total_count} scorecards submitted.",
            "data": {
                "submitted": submitted_count,
                "total": total_count,
                "pending": total_count - submitted_count,
                "pending_names": pending_names,
                "completion_pct": round(submitted_count / total_count * 100, 1) if total_count > 0 else 0,
            },
            "warnings": [f"Still waiting on {len(pending_names)} submissions"] if pending_names else [],
            "next_actions": ["SEND_REMINDER"] if pending_names else ["COMPILE_SCORECARD"],
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


# Map parameter keys to their parent category key
_PARAM_CATEGORY_MAP = {
    "RELEASE_PATCH_MGMT": "RISK_COMPLIANCE",
    "SECURITY_RISK_MGMT": "RISK_COMPLIANCE",
    "AUDIT_COMPLIANCE": "RISK_COMPLIANCE",
    "DELIVERY_TIMELINESS": "PERFORMANCE",
    "QUALITY_OF_DELIVERY": "PERFORMANCE",
    "RESOURCE_CAPABILITY": "PERFORMANCE",
    "SLA_ADHERENCE": "PERFORMANCE",
    "OPERATIONAL_EFFICIENCY": "PERFORMANCE",
    "PRICING_COMPETITIVENESS": "COMMERCIAL",
    "CONTRACT_COMPLIANCE": "COMMERCIAL",
    "COST_CONTROL": "COMMERCIAL",
    "BILLING_ACCURACY": "COMMERCIAL",
    "COMMUNICATION_EFFECTIVENESS": "RELATIONSHIP",
    "STAKEHOLDER_ENGAGEMENT": "RELATIONSHIP",
    "RESPONSIVENESS": "RELATIONSHIP",
    "COLLABORATION_ALIGNMENT": "RELATIONSHIP",
}


def _param_to_category(param_key: str) -> str | None:
    return _PARAM_CATEGORY_MAP.get(param_key)


def _build_fallback_reminder(name: str, vendor: str, tier: str, deadline: str) -> dict:
    urgency = {
        "T-5": ("Reminder", "This is a friendly reminder"),
        "T-2": ("Follow-up", "We are following up — your input is important"),
        "T-0": ("Urgent", "This is a final reminder — the deadline is today"),
    }
    label, opener = urgency.get(tier, ("Reminder", "This is a reminder"))
    return {
        "subject": f"{label}: {vendor} Governance Scorecard Due{' ' + deadline if deadline else ''}",
        "body": (
            f"Dear {name},\n\n"
            f"{opener} to complete your scorecard for {vendor}'s governance review"
            f"{' by ' + deadline if deadline else ''}.\n\n"
            "Your assessment is critical for the upcoming review meeting. "
            "Please submit your responses via the form link provided earlier.\n\n"
            "Thank you,\nVendorPulse Scorecard System"
        ),
    }
