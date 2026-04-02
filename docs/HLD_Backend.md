# VendorPulse — Backend High-Level Design (HLD)

> **Version:** 1.0 | **Stack:** FastAPI + SQLAlchemy + SQLite + Anthropic Claude API
> **Scope:** High-level architecture overview of the VendorPulse backend

---

## 1. Overview

VendorPulse is a vendor governance platform orchestrating quarterly business reviews (EGB QBRs). The backend is an async FastAPI application that drives a 12-state workflow machine, coordinating six AI agents (Modules A–F) powered by Claude's tool-calling API. Each agent handles a distinct phase of the vendor review lifecycle.

---

## 2. System Context

```
┌──────────────────────────────────────────────────────────┐
│                  React Frontend (SPA)                     │
└──────────────────────────┬───────────────────────────────┘
                           │ REST / HTTP
┌──────────────────────────▼───────────────────────────────┐
│                  FastAPI Application                      │
│                                                           │
│   API Routes Layer (7 route modules)                      │
│         │                                                 │
│   Orchestration Layer                                     │
│   ┌─────────────────┐   ┌───────────────────────────┐    │
│   │ Workflow Engine  │   │ AI Agent Modules (A–F)    │    │
│   │ (state machine)  │   │ tool-calling pattern      │    │
│   └─────────────────┘   └───────────────────────────┘    │
│         │                                                 │
│   Service Layer                                           │
│   ┌──────────┐ ┌────────────┐ ┌──────────┐ ┌──────────┐  │
│   │  LLM     │ │ Validation │ │Analytics │ │  Mock    │  │
│   │ Service  │ │  Service   │ │ Service  │ │ Services │  │
│   └──────────┘ └────────────┘ └──────────┘ └──────────┘  │
│         │                                                 │
│   Data Access Layer                                       │
│   Repositories → SQLAlchemy (async) → SQLite              │
└──────────────────────────────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │   Anthropic Claude API  │
              │   (tool-calling)        │
              └─────────────────────────┘
```

---

## 3. Application Architecture

### 3.1 Layer Breakdown

| Layer | Technology | Responsibility |
|---|---|---|
| **API Routes** | FastAPI routers | HTTP endpoints, request validation, response serialisation |
| **Workflow Engine** | Custom state machine | Validates and enforces the 12-state governance workflow |
| **Agent Modules** | 6 BaseAgent subclasses | Claude-powered AI workers with tool-calling loops |
| **Service Layer** | Python classes | LLM integration, scorecard validation, analytics, mock integrations |
| **Repository Layer** | SQLAlchemy (async) | Database CRUD abstraction |
| **Database** | SQLite + aiosqlite | Persistent storage (13 tables) |
| **LLM** | Anthropic SDK | Claude tool-calling for all AI reasoning |

### 3.2 Request Lifecycle

```
HTTP Request
    │
    ▼
FastAPI Router
    │ (dependency injection: DB session)
    ▼
Route Handler
    │
    ▼
Workflow Engine (validate state transition)
    │
    ▼
Agent / Service
    │
    ├──► Repository (DB read/write)
    │
    └──► LLM Service (Claude API — if needed)
              │
              ▼
         Tool-Calling Loop
         (Claude ↔ execute_tool ↔ DB/Mock Services)
              │
              ▼
    Log to agent_runs table
    │
    ▼
Return AgentResponse (Pydantic schema)
    │
    ▼
HTTP Response (JSON)
```

---

## 4. Workflow Engine

The `WorkflowEngine` enforces a strict linear 12-state machine. No state can be skipped or reversed.

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

**Key rules:**
- Only forward transitions are allowed (no rollback)
- Route handlers call `workflow_engine.assert_at_least()` to gate access to module endpoints
- `WorkflowViolationError` returns HTTP 409 Conflict

---

## 5. AI Agent Architecture

### 5.1 Base Agent Pattern

