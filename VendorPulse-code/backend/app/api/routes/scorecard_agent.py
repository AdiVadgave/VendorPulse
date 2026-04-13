"""
Module B — Scorecard Agent routes.

POST /api/cycles/{cycleId}/scorecard/validate        Validate a scorecard submission
POST /api/cycles/{cycleId}/scorecard/outliers         Flag statistical outliers
POST /api/cycles/{cycleId}/scorecard/reminder          Generate a reminder for pending submissions
POST /api/cycles/{cycleId}/scorecard/submission-summary  Get submission status summary
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.dependencies import get_scorecard_agent
from app.models.common import AgentResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cycles/{cycleId}/scorecard", tags=["scorecard-agent"])


class ValidateSubmissionRequest(BaseModel):
    cycle_id: str
    scores: dict[str, float] = Field(..., description="parameter_key -> score")
    comments: dict[str, str] = Field(default_factory=dict, description="category_key -> comment")


class FlagOutliersRequest(BaseModel):
    cycle_id: str


class GenerateReminderRequest(BaseModel):
    cycle_id: str
    attendee_name: str
    vendor_name: str
    reminder_tier: str = Field("T-5", description="T-5, T-2, or T-0")
    deadline: Optional[str] = None


class SubmissionSummaryRequest(BaseModel):
    cycle_id: str
    submitted: int
    total: int
    pending_names: list[str] = Field(default_factory=list)


@router.post("/validate", response_model=AgentResponse)
def validate_submission(cycleId: str, payload: ValidateSubmissionRequest):
    """Validate a scorecard submission against business rules."""
    logger.info("SCORECARD-AGENT: validate — cycleId=%s, scores=%d", cycleId, len(payload.scores))

    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    agent = get_scorecard_agent(cycle_id=cycleId)
    response = agent.run(
        user_message="Validate this scorecard submission",
        context={
            "action": "validate_submission",
            "params": {
                "scores": payload.scores,
                "comments": payload.comments,
            },
        },
    )
    return response


@router.post("/outliers", response_model=AgentResponse)
def flag_outliers(cycleId: str, payload: FlagOutliersRequest):
    """Flag statistical outliers in compiled scorecard data."""
    logger.info("SCORECARD-AGENT: flag outliers — cycleId=%s", cycleId)

    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    agent = get_scorecard_agent(cycle_id=cycleId)
    response = agent.run(
        user_message="Flag statistical outliers in the compiled scorecard",
        context={
            "action": "flag_outliers",
            "params": {"cycle_id": cycleId},
        },
    )
    return response


@router.post("/reminder", response_model=AgentResponse)
def generate_reminder(cycleId: str, payload: GenerateReminderRequest):
    """Generate a reminder message for pending scorecard submissions."""
    logger.info(
        "SCORECARD-AGENT: reminder — cycleId=%s, name=%s, tier=%s",
        cycleId, payload.attendee_name, payload.reminder_tier,
    )

    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    agent = get_scorecard_agent(cycle_id=cycleId)
    response = agent.run(
        user_message=f"Generate a {payload.reminder_tier} reminder for {payload.attendee_name}",
        context={
            "action": "generate_reminder",
            "params": {
                "attendee_name": payload.attendee_name,
                "vendor_name": payload.vendor_name,
                "reminder_tier": payload.reminder_tier,
                "deadline": payload.deadline,
            },
        },
    )
    return response


@router.post("/submission-summary", response_model=AgentResponse)
def get_submission_summary(cycleId: str, payload: SubmissionSummaryRequest):
    """Get a summary of submission status for a cycle."""
    logger.info("SCORECARD-AGENT: summary — cycleId=%s, %d/%d", cycleId, payload.submitted, payload.total)

    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    agent = get_scorecard_agent(cycle_id=cycleId)
    response = agent.run(
        user_message="Get submission summary",
        context={
            "action": "get_submission_summary",
            "params": {
                "submitted": payload.submitted,
                "total": payload.total,
                "pending_names": payload.pending_names,
            },
        },
    )
    return response
