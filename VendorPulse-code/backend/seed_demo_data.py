"""
Seed realistic multi-cycle demo data so Analytics + the cross-cycle AI features have
real material to work with.

Creates 3 vendors, each with 4 cycles across 2025 (Q1→Q4), where the first three are
ARCHIVED and the latest sits at SCORECARD_COMPILED (so the Alignment/Vendor-Prep tabs
are reachable and can compare against the previous cycle). Every cycle carries real
scorecard submissions from a fixed set of internal stakeholders, with scores that
follow an intentional trajectory (improving / declining / stable) and written comments
(some recurring) so trend lines, trajectory insights, vendor briefs and comment
summaries all populate.

Attendees are drawn ONLY from: Kanishk, Anup, Aditya, Abhishek, Richa.

Idempotent: re-running removes the previously-seeded demo vendors/cycles first.
Run:  python seed_demo_data.py   (from the backend dir, with PYTHONPATH=.)
"""
from __future__ import annotations

import random
import uuid

from app.dependencies import get_cycle_repo, get_attendee_repo, get_vendor_repo
from app.api.routes.scorecard_v2 import _submissions_repo
from app.utils.scorecard_structure import default_scorecard_config

random.seed(42)

crepo, arepo, vrepo = get_cycle_repo(), get_attendee_repo(), get_vendor_repo()
srepo = _submissions_repo()

# Fixed roster — the only people allowed on these cycles.
PEOPLE = {
    "Kanishk":  {"email": "kanishk@shell.com",  "dept": "SOM",  "role": "INTERNAL_LEAD"},
    "Anup":     {"email": "anup@shell.com",     "dept": "CP",   "role": "COMMERCIAL_LEAD"},
    "Aditya":   {"email": "aditya@shell.com",   "dept": "IDE",  "role": "TECHNICAL_LEAD"},
    "Abhishek": {"email": "abhishek@shell.com", "dept": "IRM",  "role": "INTERNAL_LEAD"},
    "Richa":    {"email": "richa@shell.com",    "dept": "IDTM", "role": "VMO_COORDINATOR"},
}

QUARTER_MONTH = {"Q1": "01", "Q2": "04", "Q3": "07", "Q4": "10"}

CFG = default_scorecard_config()
NUMERIC = [(cat["label"], m["key"]) for cat in CFG["categories"] for m in cat["measures"] if m.get("measure_type") != "rag"]
RAG = [(cat["label"], m["key"]) for cat in CFG["categories"] for m in cat["measures"] if m.get("measure_type") == "rag"]

LOW_C = [
    "{t}: agreed SLA missed again this quarter.",
    "{t}: repeated delays — an improvement plan is overdue.",
    "{t}: concerns raised last review still not addressed.",
    "{t}: below target, likely to need escalation.",
]
OK_C = [
    "{t}: broadly on track, a few gaps to close.",
    "{t}: acceptable this cycle, room to improve.",
    "{t}: steady, no major issues.",
]
HIGH_C = [
    "{t}: strong delivery, exceeded expectations.",
    "{t}: excellent responsiveness and quality.",
    "{t}: consistently high performer.",
]


def comment_for(theme: str, score: int) -> str:
    pool = LOW_C if score <= 2 else HIGH_C if score >= 4 else OK_C
    return random.choice(pool).format(t=theme)


def clamp(n: int) -> int:
    return max(1, min(5, n))


# vendor -> (category, list of (quarter, year) cycles, one target overall per cycle,
# per-theme bias by category index). len(targets) MUST equal len(quarters); bias is
# per-category (4 entries) and independent of the number of cycles.
VENDORS = [
    {
        "name": "TechnoServe", "category": "IT Infrastructure",
        "people": ["Kanishk", "Anup", "Aditya", "Abhishek"],
        "quarters": [("Q1", 2025), ("Q2", 2025), ("Q3", 2025)],
        "targets": [2.8, 3.4, 4.1],       # improving
        "bias": [-0.4, 0.1, 0.0, 0.3],    # Risk&Compliance weak (recurring), Relationship strong
        "desc": "Core infrastructure & managed services. Focus: closing risk & compliance gaps.",
    },
    {
        "name": "DataBridge", "category": "IT Infrastructure",
        "people": ["Kanishk", "Aditya", "Richa"],
        "quarters": [("Q2", 2025), ("Q3", 2025), ("Q4", 2025)],
        "targets": [3.9, 3.3, 2.7],       # declining
        "bias": [0.2, -0.5, 0.1, -0.2],   # Performance slipping
        "desc": "Data platform & integration vendor. Watch: delivery performance decline.",
    },
    {
        "name": "CloudCore", "category": "Managed Services",
        "people": ["Anup", "Abhishek", "Richa", "Aditya"],
        "quarters": [("Q3", 2025), ("Q4", 2025)],
        "targets": [3.35, 3.45],          # stable
        "bias": [0.0, 0.1, -0.3, 0.1],    # Commercial slightly weak
        "desc": "Cloud operations partner. Stable performer under commercial pressure.",
    },
    {
        "name": "NexaSoft", "category": "Application Development",
        "people": ["Kanishk", "Anup", "Richa"],
        "quarters": [("Q1", 2025), ("Q2", 2025), ("Q3", 2025)],
        "targets": [3.0, 3.5, 3.9],       # improving
        "bias": [0.1, 0.2, -0.2, 0.0],    # Performance strong, Commercial soft
        "desc": "Custom application delivery partner. Improving after early onboarding gaps.",
    },
    {
        "name": "OrbitLogic", "category": "Managed Services",
        "people": ["Abhishek", "Aditya", "Richa"],
        "quarters": [("Q2", 2025), ("Q3", 2025)],
        "targets": [3.6, 3.1],            # slight decline
        "bias": [-0.2, 0.0, 0.2, -0.1],   # Risk weak, Commercial strong
        "desc": "Logistics & operations managed-services vendor. Monitoring compliance posture.",
    },
]
DEMO_NAMES = {v["name"] for v in VENDORS}