All agents share a common tool-calling loop via `BaseAgent`:

```
Agent.run(user_message)
    │
    ▼
Create agent_runs record (PENDING)
    │
    ▼
Build messages array for Claude
    │
    ▼
Claude API call (with tools)
    │
    ├── Claude returns text → done
    │
    └── Claude returns tool_use →
            execute_tool(tool_name, input)
                │
                ├── DB operation (via repository)
                ├── Mock service call
                └── Return result string
            │
            Append tool_result to messages
            │
            Loop back to Claude API call
    │
    ▼
Update agent_runs record (SUCCESS / FAILED / PARTIAL)
    │
    ▼
Return AgentResponse
```

**Every agent response includes:**
- `status`: success | failed | partial | pending_approval
- `summary`: human-readable description of what was done
- `data`: typed result payload
- `warnings`: any issues encountered
- `next_actions`: suggested next steps
- `requires_approval`: whether human sign-off is needed before the action is sent
- `run_id`: trace ID linking to `agent_runs` table

---

### 5.2 Agent Modules (A–F)

#### Module A — Scheduling Agent

**Workflow States:** `CYCLE_CREATED` → `ATTENDEE_REFRESH_SENT` → `AVAILABILITY_COLLECTED` → `MEETING_SCHEDULED`

| Capability | Description |
|---|---|
| Attendee refresh | Sends personalised emails asking stakeholders to confirm attendance or nominate a replacement |
| Availability processing | Reads returned availability data and stores it |
| Slot ranking | Runs deterministic scoring algorithm: organiser + exec sponsor availability weighted highest |
| Slot proposal | Proposes top 3 ranked slots for coordinator approval |
| Calendar invite | Sends calendar invites after human approval of selected slot |

**Tools exposed to Claude:**
- `get_cycle_attendees` — fetch attendee list
- `send_attendee_refresh_emails` — trigger mock email service
- `get_availability` — read availability responses
- `rank_slots` — invoke slot ranking algorithm
- `create_slot_proposal` — save ranked proposals to DB
- `approve_and_schedule` — confirm slot + create meeting record

---

#### Module B — Scorecard Agent

**Workflow States:** `MEETING_SCHEDULED` → `SCORECARD_REQUEST_SENT` → `SCORECARD_COLLECTION` → `SCORECARD_COMPILED`

| Capability | Description |
|---|---|
| Scorecard dispatch | Generates personalised scorecard request emails (with form links) for approval |
| Submission tracking | Monitors who has submitted; identifies overdue stakeholders |
| Reminder escalation | Sends tiered reminders (reminder_1 → reminder_2 → escalation) |
| Score compilation | Aggregates all scores, computes per-category averages and overall score |
| Outlier detection | Flags scores deviating >1.5σ from the mean |
| Validation | Rejects invalid scores (out of range, duplicate submissions) |

**Tools exposed to Claude:**
- `dispatch_scorecard_requests` — generate and queue emails
- `get_submission_status` — who submitted vs. outstanding
- `send_reminder` — escalate reminder for a specific stakeholder
- `compile_scorecard` — aggregate + validate all scores
- `flag_outliers` — statistical outlier detection

---

#### Module C — Alignment Agent

**Workflow States:** `SCORECARD_COMPILED` → `INTERNAL_ALIGNMENT`

| Capability | Description |
|---|---|
| Change analysis | Compares current cycle scores vs. previous cycle; highlights significant deltas (>0.5) |
| Alignment flagging | Identifies categories with high stakeholder spread (disagreement) |
| Alignment document | Generates structured internal alignment document for the pre-meeting review |
| Face-off model | Builds or edits the Shell ↔ Vendor attendee pairing table |
| Note parsing | Extracts structured action items from pasted alignment meeting notes |

**Tools exposed to Claude:**
- `get_score_diff` — retrieve cycle-over-cycle deltas
- `get_alignment_flags` — fetch high-spread categories
- `generate_alignment_doc` — produce the alignment document
- `update_face_off_model` — save attendee pairing
- `extract_action_items` — parse raw notes into structured items

