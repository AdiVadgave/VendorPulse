# VendorPulse for Shell — Backend High-Level Design (HLD)

> **Version:** 2.0 (Shell) | **Stack:** FastAPI + SQLAlchemy + PostgreSQL + Microsoft Graph + Claude (Anthropic API or Azure OpenAI)
> **Scope:** Backend architecture for Shell production deployment
> **Supersedes:** `docs/HLD_Backend.md` (POC v1.0)

---

## 1. Overview

VendorPulse Backend is an **async FastAPI application** that orchestrates Shell's quarterly vendor governance cycles end-to-end. It enforces a **12-state workflow machine**, coordinates **six AI agents (Modules A–F)** built on Claude's tool-calling pattern, and integrates with Shell's Microsoft 365 estate via Microsoft Graph for all calendar, mail, and Teams operations.

Three explicit design principles:

1. **Deterministic-first, AI-second.** Workflow transitions, score validation, slot ranking, outlier detection, and audit are all deterministic code. Claude generates only the human-readable text (briefs, minutes, summaries).
2. **Human-in-the-loop on every outbound action.** No email, invite, or vendor-facing communication is dispatched without an explicit coordinator approval in the UI.
3. **Single-tenant for Shell.** No row-level tenancy logic, no per-customer schema overhead. Simpler, faster, less to test.

---

## 2. System Context

```
┌──────────────────────────────────────────────────────────────────┐
│                Shell User (browser, on Shell SSO)                │
└──────────────────────────────┬───────────────────────────────────┘
                               │ HTTPS / OIDC session cookie
                               │
┌──────────────────────────────▼───────────────────────────────────┐
│            Azure App Service — VendorPulse FastAPI               │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │  Middleware: OIDC validation · CORS · Correlation IDs    │   │
│   │  · Request logging · Rate limiting · Error mapping       │   │
│   └────────────────────────┬─────────────────────────────────┘   │
│                            │                                     │
│   ┌────────────────────────▼─────────────────────────────────┐   │
│   │  API Routes Layer  (7 routers)                            │   │
│   │  cycles · scheduling · scorecard · alignment ·            │   │
│   │  vendor_prep · meeting · analytics                        │   │
│   └────────────────────────┬─────────────────────────────────┘   │
│                            │                                     │
│   ┌────────────────────────▼─────────────────────────────────┐   │
│   │  Orchestration Layer                                      │   │
│   │  ┌──────────────────┐   ┌────────────────────────────┐    │   │
│   │  │ Workflow Engine  │   │ AI Agents (A–F)            │    │   │
│   │  │ (12-state FSM)   │   │ tool-calling on Claude     │    │   │
│   │  └──────────────────┘   └────────────────────────────┘    │   │
│   └────────────────────────┬─────────────────────────────────┘   │
│                            │                                     │
│   ┌────────────────────────▼─────────────────────────────────┐   │
│   │  Service Layer                                            │   │
│   │  LLMService (provider-abstracted) · GraphService         │   │
│   │  · ScorecardFormService · ValidationService              │   │
│   │  · AnalyticsService · SlotRankingService                 │   │
│   │  · AuditService · NotificationService                    │   │
│   └────────────────────────┬─────────────────────────────────┘   │
│                            │                                     │
│   ┌────────────────────────▼─────────────────────────────────┐   │
│   │  Data Access Layer                                        │   │
│   │  Repositories → SQLAlchemy 2.0 (async) → asyncpg → PG    │   │
│   └──────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
        ┌────────────────────────┼─────────────────────────────┐
        ▼                        ▼                             ▼
┌──────────────────┐  ┌───────────────────────┐  ┌─────────────────────────────┐
│ Microsoft Graph  │  │ LLM Provider          │  │ Azure Database for          │
│ (Shell tenant)   │  │ (Anthropic or Azure   │  │ PostgreSQL — Flexible       │
│ - Mail.Send      │  │  OpenAI — abstracted) │  │ Server (Private Endpoint)   │
│ - Calendars.RW   │  │                       │  │                             │
│ - OnlineMeetings │  │                       │  │                             │
└──────────────────┘  └───────────────────────┘  └─────────────────────────────┘

                                                       Azure Key Vault for secrets
                                                       App Insights + Log Analytics
```

---

## 3. Application Architecture

### 3.1 Layer Breakdown

