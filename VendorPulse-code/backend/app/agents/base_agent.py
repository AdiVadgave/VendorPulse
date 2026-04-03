"""
Base Agent — abstract base class for all VendorPulse agents.

Implements the tool-calling loop described in the VendorPulse LLD (Section 8).

Architecture
------------
                    ┌───────────────────────────────┐
                    │          BaseAgent             │
                    │                               │
                    │  run(message, context)        │
                    │    ↓ LLM enabled?             │
                    │  YES → _tool_calling_loop()   │
                    │  NO  → _deterministic_run()   │
                    └───────────────────────────────┘
                              │
                    ┌─────────┴──────────┐
                    │  execute_tool()    │  ← implemented by each sub-class
                    │  get_tools()       │
                    │  get_system_prompt()│
                    └────────────────────┘

When LLM is disabled (settings.enable_llm = False):
  - _deterministic_run() is called instead of the tool-calling loop
  - Sub-classes override _deterministic_run() to invoke services directly
  - All agent_runs logging still happens (full traceability)

When LLM is enabled:
  - Claude API drives which tools to call in sequence
  - execute_tool() routes each call to the correct service method
  - Swap enable_llm=true in .env to activate

Future upgrade: change nothing in routes or services — just flip the flag.
"""
from __future__ import annotations

import json
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Optional

from app.config import settings
from app.models.common import AgentResponse

if TYPE_CHECKING:
    from app.repositories.agent_run_repository import AgentRunRepository
    from app.services.llm_service import LLMService