---

#### Module D — Vendor Prep Agent

**Workflow States:** `INTERNAL_ALIGNMENT` → `VENDOR_PREP`

| Capability | Description |
|---|---|
| Vendor brief generation | Creates a complete vendor brief: scores, trends, key concerns, positive areas |
| Pushback handling | Generates 3 response options per pushback item (FACTUAL / NEUTRAL / ESCALATION) |
| Legal flag | Automatically flags pushback items that may require legal review |
| Unresolved tracker | Maintains a list of open items pending resolution before the QBR |

**Tools exposed to Claude:**
- `get_compiled_scorecard` — fetch aggregated scores
- `get_trend_data` — multi-cycle trend for this vendor
- `generate_vendor_brief` — produce the brief document
- `handle_pushback` — generate response options for a pushback item
- `resolve_pushback` — mark a pushback item as resolved

---

#### Module E — Meeting Agent

**Workflow States:** `VENDOR_PREP` → `MEETING_IN_PROGRESS` → `POST_MEETING_COMPLETE`

| Capability | Description |
|---|---|
| Pre-meeting briefing | Generates a facilitator briefing card with agenda and key talking points |
| Live note capture | Stores structured notes (QUESTION / OBJECTION / DECISION / APPRECIATION / ACTION) |
| Transcript parsing | Parses a full meeting transcript; classifies each segment by note type |
| Minutes generation | Produces structured meeting minutes: executive summary, decisions, Q&A log, action items |
| Minutes approval | Minutes require human approval before being distributed |
| Action item extraction | Automatically creates `action_items` records from minutes content |

**Tools exposed to Claude:**
- `get_meeting_context` — scorecard + alignment + vendor prep data for context
- `capture_note` — save a single structured note
- `parse_transcript` — classify and store transcript segments
- `generate_minutes` — produce the complete minutes document
- `approve_minutes` — mark minutes as approved
- `extract_actions_from_minutes` — create action items from minutes

---

#### Module F — Memory / Analytics Agent

**Workflow States:** Cross-cycle (reads `ARCHIVED` cycles)

| Capability | Description |
|---|---|
| Trend analysis | Computes score trends across multiple cycles per vendor and category |
| Recurring issue detection | Identifies issues appearing in 2+ consecutive cycles |
| Cross-vendor comparison | Benchmarks vendors against each other across all 5 categories |
| Leadership brief | Generates executive-level summary suitable for VP/C-suite review |
| Issue tracking | Updates `issues` table with occurrence count and latest owner |

**Tools exposed to Claude:**
- `get_multi_cycle_scores` — historical score data across cycles
- `detect_recurring_issues` — identify persisting problems
- `get_cross_vendor_data` — aggregate data for comparison
- `generate_leadership_brief` — produce executive summary
- `update_issue_record` — track issue lifecycle

---

## 6. Service Layer

| Service | Responsibility |
|---|---|
| `LLMService` | Wraps Anthropic SDK; manages tool-calling loop, retries, token logging |
| `ValidationService` | Scorecard validation rules: range checks, duplicate detection, outlier flagging |
| `AnalyticsService` | Trend computation engine; recurring issue detection logic |
| `MockCalendarService` | Simulates calendar invite sending (returns mock confirmation) |
| `MockEmailService` | Simulates email delivery (returns mock message ID) |
| `MockFormService` | Simulates form link generation and submission collection |
| `MockNotificationService` | Simulates in-app and push notifications |

---

## 7. Data Model Overview

### 13 Database Tables

