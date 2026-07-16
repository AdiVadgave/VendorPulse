"""
Action-item models — the shared action queue that flows across a cycle's meetings
(Internal Alignment → Vendor Meeting → further Alignment → final QBR).

Items are created from meeting transcripts (or added manually), carried forward as a
single queue, and edited/closed by the VMO coordinator as they are resolved.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

ActionSource = Literal["alignment", "vendor_prep", "meeting"]
ActionStatus = Literal["OPEN", "IN_PROGRESS", "CLOSED"]


class ActionItem(BaseModel):
    action_id: str
    cycle_id: str
    # Short action title, e.g. "Escalate pricing to commercial lead".
    description: str
    # Fuller context/details of the action — the "what & why" for the next meeting.
    details: str = ""
    owner: str = "TBD"
    due_date: Optional[str] = None
    source: ActionSource = "alignment"
    status: ActionStatus = "OPEN"
    # Where it was raised, e.g. "Alignment Meeting 1", "QBR" — for the discussion carry-over.
    origin: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ActionItemCreate(BaseModel):
    description: str
    details: str = ""
    owner: str = "TBD"
    due_date: Optional[str] = None
    source: ActionSource = "alignment"
    status: ActionStatus = "OPEN"
    origin: Optional[str] = None
    # Optional client-supplied id (from transcript extraction); server generates one if absent.
    action_id: Optional[str] = None


class ActionItemBulkCreate(BaseModel):
    actions: list[ActionItemCreate] = Field(default_factory=list)


class ActionItemUpdate(BaseModel):
    description: Optional[str] = None
    details: Optional[str] = None
    owner: Optional[str] = None
    due_date: Optional[str] = None
    source: Optional[ActionSource] = None
    status: Optional[ActionStatus] = None
    origin: Optional[str] = None
