"""
Module F — Portfolio analytics.

GET /api/analytics/portfolio   Cross-cycle vendor analytics computed live from the
                               actual stored scorecards (no mock/agent data).
"""
from __future__ import annotations

import logging
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter

from app.dependencies import get_cycle_repo

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
