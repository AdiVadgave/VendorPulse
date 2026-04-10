"""
Module D — Vendor Prep agent routes.

POST /api/cycles/{cycleId}/vendor-prep/brief       Generate vendor brief from scorecard
POST /api/cycles/{cycleId}/vendor-prep/pushback     Draft 3 response options for a pushback item
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_vendor_prep_agent
from app.models.common import AgentResponse
from app.models.vendor_prep import GenerateBriefRequest, HandlePushbackRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cycles/{cycleId}/vendor-prep", tags=["vendor-prep"])


@router.post("/brief", response_model=AgentResponse)
def generate_vendor_brief(
    cycleId: str,
    payload: GenerateBriefRequest,
):
    """
    Generate a narrative vendor brief from compiled scorecard data.
    Uses Azure OpenAI when ENABLE_LLM=true, otherwise returns a deterministic brief.
    """
    logger.info("VENDOR-PREP: generate brief — cycleId=%s, vendor=%s", cycleId, payload.vendor_name)

    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    agent = get_vendor_prep_agent(cycle_id=cycleId)
    response = agent.run(
        user_message=f"Generate a vendor brief for cycle {cycleId}",
        context={
            "action": "generate_vendor_brief",
            "params": {
                "vendor_name": payload.vendor_name or "Vendor",
            },
        },
    )
    logger.info("VENDOR-PREP: brief generated — status=%s", response.status)
    return response


@router.post("/pushback", response_model=AgentResponse)
def handle_pushback(
    cycleId: str,
    payload: HandlePushbackRequest,
):
    """
    Draft 3 response options (factual, neutral, escalation) for a vendor pushback item.
    Items flagged for legal review are excluded from AI drafting.
    """
    logger.info(
        "VENDOR-PREP: handle pushback — cycleId=%s, pushback_id=%s, category=%s, legal=%s",
        cycleId, payload.pushback_id, payload.category, payload.needs_legal_review,
    )

    if payload.cycle_id != cycleId:
        raise HTTPException(status_code=400, detail="cycle_id in body must match URL")

    agent = get_vendor_prep_agent(cycle_id=cycleId)
    response = agent.run(
        user_message=f"Draft 3 response options for pushback {payload.pushback_id}",
        context={
            "action": "handle_pushback",
            "params": {
                "pushback_id": payload.pushback_id,
                "category": payload.category,
                "description": payload.description,
                "raised_by": payload.raised_by,
                "needs_legal_review": payload.needs_legal_review,
            },
        },
    )
    logger.info("VENDOR-PREP: pushback handled — status=%s", response.status)
    return response
