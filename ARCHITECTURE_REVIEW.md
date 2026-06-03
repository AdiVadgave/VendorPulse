# VendorPulse — Full Codebase Explanation & Architecture Review

> A complete technical walkthrough of the VendorPulse platform: objective, architecture, integrations, lifecycle, strengths, and limitations.

---

## Table of Contents

1. [Objective](#1-objective)
2. [System Overview](#2-system-overview)
3. [End-to-End Flow](#3-end-to-end-flow)
4. [Core Architecture](#4-core-architecture)
5. [External Integrations](#5-external-integrations)
6. [Key Design Decisions](#6-key-design-decisions)
7. [Lifecycle (How Work Moves)](#7-lifecycle-how-work-moves)
8. [Strengths of This System](#8-strengths-of-this-system)
9. [Limitations / Considerations](#9-limitations--considerations)
10. [How to Start It (and Why That Setup Is Effective)](#10-how-to-start-it-and-why-that-setup-is-effective)
11. [Summary](#11-summary)

---

## 1. Objective

VendorPulse is a **vendor governance cycle automation platform** built to orchestrate Quarterly Business Reviews (QBRs). Its goal is to eliminate the manual, error-prone coordination work that happens around vendor reviews — scheduling, scorecard collection, internal alignment, vendor prep, meeting facilitation, and historical analytics — by enforcing a **deterministic 12-state workflow machine** and optionally augmenting it with **Claude-style tool-calling AI agents** that generate human-readable artefacts (briefs, minutes, summaries, responses).

The core promise:

> *Business-critical logic stays deterministic. AI only produces text that a human approves before it leaves the system.*

---

## 2. System Overview

### Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python 3.11+), Pydantic v2, httpx |
| Frontend | React 19 + Vite + Zustand + Recharts + TailwindCSS 4 |
| LLM | Azure OpenAI or OpenAI (dual-provider, toggled by `ENABLE_LLM`) |
| External APIs | Microsoft Graph (calendar + Teams), Gmail API, Google Forms API |
| Persistence | JSON-backed repositories (SQLite-migration ready) |
| State | 12-state forward-only FSM, 6 functional modules (A–F), 7 specialised agents |

**Codebase size:** ~4,000 LOC Python + ~2,000 LOC TypeScript, with 920 KB of real agent-run audit logs from demo sessions.

### Module Map (A–F)

| Module | States Covered | What the LLM Does |
|---|---|---|
| **A: Scheduling** | `CYCLE_CREATED` → `MEETING_SCHEDULED` | Optional invite polish |
| **B: Scorecard** | `SCORECARD_REQUEST_SENT` → `SCORECARD_COMPILED` | Nothing — fully deterministic |
| **C: Alignment** | `SCORECARD_COMPILED` → `INTERNAL_ALIGNMENT` | Extract actions, summarise score changes |
| **D: Vendor Prep** | `INTERNAL_ALIGNMENT` → `VENDOR_PREP` | Draft brief + 3 pushback responses |
| **E: Meeting** | `VENDOR_PREP` → `POST_MEETING_COMPLETE` | Parse transcript, generate minutes |
| **F: Analytics** | Any completed cycle | Leadership brief cards, trend narrative |

---

## 3. End-to-End Flow

A full cycle traverses **12 states** in a strictly one-directional graph:

```
CYCLE_CREATED
  → ATTENDEE_REFRESH_SENT
    → AVAILABILITY_COLLECTED
      → MEETING_SCHEDULED
        → SCORECARD_REQUEST_SENT
          → SCORECARD_COLLECTION
            → SCORECARD_COMPILED
              → INTERNAL_ALIGNMENT
                → VENDOR_PREP
                  → MEETING_IN_PROGRESS
                    → POST_MEETING_COMPLETE
                      → ARCHIVED
```

### Walkthrough (typical cycle)

1. **Cycle creation** — Coordinator picks vendor + quarter on the Dashboard. A cycle record lands in [cycles.json](VendorPulse-code/backend/data/cycles.json) at `CYCLE_CREATED`.
2. **Attendee refresh** — `SchedulingAgent` pulls the attendee list (reviewers, exec sponsor, organiser). State → `ATTENDEE_REFRESH_SENT`.
3. **Availability collection** — Either simulated locally or fetched via Microsoft Graph `findMeetingTimes`. State → `AVAILABILITY_COLLECTED`.
4. **Slot ranking & approval** — [slot_ranking_service.py](VendorPulse-code/backend/app/services/slot_ranking_service.py) deterministically scores candidate slots using attendance %, conflicts, key-attendee presence, and timezone suitability. Top 3 surface via the frontend [SlotRankingPanel](VendorPulse-code/frontend/src/components/modules/scheduling/SlotRankingPanel.tsx). Coordinator approves → `GraphService.create_event()` creates a Teams meeting → state → `MEETING_SCHEDULED`.
5. **Scorecard dispatch** — `ScorecardAgent` emails Google Form links via Gmail. State → `SCORECARD_REQUEST_SENT`.
6. **Collection** — `google_forms_service` polls responses. State → `SCORECARD_COLLECTION`.
7. **Compilation** — Once ≥ 2 valid responses exist, compile mean/StDev, flag |score − mean| > 1.5σ outliers. State → `SCORECARD_COMPILED`.
8. **Internal alignment** — `AlignmentAgent` runs score-diff vs previous cycle, produces "What Changed" summary (LLM-assisted), flags stakeholder divergence. State → `INTERNAL_ALIGNMENT`.
9. **Vendor prep** — `VendorPrepAgent` generates vendor brief + 3 response variants (Factual/Neutral/Escalation) for each anticipated pushback. State → `VENDOR_PREP`.
10. **Meeting** — State → `MEETING_IN_PROGRESS`. Facilitator captures notes in the Meeting tab.
11. **Post-meeting** — `MeetingAgent` parses transcript into formal minutes + extracts action items (owner + due date). State → `POST_MEETING_COMPLETE`.
12. **Archive** — Cycle closed. `MemoryAgent` feeds it into the multi-cycle analytics pipeline. State → `ARCHIVED`.

Every state transition is gated by [workflow_engine.py](VendorPulse-code/backend/app/core/workflow_engine.py); illegal transitions raise `WorkflowViolationError` → HTTP 409.

---

## 4. Core Architecture

### Backend — [VendorPulse-code/backend/](VendorPulse-code/backend/)

```
backend/
├── app/
│   ├── main.py                      FastAPI app, 11 routers, CORS, request logging
│   ├── core/workflow_engine.py      12-state FSM, can_transition/assert_state/advance
│   ├── api/routes/                  14 modules, ~3,500 LOC
│   │   ├── scheduling.py / graph_scheduling.py
│   │   ├── scorecard.py / scorecard_agent.py
│   │   ├── alignment.py
│   │   ├── meeting_agent.py / vendor_prep.py
│   │   ├── analytics.py, users.py, vendors.py, meetings.py,
│   │   ├── email.py, google_auth.py
│   ├── agents/                      BaseAgent + 6 specialised agents
│   │   ├── base_agent.py            Tool-calling loop + deterministic fallback
│   │   ├── scheduling_agent.py      6 tools (get_attendees, rank_slots, approve_slot, send_invites, ...)
│   │   ├── scorecard_agent.py
│   │   ├── alignment_agent.py
│   │   ├── vendor_prep_agent.py
│   │   ├── meeting_agent.py
│   │   └── memory_agent.py
│   ├── services/
│   │   ├── llm_service.py           Azure-OR-OpenAI wrapper, call()/call_simple()
│   │   ├── scheduling_service.py    796 LOC, orchestrates Module A
│   │   ├── slot_ranking_service.py  Pure deterministic scoring
│   │   ├── graph_service.py         MS Graph wrapper (findMeetingTimes, createEvent)
│   │   ├── gmail_service.py
│   │   ├── google_forms_service.py
│   │   ├── google_auth_service.py
│   │   ├── availability_service.py, meeting_service.py, user_service.py, email_service.py
│   │   └── mock/                    Mock adapters (calendar, email, forms, notifications)
│   ├── repositories/                8 JSON-backed repos, uniform CRUD
│   ├── models/                      Pydantic schemas, AgentResponse envelope
│   ├── middleware/request_logging.py
│   ├── utils/prompts.py             All 6 agent system prompts
│   ├── dependencies.py              DI container
│   └── config.py                    Pydantic Settings (env-driven)
├── data/                            Runtime JSON store
│   ├── cycles.json, vendors.json, users.json, attendees.json
│   ├── slot_proposals.json, meetings.json, scorecard_responses.json
│   ├── agent_runs.json (920 KB audit trail)
│   └── google_token.json
└── run.py                           Uvicorn launcher
```

### Agent Pattern — [base_agent.py](VendorPulse-code/backend/app/agents/base_agent.py)

Every agent inherits `BaseAgent` and implements four methods:

```python
get_system_prompt() -> str
get_tools() -> list[dict]        # Anthropic/OpenAI tool-schema format
execute_tool(name, input) -> str # Routes tool call → service
_deterministic_run(msg, ctx)     # Fallback when ENABLE_LLM=false
```

Flow:

```
BaseAgent.run()
    ├── ENABLE_LLM=true  →  _tool_calling_loop()  (up to 10 iterations)
    └── ENABLE_LLM=false →  _deterministic_run()  (direct service calls)
    ↓
AgentResponse (unified envelope)
    ↓
agent_runs.json  (audit log — every call start & completion)
```

### Unified Response Contract

```python
class AgentResponse(BaseModel):
    status: Literal["success","failed","partial","pending_approval"]
    agent: str
    summary: str
    data: Any
    warnings: list[str]
    next_actions: list[str]   # e.g. ["APPROVE_SLOT","SEND_INVITES"]
    requires_approval: bool
    run_id: str
```

The frontend never branches on agent-specific shapes — one envelope handles everything.

### Deterministic Slot Ranking

```
score = (attendance_% × 100)
      − (conflict_count × 10)
      + (all_key_present × 10)
      + (timezone_suitable × 5)

Hard constraints:
  - Organiser MUST be available
  - Exec sponsor MUST be available

Graph confidence mapping:
  High (≥90%)   → 100 base
  Medium (≥70%) →  80 base
  Low  (<70%)   →  60 base
```

Pure math, no LLM — testable, reproducible, defensible.

### Frontend — [VendorPulse-code/frontend/](VendorPulse-code/frontend/)

```
src/
├── App.tsx                          3 routes: Dashboard, CycleDetail, Analytics
├── pages/
│   ├── Dashboard.tsx
│   ├── CycleDetail.tsx              7 tabs, driven by current workflow state
│   └── Analytics.tsx
├── components/
│   ├── layout/ (AppLayout, Sidebar, Topbar)
│   ├── shared/
│   │   ├── WorkflowProgressBar.tsx  6-stage visual indicator
│   │   ├── ApprovalPanel.tsx        Modal approval gate
│   │   ├── ActionLog.tsx, AgentStatusBadge.tsx, EmptyState.tsx
│   └── modules/
│       ├── scheduling/   (SlotRankingPanel, SlotCard, InviteApprovalPanel, ...)
│       ├── scorecard/    (DispatchPanel, SubmissionTracker, CompiledTable)
│       ├── alignment/    (ScoreComparison, AlignmentFlags, ChangeHighlights, FaceOffModelEditor)
│       ├── vendor-prep/  (BriefPanel, PushbackInput, ResponseCards)
│       ├── meeting/      (BriefingCard, LiveCapturePanel, TranscriptInput, MinutesViewer)
│       └── analytics/    (RadarChart, TrendLineChart, RecurringIssueAlerts, LeadershipBriefCard)
├── store/
│   ├── useCycleStore.ts             Zustand + persist middleware (localStorage)
│   └── useUIStore.ts
├── lib/
│   ├── api.ts                       Fallback URL cascade (VITE_API_URL → :8000 → :8010)
│   └── {schedulingApi, scorecardApi, ...}.ts
├── types/, utils/, mock/, config/
```

**Frontend enforcement of forward-only state** (useCycleStore):

```typescript
function pickMostAdvanced(local, backend) {
  return WORKFLOW_STATES.indexOf(local) >= WORKFLOW_STATES.indexOf(backend)
    ? local : backend;   // Local state never regresses
}
```

Tab access is gated by `TAB_MIN_STATE_INDEX`; e.g. the Alignment tab unlocks only once `SCORECARD_COMPILED` is reached.

---

## 5. External Integrations

| Service | Purpose | File | Auth |
|---|---|---|---|
| **Microsoft Graph** | `findMeetingTimes`, Teams event creation, calendar reads | [graph_service.py](VendorPulse-code/backend/app/services/graph_service.py) (563 LOC) | Delegated OAuth2 bearer token in `.env` (`GRAPH_ACCESS_TOKEN`) |
| **Gmail API** | Scorecard dispatch, reminders, approval notifications | [gmail_service.py](VendorPulse-code/backend/app/services/gmail_service.py) | OAuth2; token cached in `data/google_token.json` |
| **Google Forms** | Polling scorecard responses | [google_forms_service.py](VendorPulse-code/backend/app/services/google_forms_service.py) | OAuth2 (shared with Gmail) |
| **Azure OpenAI / OpenAI** | Agent tool-calling + `call_simple()` text generation | [llm_service.py](VendorPulse-code/backend/app/services/llm_service.py) | API key, provider switch via `AI_PROVIDER=azure\|openai` |

**Mock adapters** ([app/services/mock/](VendorPulse-code/backend/app/services/mock/)) mirror the real adapter interfaces, so dev/demo runs without credentials simply swap the implementation via `dependencies.py` — routes and agents are unchanged.

---

## 6. Key Design Decisions

1. **Deterministic-first, AI-optional.** Business rules (ranking, compilation, outlier detection, state transitions) never invoke an LLM. AI only produces artefacts that a human approves.
2. **Forward-only FSM.** No rollback, no skipping. Enforced in backend ([workflow_engine.py](VendorPulse-code/backend/app/core/workflow_engine.py)) AND frontend (`pickMostAdvanced`). Audit trail stays clean.
3. **Tool-calling over free-form.** Agents never return raw text for structured data — they call typed tools validated against Pydantic schemas. Eliminates the "hallucinated JSON" failure mode.
4. **Unified `AgentResponse` envelope.** One shape for every agent; frontend renders `ApprovalPanel` purely off `requires_approval` + `next_actions`.
5. **Human-in-the-loop approval gates.** Every external side-effect (invite send, scorecard dispatch, minutes publish, vendor-facing response) goes through [ApprovalPanel](VendorPulse-code/frontend/src/components/shared/ApprovalPanel.tsx).
6. **Mock-first integrations.** Graph, Gmail, Forms all have mock twins for offline demos.
7. **Repository pattern.** All persistence goes through [base_repository.py](VendorPulse-code/backend/app/repositories/base_repository.py). Swapping JSON for SQLite means changing one file — routes and agents are untouched.
8. **Full agent-run audit trail.** Every `run()` logs start + completion to [agent_runs.json](VendorPulse-code/backend/data/agent_runs.json). Already 920 KB of real runs exist — excellent observability.
9. **Persisted frontend progress.** Zustand `persist()` keeps `workflowStates` + per-cycle `lastTabs` in localStorage; survives refreshes, degrades gracefully if backend is slow.

---

## 7. Lifecycle (How Work Moves)

1. **Kickoff (Dashboard)** → create cycle → `CYCLE_CREATED`
2. **Scheduling tab** → agent proposes ranked slots → coordinator approves → Teams invite sent → `MEETING_SCHEDULED`
3. **Scorecard tab** → form dispatched → responses collected → compiled with outlier detection → `SCORECARD_COMPILED`
4. **Alignment tab** → score diff + "what changed" summary + stakeholder divergence flags → internal face-off model finalised → `INTERNAL_ALIGNMENT`
5. **Vendor-Prep tab** → brief + 3-option pushback responses generated + reviewed → `VENDOR_PREP`
6. **Meeting tab** → `MEETING_IN_PROGRESS` → live notes / transcript capture → agent generates minutes & actions → `POST_MEETING_COMPLETE`
7. **Analytics (Memory agent)** → cycle fed into trend analysis, radar charts, recurring-issue detection, leadership brief → `ARCHIVED`

Progress is always visible in [WorkflowProgressBar.tsx](VendorPulse-code/frontend/src/components/shared/WorkflowProgressBar.tsx) (6 stages, green/blue/grey).

---

## 8. Strengths of This System

- **Predictable, auditable workflow** — forward-only FSM + per-agent audit trail means every cycle can be replayed and debugged.
- **Regulation-friendly AI usage** — LLM never makes a decision that affects the vendor; it only drafts text for humans.
- **Clean layering** — routes → services → repositories, zero cross-cutting. Easy to reason about, easy to test.
- **Extensible** — new agent = inherit `BaseAgent` + implement 4 methods + register in `dependencies.py`.
- **Type-safe end-to-end** — Pydantic v2 on the backend + TypeScript `cycle.types.ts` on the frontend.
- **Dual run modes** — full LLM mode for real intelligence; deterministic mode for deterministic CI/CD, demos, or air-gapped environments.
- **Integration-agnostic** — mock adapters keep development moving without Graph/Gmail tokens.
- **Smart UX** — state-aware tab gating, workflow-aware default navigation, persistent cycle progress across refreshes.
- **Already road-tested** — 100+ real agent runs in [agent_runs.json](VendorPulse-code/backend/data/agent_runs.json) covering end-to-end flows.

---

## 9. Limitations / Considerations

1. **JSON persistence** — whole-file read/write per op, no transactions, not safe for multi-process concurrency. Fine for demo/pilot; must migrate to Postgres/SQLite before multi-tenant rollout. (Migration path is clean: swap [base_repository.py](VendorPulse-code/backend/app/repositories/base_repository.py).)
2. **Graph access token is static** — stored in `.env`; no refresh loop. Production needs proper OAuth2 MSAL flow.
3. **No user authentication** — FastAPI routes are unguarded. Needs OIDC / OAuth2 / RBAC before exposure beyond dev.
4. **Some Graph calls are sync** — `httpx` is used synchronously in parts of `graph_scheduling.py`; converting to async would meaningfully improve throughput.
5. **Mock ↔ real swap isn't env-flagged** — changing requires editing `dependencies.py` rather than flipping `USE_MOCK_SERVICES=true`.
6. **No automated test suite** — only ad-hoc integration scripts (`test_cycles.py`, `test_graph_api.py`, `tmp_run_samsung_flow.py`). Needs pytest coverage for state-machine invariants and slot ranking, minimally.
7. **LLM default is disabled** — demo-quality text requires `.env` setup; no bundled fallback model.
8. **Single-organiser assumption** — slot ranking treats organiser + exec sponsor as hard constraints; no multi-organiser semantics.
9. **No retry / backoff** on external API calls — Graph / Gmail rate limiting would surface as outright failures.
10. **Agent-run log grows unbounded** — 920 KB already after demo use; needs rotation/archival in production.

---

## 10. How to Start It (and Why That Setup Is Effective)

### Local startup

**Backend**

```bash
cd VendorPulse-code/backend
python run.py                 # :8000 with reload
# Swagger: http://localhost:8000/docs
```

**Frontend**

```bash
cd VendorPulse-code/frontend
npm install
npm run dev                   # :5173
```

### Environment (`backend/.env`)

```env
ENABLE_LLM=true
AI_PROVIDER=azure
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://....openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=...
AZURE_OPENAI_API_VERSION=2024-12-01-preview
GRAPH_ACCESS_TOKEN=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_FORM_ID=...
```

**Frontend** (`frontend/.env.local`)

```env
VITE_API_URL=http://localhost:8000
```

### Why this setup is effective

- **Zero friction onboarding** — JSON data + seeded demo cycles (NovaTech improving, CoreSystems declining, Meridian stable) let a new engineer run the full flow in <5 minutes without any external credentials.
- **Progressive enhancement** — start deterministic (`ENABLE_LLM=false`), add AI when credentials arrive, add real Graph when the tenant is ready — no code changes.
- **Demo-first design** — the 4 pre-seeded historical cycles make Module F (analytics) immediately useful; `agent_runs.json` already showcases end-to-end runs.
- **Observability built in** — every agent run is logged; every state transition is enforced; Swagger UI documents every route; request-ID logging links frontend actions to backend traces.
- **Audit-friendly** — every human approval, every agent output, every state transition is stored — exactly what a compliance team wants.
- **Future-proof** — the repository pattern + mock adapters + dual LLM providers mean the system can scale from single-laptop demo → multi-tenant SaaS without rewrites, just layer-specific upgrades.

---

## 11. Summary

VendorPulse is a thoughtfully-layered, workflow-driven vendor governance platform. Its defining pattern is **deterministic core + optional AI glue + mandatory human approval**, wrapped in a strict **12-state forward-only FSM** with a **unified agent response envelope** and **full audit trail**. The 6-module design (Scheduling → Scorecard → Alignment → Vendor Prep → Meeting → Analytics) maps precisely to the real QBR lifecycle; the clean routes-services-repositories separation and mock-first integration strategy make it practical to pilot today and harden tomorrow. The main production gaps (SQLite migration, auth, async Graph calls, automated tests) are well-scoped upgrades, not architectural rewrites — a strong indicator of mature design.
