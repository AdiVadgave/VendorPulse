"""
Module F — Memory / Analytics Agent routes.

POST /api/analytics/multi-cycle-scores     Get scores across cycles for a vendor
POST /api/analytics/recurring-issues       Detect recurring low-score categories
POST /api/analytics/leadership-brief       Generate leadership briefing card
POST /api/analytics/vendor-trajectory      Get vendor improvement trajectory
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.dependencies import get_memory_agent
from app.models.common import AgentResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


class MultiCycleRequest(BaseModel):
    vendor_name: str


class RecurringIssuesRequest(BaseModel):
    vendor_name: str


class LeadershipBriefRequest(BaseModel):
    vendor_name: str
    cycle_id: Optional[str] = None


class TrajectoryRequest(BaseModel):
    vendor_name: str


@router.post("/multi-cycle-scores", response_model=AgentResponse)
def get_multi_cycle_scores(payload: MultiCycleRequest):
    """Retrieve scorecard data across all cycles for a vendor."""
    logger.info("ANALYTICS: multi-cycle scores — vendor=%s", payload.vendor_name)

    agent = get_memory_agent()
    return agent.run(
        user_message=f"Get multi-cycle scores for {payload.vendor_name}",
        context={
            "action": "get_multi_cycle_scores",
            "params": {"vendor_name": payload.vendor_name},
        },
    )


@router.post("/recurring-issues", response_model=AgentResponse)
def detect_recurring_issues(payload: RecurringIssuesRequest):
    """Identify categories scoring below 3.0 for 2+ consecutive cycles."""
    logger.info("ANALYTICS: recurring issues — vendor=%s", payload.vendor_name)

    agent = get_memory_agent()
    return agent.run(
        user_message=f"Detect recurring issues for {payload.vendor_name}",
        context={
            "action": "detect_recurring_issues",
            "params": {"vendor_name": payload.vendor_name},
        },
    )


@router.post("/leadership-brief", response_model=AgentResponse)
def generate_leadership_brief(payload: LeadershipBriefRequest):
    """Generate a concise leadership briefing card for a vendor."""
    logger.info("ANALYTICS: leadership brief — vendor=%s, cycle=%s", payload.vendor_name, payload.cycle_id)

    agent = get_memory_agent(cycle_id=payload.cycle_id)
    return agent.run(
        user_message=f"Generate leadership brief for {payload.vendor_name}",
        context={
            "action": "generate_leadership_brief",
            "params": {
                "vendor_name": payload.vendor_name,
                "cycle_id": payload.cycle_id,
            },
        },
    )


@router.post("/vendor-trajectory", response_model=AgentResponse)
def get_vendor_trajectory(payload: TrajectoryRequest):
    """Determine if a vendor is improving, stable, or declining."""
    logger.info("ANALYTICS: trajectory — vendor=%s", payload.vendor_name)

    agent = get_memory_agent()
    return agent.run(
        user_message=f"Get trajectory for {payload.vendor_name}",
        context={
            "action": "get_vendor_trajectory",
            "params": {"vendor_name": payload.vendor_name},
        },
    )