class BaseAgent(ABC):
    """
    All VendorPulse agents inherit from this class.

    Provides:
    - Standard Claude API tool-calling loop (when LLM enabled)
    - Deterministic fallback path (when LLM disabled)
    - agent_runs logging for full traceability
    - Standardised AgentResponse output envelope
    """

    agent_name: str = "base_agent"

    def __init__(
        self,
        cycle_id: Optional[str] = None,
        llm_svc: Optional["LLMService"] = None,
        agent_run_repo: Optional["AgentRunRepository"] = None,
    ) -> None:
        self.cycle_id = cycle_id
        self._run_id = str(uuid.uuid4())
        self._llm = llm_svc
        self._agent_run_repo = agent_run_repo

    # ------------------------------------------------------------------
    # Abstract interface — implement in every sub-class
    # ------------------------------------------------------------------

    @abstractmethod
    def get_system_prompt(self) -> str:
        """Return the Claude system prompt for this agent."""
        ...

    @abstractmethod
    def get_tools(self) -> list[dict]:
        """
        Return tool definitions in Anthropic tool-calling format.

        Example:
            [{"name": "rank_slots", "description": "...", "input_schema": {...}}]
        """
        ...

    @abstractmethod
    def execute_tool(self, tool_name: str, tool_input: dict) -> str:
        """
        Execute a single tool call and return the result as a JSON string.
        Called by the tool-calling loop for each tool_use block from Claude.
        """
        ...

    @abstractmethod
    def _deterministic_run(self, message: str, context: dict) -> dict:
        """
        Called instead of the LLM loop when settings.enable_llm is False.
        Must return a dict that _build_response() can consume:
        {
            "summary":           str,
            "data":              Any,
            "warnings":          list[str],
            "next_actions":      list[str],
            "requires_approval": bool,
        }
        """
        ...

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------

    def run(self, user_message: str = "", context: Optional[dict] = None) -> AgentResponse:
        """
        Execute the agent and return an AgentResponse.

        Parameters
        ----------
        user_message : Natural-language instruction (used in LLM mode).
        context      : Structured input for deterministic mode (key = action name).
        """
        ctx = context or {}
        input_payload = {"user_message": user_message, "context": ctx}
        run_record = self._log_run_start(input_payload)

        try:
            if settings.enable_llm and self._llm is not None:
                result = self._tool_calling_loop(user_message)
            else:
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
    # LLM tool-calling loop
    # ------------------------------------------------------------------

    def _tool_calling_loop(self, user_message: str) -> dict:
        """
        Implements the OpenAI / Azure OpenAI tool-calling loop.

        Runs until the model returns finish_reason='stop' or max iterations reached.
        Each tool_calls block is dispatched to execute_tool().
        """
        tools = self.get_tools()
        system = self.get_system_prompt()
        messages: list[dict] = [
            {"role": "system", "content": system},
            {"role": "user", "content": user_message},
        ]

        max_iterations = 10
        for _ in range(max_iterations):
            response = self._llm.call(messages=messages, tools=tools)
            choice = response.choices[0]

            if choice.finish_reason in ("stop", "end_turn", None):
                return self._extract_final_result(choice.message)

            if choice.finish_reason == "tool_calls":
                # Append the assistant message (with tool_calls) to history
                tool_calls_payload = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in choice.message.tool_calls
                ]
                messages.append(
                    {
                        "role": "assistant",
                        "content": choice.message.content,
                        "tool_calls": tool_calls_payload,
                    }
                )

                # Execute each tool and append results
                for tc in choice.message.tool_calls:
                    tool_input = json.loads(tc.function.arguments)
                    tool_result = self.execute_tool(tc.function.name, tool_input)
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "content": tool_result,
                        }
                    )
            else:
                # Unknown finish_reason (e.g. "length", "content_filter") — treat as done
                return self._extract_final_result(choice.message)

        # Max iterations reached — return whatever the last message said
        last = messages[-1] if messages else {}
        return {
            "summary": "Agent completed after reaching max iterations.",
            "data": {"last_tool_result": last.get("content", "")},
            "warnings": ["Agent reached max iterations (10)."],
            "next_actions": ["APPROVE_SLOT"],
            "requires_approval": True,
        }

    def _extract_final_result(self, message: Any) -> dict:
        """Parse GPT-4o's final text response as JSON, or wrap as raw output."""
        text = message.content or ""
        if text:
            try:
                return json.loads(text)
            except (json.JSONDecodeError, ValueError):
                return {
                    "summary": text,
                    "data": {"raw_output": text},
                    "warnings": [],
                    "next_actions": [],
                    "requires_approval": False,
                }
        return {
            "summary": "Agent completed with no text output.",
            "data": {},
            "warnings": [],
            "next_actions": [],
            "requires_approval": False,
        }

    # ------------------------------------------------------------------
    # Response construction
    # ------------------------------------------------------------------

    def _build_response(self, status: str, result: dict) -> AgentResponse:
        return AgentResponse(
            status=status,  # type: ignore[arg-type]
            agent=self.agent_name,
            summary=result.get("summary", ""),
            data=result.get("data"),
            warnings=result.get("warnings", []),
            next_actions=result.get("next_actions", []),
            requires_approval=result.get("requires_approval", False),
            run_id=self._run_id,
        )

    def _build_error_response(self, error: str) -> AgentResponse:
        return AgentResponse(
            status="failed",
            agent=self.agent_name,
            summary=f"Agent error: {error}",
            data=None,
            warnings=[],
            next_actions=["RETRY"],
            requires_approval=False,
            run_id=self._run_id,
        )

    # ------------------------------------------------------------------
    # agent_runs logging
    # ------------------------------------------------------------------

    def _log_run_start(self, input_payload: dict) -> Optional[dict]:
        if not self._agent_run_repo:
            return None
        record = {
            "run_id": self._run_id,
            "agent_name": self.agent_name,
            "cycle_id": self.cycle_id,
            "input_payload": json.dumps(input_payload),
            "output_payload": "{}",
            "status": "PENDING",
            "triggered_by": "USER",
            "error_message": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        return self._agent_run_repo.insert(record)

    def _log_run_complete(
        self,
        record: Optional[dict],
        status: str,
        response: AgentResponse,
        error: Optional[str] = None,
    ) -> None:
        if not self._agent_run_repo or record is None:
            return
        self._agent_run_repo.update_by_id(
            "run_id",
            self._run_id,
            {
                "status": status,
                "output_payload": json.dumps(response.model_dump()),
                "error_message": error,
            },
        )
