"""
Weighted scorecard structure (production format).

Themes carry a per-theme weight and a list of measures. Scoring: reviewers
(teams) rate each *numeric* measure 1-5. A measure's score is the average of
provided team scores; a theme's score is the average of its numeric measure
scores; the overall score is the weighted average of theme scores. A team may
skip a measure or an entire theme when it is not applicable — such cells are
excluded from the averages.

Measure types
-------------
- ``numeric`` — rated 1-5 and included in all averages (the default).
- ``rag``     — a colour-coded Red / Amber / Green status with **no influence
                on the calculations** (e.g. Decarbonisation, Financial Strength).
                Collected and displayed, but never averaged.

Per-SPR configuration
---------------------
``SCORECARD_CATALOG`` is the full menu of themes/measures a VMO can choose from.
Before dispatch, the VMO selects which measures to include for a given cycle and
sets the per-theme weights — stored on the cycle as ``scorecard_config``.
``WEIGHTED_SCORECARD_STRUCTURE`` is the *default* configuration used when a cycle
has not been explicitly configured (keeps older cycles working unchanged).
"""
from __future__ import annotations

# ── Full catalog of themes & measures a VMO can choose from ───────────────────
# ``default_weight`` is only a suggested starting weight for the config UI; the
# VMO adjusts weights so the included themes sum to 100.
SCORECARD_CATALOG: list[dict] = [
    {
        "key": "RISK_COMPLIANCE",
        "label": "Risk & Compliance",
        "default_weight": 20,
        "measures": [
            {
                "key": "PATCH_MANAGEMENT",
                "label": "Patch Management",
                "description": "Vendor support towards implementing latest Releases, Anti-virus upgrades and Patch Management",
                "measure_type": "numeric",
            },
            {
                "key": "IRM_ASSURANCE_RISK",
                "label": "IRM Assurance & Risk Management",
                "description": "Information Risk Management assurance — effective identification, control and reporting of information and cyber risks",
                "measure_type": "numeric",
            },
        ],
    },
    {
        "key": "HSSE",
        "label": "HSSE",
        "default_weight": 10,
        "measures": [
            {
                "key": "GOAL_ZERO",
                "label": "Goal Zero",
                "description": "Commitment to HSSE 'Goal Zero' — no harm to people and no significant incidents; a strong safety culture",
                "measure_type": "numeric",
            },
            {
                "key": "DECARBONISATION",
                "label": "Decarbonisation",
                "description": "Progress toward decarbonisation and sustainability commitments (colour-coded RAG; no influence on the score)",
                "measure_type": "rag",
            },
        ],
    },
    {
        "key": "PERFORMANCE",
        "label": "Performance",
        "default_weight": 30,
        "measures": [
            {
                "key": "RESOURCES_CAPABILITY",
                "label": "Resources & Capability",
                "description": "Vendor proactive capability to leverage their resources to meet the organizational goals and anticipating the future requirements of an organization",
                "measure_type": "numeric",
            },
            {
                "key": "RELEASE_DELIVERY",
                "label": "Release & Delivery",
                "description": "On-time, quality project delivery, resources and capability",
                "measure_type": "numeric",
            },
            {
                "key": "OPERATIONS",
                "label": "Operations",
                "description": "Meets or exceeds contracted service levels with strong focus on user experience",
                "measure_type": "numeric",
            },
        ],
    },
    {
        "key": "COMMERCIAL",
        "label": "Commercial",
        "default_weight": 20,
        "measures": [
            {
                "key": "FINANCIAL_STRENGTH",
                "label": "Financial Strength",
                "description": "Vendor's financial stability and viability (colour-coded RAG; no influence on the score)",
                "measure_type": "rag",
            },
            {
                "key": "PRICING",
                "label": "Pricing",
                "description": "Cost is competitive and well-managed",
                "measure_type": "numeric",
            },
            {
                "key": "COMMERCIAL_EXCELLENCE",
                "label": "Commercial Excellence",
                "description": "Appropriate commercial contract structure, invoices timely, accurate, and transparent",
                "measure_type": "numeric",
            },
            {
                "key": "COST_CONTROL",
                "label": "Cost Control",
                "description": "Changes and increases are managed well and minimized; cost-saving ideas shared",
                "measure_type": "numeric",
            },
        ],
    },
    {
        "key": "RELATIONSHIP",
        "label": "Relationship",
        "default_weight": 20,
        "measures": [
            {
                "key": "FLEXIBILITY",
                "label": "Flexibility",
                "description": "Vendor team demonstrates flexibility & Proactive responsiveness when required",
                "measure_type": "numeric",
            },
            {
                "key": "STAKEHOLDER_ENGAGEMENT",
                "label": "Stakeholder Engagement",
                "description": "Vendor's ability to understand, communicate and respond to Shell's stakeholders in a professional, clear and timely manner",
                "measure_type": "numeric",
            },
            {
                "key": "ALIGNMENT",
                "label": "Alignment",
                "description": "Vendor understands the business needs and partners with Shell to meet the short- & long-term milestone roadmap timelines and ownership (includes innovation & sustainability)",
                "measure_type": "numeric",
            },
        ],
    },
]