| Layer | Technology | Responsibility |
|-------|------------|----------------|
| **Middleware** | FastAPI ASGI middlewares | OIDC session validation, correlation-ID injection, request logging, rate limiting, exception mapping |
| **API Routes** | FastAPI routers | HTTP endpoints, request validation, response serialisation |
| **Workflow Engine** | Custom state machine | Enforces the 12-state forward-only workflow; gates every module endpoint |
| **Agent Modules** | 6 `BaseAgent` subclasses | Claude-powered AI workers using the tool-calling pattern |
| **Service Layer** | Python service classes | LLM abstraction, Graph integration, scorecard form handling, deterministic algorithms |
| **Repository Layer** | SQLAlchemy 2.0 (async) | Database CRUD abstraction; one repo per aggregate root |
| **Database** | PostgreSQL 16 (Azure Flexible Server) | Persistent storage (~15 tables, evolved from POC's 13) |
| **External Integrations** | Microsoft Graph, LLM API | Calendar/mail/Teams, AI text generation |
| **Secrets** | Azure Key Vault via Managed Identity | All credentials, certificates, signing keys |

### 3.2 Request Lifecycle

```
HTTP Request (from Shell user)
    │
    ▼
Azure Front Door (WAF, TLS)
    │
    ▼
App Service ingress
    │
    ▼
FastAPI middleware stack
    ├─ OIDC session validation → user identity + roles attached to request.state
    ├─ Correlation ID middleware → generate / propagate request-id
    ├─ Rate limit middleware → reject if user exceeds quota
    └─ Logging middleware → start span in App Insights
    │
    ▼
Route handler (with dependency injection: get_db, current_user)
    │
    ▼
Authorization check → required role for endpoint
    │
    ▼
Workflow engine → validate state transition (HTTP 409 if invalid)
    │
    ▼
Agent OR direct service call
    │
    ├──► Repository (Postgres read/write inside transaction)
    │
    ├──► LLM Service (Claude tool-calling loop — if needed)
    │       └──► Tool execution → DB or GraphService call
    │
    └──► GraphService (Microsoft Graph API call — if needed)
    │
    ▼
Audit write to agent_runs + external_calls
    │
    ▼
Pydantic v2 response serialisation → AgentResponse[T]
    │
    ▼
Middleware exit: span ended, latency captured, logs flushed
    │
    ▼
HTTP Response (JSON, application/json)
```

### 3.3 Concurrency Model

- **uvicorn workers:** 2 per App Service instance (2 vCPU → 2 workers — adjustable)
- **App Service autoscale:** 2 instances minimum, scale to 6 on CPU > 70% or queue length > 100
- **Inside a worker:** Single event loop. All I/O is async (DB via `asyncpg`, HTTP via `httpx`, LLM SDK async client).
- **Connection pools:** Postgres pool sized at 10 per worker (20 per instance, 120 at full scale). Postgres Flexible Server `max_connections` set to 200 — comfortable headroom.

---

## 4. Workflow Engine

The `WorkflowEngine` enforces a strict linear 12-state machine — unchanged from POC.

```
CYCLE_CREATED
    ↓
ATTENDEE_REFRESH_SENT       ← Module A: Scheduling
    ↓
AVAILABILITY_COLLECTED      ← Module A
    ↓
MEETING_SCHEDULED           ← Module A
    ↓
SCORECARD_REQUEST_SENT      ← Module B: Scorecard
    ↓
SCORECARD_COLLECTION        ← Module B
    ↓
SCORECARD_COMPILED          ← Module B
    ↓
INTERNAL_ALIGNMENT          ← Module C: Alignment
    ↓
VENDOR_PREP                 ← Module D: Vendor Prep
    ↓
MEETING_IN_PROGRESS         ← Module E: Meeting
    ↓
POST_MEETING_COMPLETE       ← Module E
    ↓
ARCHIVED                    ← Module F: Analytics
```

### 4.1 Rules

- Only **forward transitions**. No rollback.
- Module endpoints call `workflow_engine.assert_at_least(required_state)` — returns HTTP 409 if violated.
- A `cycle_state_transitions` audit table (new in Shell production) records every transition with timestamp and triggering user.

### 4.2 Why no rollback

The state machine is deliberately linear because every transition has an external side effect (emails sent, invites issued, scorecards distributed). Rolling back would require un-sending. Instead:

- **Operator escape hatch:** A `vmo_admin` role can mark a cycle `ARCHIVED` early ("abandon"). The cycle data is preserved; no rollback to mid-state is needed.
- **Re-run within a state:** Inside a state, agents can be re-triggered (e.g., regenerate a vendor brief). The state itself does not move backwards.

---

## 5. AI Agent Architecture

### 5.1 Base agent pattern (unchanged structurally)

All agents inherit from `BaseAgent`:

```
Agent.run(user_message, context)
    │
    ▼
Create agent_runs record (status=PENDING)
    │
    ▼
Build LLM message array + system prompt + tool definitions
    │
    ▼
Claude API call (with tools)
    │
    ├── Claude returns text (stop_reason=end_turn) → done
    │
    └── Claude returns tool_use →
            execute_tool(tool_name, input)
                │
                ├── DB operation (via repository)
                ├── GraphService call (real Graph in Shell prod)
                └── Return result string
            Append tool_result to messages
            Loop back to Claude
    │
    ▼
Update agent_runs (status=SUCCESS/FAILED/PARTIAL, output_payload, tokens_used)
    │
    ▼
Return AgentResponse[T]
```

### 5.2 AgentResponse contract (unchanged)

```python
class AgentResponse(BaseModel, Generic[T]):
    status: Literal["success", "failed", "partial", "pending_approval"]
    agent: str
    summary: str
    data: T
    warnings: list[str] = []
    next_actions: list[str] = []
    requires_approval: bool = False
    run_id: str
    cycle_id: str | None
```

### 5.3 Six agents (unchanged module split)

| Module | Agent | Workflow states | LLM-generated content | Deterministic tools |
|--------|-------|----------------|------------------------|---------------------|
| **A** | `SchedulingAgent` | `CYCLE_CREATED` → `MEETING_SCHEDULED` | Attendee refresh email body, invite body | `get_attendees`, `rank_slots` (deterministic), Graph `findMeetingTimes` |
| **B** | `ScorecardAgent` | `MEETING_SCHEDULED` → `SCORECARD_COMPILED` | Scorecard request email body, reminder emails | `validate_submission`, `compile_scorecard`, `detect_outliers` |
| **C** | `AlignmentAgent` | `SCORECARD_COMPILED` → `INTERNAL_ALIGNMENT` | Score change narrative, action item extraction from raw notes | `compare_cycles`, `detect_alignment_flags` |
| **D** | `VendorPrepAgent` | `INTERNAL_ALIGNMENT` → `VENDOR_PREP` | Vendor brief, 3-stance pushback responses | `get_scorecard_summary`, `get_open_issues`, `categorise_pushback` |
| **E** | `MeetingAgent` | `VENDOR_PREP` → `POST_MEETING_COMPLETE` | Pre-meeting briefing, transcript classification, full minutes | `get_all_notes`, `merge_action_items` |
| **F** | `MemoryAgent` | Cross-cycle (`ARCHIVED`) | Leadership brief | `detect_recurring_issues`, `get_trend_data`, `get_cross_vendor_data` |

The capability matrix from the POC HLD is preserved verbatim. Shell-specific additions:

- **Module A** uses real Graph `findMeetingTimes` against Shell mailboxes (POC had mock data only).
- **Module B** uses the native in-app scorecard form (POC had Google Forms).
- **Module E** can optionally ingest Teams meeting transcripts via Graph's Communications API in a Phase 2 enhancement (out of scope for first release; needs Shell IT call-recording consent flow).

---

## 6. Service Layer (Shell production)

| Service | Responsibility | Change from POC |
|---------|----------------|------------------|
| `LLMService` | Wraps the chosen LLM provider (Anthropic or Azure OpenAI); tool-calling loop, retries, token + cost logging | Refactored into a `LLMProvider` Protocol with `AnthropicProvider` and `AzureOpenAIProvider` implementations |
| `GraphService` | Microsoft Graph integration — findMeetingTimes, events, mail, online meetings, user lookup, mailbox queries | Hardened: app-only auth with certificate via MSAL; retry-with-backoff on 429/5xx; full request-ID logging; constrained mailbox access |
| `ScorecardFormService` | Renders in-app scorecard form for stakeholders, validates submissions, stores responses | **New** — replaces Google Forms entirely |
| `ValidationService` | Score range checks, comment requirements, statistical outlier detection | Unchanged from POC (already deterministic) |
| `AnalyticsService` | Multi-cycle trends, recurring issue detection, cross-vendor comparison | Unchanged |
| `SlotRankingService` | Deterministic slot scoring (organiser + exec sponsor weighted highest) | Unchanged |
| `AuditService` | Writes `agent_runs`, `external_calls`, `cycle_state_transitions`, `security_events` | **New** — centralises audit writes; mirrors security events to Log Analytics |
| `NotificationService` | In-app notifications (toast / badge / panel); does NOT send email (email goes via GraphService) | Renamed from POC's MockNotificationService |
| ~~`MockCalendarService`~~ | — | **Removed** — Graph is the calendar |
| ~~`MockEmailService`~~ | — | **Removed** — Graph is the email |
| ~~`MockFormService`~~ | — | **Removed** — ScorecardFormService is the form |
| ~~`GmailService`~~ | — | **Removed** entirely |
| ~~`GoogleFormsService`~~ | — | **Removed** entirely |
| ~~`GoogleAuthService`~~ | — | **Removed** entirely |

---

## 7. Data Model Overview

### 7.1 Tables (15 in Shell production)

```
vendors                      ─ master vendor registry (Shell-seeded from CSV)
governance_cycles            ─ one cycle per vendor per quarter (12-state FSM)
stakeholders                 ─ Shell + vendor personnel (Shell entries synced from Entra ID)
cycle_attendees              ─ confirmed attendees per cycle
scorecards                   ─ individual category scores (5 per stakeholder per cycle)
scorecard_form_links         ─ NEW — one-time-use scorecard form links + token bindings
meetings                     ─ INTERNAL_ALIGNMENT / VENDOR_PREP / EGB_QBR records
meeting_notes                ─ classified meeting notes
action_items                 ─ extracted actions from alignment/prep/meeting
issues                       ─ recurring issues tracked across cycles
face_off_model               ─ Shell ↔ Vendor attendee pairings
notifications                ─ in-app + external comms log
slot_proposals               ─ ranked time slot options
agent_runs                   ─ audit log of every AI agent execution
external_calls               ─ NEW — audit log of every Graph / LLM call
cycle_state_transitions      ─ NEW — audit log of every workflow state change
security_events              ─ NEW — login, role grant, sensitive action audit
```

### 7.2 Key relationships

```
Vendor ──< GovernanceCycle ──< CycleAttendee >── Stakeholder
                          ──< Scorecard >── Stakeholder
                          ──< ScorecardFormLink >── Stakeholder
                          ──< Meeting ──< MeetingNote
                                       ──< ActionItem
                          ──< SlotProposal
                          ──< Notification
                          ──< AgentRun ──< ExternalCall
                          ──< CycleStateTransition
```

### 7.3 Scorecard categories — Shell taxonomy

The POC used a generic 5-category model (`DELIVERY_QUALITY`, `SLA_COMPLIANCE`, `INNOVATION`, `COMMUNICATION`, `VALUE_FOR_MONEY`). Shell's actual taxonomy is hierarchical:

```
Risk & Compliance        — Release/Patch Mgmt, Security Risk Mgmt, Audit Compliance
Performance              — Delivery Timeliness, Quality, SLA Adherence, Resource Capability, Operational Efficiency
Commercial               — Pricing Competitiveness, Contract Compliance, Cost Control, Billing Accuracy
Relationship             — Communication Effectiveness, Stakeholder Engagement, Responsiveness, Collaboration Alignment
```

These are **already present** in the POC's `google_forms_service.py` QUESTION_MAP. We propose lifting them out of that file and into a tenant-configurable schema (`scorecard_taxonomy` JSON column on `governance_cycles`) so changes don't need code deploys. **Final taxonomy to be confirmed with Shell VMO at the Day-2 design alignment checkpoint** (see [§11 Productionization Roadmap](11_Productionization_Roadmap_Shell.md)).

---

## 8. API Route Structure

| Router | Base Path | Modules |
|--------|-----------|---------|
| `auth` | `/api/v1/auth` | OIDC callback, session refresh, logout |
| `cycles` | `/api/v1/cycles` | Cycle CRUD, workflow state management, vendor list |
| `scheduling` | `/api/v1/cycles/{id}/scheduling` | Module A |
| `scorecard` | `/api/v1/cycles/{id}/scorecard` | Module B (includes form rendering + submission) |
| `alignment` | `/api/v1/cycles/{id}/alignment` | Module C |
| `vendor_prep` | `/api/v1/cycles/{id}/vendor-prep` | Module D |
| `meeting` | `/api/v1/cycles/{id}/meeting` | Module E |
| `analytics` | `/api/v1/analytics` | Module F (cross-cycle) |
| `admin` | `/api/v1/admin` | **New** — vendor master CRUD, user role view, audit query (vmo_admin only) |
| `health` | `/healthz`, `/readyz` | Liveness + readiness probes for App Service |

All operational routes return `AgentResponse[T]`. Admin routes return Pydantic models directly without the agent envelope.

---

## 9. Cross-cutting concerns

### 9.1 Observability

- Every agent execution logged to `agent_runs` (input, output, status, tokens, cost estimate)
- Every Graph / LLM call logged to `external_calls` (endpoint, latency, status code, request-id)
- App Insights collects HTTP request telemetry, dependency calls, and exceptions
- Custom App Insights metrics published per agent and per Graph endpoint
- Per-request correlation ID propagated via `traceparent` header into Graph and LLM calls where supported

### 9.2 Error handling

| Error type | HTTP response | Logged where |
|------------|---------------|--------------|
| Workflow violation | 409 Conflict + `ErrorResponse{detail, code=WORKFLOW_VIOLATION}` | App Insights (warn) |
| Validation failure | 422 (Pydantic) | App Insights (warn) |
| Not found | 404 | App Insights (info) |
| Auth required | 401 | Log Analytics security stream |
| Forbidden (role) | 403 | Log Analytics security stream |
| Rate limit | 429 + Retry-After | App Insights (warn) |
| Graph 429 | Caught, retried with backoff; surfaced as 503 to client if exhausted | App Insights + `external_calls` |
| Graph 5xx | Caught, retried; if exhausted, agent returns `status=failed` | App Insights + `agent_runs.error_message` |
| LLM error | Caught in `BaseAgent.run()`; `AgentResponse.status=failed` | App Insights + `agent_runs.error_message` |
| Internal exception | 500 + generic message | App Insights (error) — full stack trace in logs only |

### 9.3 Human-in-the-loop

Actions that result in external communications (mail, calendar invites) require explicit coordinator approval:

1. Agent generates content, sets `requires_approval = True`, returns `status = pending_approval`.
2. Frontend renders `ApprovalPanel` with preview, recipient list, and editable content.
3. Coordinator clicks **Approve** → frontend calls `POST /cycles/{id}/<module>/approve/{action_id}`.
4. Backend calls `GraphService` to send → records result.
5. Workflow advances.

**An agent never has direct send authority. Approval is a hard gate, not a UX convention.**

### 9.4 Rate limiting and cost control

- **Per-user rate limit:** 60 req/min (sliding window) via `slowapi` middleware, keyed on user ID.
- **Per-cycle LLM budget:** Default 100,000 tokens per cycle. Hard stop with operator override. Budget tracked in `governance_cycles.llm_tokens_used`.
- **Tenant-wide daily LLM budget:** Default 5M tokens/day. Operator alert at 80%, hard stop at 100% (admin override only).
- **Graph call rate:** Naturally limited by Graph's per-app and per-mailbox throttles; we add a token-bucket in `GraphService` set to 80% of Graph's published limits to stay under their threshold.

---

## 10. Key design decisions (Shell-flavoured)

| Decision | Rationale |
|----------|-----------|
| Async FastAPI + asyncpg | Full async I/O; matches POC; well-supported in Shell engineering toolchain |
| PostgreSQL on Azure Flexible Server | Managed; Shell DBA-supported; matches Postgres-compatible schema designed in POC |
| App-only Graph auth with certificate | Production-correct; no user-token fragility; Shell IT-preferred |
| `LLMProvider` abstraction | Reversible LLM choice; insulates code from SDK churn |
| Native in-app scorecard form | Removes Google Forms dependency; full control over schema; better UX |
| `agent_runs` mirrored to Log Analytics | Tamper-resistant audit for sensitive payloads |
| Workflow engine unchanged | The POC's 12-state machine is correct; no reason to change |
| Single-tenant simplification | No row-level tenant filtering; less to test |
| No mobile app | Out of scope; web-first |

---

## 11. What is NOT in the backend HLD

To keep this document scoped:

- **Detailed table DDL** — in `05_LLD_Backend_Shell.md`
- **Specific Pydantic schemas** — in LLD
- **Specific Claude prompt templates** — in LLD (and prompt-engineering guide, separate)
- **CI/CD pipeline configuration** — in roadmap document
- **Infrastructure-as-code Bicep modules** — in roadmap document

---

*Backend HLD v2.0 — Zensar VendorPulse for Shell — 2026-06-03.*
