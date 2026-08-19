"""
Vendor pushback (objection) models.

A pushback item is a vendor disagreement raised during prep; each can carry up to
three AI-drafted response options (factual / neutral / escalation), one of which the
coordinator selects. Items and responses are separate stores (relational child), so
they map cleanly to Postgres tables.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

PushbackCategory = Literal[
    "DATA_DISPUTE", "PROCESS_CONCERN", "RESOURCE_CONSTRAINT", "SCOPE_DISAGREEMENT", "OTHER"
]
PushbackStatus = Literal["OPEN", "RESOLVED", "ESCALATED"]
ResponseStance = Literal["factual", "neutral", "escalation"]


class PushbackCreate(BaseModel):
    category: PushbackCategory = "OTHER"
    description: str
    raised_by: str
    needs_legal_review: bool = False
    status: PushbackStatus = "OPEN"


class PushbackUpdate(BaseModel):
    category: Optional[PushbackCategory] = None
    description: Optional[str] = None
    raised_by: Optional[str] = None
    needs_legal_review: Optional[bool] = None
    status: Optional[PushbackStatus] = None


class PushbackItem(BaseModel):
    pushback_id: str
    cycle_id: str
    category: PushbackCategory
    description: str
    raised_by: str
    needs_legal_review: bool = False
    status: PushbackStatus = "OPEN"
    created_at: str
    updated_at: str


class PushbackResponseIn(BaseModel):
    stance: ResponseStance
    content: str
    is_selected: bool = False


class PushbackResponsesReplace(BaseModel):
    """Replace the full set of drafted responses for a pushback item."""
    responses: list[PushbackResponseIn] = Field(default_factory=list)
