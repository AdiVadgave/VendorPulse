# PostgreSQL Migration

VendorPulse persists every entity in **PostgreSQL** using a **normalized (3NF)
relational schema** — real typed columns, domain primary keys, and foreign-key
constraints. This replaced the JSON-file store with no changes to services,
routes, models, or agents: the entire migration lives behind
`app/repositories/base_repository.py`, the single data-access seam.

## Data model

Each entity is its own table with typed columns (`TEXT`/`BOOLEAN`/`INTEGER`/
`DOUBLE PRECISION`), a domain `PRIMARY KEY`, and `FOREIGN KEY` constraints to its
parents (`ON DELETE CASCADE` for owned children). Genuinely nested / variable
data (meeting `time_slot`, scorecard `scores`, agent `input_payload`/
`output_payload`, cycle `meeting_plan`) is kept in `JSONB` columns — the standard
"relational core + JSONB" pattern. Every table also has a `seq BIGSERIAL` column
used only to preserve insertion order on reads. Full DDL: `app/db/schema.py`.

16 tables (parent→child): `vendors`, `persons`, `users`, `user_availability`,
`cycles`, `attendees`, `meetings`, `meeting_participants`, `slot_proposals`,
`scorecard_submissions`, `scorecard_final`, `pushback_items`,
`pushback_responses`, `action_items`, `meeting_artifacts`, `agent_runs`.

### De-duplication (3NF)

* **`persons`** — one row per human (natural key: `email`). `attendees` became a
  cycle↔person junction that references `person_id`; the person's
  name/email/gmail/organisation are stored once instead of repeating ~5.5× across
  cycles. The `AttendeeRepository` decomposes the incoming attendee dict on write
  (upserting the person) and reconstructs those fields via join on read, so
  callers see the same shape.
* **`vendors`** — canonical. `cycles` stores only `vendor_id`; `vendor_name` is
  **not** stored and is reconstructed by `CycleRepository` on read.
* **`scorecard_submissions`** dropped the denormalized `respondent_email` /
  `respondent_name` / `team` snapshots (the app re-derives them from the live
  attendee).

### Notes on constraints

* `meeting_participants.user_id` is intentionally **polymorphic** (a
  `users.user_id` for generic meetings, an email for alignment/vendor-prep
  meetings) — it is an indexed `TEXT` column with **no FK**.
* `agent_runs.cycle_id` uses `ON DELETE SET NULL` so the audit log survives a
  cycle deletion; every other child uses `ON DELETE CASCADE`.
* `google_token.json` (OAuth) and the Google Forms response cache are
  integration/infra files, not entity stores — left as files, **not** migrated.

## Configuration

Set a connection in the backend `.env` (see `.env.example`). Either a full DSN:

```
DATABASE_URL=postgresql://<user>:<password>@<host>.postgres.database.azure.com:5432/vendorpulse?sslmode=require
```

…or the individual `PG_*` parts (`PG_HOST`, `PG_USER`, `PG_PASSWORD`, …). The
app **fails fast on startup** if the database is unreachable.

## Steps to migrate (Azure Database for PostgreSQL)

1. Install dependencies: `pip install -r requirements.txt` (adds
   `psycopg[binary]` + `psycopg-pool`).
2. Set the connection in `.env` (`PG_HOST`, `PG_USER`, `PG_PASSWORD`, …). The
   `.env` file is git-ignored — never commit the password.
3. Allow your client in the Azure firewall: **Networking → Firewall rules → Add
   current client IP** (or the app host's IP). The server enforces SSL, which
   the app already sends (`PG_SSLMODE=require`).
4. Create the database (connects via the server's `postgres` maintenance DB;
   idempotent):
   ```
   python scripts/create_database.py
   ```
5. Seed Postgres from the historical JSON files. The script **drops & recreates**
   all tables then loads them (idempotent — safe to re-run; also cleanly replaces
   any earlier-shaped tables). It deletes orphaned child rows whose parent cycle
   no longer exists so the FK constraints hold, and de-duplicates people into
   `persons`:
   ```
   python scripts/migrate_json_to_postgres.py
   ```
6. Start the app (`python run.py`). Schema is also ensured on startup, so a
   fresh empty database works even without step 5.

`GET /api/health` reports `"database": "connected" | "unavailable"`.

## Notes

- Connections run in **autocommit** mode via a shared `psycopg_pool`
  connection pool, so each CRUD call is an immediate write-through (matching the
  old JSON write-on-every-mutation behaviour).
- `update_by_id` uses JSONB `||` (top-level merge — identical semantics to the
  previous `dict.update`); `replace_by_id` overwrites the whole document.
- Local testing was done against an ephemeral server via the `pgserver` package
  (dev-only, not a runtime dependency).
