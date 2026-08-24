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
    "meeting_attendees",
    "meeting_attendee_seeds",
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
    "meeting_attendees": (
        # Per-meeting attendee roster for internal-alignment and vendor-prep meetings,
        # kept SEPARATE from the cycle's master `attendees` table so editing a meeting's
        # roster never mutates the QBR / scorecard attendees. Keyed by
        # (cycle_id, meeting_kind, meeting_index); seeded once from the cycle roster.
        """
        CREATE TABLE IF NOT EXISTS meeting_attendees (
            row_id                 TEXT PRIMARY KEY,
            cycle_id               TEXT NOT NULL REFERENCES cycles(cycle_id) ON DELETE CASCADE,
            meeting_kind           TEXT NOT NULL,
            meeting_index          INTEGER NOT NULL,
            stakeholder_id         TEXT,
            name                   TEXT,
            email                  TEXT,
            role                   TEXT,
            organisation           TEXT,
            type                   TEXT,
            is_key                 BOOLEAN,
            attendance_requirement TEXT,
            lt_status              TEXT,
            shell_department       TEXT,
            user_id                TEXT,
            seq                    BIGSERIAL UNIQUE NOT NULL
        )
        """,
        ["CREATE INDEX IF NOT EXISTS ma_cycle_kind ON meeting_attendees (cycle_id, meeting_kind, meeting_index)"],
    ),
    "meeting_attendee_seeds": (
        # One row per (cycle, meeting_kind, meeting_index) that has been seeded, so a
        # meeting's roster is populated from the cycle exactly ONCE. Without this, a
        # meeting the user emptied would be silently re-seeded on the next load.
        """
        CREATE TABLE IF NOT EXISTS meeting_attendee_seeds (
            seed_id       TEXT PRIMARY KEY,
            cycle_id      TEXT NOT NULL REFERENCES cycles(cycle_id) ON DELETE CASCADE,
            meeting_kind  TEXT NOT NULL,
            meeting_index INTEGER NOT NULL,
            seeded_at     TEXT,
            seq           BIGSERIAL UNIQUE NOT NULL
        )
        """,
        [],
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
        # attendee_id gained referential integrity to attendees — see
        # _ADDITIVE_CONSTRAINTS below (added NOT VALID so it never fails on a
        # live table that may hold legacy rows).
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


# ── Column type upgrades: TEXT → TIMESTAMPTZ / DATE ──────────────────────────
# These columns have always held ISO-8601 strings; typing them properly gives
# real chronological ordering, timezone correctness and efficient range queries.
# The change is SAFE on a live database:
#   • Applied only if the column is still `text` (idempotent — never re-rewrites).
#   • The USING cast goes through `_vp_to_timestamptz` / `_vp_to_date`, which
#     return NULL for any unparseable/blank value instead of raising — so the
#     migration can never fail on legacy data.
#   • The repository read layer converts the returned datetime/date back to the
#     same ISO string the app has always seen (see base_repository), so no
#     model, route, or frontend consumer changes behaviour.
# action_items.due_date is deliberately EXCLUDED — it can hold free-form text
# (e.g. "by 11 April"), so it stays TEXT.
_TIMESTAMP_COLUMNS: list[tuple[str, str]] = [
    ("users", "created_at"),
    ("cycles", "created_at"),
    ("cycles", "updated_at"),
    ("cycles", "teams_meeting_scheduled_at"),
    ("cycles", "scorecard_dispatched_at"),
    ("attendees", "outreach_sent_at"),
    ("meetings", "created_at"),
    ("meeting_participants", "responded_at"),
    ("slot_proposals", "approved_at"),
    ("scorecard_submissions", "submitted_at"),
    ("scorecard_final", "updated_at"),
    ("scorecard_final", "computed_at"),
    ("pushback_items", "created_at"),
    ("pushback_items", "updated_at"),
    ("action_items", "created_at"),
    ("action_items", "updated_at"),
    ("meeting_artifacts", "parsed_at"),
    ("meeting_artifacts", "minutes_generated_at"),
    ("agent_runs", "created_at"),
    ("agent_runs", "approved_at"),
]
_DATE_COLUMNS: list[tuple[str, str]] = [
    ("user_availability", "date"),
]

# Fault-tolerant cast helpers (created transiently during ensure_schema). A bad or
# blank value becomes NULL rather than raising, so a type migration never crashes.
_CAST_HELPERS = """
CREATE OR REPLACE FUNCTION _vp_to_timestamptz(txt text) RETURNS timestamptz AS $$
BEGIN
  IF txt IS NULL OR btrim(txt) = '' THEN RETURN NULL; END IF;
  RETURN txt::timestamptz;
EXCEPTION WHEN others THEN RETURN NULL;
END; $$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION _vp_to_date(txt text) RETURNS date AS $$
BEGIN
  IF txt IS NULL OR btrim(txt) = '' THEN RETURN NULL; END IF;
  RETURN txt::date;
EXCEPTION WHEN others THEN RETURN NULL;
END; $$ LANGUAGE plpgsql IMMUTABLE;
"""


def _type_change_sql(table: str, col: str, target: str, cast_fn: str) -> str:
    """Idempotent, non-failing column retype: only runs while the column is still
    `text`, and casts through the fault-tolerant helper."""
    return f"""
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = '{table}' AND column_name = '{col}' AND data_type = 'text'
      ) THEN
        ALTER TABLE "{table}" ALTER COLUMN "{col}" TYPE {target} USING {cast_fn}("{col}");
      END IF;
    END $$;
    """


# Foreign-key + NOT NULL constraints added to tables that predate them. Each is
# applied with NOT VALID so it NEVER fails on a live table that may hold legacy
# rows: the constraint is enforced on every NEW insert/update, while pre-existing
# rows are left unchecked (they can be validated later with
# `ALTER TABLE ... VALIDATE CONSTRAINT`). Every statement is guarded by a
# pg_constraint existence check, so it is fully idempotent — safe on every startup.
#
#   scorecard_submissions.attendee_id → attendees(attendee_id) ON DELETE CASCADE
#   The submit endpoint already rejects a submission whose attendee is not in the
#   cycle, so new writes always satisfy this; the FK also auto-removes a team's
#   submissions if its attendee row is ever deleted (no orphans).
_ADDITIVE_CONSTRAINTS: list[str] = [
    """
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'scorecard_submissions_attendee_fk'
      ) THEN
        ALTER TABLE scorecard_submissions
          ADD CONSTRAINT scorecard_submissions_attendee_fk
          FOREIGN KEY (attendee_id) REFERENCES attendees (attendee_id)
          ON DELETE CASCADE NOT VALID;
      END IF;
    END $$;
    """,
]

# NOT NULL enforcement on invariants the application always sets, expressed as
# CHECK (... IS NOT NULL) NOT VALID so existing rows are never rejected. Guarded by
# name for idempotency. constraint name: {table}_{col}_nn.
_NOT_NULL_INVARIANTS: list[tuple[str, str]] = [
    ("cycles", "workflow_state"),
    ("scorecard_submissions", "attendee_id"),
    ("scorecard_submissions", "submitted_at"),
]
for _t, _c in _NOT_NULL_INVARIANTS:
    _ADDITIVE_CONSTRAINTS.append(
        f"""
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{_t}_{_c}_nn') THEN
            ALTER TABLE "{_t}" ADD CONSTRAINT "{_t}_{_c}_nn"
              CHECK ("{_c}" IS NOT NULL) NOT VALID;
          END IF;
        END $$;
        """
    )


def ensure_schema(pool: Optional[ConnectionPool] = None) -> None:
    """Create every table + index if absent (parent→child order), additively add
    any missing `_ADDITIVE_COLUMNS`, upgrade timestamp/date column types, then
    apply `_ADDITIVE_CONSTRAINTS`. Fully idempotent and non-destructive — safe on
    a live database (every step tolerates pre-existing data)."""
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

        # TEXT → TIMESTAMPTZ / DATE upgrades (only while still text; fault-tolerant).
        conn.execute(_CAST_HELPERS)
        for table, col in _TIMESTAMP_COLUMNS:
            conn.execute(_type_change_sql(table, col, "timestamptz", "_vp_to_timestamptz"))
        for table, col in _DATE_COLUMNS:
            conn.execute(_type_change_sql(table, col, "date", "_vp_to_date"))
        conn.execute("DROP FUNCTION IF EXISTS _vp_to_timestamptz(text)")
        conn.execute("DROP FUNCTION IF EXISTS _vp_to_date(text)")

        for stmt in _ADDITIVE_CONSTRAINTS:
            conn.execute(stmt)
    logger.info("PostgreSQL schema ensured — %d tables (3NF, typed timestamps)", len(KNOWN_TABLES))
