"""
Module E — Meeting Agent models.

Pydantic v2 schemas for meeting notes, meeting minutes, and action items.
These match the frontend TypeScript types in meeting.types.ts.
"""
from __future__ import annotations

import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


NoteType = Literal["QUESTION", "OBJECTION", "DECISION", "APPRECIATION", "ACTION"]

_VALID_NOTE_TYPES = {"QUESTION", "OBJECTION", "DECISION", "APPRECIATION", "ACTION"}
_NOTE_TYPE_STEMS = [
    ("ACTION", ("ACTION", "TODO", "TASK", "FOLLOW")),
    ("DECISION", ("DECIS", "AGREED", "RESOLVED", "APPROVED")),
    ("OBJECTION", ("OBJECT", "CONCERN", "DISAGREE", "DISPUTE", "ISSUE", "RISK")),
    ("APPRECIATION", ("APPREC", "THANK", "PRAISE", "RECOGNI")),
    ("QUESTION", ("QUEST", "ASK", "CLARIF", "INQUIR")),
]


def _coerce_note_type(raw_type: object) -> str:
    """Map a possibly-invalid note_type to one of the five allowed values.

    Upstream LLMs occasionally emit values like "RESPONSE/EXPLANATION" or
    "COMMENT/CLARIFICATION". We coerce those into the closest valid enum rather
    than 422ing the whole minutes request.
    """
    candidate = (raw_type if isinstance(raw_type, str) else "").strip().upper()
    if candidate in _VALID_NOTE_TYPES:
        return candidate

    for tok in re.split(r"[\s/|,;&\-]+", candidate):
        if tok in _VALID_NOTE_TYPES:
            return tok

    for valid, stems in _NOTE_TYPE_STEMS:
        if any(stem in candidate for stem in stems):
            return valid

    return "QUESTION"


class MeetingNote(BaseModel):
    note_id: str
    meeting_id: str
    note_type: NoteType
    content: str
    raised_by: str
    timestamp: str = Field(..., description="HH:MM format")

    @field_validator("note_type", mode="before")
    @classmethod
    def _normalize_note_type(cls, v: object) -> str:
        return _coerce_note_type(v)


class AgendaSummary(BaseModel):
    topic: str
    summary: str


class QALogEntry(BaseModel):
    question: str
    raised_by: str
    response: str


class ActionItem(BaseModel):
    description: str
    owner: str
    due_date: str = Field(default="", description="YYYY-MM-DD or empty if not mentioned")


class MeetingMinutes(BaseModel):
    minutes_id: str
    meeting_id: str
    cycle_id: str
    meeting_date: str
    attendees: list[str]
    executive_summary: str
    agenda_summaries: list[AgendaSummary]
    key_decisions: list[str]
    qa_log: list[QALogEntry]
    action_items: list[ActionItem]
    generated_at: str


# ── Request models for API endpoints ─────────────────────────────────────────


class GenerateMinutesRequest(BaseModel):
    cycle_id: str
    meeting_id: str
    notes: list[MeetingNote]
    attendees: list[str] = Field(default_factory=list)
    meeting_date: Optional[str] = None


class ParseTranscriptRequest(BaseModel):
    cycle_id: str
    meeting_id: str
    transcript: str
