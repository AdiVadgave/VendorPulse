"""
Weighted scorecard structure (production format).

Four weighted themes with measures, descriptions and per-theme weights.
Scoring: reviewers (teams) rate each measure 1-5. A measure's score is the
average of provided team scores; a theme's score is the average of its measure
scores; the overall score is the weighted average of theme scores.

A team may skip a measure or an entire theme when it is not applicable — such
cells are excluded from the averages.
"""
from __future__ import annotations

WEIGHTED_SCORECARD_STRUCTURE: list[dict] = [
    {
        "key": "RISK_COMPLIANCE",
        "label": "Risk & Compliance",
        "weight": 20,
        "measures": [
            {
                "key": "PATCH_MANAGEMENT",
                "label": "Patch Management",
                "description": "Vendor support towards implementing latest Releases, Anti-virus upgrades and Patch Management",
            },
        ],
    },
    {
        "key": "PERFORMANCE",
        "label": "Performance",
        "weight": 30,
        "measures": [
            {
                "key": "RESOURCES_CAPABILITY",
                "label": "Resources & Capability",
                "description": "Vendor proactive capability to leverage their resources to meet the organizational goals and anticipating the future requirements of an organization",
            },
            {
                "key": "RELEASE_DELIVERY",
                "label": "Release & Delivery",
                "description": "On-time, quality project delivery, resources and capability",
            },
            {
                "key": "OPERATIONS",
                "label": "Operations",
                "description": "Meets or exceeds contracted service levels with strong focus on user experience",
            },
        ],
    },
    {
        "key": "COMMERCIAL",
        "label": "Commercial",
        "weight": 20,
        "measures": [
            {
                "key": "PRICING",
                "label": "Pricing",
                "description": "Cost is competitive and well-managed",
            },
            {
                "key": "COMMERCIAL_EXCELLENCE",
                "label": "Commercial Excellence",
                "description": "Appropriate commercial contract structure, invoices timely, accurate, and transparent",
            },
            {
                "key": "COST_CONTROL",
                "label": "Cost Control",
                "description": "Changes and increases are managed well and minimized; cost-saving ideas shared",
            },
        ],
    },
    {
        "key": "RELATIONSHIP",
        "label": "Relationship",
        "weight": 30,
        "measures": [
            {
                "key": "FLEXIBILITY",
                "label": "Flexibility",
                "description": "Vendor team demonstrates flexibility & Proactive responsiveness when required",
            },
            {
                "key": "STAKEHOLDER_ENGAGEMENT",
                "label": "Stakeholder Engagement",
                "description": "Vendor's ability to understand, communicate and respond to Shell's stakeholders in a professional, clear and timely manner",
            },
            {
                "key": "ALIGNMENT",
                "label": "Alignment",
                "description": "Vendor understands the business needs and partners with Shell to meet the short- & long-term milestone roadmap timelines and ownership (includes innovation & sustainability)",
            },
        ],
    },
]

# Flat lookup: measure_key -> {label, description, category_key, category_label, weight}
ALL_MEASURES: dict[str, dict] = {
    m["key"]: {
        "label": m["label"],
        "description": m["description"],
        "category_key": cat["key"],
        "category_label": cat["label"],
        "weight": cat["weight"],
    }
    for cat in WEIGHTED_SCORECARD_STRUCTURE
    for m in cat["measures"]
}