# Flat lookup: measure_key -> catalog measure enriched with theme context.
CATALOG_MEASURES: dict[str, dict] = {
    m["key"]: {
        "label": m["label"],
        "description": m["description"],
        "measure_type": m["measure_type"],
        "category_key": theme["key"],
        "category_label": theme["label"],
        "default_weight": theme["default_weight"],
    }
    for theme in SCORECARD_CATALOG
    for m in theme["measures"]
}


# ── Default configuration (used when a cycle isn't explicitly configured) ─────
# The original production default: Risk & Compliance (Patch Management),
# Performance, Commercial, Relationship — weighted 20 / 30 / 20 / 30.
_DEFAULT_SELECTION: list[tuple[str, int]] = [
    ("RISK_COMPLIANCE", 20),
    ("PERFORMANCE", 30),
    ("COMMERCIAL", 20),
    ("RELATIONSHIP", 30),
]
# Measures included in the default config (the original 10-measure set — the
# newer catalog additions such as IRM/HSSE/Financial Strength are opt-in).
_DEFAULT_MEASURE_KEYS: set[str] = {
    "PATCH_MANAGEMENT",
    "RESOURCES_CAPABILITY", "RELEASE_DELIVERY", "OPERATIONS",
    "PRICING", "COMMERCIAL_EXCELLENCE", "COST_CONTROL",
    "FLEXIBILITY", "STAKEHOLDER_ENGAGEMENT", "ALIGNMENT",
}


def _theme_measures(theme_key: str, keys: set[str]) -> list[dict]:
    theme = next((t for t in SCORECARD_CATALOG if t["key"] == theme_key), None)
    if theme is None:
        return []
    return [
        {
            "key": m["key"],
            "label": m["label"],
            "description": m["description"],
            "measure_type": m["measure_type"],
        }
        for m in theme["measures"]
        if m["key"] in keys
    ]


def default_scorecard_config() -> dict:
    """The default per-cycle scorecard configuration (configured=False)."""
    weight_by_theme = dict(_DEFAULT_SELECTION)
    categories = []
    for theme in SCORECARD_CATALOG:
        if theme["key"] not in weight_by_theme:
            continue
        measures = _theme_measures(theme["key"], _DEFAULT_MEASURE_KEYS)
        if not measures:
            continue
        categories.append({
            "key": theme["key"],
            "label": theme["label"],
            "weight": weight_by_theme[theme["key"]],
            "measures": measures,
        })
    return {"categories": categories, "configured": False}


def build_config_from_selection(selected_measure_keys: list[str], weights: dict[str, int]) -> dict:
    """Resolve a VMO selection (measure keys + per-theme weights) against the
    catalog into an authoritative config. Labels/descriptions/types always come
    from the catalog — never trusted from the client."""
    selected = set(selected_measure_keys)
    categories = []
    for theme in SCORECARD_CATALOG:
        measures = _theme_measures(theme["key"], selected)
        if not measures:
            continue
        raw = weights.get(theme["key"], theme["default_weight"])
        try:
            weight = int(round(float(raw)))
        except (TypeError, ValueError):
            weight = theme["default_weight"]
        categories.append({
            "key": theme["key"],
            "label": theme["label"],
            "weight": weight,
            "measures": measures,
        })
    return {"categories": categories, "configured": True}


# Backwards-compatible export: the DEFAULT weighted structure (themes/measures/
# weights). Existing imports of WEIGHTED_SCORECARD_STRUCTURE keep working.
WEIGHTED_SCORECARD_STRUCTURE: list[dict] = default_scorecard_config()["categories"]

# Flat lookup for the default structure: measure_key -> {label, description, ...}
ALL_MEASURES: dict[str, dict] = {
    m["key"]: {
        "label": m["label"],
        "description": m["description"],
        "measure_type": m.get("measure_type", "numeric"),
        "category_key": cat["key"],
        "category_label": cat["label"],
        "weight": cat["weight"],
    }
    for cat in WEIGHTED_SCORECARD_STRUCTURE
    for m in cat["measures"]
}
