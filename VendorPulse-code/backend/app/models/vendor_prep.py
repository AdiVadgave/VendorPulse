"""
Module D — Vendor Prep models.

Pydantic v2 schemas for vendor briefs, pushback items, and pushback responses.
These match the frontend TypeScript types in vendor-prep.types.ts.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class CategoryRating(BaseModel):
    category: str
    score: float = Field(..., ge=0, le=5)
    rationale: str
    trend: Literal["up", "down", "flat"]


class VendorBrief(BaseModel):
    overall_score: float = Field(..., ge=0, le=5)
    overall_trend: Literal["improving", "declining", "stable"]
    category_ratings: list[CategoryRating]
    key_concerns: list[str] = Field(default_factory=list, max_length=5)
    positive_areas: list[str] = Field(default_factory=list, max_length=5)
    open_actions: int = 0
    generated_at: str


class PushbackItem(BaseModel):
    pushback_id: str
    cycle_id: str
    category: Literal[
        "DATA_DISPUTE", "PROCESS_CONCERN", "RESOURCE_CONSTRAINT",
        "SCOPE_DISAGREEMENT", "OTHER",
    ]
    description: str
    raised_by: str
    needs_legal_review: bool = False
    status: Literal["OPEN", "RESOLVED", "ESCALATED"] = "OPEN"
    created_at: str


class PushbackResponse(BaseModel):
    response_id: str
    pushback_id: str
    stance: Literal["factual", "neutral", "escalation"]
    content: str
    is_selected: bool = False


# ── Request models for API endpoints ─────────────────────────────────────────


class GenerateBriefRequest(BaseModel):
    cycle_id: str
    vendor_name: Optional[str] = None


class HandlePushbackRequest(BaseModel):
    cycle_id: str
    pushback_id: str
    category: Literal[
        "DATA_DISPUTE", "PROCESS_CONCERN", "RESOURCE_CONSTRAINT",
        "SCOPE_DISAGREEMENT", "OTHER",
    ]
    description: str
    raised_by: str
    needs_legal_review: bool = False
