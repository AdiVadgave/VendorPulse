"""
Shared response contracts used across all agent and scheduling endpoints.

AgentResponse is the single JSON shape every AI-capable endpoint returns.
The frontend never parses raw AI text — it always reads this envelope.
"""
from __future__ import annotations

import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field


class AgentResponse(BaseModel):
    """
    Standard envelope returned by every agent / scheduling endpoint.

    Fields
    ------
    status            : Terminal state of this execution.
    agent             : Name of the agent that produced the response.
    summary           : Human-readable one-liner for the UI.
    data              : Structured payload (varies per agent).
    warnings          : Non-fatal issues surfaced to the coordinator.
    next_actions      : Button / action IDs the UI should highlight next.
    requires_approval : True if a human must approve before anything is sent.
    run_id            : Links back to an agent_runs log entry (traceability).
    """

    status: Literal["success", "failed", "partial", "pending_approval"]
    agent: str
    summary: str
    data: Any = None
    warnings: list[str] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)
    requires_approval: bool = False
    run_id: str = Field(default_factory=lambda: str(uuid.uuid4()))


class ErrorDetail(BaseModel):
    detail: str
