"""
Normalized (3NF) relational schema.

Every entity is a real table with typed columns, a domain PRIMARY KEY, and
FOREIGN KEY constraints to its parents (ON DELETE CASCADE for owned children,
SET NULL for the audit log). Genuinely nested/variable data is kept in JSONB
columns ("relational core + JSONB"). A `seq BIGSERIAL` column on every table
preserves insertion order for reads.

De-duplication (removes the redundancy the JSON store carried):
  * `persons`  — one row per human (natural key: email). `attendees` is a
                 cycle↔person junction that no longer repeats name/email/etc.
  * `vendors`  — canonical; `cycles` keeps only vendor_id (vendor_name derived).

`meeting_participants.user_id` is intentionally polymorphic (a users.user_id
for generic meetings, an email for alignment/vendor-prep meetings), so it is a
plain indexed TEXT column with no FK — a constraint there would reject valid
rows the application writes.

DDL is ordered parent→child so REFERENCES targets always exist first.
"""
from __future__ import annotations

import logging
from typing import Optional

from psycopg_pool import ConnectionPool

from app.db.pool import get_pool

logger = logging.getLogger(__name__)

# Ordered parent → child. Also the truncate/rebuild order (reversed for drop).
KNOWN_TABLES: list[str] = [
    "vendors",
    "persons",
    "users",
    "user_availability",
    "cycles",
    "attendees",
    "meetings",
    "meeting_participants",
    "slot_proposals",
    "scorecard_submissions",
    "scorecard_final",
    "pushback_items",
    "pushback_responses",
    "action_items",
    "meeting_artifacts",
    "agent_runs",
]

