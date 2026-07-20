# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (FastAPI — Python 3.11+)
```bash
cd VendorPulse-code/backend
python run.py               # Dev server with auto-reload on :8000
python run.py --no-reload   # Without reload

```
Swagger UI: `http://localhost:8000/docs`

### Frontend (React + Vite)
```bash
cd VendorPulse-code/frontend
npm run dev     # Dev server on :5173
npm run build   # Production build
npm run lint    # ESLint check
```

### Tests
No automated test suite. Ad-hoc integration scripts live at `VendorPulse-code/backend/`:
- `test_cycles.py` — cycle workflow
- `test_graph_api.py` / `test_graph_raw.py` — Graph API integration
- `tmp_run_samsung_flow.py` — end-to-end flow

Run them directly: `python test_cycles.py`

### Environment Variables
**Backend** (`.env` in `VendorPulse-code/backend/`):
```
DATABASE_URL=postgresql://user:pass@host:5432/vendorpulse?sslmode=require  # or PG_HOST/PG_USER/... parts
ENABLE_LLM=true
AI_PROVIDER=azure                          # "azure" or "openai"
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://...openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=...
AZURE_OPENAI_API_VERSION=2024-12-01-preview
GRAPH_ACCESS_TOKEN=...                     # Microsoft Graph bearer token
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_FORM_ID=...
```
**Frontend** (`.env.local` in `VendorPulse-code/frontend/`):
```
VITE_API_URL=http://localhost:8000
```

---

## Architecture

VendorPulse is a **vendor governance cycle automation platform** for orchestrating Quarterly Business Reviews (QBRs). It enforces a 12-state workflow machine across 6 modules (A–F), with Claude AI used only for text generation while all business-critical logic remains deterministic.

### Workflow States (linear, forward-only)
```
CYCLE_CREATED → ATTENDEE_REFRESH_SENT → AVAILABILITY_COLLECTED → MEETING_SCHEDULED
→ SCORECARD_REQUEST_SENT → SCORECARD_COLLECTION → SCORECARD_COMPILED
→ INTERNAL_ALIGNMENT → VENDOR_PREP → MEETING_IN_PROGRESS → POST_MEETING_COMPLETE → ARCHIVED
```
State transitions are enforced in `backend/app/core/workflow_engine.py`. Invalid transitions raise errors; the frontend disables UI for out-of-state actions.

### Module Map

| Module | States | What LLM does |
|--------|--------|---------------|
| **A: Scheduling** | CYCLE_CREATED → MEETING_SCHEDULED | Optional: polish invite text |
| **B: Scorecard** | SCORECARD_REQUEST_SENT → SCORECARD_COMPILED | Nothing (deterministic validation) |
| **C: Alignment** | SCORECARD_COMPILED → INTERNAL_ALIGNMENT | Extract action items from notes; summarize score changes |
| **D: Vendor Prep** | INTERNAL_ALIGNMENT → VENDOR_PREP | Generate vendor brief; draft 3 response options per pushback |
| **E: Meeting** | VENDOR_PREP → POST_MEETING_COMPLETE | Parse transcript; generate meeting minutes |
| **F: Analytics** | Any completed cycle | Generate leadership brief card |

### Backend Layout (`VendorPulse-code/backend/app/`)
- `main.py` — FastAPI app, router registration
- `core/workflow_engine.py` — state machine
- `api/routes/` — 7 route modules matching module names
- `agents/` — `BaseAgent` + 6 specialized agents; all use Claude tool-calling (structured output, not raw text)
- `services/` — LLM service, slot ranking, analytics, and mock adapters for calendar/email/forms
- `services/graph_service.py` — Microsoft Graph API (calendar slots, invites)
- `services/gmail_service.py` / `google_forms_service.py` — scorecard distribution & polling
- `services/slot_ranking_service.py` — deterministic slot scoring algorithm
- `repositories/` — data access layer (one file per entity)
- `models/` — Pydantic v2 schemas

### Frontend Layout (`VendorPulse-code/frontend/src/`)
- `App.tsx` — three routes: Dashboard, CycleDetail (tabbed workspace), Analytics
- `pages/CycleDetail.tsx` — renders active module tab based on workflow state
- `components/modules/` — one component per module (A–F)
- `components/shared/` — `ApprovalPanel`, `ActionLog`, `WorkflowProgressBar`, `AgentStatusBadge`
- `store/useCycleStore.ts` — Zustand: active cycle, workflow state, active tab
- `store/useUIStore.ts` — Zustand: sidebar, notifications, modals
- `lib/api.ts` — base fetch client; `lib/schedulingApi.ts`, `lib/scorecardApi.ts` — typed wrappers
- `mock/` — demo data matching the 4 seeded cycles and 3 vendors

### Key Design Decisions
- **Deterministic vs AI:** Slot ranking, score validation, workflow transitions, and outlier detection are all deterministic. LLM is called only to produce human-readable text (briefs, minutes, summaries).
- **Tool-calling pattern:** Every agent uses Claude's tool-calling API (not raw completion) so outputs are structured JSON, validated against Pydantic schemas.
- **Human-approval gate:** All AI-generated content (invites, briefs, minutes, responses) is surfaced via `ApprovalPanel` before any external action is taken.
- **AgentResponse contract:** A single response schema shared across all agents ensures the frontend never guesses output shape.
- **Mock-first integrations:** Calendar, email, forms, and notifications have mock service implementations behind clean interfaces. Real integrations (Graph API, Gmail) can be toggled via env vars without changing agent code.
- **Database:** PostgreSQL, normalized **3NF** schema — 16 tables with typed columns, domain primary keys, and FK constraints (`ON DELETE CASCADE`). Nested/variable data lives in `JSONB` columns ("relational core + JSONB"). De-duplicated: a `persons` table (email natural key) referenced by the `attendees` junction, and `vendors` referenced by `cycles` (vendor_name derived, not stored). All data access goes through `repositories/base_repository.py` — a column-mapping engine keeping the dict-in/dict-out contract; the `AttendeeRepository`/`CycleRepository` decompose on write and reconstruct via join on read. The app requires a reachable Postgres (`DATABASE_URL` / `PG_*` in `.env`) and fails fast otherwise. `python scripts/create_database.py` then `python scripts/migrate_json_to_postgres.py` to set up + seed. See `backend/docs/POSTGRES_MIGRATION.md`.

### Demo Data
3 vendors with intentional trajectories seeded: NovaTech (improving), CoreSystems (declining), Meridian IT (stable). 4 historical cycles pre-seeded for analytics.
