"""
SchedulingAgent — Module A agent.

Wraps the SchedulingService in the BaseAgent tool-calling pattern so that:
  - When LLM is disabled → calls service methods directly via _deterministic_run()
  - When LLM is enabled  → Claude drives the conversation via execute_tool()

Tools exposed to Claude:
  get_attendee_list          Read current cycle attendees
  simulate_responses         Mark all attendees as having submitted availability
  rank_slots                 Run deterministic slot ranking algorithm
  approve_slot               Approve a ranked slot
  send_invites               Create meeting and send invites for approved slot
  get_rsvp_status            Summarise current RSVP responses
"""
from __future__ import annotations

import json
from typing import TYPE_CHECKING, Optional

from app.agents.base_agent import BaseAgent
from app.utils.prompts import SCHEDULING_SYSTEM_PROMPT

if TYPE_CHECKING:
    from app.repositories.agent_run_repository import AgentRunRepository
    from app.services.llm_service import LLMService
    from app.services.scheduling_service import SchedulingService


class SchedulingAgent(BaseAgent):
    agent_name = "scheduling_agent"

    # External side effects — withheld from the model and refused inside an agent
    # run. They fire only from their deterministic routes after a human approves.
    gated_tools = {"approve_slot", "send_invites"}

    def __init__(
        self,
        scheduling_svc: "SchedulingService",
        cycle_id: Optional[str] = None,
        llm_svc: Optional["LLMService"] = None,
        agent_run_repo: Optional["AgentRunRepository"] = None,
    ) -> None:
        super().__init__(cycle_id=cycle_id, llm_svc=llm_svc, agent_run_repo=agent_run_repo)
        self._svc = scheduling_svc

    # ------------------------------------------------------------------
    # BaseAgent interface
    # ------------------------------------------------------------------

    def get_system_prompt(self) -> str:
        return SCHEDULING_SYSTEM_PROMPT

    def get_tools(self) -> list[dict]:
        """Return tools in OpenAI function-calling format."""
        return [
            {
                "type": "function",
                "function": {
                    "name": "get_attendee_list",
                    "description": "Return the current list of attendees for this governance cycle.",
                    "parameters": {"type": "object", "properties": {}, "required": []},
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "simulate_responses",
                    "description": "Simulate all attendees submitting their availability (demo helper).",
                    "parameters": {"type": "object", "properties": {}, "required": []},
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "rank_slots",
                    "description": (
                        "Run the deterministic slot-ranking algorithm and return the top 3 proposals. "
                        "Hard constraints: organiser and exec-sponsor must be available. "
                        "Scoring: attendance % − conflict penalty + tz bonus."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "attendee_user_ids": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "User IDs to include",
                            },
                            "attendee_names": {
                                "type": "object",
                                "description": "userId → display name",
                            },
                            "attendee_key_flags": {
                                "type": "object",
                                "description": "userId → is_key flag",
                            },
                            "organiser_id": {"type": "string", "description": "userId of meeting organiser (hard constraint)"},
                            "exec_sponsor_id": {"type": "string", "description": "userId of exec sponsor (hard constraint)"},
                            "date_range_start": {"type": "string", "description": "YYYY-MM-DD — first candidate day"},
                            "date_range_end": {"type": "string", "description": "YYYY-MM-DD — last candidate day"},
                            "duration_hours": {"type": "number", "description": "Meeting duration in hours"},
                        },
                        "required": [
                            "attendee_user_ids",
                            "organiser_id",
                            "exec_sponsor_id",
                            "date_range_start",
                            "date_range_end",
                        ],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "approve_slot",
                    "description": "Approve a ranked slot proposal and generate a calendar invite draft.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "slot_id": {"type": "string"},
                            "approved_by": {"type": "string", "description": "userId of the approver"},
                            "time_zone": {"type": "string", "description": "Optional timezone to use for the approved slot (e.g. IST, UTC, GMT)"},
                        },
                        "required": ["slot_id", "approved_by"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "send_invites",
                    "description": "Create the meeting record and send invites for an approved slot.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "slot_id": {"type": "string"},
                            "organiser_id": {"type": "string"},
                        },
                        "required": ["slot_id", "organiser_id"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "get_rsvp_status",
                    "description": "Return the current RSVP summary for the cycle.",
                    "parameters": {"type": "object", "properties": {}, "required": []},
                },
            },
        ]

    def execute_tool(self, tool_name: str, tool_input: dict) -> str:
        """Route Claude's tool calls to the SchedulingService."""
        if tool_name == "get_attendee_list":
            attendees = self._svc.get_attendees(self.cycle_id)
            return json.dumps(attendees)

        if tool_name == "simulate_responses":
            result = self._svc.simulate_responses(self.cycle_id)
            return json.dumps(result.model_dump())

        if tool_name == "rank_slots":
            from app.models.scheduling import RankSlotsRequest

            req = RankSlotsRequest(
                cycle_id=self.cycle_id,
                **{k: v for k, v in tool_input.items() if k != "cycle_id"},
            )
            result = self._svc.rank_slots(req)
            return json.dumps(result.model_dump())

        if tool_name == "approve_slot":
            result = self._svc.approve_slot(
                self.cycle_id,
                tool_input["slot_id"],
                tool_input["approved_by"],
                time_zone=tool_input.get("time_zone"),
            )
            return json.dumps(result.model_dump())

        if tool_name == "send_invites":
            result = self._svc.send_invites(
                self.cycle_id, tool_input["slot_id"], tool_input["organiser_id"]
            )
            return json.dumps(result.model_dump())

        if tool_name == "get_rsvp_status":
            result = self._svc.get_rsvp_status(self.cycle_id)
            return json.dumps(result.model_dump())

        return json.dumps({"error": f"Unknown tool: {tool_name}"})

    # ------------------------------------------------------------------
    # Deterministic run (LLM disabled path)
    # ------------------------------------------------------------------

    def _deterministic_run(self, message: str, context: dict) -> dict:
        """
        When settings.enable_llm is False, this method routes the action directly
        to the SchedulingService without involving Claude.

        context["action"] must be one of the tool names above.
        """
        action = context.get("action", "")
        result = json.loads(self.execute_tool(action, context.get("params", {})))

        if "status" in result:
            # execute_tool returned an AgentResponse dict — unwrap it
            return {
                "summary": result.get("summary", ""),
                "data": result.get("data"),
                "warnings": result.get("warnings", []),
                "next_actions": result.get("next_actions", []),
                "requires_approval": result.get("requires_approval", False),
            }

        return {
            "summary": f"Completed action '{action}'.",
            "data": result,
            "warnings": [],
            "next_actions": [],
            "requires_approval": False,
        }
