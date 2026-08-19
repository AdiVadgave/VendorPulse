"""
One-time ETL: load the historical JSON files into the normalized (3NF) Postgres
schema.

What it does:
  * Ensures the schema (tables, PK/FK, indexes).
  * TRUNCATEs every table (idempotent — safe to re-run).
  * Deletes orphaned child rows whose parent no longer exists (rows pointing at
    cycles/meetings/pushbacks that were removed), so the FK constraints hold.
  * Loads in parent→child order through the real repositories, so person/vendor
    de-duplication happens exactly as it will at runtime (attendee identity is
    collapsed into `persons`; cycle.vendor_name is dropped).

Usage (from backend/, with DATABASE_URL / PG_* set in .env):
    python scripts/migrate_json_to_postgres.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.db.pool import get_pool  # noqa: E402
from app.db.schema import KNOWN_TABLES, ensure_schema  # noqa: E402
from app.repositories.action_repository import ActionRepository  # noqa: E402
from app.repositories.agent_run_repository import AgentRunRepository  # noqa: E402
from app.repositories.attendee_repository import AttendeeRepository  # noqa: E402
from app.repositories.cycle_repository import CycleRepository  # noqa: E402
from app.repositories.meeting_artifact_repository import MeetingArtifactRepository  # noqa: E402
from app.repositories.meeting_repository import (  # noqa: E402
    MeetingParticipantRepository,
    MeetingRepository,
)
from app.repositories.person_repository import PersonRepository  # noqa: E402
from app.repositories.pushback_repository import (  # noqa: E402
    PushbackRepository,
    PushbackResponseRepository,
)
from app.repositories.scorecard_repository import (  # noqa: E402
    FinalScorecardRepository,
    ScorecardSubmissionRepository,
)
from app.repositories.slot_repository import SlotRepository  # noqa: E402
from app.repositories.user_availability_repository import UserAvailabilityRepository  # noqa: E402
from app.repositories.user_repository import UserRepository  # noqa: E402
from app.repositories.vendor_repository import VendorRepository  # noqa: E402


def _load(name: str) -> list[dict]:
    path = settings.data_dir / f"{name}.json"
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else []


def _drop_all() -> None:
    """Drop every known table (CASCADE) so the schema is rebuilt from scratch.

    This also cleanly replaces any earlier-shaped tables (e.g. the interim JSONB
    document tables) that share these names. The JSON files are the source of
    truth, so no data is lost — the load below repopulates everything.
    """
    with get_pool().connection() as conn:
        for table in reversed(KNOWN_TABLES):
            conn.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE')


def main() -> int:
    if not settings.effective_database_url:
        print("ERROR: no DATABASE_URL / PG_* configured in .env", file=sys.stderr)
        return 1

    pool = get_pool()
    try:
        pool.wait(timeout=15)
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: could not connect to Postgres: {exc}", file=sys.stderr)
        print(
            "Hint: if the target database does not exist yet, run\n"
            "    python scripts/create_database.py\n"
            "first, and check the Azure firewall allows this machine's IP.",
            file=sys.stderr,
        )
        return 1

    _drop_all()
    ensure_schema(pool)

    # Repositories (constructed directly; person/vendor decomposition runs here).
    vendor_repo = VendorRepository()
    person_repo = PersonRepository()
    user_repo = UserRepository()
    ua_repo = UserAvailabilityRepository()
    cycle_repo = CycleRepository(vendor_repo=vendor_repo)
    attendee_repo = AttendeeRepository(person_repo=person_repo)
    meeting_repo = MeetingRepository()
    participant_repo = MeetingParticipantRepository()
    slot_repo = SlotRepository()
    sub_repo = ScorecardSubmissionRepository()
    final_repo = FinalScorecardRepository()
    pushback_repo = PushbackRepository()
    response_repo = PushbackResponseRepository()
    action_repo = ActionRepository()
    artifact_repo = MeetingArtifactRepository()
    agent_run_repo = AgentRunRepository()

    # Load sources + compute valid parent id sets for orphan cleanup.
    cycles = _load("cycles")
    valid_cycles = {c["cycle_id"] for c in cycles}
    meetings_src = [
        m for m in _load("meetings")
        if m.get("cycle_id") is None or m.get("cycle_id") in valid_cycles
    ]
    kept_meeting_ids = {m["meeting_id"] for m in meetings_src}
    pushback_src = [p for p in _load("pushback_items") if p.get("cycle_id") in valid_cycles]
    kept_pushback_ids = {p["pushback_id"] for p in pushback_src}

    report: list[tuple[str, int, int]] = []  # (table, loaded, skipped)

    def load(name: str, repo, records: list[dict], insert=None) -> None:
        do_insert = insert or repo.insert
        loaded = 0
        for rec in records:
            do_insert(rec)
            loaded += 1
        report.append((name, loaded, len(_load(name)) - loaded if name not in ("persons",) else 0))

    # Parent → child order.
    load("vendors", vendor_repo, _load("vendors"))
    load("users", user_repo, _load("users"))
    load("user_availability", ua_repo, _load("user_availability"))
    load("cycles", cycle_repo, cycles)
    load("attendees", attendee_repo, _load("attendees"))
    load("meetings", meeting_repo, meetings_src)
    load(
        "meeting_participants",
        participant_repo,
        [p for p in _load("meeting_participants") if p.get("meeting_id") in kept_meeting_ids],
    )
    load(
        "slot_proposals",
        slot_repo,
        [s for s in _load("slot_proposals") if s.get("cycle_id") in valid_cycles],
    )
    load(
        "scorecard_submissions",
        sub_repo,
        [s for s in _load("scorecard_submissions") if s.get("cycle_id") in valid_cycles],
    )
    load(
        "scorecard_final",
        final_repo,
        [s for s in _load("scorecard_final") if s.get("cycle_id") in valid_cycles],
    )
    load("pushback_items", pushback_repo, pushback_src)
    load(
        "pushback_responses",
        response_repo,
        [r for r in _load("pushback_responses") if r.get("pushback_id") in kept_pushback_ids],
    )
    load(
        "action_items",
        action_repo,
        [a for a in _load("action_items") if a.get("cycle_id") in valid_cycles],
    )
    load(
        "meeting_artifacts",
        artifact_repo,
        [a for a in _load("meeting_artifacts") if a.get("cycle_id") in valid_cycles],
    )
    load(
        "agent_runs",
        agent_run_repo,
        [r for r in _load("agent_runs") if r.get("cycle_id") in valid_cycles],
    )

    print(f"Migrating JSON from {settings.data_dir} -> Postgres (3NF)\n")
    total = 0
    for name, loaded, skipped in report:
        note = f"  (skipped {skipped} orphan/other)" if skipped else ""
        print(f"  OK {name}: {loaded} rows{note}")
        total += loaded
    print(f"  OK persons: {person_repo.count()} rows (de-duplicated from attendees)")
    print(f"\nDone — {total} entity rows + {person_repo.count()} persons loaded.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