# Each entry: (create-table SQL, [index SQL, ...]). Ordered as KNOWN_TABLES.
_SCHEMA: dict[str, tuple[str, list[str]]] = {
    "vendors": (
        """
        CREATE TABLE IF NOT EXISTS vendors (
            vendor_id TEXT PRIMARY KEY,
            name      TEXT NOT NULL,
            category  TEXT,
            status    TEXT,
            seq       BIGSERIAL UNIQUE NOT NULL
        )
        """,
        ["CREATE UNIQUE INDEX IF NOT EXISTS vendors_name_lower ON vendors (lower(name))"],
    ),
    "persons": (
        """
        CREATE TABLE IF NOT EXISTS persons (
            person_id    TEXT PRIMARY KEY,
            email        TEXT NOT NULL,
            name         TEXT,
            gmail        TEXT,
            organisation TEXT,
            seq          BIGSERIAL UNIQUE NOT NULL
        )
        """,
        ["CREATE UNIQUE INDEX IF NOT EXISTS persons_email_lower ON persons (lower(email))"],
    ),
    "users": (
        """
        CREATE TABLE IF NOT EXISTS users (
            user_id      TEXT PRIMARY KEY,
            name         TEXT,
            email        TEXT,
            role         TEXT,
            organisation TEXT,
            gmail        TEXT,
            avatar       TEXT,
            created_at   TEXT,
            seq          BIGSERIAL UNIQUE NOT NULL
        )
        """,
        ["CREATE INDEX IF NOT EXISTS users_email_lower ON users (lower(email))"],
    ),
    "user_availability": (
        """
        CREATE TABLE IF NOT EXISTS user_availability (
            row_id  TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            date    TEXT NOT NULL,
            slots   JSONB,
            seq     BIGSERIAL UNIQUE NOT NULL,
            UNIQUE (user_id, date)
        )
        """,
        ["CREATE INDEX IF NOT EXISTS ua_user ON user_availability (user_id)"],
    ),
    "cycles": (
        """
        CREATE TABLE IF NOT EXISTS cycles (
            cycle_id                   TEXT PRIMARY KEY,
            vendor_id                  TEXT REFERENCES vendors(vendor_id),
            cycle_type                 TEXT,
            quarter                    TEXT,
            year                       INTEGER,
            description                TEXT,
            workflow_state             TEXT,
            created_at                 TEXT,
            updated_at                 TEXT,
            meeting_plan               JSONB,
            scorecard_config           JSONB,
            teams_meeting_url          TEXT,
            teams_meeting_web_link     TEXT,
            teams_meeting_event_id     TEXT,
            teams_meeting_scheduled_at TEXT,
            scorecard_dispatched_at    TEXT,
            scorecard_dispatched_to    JSONB,
            meeting_time_zone          TEXT,
            meeting_duration_minutes   INTEGER,
            seq                        BIGSERIAL UNIQUE NOT NULL
        )
        """,
        ["CREATE INDEX IF NOT EXISTS cycles_vendor ON cycles (vendor_id)"],
    ),
    "attendees": (
        """
        CREATE TABLE IF NOT EXISTS attendees (
            attendee_id            TEXT PRIMARY KEY,
            cycle_id               TEXT NOT NULL REFERENCES cycles(cycle_id) ON DELETE CASCADE,
            person_id              TEXT REFERENCES persons(person_id),
            stakeholder_id         TEXT,
            role                   TEXT,
            type                   TEXT,
            is_key                 BOOLEAN,
            attendance_requirement TEXT,
            lt_status              TEXT,
            shell_department       TEXT,
            invite_status          TEXT,
            availability_submitted BOOLEAN,
            user_id                TEXT,
            replaced_by            TEXT,
            replaced_by_email      TEXT,
            replacement_note       TEXT,
            confirmation_status    TEXT,
            confirmation_note      TEXT,
            outreach_message_id    TEXT,
            outreach_conversation_id TEXT,
            outreach_sent_at       TEXT,
            seq                    BIGSERIAL UNIQUE NOT NULL
        )
        """,
        [
            "CREATE INDEX IF NOT EXISTS attendees_cycle ON attendees (cycle_id)",
            "CREATE INDEX IF NOT EXISTS attendees_person ON attendees (person_id)",
        ],
    ),
    "meetings": (
        """
        CREATE TABLE IF NOT EXISTS meetings (
            meeting_id   TEXT PRIMARY KEY,
            title        TEXT,
            description  TEXT,
            agenda       TEXT,
            organizer_id TEXT,
            time_slot    JSONB,
            status       TEXT,
            created_at   TEXT,
            cycle_id     TEXT REFERENCES cycles(cycle_id) ON DELETE CASCADE,
            meeting_type TEXT,
            time_zone         TEXT,
            duration_minutes  INTEGER,
            alignment_index   INTEGER,
            teams_meeting_url TEXT,
            web_link          TEXT,
            seq          BIGSERIAL UNIQUE NOT NULL
        )
        """,
        ["CREATE INDEX IF NOT EXISTS meetings_cycle ON meetings (cycle_id)"],
    ),
    "meeting_participants": (
        """
        CREATE TABLE IF NOT EXISTS meeting_participants (
            row_id       TEXT PRIMARY KEY,
            meeting_id   TEXT NOT NULL REFERENCES meetings(meeting_id) ON DELETE CASCADE,
            user_id      TEXT,
            status       TEXT,
            responded_at TEXT,
            seq          BIGSERIAL UNIQUE NOT NULL
        )
        """,
        [
            "CREATE INDEX IF NOT EXISTS mp_meeting ON meeting_participants (meeting_id)",
            "CREATE INDEX IF NOT EXISTS mp_user ON meeting_participants (user_id)",
        ],
    ),
    "slot_proposals": (
        """
        CREATE TABLE IF NOT EXISTS slot_proposals (
            slot_id                TEXT PRIMARY KEY,
            cycle_id               TEXT NOT NULL REFERENCES cycles(cycle_id) ON DELETE CASCADE,
            proposed_time          TEXT,
            proposed_time_zone     TEXT,
            duration_minutes       INTEGER,
            organiser_available    BOOLEAN,
            exec_sponsor_available BOOLEAN,
            rank_score             DOUBLE PRECISION,
            is_approved            BOOLEAN,
            attendance_count       INTEGER,
            total_attendees        INTEGER,
            conflict_count         INTEGER,
            attending              JSONB,
            conflicts              JSONB,
            approved_by            TEXT,
            approved_at            TEXT,
            tentative              JSONB,
            ranking_rationale      TEXT,
            seq                    BIGSERIAL UNIQUE NOT NULL
        )
        """,
        ["CREATE INDEX IF NOT EXISTS slots_cycle ON slot_proposals (cycle_id)"],
    ),
    "scorecard_submissions": (
        # respondent_email / respondent_name / team were denormalized snapshots
        # of the attendee that the app never reads back — dropped here.
        """
        CREATE TABLE IF NOT EXISTS scorecard_submissions (
            submission_id    TEXT PRIMARY KEY,
            cycle_id         TEXT NOT NULL REFERENCES cycles(cycle_id) ON DELETE CASCADE,
            attendee_id      TEXT,
            scores           JSONB,
            rag_scores       JSONB,
            comments         JSONB,
            skipped_measures JSONB,
            skipped_themes   JSONB,
            submitted_at     TEXT,
            seq              BIGSERIAL UNIQUE NOT NULL
        )
        """,
        [
            "CREATE INDEX IF NOT EXISTS subs_cycle ON scorecard_submissions (cycle_id)",
            "CREATE INDEX IF NOT EXISTS subs_attendee ON scorecard_submissions (attendee_id)",
        ],
    ),
    "scorecard_final": (
        """
        CREATE TABLE IF NOT EXISTS scorecard_final (
            cycle_id      TEXT PRIMARY KEY REFERENCES cycles(cycle_id) ON DELETE CASCADE,
            categories    JSONB,
            overall_score DOUBLE PRECISION,
            note          TEXT,
            updated_at    TEXT,
            computed_at   TEXT,
            seq           BIGSERIAL UNIQUE NOT NULL
        )
        """,
        [],
    ),
    "pushback_items": (
        """
        CREATE TABLE IF NOT EXISTS pushback_items (
            pushback_id        TEXT PRIMARY KEY,
            cycle_id           TEXT NOT NULL REFERENCES cycles(cycle_id) ON DELETE CASCADE,
            category           TEXT,
            description        TEXT,
            raised_by          TEXT,
            needs_legal_review BOOLEAN,
            status             TEXT,
            created_at         TEXT,
            updated_at         TEXT,
            seq                BIGSERIAL UNIQUE NOT NULL
        )
        """,
        ["CREATE INDEX IF NOT EXISTS pb_cycle ON pushback_items (cycle_id)"],
    ),
    "pushback_responses": (
        """
        CREATE TABLE IF NOT EXISTS pushback_responses (
            response_id TEXT PRIMARY KEY,
            pushback_id TEXT NOT NULL REFERENCES pushback_items(pushback_id) ON DELETE CASCADE,
            stance      TEXT,
            content     TEXT,
            is_selected BOOLEAN,
            seq         BIGSERIAL UNIQUE NOT NULL
        )
        """,
        ["CREATE INDEX IF NOT EXISTS pr_pushback ON pushback_responses (pushback_id)"],
    ),
    "action_items": (
        """
        CREATE TABLE IF NOT EXISTS action_items (
            action_id   TEXT PRIMARY KEY,
            cycle_id    TEXT NOT NULL REFERENCES cycles(cycle_id) ON DELETE CASCADE,
            description TEXT,
            owner       TEXT,
            due_date    TEXT,
            source      TEXT,
            status      TEXT,
            origin      TEXT,
            details     TEXT,
            created_at  TEXT,
            updated_at  TEXT,
            seq         BIGSERIAL UNIQUE NOT NULL
        )
        """,
        ["CREATE INDEX IF NOT EXISTS ai_cycle ON action_items (cycle_id)"],
    ),
    "meeting_artifacts": (
        """
        CREATE TABLE IF NOT EXISTS meeting_artifacts (
            artifact_id          TEXT PRIMARY KEY,
            cycle_id             TEXT NOT NULL REFERENCES cycles(cycle_id) ON DELETE CASCADE,
            meeting_id           TEXT,
            notes                JSONB,
            minutes              JSONB,
            parsed_at            TEXT,
            minutes_generated_at TEXT,
            seq                  BIGSERIAL UNIQUE NOT NULL,
            UNIQUE (cycle_id, meeting_id)
        )
        """,
        [],
    ),
    "agent_runs": (
        """
        CREATE TABLE IF NOT EXISTS agent_runs (
            run_id         TEXT PRIMARY KEY,
            agent_name     TEXT,
            cycle_id       TEXT REFERENCES cycles(cycle_id) ON DELETE SET NULL,
            input_payload  JSONB,
            output_payload JSONB,
            status          TEXT,
            triggered_by    TEXT,
            error_message   TEXT,
            created_at      TEXT,
            approval_status TEXT,
            approved_by     TEXT,
            approved_at     TEXT,
            seq             BIGSERIAL UNIQUE NOT NULL
        )
        """,
        [
            "CREATE INDEX IF NOT EXISTS ar_cycle ON agent_runs (cycle_id)",
            "CREATE INDEX IF NOT EXISTS ar_agent ON agent_runs (agent_name)",
            "CREATE INDEX IF NOT EXISTS ar_status ON agent_runs (status)",
        ],
    ),
}


