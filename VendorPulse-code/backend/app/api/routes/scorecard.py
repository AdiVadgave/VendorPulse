"""
Legacy compiled-scorecard route (Google-Forms era).

Only the 2-column compiled view (Internal Stakeholder avg vs Vendor avg) remains —
it is still read by the cycle detail page. Scorecard collection itself now happens
in-app via `scorecard_v2` (weighted scorecard); the old dispatch/poll/responses
endpoints have been removed. For cycles created after the in-app switch, the stored
Google-Forms responses are empty, so this view simply returns empty categories.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter

from app.services.google_forms_service import get_responses_for_cycle

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scorecard", tags=["scorecard"])


# ── Compiled Scorecard ──────────────────────────────────────────────────────

# Scorecard parameter keys grouped by category
SCORECARD_CATEGORIES = {
    "RISK_COMPLIANCE": {
        "label": "Risk & Compliance",
        "parameters": [
            {"key": "RELEASE_PATCH_MGMT", "label": "Release & Patch Management"},
            {"key": "SECURITY_RISK_MGMT", "label": "Security & Risk Management"},
            {"key": "AUDIT_COMPLIANCE", "label": "Audit & Compliance Adherence"},
        ],
    },
    "PERFORMANCE": {
        "label": "Performance",
        "parameters": [
            {"key": "DELIVERY_TIMELINESS", "label": "Delivery Timeliness"},
            {"key": "QUALITY_OF_DELIVERY", "label": "Quality of Delivery"},
            {"key": "RESOURCE_CAPABILITY", "label": "Resource Capability"},
            {"key": "SLA_ADHERENCE", "label": "SLA Adherence"},
            {"key": "OPERATIONAL_EFFICIENCY", "label": "Operational Efficiency"},
        ],
    },
    "COMMERCIAL": {
        "label": "Commercial",
        "parameters": [
            {"key": "PRICING_COMPETITIVENESS", "label": "Pricing Competitiveness"},
            {"key": "CONTRACT_COMPLIANCE", "label": "Contract Compliance"},
            {"key": "COST_CONTROL", "label": "Cost Control"},
            {"key": "BILLING_ACCURACY", "label": "Billing Accuracy"},
        ],
    },
    "RELATIONSHIP": {
        "label": "Relationship",
        "parameters": [
            {"key": "COMMUNICATION_EFFECTIVENESS", "label": "Communication Effectiveness"},
            {"key": "STAKEHOLDER_ENGAGEMENT", "label": "Stakeholder Engagement"},
            {"key": "RESPONSIVENESS", "label": "Responsiveness"},
            {"key": "COLLABORATION_ALIGNMENT", "label": "Collaboration & Alignment"},
        ],
    },
}


def _parse_score(value: str) -> int | None:
    """Extract numeric score from form answer like '3 (Acceptable)' or '5 (Excellent)'."""
    if not value:
        return None
    try:
        return int(value.strip()[0])
    except (ValueError, IndexError):
        return None


@router.get("/compiled/{cycle_id}")
def get_compiled_scorecard(cycle_id: str):
    """
    Build a compiled scorecard with 2 columns: Internal Stakeholder avg and Vendor avg.
    Matches responses to attendees by email, groups by attendee type, averages scores.
    """
    from app.dependencies import get_attendee_repo

    attendee_repo = get_attendee_repo()
    attendees = [a for a in attendee_repo.find_all() if a.get("cycle_id") == cycle_id]

    # Build email → attendee type and name lookup
    email_type_map: dict[str, str] = {}
    email_name_map: dict[str, str] = {}
    for att in attendees:
        gmail = (att.get("gmail") or "").lower().strip()
        corp = (att.get("email") or "").lower().strip()
        att_type = att.get("type", "Internal Stakeholder")
        att_name = att.get("name", "Unknown")
        if gmail:
            email_type_map[gmail] = att_type
            email_name_map[gmail] = att_name
        if corp:
            email_type_map[corp] = att_type
            email_name_map[corp] = att_name

    # Get responses (read from stored data — the legacy Google-Forms store)
    responses = get_responses_for_cycle(cycle_id)

    # Classify responses by type
    internal_responses: list[dict] = []
    vendor_responses: list[dict] = []

    for resp in responses:
        email = (resp.get("email") or "").lower().strip()
        att_type = email_type_map.get(email, "Internal Stakeholder")
        if att_type == "Vendor":
            vendor_responses.append(resp)
        else:
            internal_responses.append(resp)

    # Build compiled scorecard
    categories = []
    all_internal_scores = []
    all_vendor_scores = []

    for cat_key, cat_def in SCORECARD_CATEGORIES.items():
        params = []
        cat_internal_scores = []
        cat_vendor_scores = []

        for param in cat_def["parameters"]:
            pkey = param["key"]

            # Collect scores from internal responses (with respondent names)
            i_scores = []
            i_individual = []
            for resp in internal_responses:
                raw = resp.get(pkey)
                if raw:
                    s = _parse_score(raw)
                    if s and 1 <= s <= 5:
                        i_scores.append(s)
                        resp_email = (resp.get("email") or "").lower().strip()
                        resp_name = email_name_map.get(resp_email, resp_email or "Unknown")
                        i_individual.append({"name": resp_name, "score": s})

            # Collect scores from vendor responses (with respondent names)
            v_scores = []
            v_individual = []
            for resp in vendor_responses:
                raw = resp.get(pkey)
                if raw:
                    s = _parse_score(raw)
                    if s and 1 <= s <= 5:
                        v_scores.append(s)
                        resp_email = (resp.get("email") or "").lower().strip()
                        resp_name = email_name_map.get(resp_email, resp_email or "Unknown")
                        v_individual.append({"name": resp_name, "score": s})

            i_avg = round(sum(i_scores) / len(i_scores), 2) if i_scores else None
            v_avg = round(sum(v_scores) / len(v_scores), 2) if v_scores else None

            if i_avg is not None:
                cat_internal_scores.append(i_avg)
                all_internal_scores.append(i_avg)
            if v_avg is not None:
                cat_vendor_scores.append(v_avg)
                all_vendor_scores.append(v_avg)

            params.append({
                "parameter_key": pkey,
                "parameter_label": param["label"],
                "internal_avg": i_avg,
                "vendor_avg": v_avg,
                "internal_count": len(i_scores),
                "vendor_count": len(v_scores),
                "internal_scores": i_individual,
                "vendor_scores": v_individual,
            })

        cat_i_avg = round(sum(cat_internal_scores) / len(cat_internal_scores), 2) if cat_internal_scores else None
        cat_v_avg = round(sum(cat_vendor_scores) / len(cat_vendor_scores), 2) if cat_vendor_scores else None

        categories.append({
            "category": cat_key,
            "category_label": cat_def["label"],
            "internal_avg": cat_i_avg,
            "vendor_avg": cat_v_avg,
            "parameters": params,
        })

    overall_i = round(sum(all_internal_scores) / len(all_internal_scores), 2) if all_internal_scores else None
    overall_v = round(sum(all_vendor_scores) / len(all_vendor_scores), 2) if all_vendor_scores else None

    # Collect comments by type
    comments: dict[str, dict] = {}
    for cat_key in SCORECARD_CATEGORIES:
        comment_key = f"comment_{cat_key}"
        internal_comments = [r.get(comment_key, "") for r in internal_responses if r.get(comment_key)]
        vendor_comments = [r.get(comment_key, "") for r in vendor_responses if r.get(comment_key)]
        if internal_comments or vendor_comments:
            comments[cat_key] = {
                "internal": internal_comments,
                "vendor": vendor_comments,
            }

    # Key recommendations
    all_recs = [r.get("key_recommendations", "") for r in responses if r.get("key_recommendations")]

    return {
        "cycle_id": cycle_id,
        "internal_respondents": len(internal_responses),
        "vendor_respondents": len(vendor_responses),
        "overall_internal_avg": overall_i,
        "overall_vendor_avg": overall_v,
        "categories": categories,
        "comments": comments,
        "key_recommendations": all_recs,
    }