def cleanup() -> None:
    for c in list(crepo.find_all()):
        if c.get("vendor_name") in DEMO_NAMES or str(c.get("cycle_id", "")).startswith("c_demo_"):
            cid = c["cycle_id"]
            arepo.delete_by_field("cycle_id", cid)
            srepo.delete_by_field("cycle_id", cid)
            crepo.delete_by_id("cycle_id", cid)
    for v in list(vrepo.find_all()):
        if v.get("name") in DEMO_NAMES:
            vrepo.delete_by_id("vendor_id", v["vendor_id"])


def seed() -> None:
    cleanup()
    total_cycles = total_subs = 0
    for v in VENDORS:
        vendor_id = f"v_{uuid.uuid4().hex}"
        vrepo.insert({"vendor_id": vendor_id, "name": v["name"], "category": v["category"], "status": "active"})
        quarters = v["quarters"]
        for idx, ((q, year), target) in enumerate(zip(quarters, v["targets"])):
            is_latest = idx == len(quarters) - 1
            state = "SCORECARD_COMPILED" if is_latest else "ARCHIVED"
            created = f"{year}-{QUARTER_MONTH[q]}-01T09:00:00+00:00"
            slug = v["name"].lower()
            cid = f"c_demo_{slug}_{q}{year}"
            crepo.insert({
                "cycle_id": cid, "vendor_id": vendor_id, "vendor_name": v["name"],
                "cycle_type": "SPR", "quarter": q, "year": year,
                "description": v["desc"],
                "workflow_state": state, "created_at": created, "updated_at": created,
                "scorecard_config": CFG,
            })
            total_cycles += 1
            for person in v["people"]:
                p = PEOPLE[person]
                aid = f"att_demo_{cid}_{person}"
                arepo.insert({
                    "attendee_id": aid, "cycle_id": cid, "stakeholder_id": f"s_{person.lower()}",
                    "name": person, "email": p["email"], "gmail": p["email"], "role": p["role"],
                    "organisation": "Shell", "type": "Internal Stakeholder", "is_key": True,
                    "shell_department": p["dept"], "attendance_requirement": "Required",
                    "lt_status": "Non-LT", "invite_status": "ACCEPTED",
                    "availability_submitted": True, "user_id": None, "confirmation_status": "CONFIRMED",
                })
                scores: dict[str, int] = {}
                comments: dict[str, str] = {}
                for i, (theme, mkey) in enumerate(NUMERIC):
                    bias = v["bias"][i % len(v["bias"])]
                    jitter = random.choice([-1, 0, 0, 0, 1])  # occasional cross-team divergence
                    scores[mkey] = clamp(round(target + bias + jitter))
                # Comment on the 2 lowest + 1 highest measures (concern / praise).
                ranked = sorted(NUMERIC, key=lambda tm: scores[tm[1]])
                for theme, mkey in ranked[:2] + ranked[-1:]:
                    comments[mkey] = comment_for(theme, scores[mkey])
                rag_scores: dict[str, str] = {}
                band = "green" if target >= 3.5 else "amber" if target >= 2.8 else "red"
                for _theme, mkey in RAG:
                    rag_scores[mkey] = band
                srepo.insert({
                    "submission_id": f"sub_demo_{cid}_{person}", "cycle_id": cid, "attendee_id": aid,
                    "respondent_email": p["email"], "respondent_name": person, "team": p["dept"],
                    "scores": scores, "rag_scores": rag_scores, "comments": comments,
                    "skipped_measures": [], "skipped_themes": [], "submitted_at": created,
                })
                total_subs += 1
    print(f"Seeded {len(VENDORS)} vendors, {total_cycles} cycles, {total_subs} submissions.")
    print(f"Numeric measures/cycle: {len(NUMERIC)}, RAG measures: {len(RAG)}.")


if __name__ == "__main__":
    seed()