# Columns added after a table's original CREATE. `ensure_schema` runs
# `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for each on every startup, so a
# live database (with real data) picks up new columns without a destructive
# re-migration. Adding a column here is the safe way to evolve the schema.
_ADDITIVE_COLUMNS: dict[str, list[tuple[str, str]]] = {
    "attendees": [
        ("replaced_by_email", "TEXT"),
        ("confirmation_status", "TEXT"),
        ("confirmation_note", "TEXT"),
        ("outreach_message_id", "TEXT"),
        ("outreach_conversation_id", "TEXT"),
        ("outreach_sent_at", "TEXT"),
    ],
    "cycles": [
        ("meeting_time_zone", "TEXT"),
        ("meeting_duration_minutes", "INTEGER"),
    ],
    "meetings": [
        ("time_zone", "TEXT"),
        ("duration_minutes", "INTEGER"),
        ("alignment_index", "INTEGER"),
        ("teams_meeting_url", "TEXT"),
        ("web_link", "TEXT"),
    ],
    "slot_proposals": [
        ("tentative", "JSONB"),
        ("ranking_rationale", "TEXT"),
    ],
    "scorecard_submissions": [
        ("rag_scores", "JSONB"),
    ],
    "scorecard_final": [
        ("computed_at", "TEXT"),
    ],
    "action_items": [
        ("details", "TEXT"),
    ],
    "agent_runs": [
        ("approval_status", "TEXT"),
        ("approved_by", "TEXT"),
        ("approved_at", "TEXT"),
    ],
}


def ensure_schema(pool: Optional[ConnectionPool] = None) -> None:
    """Create every table + index if absent (parent→child order), then additively
    add any columns in `_ADDITIVE_COLUMNS` that a pre-existing table is missing.
    Fully idempotent and non-destructive — safe on a live database."""
    pool = pool or get_pool()
    with pool.connection() as conn:
        for table in KNOWN_TABLES:
            create_sql, indexes = _SCHEMA[table]
            conn.execute(create_sql)
            for idx in indexes:
                conn.execute(idx)
        for table, cols in _ADDITIVE_COLUMNS.items():
            for col, col_type in cols:
                conn.execute(f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS "{col}" {col_type}')
    logger.info("PostgreSQL schema ensured — %d tables (3NF)", len(KNOWN_TABLES))
