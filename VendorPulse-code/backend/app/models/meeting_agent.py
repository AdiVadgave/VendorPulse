"""
Module E — Meeting Agent models.

Pydantic v2 schemas for meeting notes, meeting minutes, and action items.
These match the frontend TypeScript types in meeting.types.ts.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


NoteType = Literal["QUESTION", "OBJECTION", "DECISION", "APPRECIATION", "ACTION"]


class MeetingNote(BaseModel):
    note_id: str
    meeting_id: str
    note_type: NoteType
    content: str
    raised_by: str
    timestamp: str = Field(..., description="HH:MM format")


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