```
vendors                   ─ master vendor registry
governance_cycles         ─ one cycle per vendor per quarter
stakeholders              ─ all Shell and vendor personnel
cycle_attendees           ─ confirmed attendees per cycle
scorecards                ─ individual category scores (5 per stakeholder per cycle)
meetings                  ─ meeting records (INTERNAL_ALIGNMENT, VENDOR_PREP, EGB_QBR)
meeting_notes             ─ classified notes per meeting
action_items              ─ extracted actions from alignment/prep/meeting
issues                    ─ recurring issues tracked across cycles
face_off_model            ─ Shell ↔ Vendor attendee pairings
notifications             ─ log of all sent communications
slot_proposals            ─ ranked time slot options
agent_runs                ─ audit log of every AI agent execution
```

### Key Relationships

```
Vendor ──< GovernanceCycle ──< CycleAttendee >── Stakeholder
                           ──< Scorecard >── Stakeholder
                           ──< Meeting ──< MeetingNote
                                        ──< ActionItem
                           ──< SlotProposal
                           ──< Notification
                           ──< AgentRun
```

### Scorecard Categories

| Category | Description |
|---|---|
| `DELIVERY_QUALITY` | On-time, defect-free delivery |
| `SLA_COMPLIANCE` | Adherence to contractual SLAs |
| `INNOVATION` | New ideas and proactive improvements |
| `COMMUNICATION` | Responsiveness and transparency |
| `VALUE_FOR_MONEY` | Cost efficiency vs. market |

---

## 8. API Route Structure

| Router | Base Path | Modules / Agents |
|---|---|---|
| `cycles` | `/api/v1/cycles` | Cycle CRUD, workflow state management |
| `scheduling` | `/api/v1/cycles/{id}/scheduling` | Module A |
| `scorecard` | `/api/v1/cycles/{id}/scorecard` | Module B |
| `alignment` | `/api/v1/cycles/{id}/alignment` | Module C |
| `vendor_prep` | `/api/v1/cycles/{id}/vendor-prep` | Module D |
| `meeting` | `/api/v1/cycles/{id}/meeting` | Module E |
| `analytics` | `/api/v1/analytics` | Module F (cross-cycle) |

All routes return `AgentResponse[T]` — a generic wrapper with `status`, `summary`, `data`, `warnings`, `next_actions`, and `run_id`.

---

## 9. Cross-Cutting Concerns

### Observability

- Every agent execution is logged to `agent_runs` with: `agent_name`, `cycle_id`, `input_payload`, `output_payload`, `status`, `error_message`, `triggered_by`, and `created_at`
- `run_id` in every response links the HTTP response to the `agent_runs` record
- Python `logging` with structured format across all layers

### Error Handling

| Error Type | Response |
|---|---|
| Workflow violation | HTTP 409 Conflict |
| Agent failure | `AgentResponse.status = "failed"` with `error_message` |
| Validation failure | HTTP 422 Unprocessable Entity (Pydantic) |
| Not found | HTTP 404 with `ErrorResponse` |
| LLM error | Caught in `BaseAgent.run()`, logged, status = "failed" |

### Human-in-the-Loop

Actions that trigger external communications (emails, calendar invites) require explicit coordinator approval:
1. Agent sets `requires_approval = True` in `AgentResponse`
2. Frontend displays `ApprovalPanel` with preview content and recipient list
3. Coordinator approves → frontend calls approve endpoint → action is sent

---

## 10. Key Design Decisions

| Decision | Rationale |
|---|---|
| Async FastAPI + aiosqlite | Full async I/O prevents blocking on DB or LLM calls |
| Tool-calling pattern for all agents | Structured, observable reasoning — Claude decides which tools to use; we control what tools do |
| 12-state linear workflow | Prevents out-of-order operations; simplifies frontend tab locking |
| Repository pattern | Decouples DB access from business logic; enables easy test mocking |
| Mock external services | Enables full demo without real calendar/email infrastructure |
| SQLite for MVP | Zero-configuration, file-based DB sufficient for single-tenant demo; migrate to PostgreSQL for multi-tenant production |
| AgentRun audit table | Full traceability of every AI decision for debugging and compliance |
