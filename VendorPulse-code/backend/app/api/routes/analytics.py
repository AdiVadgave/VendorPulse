"""
Module F — Memory / Analytics Agent routes.

POST /api/analytics/multi-cycle-scores     Get scores across cycles for a vendor
POST /api/analytics/recurring-issues       Detect recurring low-score categories
POST /api/analytics/leadership-brief       Generate leadership briefing card
POST /api/analytics/vendor-trajectory      Get vendor improvement trajectory
"""
from __future__ import annotations

import logging
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.dependencies import get_memory_agent, get_cycle_repo
from app.models.common import AgentResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# ── Portfolio analytics (REAL data — computed live from cycles + submissions) ──


def _trajectory(delta: Optional[float]) -> str:
    if delta is None:
        return "n/a"
    if delta >= 0.25:
        return "improving"
    if delta <= -0.25:
        return "declining"
    return "stable"


@router.get("/portfolio")
def portfolio_analytics():
    """Cross-cycle vendor analytics computed on demand from the actual stored
    scorecards (no mock/dummy data). For each vendor it walks its cycles that have
    submissions, computes the consolidated weighted overall + per-theme scores, and
    derives the trajectory (latest vs previous overall). Only cycles with at least
    one submission are included, so vendors without data simply don't appear."""
    from app.api.routes.scorecard_v2 import _compile_weighted, _QUARTER_NUM

    cycles = get_cycle_repo().find_all()
    by_vendor: dict[str, list[dict]] = defaultdict(list)
    for c in cycles:
        by_vendor[c.get("vendor_id")].append(c)

    vendors_out: list[dict] = []
    theme_order: list[str] = []          # first-seen order of theme labels (stable series order)
    theme_seen: set[str] = set()

    for vid, vcycles in by_vendor.items():
        vcycles.sort(key=lambda c: (int(c.get("year") or 0), _QUARTER_NUM.get(c.get("quarter", ""), 0)))
        points: list[dict] = []
        for c in vcycles:
            w = _compile_weighted(c["cycle_id"])
            if not w.get("submitted_count"):
                continue
            themes: dict[str, float] = {}
            for cat in w.get("categories", []):
                avg = cat.get("category_average")
                if avg is None:
                    continue
                themes[cat["label"]] = avg
                if cat["label"] not in theme_seen:
                    theme_seen.add(cat["label"])
                    theme_order.append(cat["label"])
            points.append({
                "cycle_id": c["cycle_id"],
                "label": f"{c.get('quarter', '')} {c.get('year', '')}".strip(),
                "quarter": c.get("quarter"),
                "year": c.get("year"),
                "overall_score": w.get("overall_score"),
                "themes": themes,
                "team_count": w.get("submitted_count"),
                "workflow_state": c.get("workflow_state"),
            })
        if not points:
            continue
        latest, prev = points[-1], (points[-2] if len(points) >= 2 else None)
        delta = None
        if prev and latest["overall_score"] is not None and prev["overall_score"] is not None:
            delta = round(latest["overall_score"] - prev["overall_score"], 2)
        vendors_out.append({
            "vendor_id": vid,
            "vendor_name": vcycles[0].get("vendor_name"),
            "cycles": points,
            "latest": latest,
            "previous_label": prev["label"] if prev else None,
            "trajectory": _trajectory(delta),
            "delta": delta,
        })

    vendors_out.sort(key=lambda v: (v["latest"]["overall_score"] is None, -(v["latest"]["overall_score"] or 0)))

    overalls = [v["latest"]["overall_score"] for v in vendors_out if v["latest"]["overall_score"] is not None]
    kpis = {
        "vendors_tracked": len(vendors_out),
        "avg_overall": round(sum(overalls) / len(overalls), 2) if overalls else None,
        "improving": sum(1 for v in vendors_out if v["trajectory"] == "improving"),
        "declining": sum(1 for v in vendors_out if v["trajectory"] == "declining"),
        "stable": sum(1 for v in vendors_out if v["trajectory"] == "stable"),
        "cycles_scored": sum(len(v["cycles"]) for v in vendors_out),
    }
    return {"vendors": vendors_out, "themes": theme_order, "kpis": kpis}


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
