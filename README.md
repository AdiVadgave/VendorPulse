# VendorPulse — MVP Development Plan

> **Agentic AI for Governance Cycle Automation**  
> Prepared by: Zensar Technologies | Sprint: 5 Working Days | Status: Draft

---

## Table of Contents

1.  [What We Are Building](#1-what-we-are-building)
2.  [Problem Statement](#2-problem-statement)
3.  [Tech Stack](#3-tech-stack)
4.  [Project Structure](#4-project-structure)
5.  [Data Model](#5-data-model)
6.  [Standard Agent Response Contract](#6-standard-agent-response-contract)
7.  [Workflow Engine — State Machine](#7-workflow-engine--state-machine)
8.  [Mock Services Layer](#8-mock-services-layer)
9.  [Claude API Agent Pattern](#9-claude-api-agent-pattern)
10.  [Module Plans (A–F)](#10-module-plans-af)
     -   [Module A — Meeting Scheduling](#module-a--meeting-scheduling--coordination)
     -   [Module B — Scorecard Collection](#module-b--scorecard-collection--validation)
     -   [Module C — Internal Alignment](#module-c--internal-alignment-call-support)
     -   [Module D — Vendor Prep](#module-d--vendor-prep-call-support)
     -   [Module E — Live Meeting Support](#module-e--egbqbr-live-meeting-support)
     -   [Module F — Analytics Dashboard](#module-f--cross-cycle-memory--analytics-dashboard)
11.  [Frontend Architecture](#11-frontend-architecture)
12.  [Key API Endpoints](#12-key-api-endpoints)
13.  [Seed Data Strategy](#13-seed-data-strategy)
14.  [Build Sequence — 5-Day Sprint](#14-build-sequence--5-day-sprint)
15.  [Demo Flow — 8-Step Narrative](#15-demo-flow--8-step-narrative)
16.  [Key Design Decisions](#16-key-design-decisions)
17.  [Non-Functional Requirements](#17-non-functional-requirements)
18.  [Risks & Mitigations](#18-risks--mitigations)
19.  [User Personas](#19-user-personas)
20.  [Glossary](#20-glossary)

---

## 1. What We Are Building

VendorPulse is **not a chatbot**. It is a four-layer system:

Layer

Description

Workflow Orchestrator

Moves a governance cycle through defined, enforced stages

Document Intelligence

Generates briefs, minutes, and responses using Claude AI

Governance Memory

Stores and analyses historical data across cycles

Human-Approved Automation

AI suggests every action — humans approve before anything is sent

The product automates Shell's **EGB (Executive Governance Board)** and **QBR (Quarterly Business Review)** governance cycles end-to-end: from scheduling through post-meeting analytics.

---

## 2. Problem Statement

#

Pain Point

Observed Impact

1

High administrative overhead scheduling multi-stakeholder meetings

3–5 hrs per cycle per coordinator

2

Manual consolidation and validation of scorecard inputs

Error-prone, delayed reporting

3

Frequent manual reminders to stakeholders and vendors

Chase email fatigue

4

Vendor pushback requires multiple back-and-forth cycles

Governance delays

5

Limited cross-cycle memory on trends and prior agreements

Missed escalation opportunities

6

Preparation work outweighs value-driven governance work

Strategic capacity lost

### Scope

Module

Name

v1.0

A

Meeting Scheduling & Coordination Agent

In Scope

B

Scorecard Input Collection & Validation Agent

In Scope

C

Internal Alignment Call Support Agent

In Scope

D

Vendor Prep Call Support Agent

In Scope

E

EGB/QBR Live Meeting Support Agent

In Scope

F

Cross-Cycle Memory & Trend Analysis Dashboard

In Scope

—

Contract Management Automation (Section B)

Phase 2

—

Real calendar / email integration

Phase 2 (Mock in v1.0)

—

PPT / slide auto-population

Out of Scope

---

## 3. Tech Stack

Layer

Technology

Purpose

Frontend Framework

React 18 + Vite

SPA with fast HMR dev experience

UI Styling

Tailwind CSS + shadcn/ui

Utility-first + accessible component primitives

Charts

Recharts

Line, Radar, Bar charts for Module F

Forms

React Hook Form + Zod

Typed client-side validation

Client State

Zustand

Lightweight global store (cycle, approvals)

Server State

TanStack Query v5

Caching, background refetch, loading states

Backend

FastAPI (Python 3.11+)

Async REST API with automatic OpenAPI docs

ORM

SQLAlchemy 2.0 (async)

Typed DB access, easy migration to Postgres

Database

SQLite

Zero-config, demo-reset friendly

Migrations

Alembic

Version-controlled schema changes

Request/Response Validation

Pydantic v2

Schema enforcement

AI Engine

Anthropic Claude API

Tool-calling pattern per agent module

Mock Services

In-process Python classes

Calendar, Email, Forms, Notifications

---

## 4. Project Structure

```
vendorpulse/├── frontend/│   └── src/│       ├── components/│       │   ├── ui/                   # shadcn/ui primitives│       │   ├── modules/│       │   │   ├── scheduling/│       │   │   ├── scorecard/│       │   │   ├── alignment/│       │   │   ├── vendor-prep/│       │   │   ├── meeting/│       │   │   └── analytics/│       │   └── shared/│       │       ├── ApprovalPanel.tsx│       │       ├── ActionLog.tsx│       │       ├── AgentStatusBadge.tsx│       │       └── WorkflowProgressBar.tsx│       ├── pages/│       │   ├── Dashboard.tsx│       │   ├── CycleDetail.tsx       # main tabbed workspace per cycle│       │   └── Analytics.tsx│       ├── api/                      # typed fetch wrappers per module│       ├── store/                    # Zustand stores│       ├── hooks/                    # custom React hooks per module│       └── types/                    # TypeScript types matching backend schemas│├── backend/│   └── app/│       ├── main.py│       ├── api/routes/│       │   ├── cycles.py│       │   ├── scheduling.py│       │   ├── scorecard.py│       │   ├── alignment.py│       │   ├── vendor_prep.py│       │   ├── meeting.py│       │   └── analytics.py│       ├── core/│       │   ├── config.py│       │   ├── database.py│       │   └── workflow_engine.py    # state machine│       ├── agents/│       │   ├── base_agent.py         # shared tool-calling pattern│       │   ├── scheduling_agent.py│       │   ├── scorecard_agent.py│       │   ├── alignment_agent.py│       │   ├── vendor_prep_agent.py│       │   ├── meeting_agent.py│       │   └── memory_agent.py│       ├── services/│       │   ├── mock/│       │   │   ├── mock_calendar.py│       │   │   ├── mock_email.py│       │   │   ├── mock_forms.py│       │   │   └── mock_notifications.py│       │   ├── llm_service.py        # Claude API wrapper│       │   ├── validation_service.py│       │   └── analytics_service.py│       ├── models/                   # SQLAlchemy ORM models│       ├── schemas/                  # Pydantic schemas│       ├── repositories/             # DB access layer│       └── utils/│           ├── prompts.py            # all LLM prompt templates│           ├── slot_ranking.py       # deterministic slot ranker│           ├── score_diff.py         # cycle comparison engine│           └── text_parsing.py       # action item extractor│├── seed/│   └── seed_data.py├── alembic/└── tests/
```

---

## 5. Data Model

All 13 tables. Every entity is tied to a **Governance Cycle** as the central organising concept.

Table

Key Columns

Notes

`vendors`

vendor_id, name, category, status

Seed: NovaTech, CoreSystems, Meridian IT

`governance_cycles`

cycle_id, vendor_id, quarter, year, **workflow_state**

`workflow_state` drives the entire product flow

`stakeholders`

stakeholder_id, name, email, **role**, organisation

Roles: VMO_COORDINATOR, INTERNAL_LEAD, VENDOR_MANAGER, EGB_CHAIR, TECHNICAL_LEAD, COMMERCIAL_LEAD

`cycle_attendees`

cycle_id, stakeholder_id, **is_key**, invite_status, replacement_*

`is_key=true` for organiser & exec sponsor (hard constraint in slot ranking)

`scorecards`

cycle_id, stakeholder_id, **category**, score(1–5), comment, is_valid, validation_flags

Categories: DELIVERY_QUALITY, SLA_COMPLIANCE, INNOVATION, COMMUNICATION, VALUE_FOR_MONEY

`meetings`

meeting_id, cycle_id, **meeting_type**, scheduled_time

Types: INTERNAL_ALIGNMENT, VENDOR_PREP, EGB_QBR

`meeting_notes`

note_id, meeting_id, **note_type**, content, raised_by_role, timestamp

Types: QUESTION, OBJECTION, DECISION, APPRECIATION, ACTION

`action_items`

action_id, cycle_id, **source_module**, description, owner, due_date, status

Merged in unified action log across modules C, D, E

`issues`

issue_id, vendor_id, description, **occurrences**, status

`occurrences >= 2` triggers recurring issue alert

`face_off_model`

cycle_id, position_number, shell_name, shell_role, vendor_name, vendor_role

Updated via inline form in Modules C and D

`notifications`

cycle_id, stakeholder_id, **type**, content, sent_at, status

Types: SCORECARD_REQUEST, REMINDER_1, REMINDER_2, ESCALATION, INVITE

`slot_proposals`

cycle_id, proposed_time, organiser_available, exec_sponsor_available, **rank_score**, is_approved

Rank score is deterministic — no LLM

`agent_runs`

agent_name, cycle_id, input_payload, output_payload, **status**, error_message

Every agent action logged here — critical for traceability

---

## 6. Standard Agent Response Contract

Every agent returns this exact shape. The frontend **never parses raw AI text**.

```json
{  "status":            "success | failed | partial | pending_approval",  "agent":             "scheduling_agent",  "summary":           "Attendee refresh form generated for 9 stakeholders.",  "data":              {},  "warnings":          ["3 stakeholders have not responded"],  "next_actions":      ["APPROVE_INVITE", "SEND_REMINDER"],  "requires_approval": true,  "run_id":            "uuid"}
```

> **Why this matters:**  
> The UI never guesses the response shape. `requires_approval` drives approval panels.  
> `warnings` surface without blocking. `next_actions` auto-highlights the next button.  
> `run_id` links back to `agent_runs` for full traceability.

---

## 7. Workflow Engine — State Machine

The `workflow_state` on each cycle only moves **forward** and only when prerequisites are met.  
This is **pure deterministic logic** — no LLM involvement.

```
CYCLE_CREATED    → ATTENDEE_REFRESH_SENT       trigger: organiser approves refresh form dispatch    → AVAILABILITY_COLLECTED      trigger: all key attendees responded    → MEETING_SCHEDULED           trigger: organiser approves a slot    → SCORECARD_REQUEST_SENT      trigger: organiser approves scorecard dispatch    → SCORECARD_COLLECTION        trigger: at least 1 submission received    → SCORECARD_COMPILED          trigger: deadline passed OR manual compile    → INTERNAL_ALIGNMENT          trigger: scorecard compiled    → VENDOR_PREP                 trigger: alignment notes saved    → MEETING_IN_PROGRESS         trigger: facilitator clicks "Start Meeting"    → POST_MEETING_COMPLETE       trigger: minutes approved    → ARCHIVED                    trigger: manual — all open actions closed
```

### Enforcement Rules

-   Cannot send vendor brief before scorecard is compiled
-   Cannot generate meeting minutes before meeting notes exist
-   Cannot move to ARCHIVED without at least one approved action item log
-   Cannot compile scorecard before at least 2 valid submissions are received

---

## 8. Mock Services Layer

All four services implement a **clean interface** so they can be swapped for real Outlook/Teams integrations later without rewriting any agent code.

Service

Key Method

What It Does in Demo

`MockCalendarService`

`get_availability(stakeholder_ids, date_range)`

Returns fixture availability from seeded schedule data — no external calls

`MockEmailService`

`send(to, subject, body)`

Stores emails to `mock_outbox` table; returns HTML preview for approval panel

`MockFormService`

`create_form(type, fields, recipients)`

Opens form as in-app modal; simulates responses via seed data + "Simulate Responses" button

`MockNotificationService`

`send_reminder(stakeholder_id, level)`

Writes to `notifications` table; rendered in UI with escalating tone labels

---

## 9. Claude API Agent Pattern

### What Uses Claude (LLM)

-   Generating vendor brief narrative from scorecard data
-   Drafting 2–3 pushback response options (factual / neutral / escalation)
-   Extracting structured action items from pasted meeting notes
-   Generating meeting minutes from captured note items
-   Generating leadership briefing card insights
-   Writing the "What Changed" summary in Module C

### What Is Deterministic (No LLM)

-   Slot ranking algorithm — hard/soft constraint scoring
-   Score validation — range check, comment requirement rule
-   Outlier detection — standard deviation calculation
-   Score averaging and scorecard compilation
-   Cycle-to-cycle score diff (simple delta)
-   Alignment flag detection — spread ≥ 1.5 threshold
-   Recurring issue detection — count query on `issues` table
-   Workflow state transitions

> **Design Principle:** Deterministic logic first, AI second.  
> This keeps the system explainable to a Shell executive audience and avoids hallucination in critical governance paths.

### Slot Ranking Algorithm (Module A)

Factor

Type

Rule

Organiser available

Hard constraint

Slot invalid if organiser blocked

Exec sponsor available

Hard constraint

Slot invalid if exec sponsor blocked

Max group attendance

Soft score

`(confirmed / total) × 100`

Conflict count

Penalty

`−10` per non-key attendee conflict

Timezone suitability

Bonus

`+5` if within 09:00–17:00 local for all key stakeholders

### Scorecard Validation Rules (Module B)

Rule

Type

Action

`score < 1 or score > 5`

ERROR

Reject — out of range

`score = 1 or 5, no comment`

ERROR

Reject — comment required

`|score − group avg| > 1.5σ`

WARNING

Flag as outlier in compiled view

Required category missing

ERROR

Reject — required field empty

---

## 10. Module Plans (A–F)

---

### Module A — Meeting Scheduling & Coordination

**Goal:** Go from a blank cycle to a confirmed meeting invite with tracked RSVPs.

**Steps:**

1.  "Start New Cycle" → creates cycle record → `CYCLE_CREATED` state
2.  System loads attendees from previous cycle
3.  Scheduling agent generates attendee refresh form (rendered as in-app modal)
4.  User reviews and dispatches → state → `ATTENDEE_REFRESH_SENT`
5.  "Simulate Responses" button populates mock responses from seed data
6.  Attendee list updated — new names added, old ones replaced
7.  `MockCalendarService` returns fixture availability for all confirmed attendees
8.  Deterministic slot ranker runs → top 3 ranked slots with attendance breakdown
9.  Organiser clicks "Approve This Slot" → invite draft generated
10.  Approval panel shows email preview → "Send Invite" → `MockEmailService`
11.  Confirmation tracker shows ACCEPTED / DECLINED / PENDING per attendee
12.  Auto-nudge message generated for non-responders

**UI Components:**

Component

Purpose

`AttendeeRefreshPanel`

Current list, refresh form, response status

`SlotRankingPanel`

Three slot cards with attendance breakdown

`InviteApprovalPanel`

Email preview + approve / reject

`ConfirmationTracker`

Live RSVP table per attendee

---

### Module B — Scorecard Collection & Validation

**Goal:** Collect, validate, flag outliers, and compile a final scorecard.

**Steps:**

1.  Triggered after meeting scheduled (can run in parallel)
2.  Scorecard request form generated — 5 categories, 1–5 scale, comment field
3.  Dispatch approval panel → `MockEmailService` sends to all stakeholders
4.  Reminder schedule runs automatically (visible in Notifications panel):
    -   T−5 days → informational tone
    -   T−2 days → deadline notice
    -   T−day → escalation flag to organiser
5.  Each submission goes through deterministic validation service
6.  Invalid submissions trigger inline correction request to submitter
7.  Status panel shows per-stakeholder submission progress
8.  "Compile Scorecard" → final table with averages + outlier flags → `SCORECARD_COMPILED`

**UI Components:**

Component

Purpose

`ScorecardDispatchPanel`

Approval gate for sending scorecard requests

`SubmissionTracker`

Per-stakeholder status table with reminder history

`CompiledScorecardTable`

Final table with outlier badges and averages row

---

### Module C — Internal Alignment Call Support

**Goal:** Prepare the internal team by surfacing what changed and capturing actions.

**Steps:**

1.  Triggered after scorecard compiled
2.  Deterministic score diff engine: delta ≥ 1 point per category → highlighted
3.  Alignment flag engine: spread ≥ 1.5 points between stakeholders → prompt question
4.  Claude generates 3–5 bullet "What Changed" summary from diff data
5.  Face-off model panel — inline editable Shell/Vendor role-name grid
6.  Coordinator pastes meeting notes into text area
7.  Claude extracts structured action items: description, owner, due date
8.  Action items added to action log with `status = OPEN`

**UI Components:**

Component

Purpose

`ChangeHighlightsPanel`

Bullet list of score deltas and new issues vs prior cycle

`AlignmentFlagsPanel`

Divergence flags with prompt questions for team

`FaceOffModelEditor`

Numbered grid, inline editable

`NotesInputPanel`

Paste area + "Extract Actions" button

`ActionLog` (shared)

Table with module filter, status badges, owner, due date

---

### Module D — Vendor Prep Call Support

**Goal:** Equip the Shell team with a vendor brief and structured pushback handling.

**Steps:**

1.  Triggered after internal alignment complete
2.  Claude generates vendor brief via tool calls (scorecard, comments, prior cycle, open actions)
3.  Brief: Overall Score · Category Ratings + Rationale · Key Concerns · Positive Areas
4.  Brief shown in approval panel — human reviews before vendor sees it
5.  Vendor objection form: free text + category selector
    -   Categories: `DATA_DISPUTE` / `PROCESS_CONCERN` / `RESOURCE_CONSTRAINT` / `SCOPE_DISAGREEMENT` / `OTHER`
6.  Claude drafts 3 response options per pushback:
    -   Factual stance (data-backed)
    -   Neutral collaborative stance
    -   Firm escalation stance
7.  Items requiring legal/commercial review are flagged — excluded from AI drafts
8.  Unresolved items stored in `issues` table with `status = OPEN`

**UI Components:**

Component

Purpose

`VendorBriefPanel`

Structured brief card with approve button

`PushbackInput`

Form to add objections with category selector

`PushbackResponseCards`

Three option cards with select / edit per option

`UnresolvedItemTracker`

Table with status badges, raised-by, date

---

### Module E — EGB/QBR Live Meeting Support

**Goal:** Real-time capture during the meeting + automatic post-meeting artefact generation.

**Steps:**

1.  At meeting start, trend briefing card shown (from Module F analytics engine)
2.  Live capture panel — facilitator logs per item type:
    -   `QUESTION` (+ who raised it)
    -   `OBJECTION` (+ category)
    -   `DECISION`
    -   `APPRECIATION`
    -   `ACTION`
3.  Each item timestamped
4.  Alternate mode: paste full transcript → Claude parses into structured items
5.  "Generate Minutes" → Claude produces:
    -   Meeting metadata (date, attendees, cycle ref)
    -   Executive summary (2–3 sentences)
    -   Agenda summaries
    -   Key decisions list
    -   Q&A and objection log
    -   Extracted action items
6.  Minutes shown in approval panel
7.  On approval, action items merged with open items from Modules C and D
8.  Minutes available for copy-to-clipboard export

**UI Components:**

Component

Purpose

`MeetingBriefingCard`

Pre-meeting trend summary — most improved, most concerning

`LiveCapturePanel`

Type-selector + text input + timestamped running feed

`TranscriptInput`

Paste-and-parse alternate mode

`MeetingMinutesViewer`

Structured minutes display + copy button

`ActionLog` (shared)

Final merged action log

---

### Module F — Cross-Cycle Memory & Analytics Dashboard

**Goal:** Persistent institutional memory, trend charts, recurring issue detection, leadership briefs.

**Steps:**

1.  All historical cycles auto-stored — 4 pre-seeded + new cycles
2.  Trend chart: per-vendor per-category line chart over cycles (`Recharts LineChart`)
3.  Radar chart: current vs previous cycle health (`Recharts RadarChart`)
4.  Cross-vendor bar chart: current cycle side-by-side (`Recharts BarChart`)
5.  Recurring issue detection (deterministic): `occurrences >= 2 AND status = OPEN`
    -   Alert: *"Delivery Quality flagged for 3 consecutive cycles — CoreSystems Ltd"*
6.  Claude generates leadership briefing card:
    -   Vendor trajectory (improving / stable / declining)
    -   Unresolved recurring issues
    -   Prior commitments requiring follow-up
    -   Recommended focus areas

**UI Components:**

Component

Purpose

`TrendLineChart`

Per-vendor per-category scores over cycles

`RadarChart`

Current vs prior cycle overall vendor health

`CrossVendorComparison`

Bar chart — current cycle all vendors

`RecurringIssueAlerts`

Alert cards with occurrence count and first-seen date

`LeadershipBriefCard`

4-section card with "Generate" button (Claude-powered)

---

## 11. Frontend Architecture

### Page Structure

Route

Page

Content

`/`

Dashboard

Active cycles · Start New Cycle CTA · Recent agent runs · Vendor quick-access

`/cycles/:cycleId`

Cycle Workspace

Tabbed layout with all modules

`/analytics`

Analytics Dashboard

Module F — charts, vendor selector, leadership brief

### Cycle Workspace Tabs

Tab

Shows

Overview

Workflow progress bar · Summary cards · Last agent run

Scheduling

Module A — full scheduling workflow

Scorecard

Module B — collection, validation, compilation

Alignment

Module C — change highlights, flags, face-off, actions

Vendor Prep

Module D — brief, pushback, responses, unresolved

Meeting

Module E — live capture, minutes, merged actions

Actions

Unified action log filtered across all modules for this cycle

### Shared UI Patterns

**Approval Panel** — used before every "send" action:

```
┌──────────────────────────────────────────────────────┐│  Agent summary:  Attendee refresh form ready         ││  Preview:        [email / form content rendered]     ││  Recipients:     Alex (alex@zensar.com), Priya, Marcus││  [Approve & Send]         [Edit]         [Cancel]    │└──────────────────────────────────────────────────────┘
```

**Workflow Progress Bar** — always visible in the cycle workspace:

```
[Scheduling ✓] → [Scorecard ✓] → [Alignment ●] → [Vendor Prep] → [Meeting] → [Complete]
```

**Agent Status Badge** — on every module tab:`IDLE` · `RUNNING` · `AWAITING_APPROVAL` · `COMPLETE` · `FAILED`

---

## 12. Key API Endpoints

Method

Path

Purpose

`POST`

`/api/cycles`

Create new governance cycle

`GET`

`/api/cycles`

List all cycles with workflow state

`GET`

`/api/cycles/{id}`

Cycle detail + current workflow state

`POST`

`/api/cycles/{id}/scheduling/start`

Trigger attendee refresh (Module A)

`POST`

`/api/cycles/{id}/scheduling/simulate-responses`

Demo: simulate attendee responses

`GET`

`/api/cycles/{id}/scheduling/slots`

Get ranked slot proposals

`POST`

`/api/cycles/{id}/scheduling/approve-slot`

Approve a slot → triggers invite draft

`POST`

`/api/cycles/{id}/scorecard/send-request`

Dispatch scorecard forms to stakeholders

`POST`

`/api/cycles/{id}/scorecard/submit`

Submit a score (mock form submission)

`POST`

`/api/cycles/{id}/scorecard/compile`

Compile final scorecard

`GET`

`/api/cycles/{id}/scorecard/compiled`

Get compiled scorecard with averages + flags

`GET`

`/api/cycles/{id}/alignment/changes`

Score diffs vs prior cycle

`GET`

`/api/cycles/{id}/alignment/flags`

Alignment divergence flags

`POST`

`/api/cycles/{id}/alignment/extract-actions`

Claude extracts actions from pasted notes

`POST`

`/api/cycles/{id}/vendor-prep/generate-brief`

Claude generates vendor brief

`POST`

`/api/cycles/{id}/vendor-prep/pushback`

Add pushback / objection item

`GET`

`/api/cycles/{id}/vendor-prep/pushback/{pid}/responses`

Get Claude-drafted response options

`POST`

`/api/cycles/{id}/meeting/capture`

Add live meeting note

`POST`

`/api/cycles/{id}/meeting/generate-minutes`

Claude generates meeting minutes

`GET`

`/api/cycles/{id}/meeting/minutes`

Get minutes for approval

`GET`

`/api/analytics/vendors/{vid}/trends`

Score trends over 4 cycles per category

`GET`

`/api/analytics/recurring-issues`

All recurring issue alerts across vendors

`POST`

`/api/analytics/cycles/{id}/leadership-brief`

Claude generates leadership briefing card

`GET`

`/api/agent-runs`

Full agent execution log (traceability)

---

## 13. Seed Data Strategy

The seed data tells a **deliberate story** — analytics only work if data has intentional trajectories.

### Vendor Score Trajectories (Q1 → Q2 → Q3 → Q4)

Category

NovaTech *(Improving)*

CoreSystems *(Declining)*

Meridian IT *(Stable)*

Delivery Quality

3 → 3 → 4 → 4

4 → 3 → 3 → 2

3 → 3 → 3 → 3

SLA Compliance

2 → 3 → 3 → 4

3 → 3 → 2 → 2

4 → 4 → 3 → 4

Innovation

3 → 3 → 4 → 5

3 → 2 → 2 → 2

3 → 3 → 3 → 3

Communication

3 → 4 → 4 → 4

4 → 3 → 3 → 2

3 → 3 → 4 → 3

Value for Money

3 → 3 → 3 → 4

4 → 4 → 3 → 3

3 → 3 → 3 → 3

### Pre-Seeded Recurring Issues

Vendor

Issue

Flagged In

Status

CoreSystems Ltd

Delivery Quality consistently below SLA threshold

Q2, Q3, Q4

OPEN

CoreSystems Ltd

Delayed invoice submissions

Q3, Q4

OPEN

NovaTech Services

Innovation KPIs not aligned to contract commitments

Q2, Q3

RESOLVED (Q4)

### Other Seed Requirements

-   8–10 stakeholders across Shell VMO, IDT Operations, and vendor teams
-   4 historical EGB cycles (Q1–Q4 previous year) with realistic score variations
-   Pre-seeded action items — mix of OPEN and CLOSED — across historical cycles
-   At least 2 pre-seeded objection items per vendor for the pushback demo
-   Face-off model seeded with 6 Shell roles and 4 vendor roles per cycle

---

## 14. Build Sequence — 5-Day Sprint

### Day 1 — Foundation

-   Project scaffolding (Vite + FastAPI + SQLite)
-   Database setup — all 13 tables via Alembic migrations
-   Seed data script — 4 cycles, 3 vendors, realistic scores
-   Workflow engine — state machine class with enforcement rules
-   Base agent pattern + `agent_runs` logging
-   Mock services — calendar, email, forms, notifications
-   Standard `AgentResponse` Pydantic schema (API contract)
-   Frontend: routing, layout shell, Tailwind config, shadcn/ui setup

### Day 2 — Module A + B (Scheduling + Scorecard)

-   Scheduling agent — attendee refresh, slot ranking (deterministic), invite draft
-   Scheduling UI — `AttendeeRefreshPanel`, `SlotRankingPanel`, `InviteApprovalPanel`, `ConfirmationTracker`
-   "Simulate Responses" demo button for Module A
-   Validation service — deterministic rules only (no LLM)
-   Scorecard agent — compilation, averaging
-   Scorecard UI — `DispatchPanel`, `SubmissionTracker`, `CompiledScorecardTable`
-   "Simulate Submissions" demo button for Module B

### Day 3 — Module C + D (Alignment + Vendor Prep)

-   Score diff engine — deterministic comparison (`score_diff.py`)
-   Alignment flag engine — deterministic spread check
-   Claude integration — action item extraction from notes (Module C)
-   Claude integration — vendor brief generation (Module D)
-   Claude integration — pushback response drafting (3 options) (Module D)
-   Alignment UI — `ChangeHighlights`, `AlignmentFlags`, `FaceOffModelEditor`, `NotesInput`
-   Vendor Prep UI — `VendorBriefPanel`, `PushbackInput`, `ResponseCards`, `UnresolvedTracker`
-   Shared `ActionLog` component

### Day 4 — Module E + F (Meeting + Analytics)

-   Live capture panel with all 5 note types
-   Transcript paste + Claude parsing mode
-   Claude meeting minutes generation
-   Trend charts — Recharts `LineChart`, `RadarChart`, `BarChart`
-   Recurring issue detection — deterministic DB query
-   Claude leadership brief generation
-   Meeting UI — `BriefingCard`, `LiveCapturePanel`, `TranscriptInput`, `MinutesViewer`
-   Analytics page — 3 chart types, `RecurringIssueAlerts`, `LeadershipBriefCard`

### Day 5 — Integration + Demo Hardening

-   End-to-end workflow state machine wiring — all 6 modules connected
-   8-step demo narrative walkthrough — test and fix
-   Approval panels verified for all send actions
-   Agent execution trace log page
-   Error handling — LLM retry, graceful fallback text, empty states
-   Demo data review — story reads correctly across all vendors
-   Performance check — all responses < 5 seconds
-   Deploy to public URL (FastAPI → Render/Fly.io · React → Vercel)

---

## 15. Demo Flow — 8-Step Narrative

> Every step is triggerable by a single button/action. No manual data entry during the 30-minute demo.

Step

Module

Trigger

What Is Shown

1

A

"Start New Cycle" button

Attendee refresh form dispatched — 9 stakeholders notified

2

A

"Simulate Responses" button

Agent ranks top 3 slots with attendance breakdown — organiser approves

3

B

"Send Scorecard Request"

Dispatch approval panel + full 3-tier reminder schedule visible

4

B

"Simulate Submissions"

Outlier flagged in compiled scorecard — averages calculated

5

C

Auto-triggered on compile

Change highlights vs prior cycle — one alignment flag raised

6

D

"Generate Vendor Brief"

Brief generated → pushback entered → 3 response drafts shown

7

E

"Start Meeting" button

Notes captured → minutes auto-generated → merged action log

8

F

Navigate to Analytics

Recurring issue alert fires → leadership brief card generated

---

## 16. Key Design Decisions

Decision

Rationale

SQLite over Postgres

Zero-config, file-based, demo-reset friendly. Schema is Postgres-compatible for production.

Tool-calling agents over prompt-only

Better control, lower hallucination, easier debugging, more production-like.

Deterministic logic for validation and ranking

Explainable to a Shell executive audience. No AI black-box in critical governance paths.

Mock services behind clean interfaces

Swap to Outlook/Teams/SharePoint API later without rewriting any agent code.

Single JSON contract (AgentResponse)

Frontend never guesses shape. Stable even as AI outputs evolve. Enables reliable approval flows.

Human approval before every "send" action

Builds client trust. Legally important for governance context. AI assists, humans decide — always.

Workflow state machine

Prevents impossible combinations — cannot generate minutes without notes, cannot compile without submissions.

Seed data tells a story

Analytics only work if data has deliberate trajectories and recurring issues. Filler data breaks the demo narrative.

Zustand + TanStack Query

Zustand for UI state (active cycle, modals). TanStack Query for server state with automatic background refresh.

Recharts for visualisation

Tailwind-compatible, lightweight, supports all 3 required chart types (Line, Radar, Bar).

---

## 17. Non-Functional Requirements

Category

Requirement

Performance

All agent responses render within 5 seconds in demo environment

Reliability

Demo flows must be reproducible with no manual resets required between runs

Mock data fidelity

All demo data uses realistic energy-sector vendor names, categories, and scores

LLM output quality

All LLM-generated outputs reviewed and locked before demo day

Accessibility

UI must be usable on a standard laptop browser at 1280×800 resolution

Portability

Deployed on a single public URL accessible without VPN

---

## 18. Risks & Mitigations

Risk

Mitigation

LLM hallucination in generated minutes or briefs

All LLM outputs pre-reviewed and locked to a fixed demo transcript; live generation used for non-critical fields only

Demo data feels unrealistic

Seed data reviewed by architect and domain-aware team member before Day 4

Integration complexity between modules

All modules share a single JSON contract; orchestration layer enforces schema

Scope creep from team

Architect holds scope freeze after Day 1; any new feature goes into backlog, not the sprint

---

## 19. User Personas

Persona

Role

Primary Modules

Alex — VMO Coordinator

Manages scheduling, reminders, scorecard chasing

A, B

Priya — Internal Lead

Prepares internal alignment, reviews vendor scores

C, F

Marcus — Vendor Manager

Manages vendor pre-call, drafts pushback responses

D

Sandra — EGB Chair

Runs live governance meetings, reviews minutes

E, F

---

## 20. Glossary

Term

Definition

EGB

Executive Governance Board — Shell's senior vendor governance forum

QBR

Quarterly Business Review — operational vendor performance review cycle

VMO

Vendor Management Office — Shell team responsible for vendor governance

IDT

Information & Digital Technology — Shell's IT function

Face-off model

Structured table mapping Shell and vendor roles/names to governance responsibilities

Cross-cycle memory

Persistent storage of historical scorecard data, actions, and decisions across cycles

Agentic AI

An AI system that takes multi-step actions using tools and memory to complete a goal, with human oversight checkpoints

Workflow state

The current stage of a governance cycle in the state machine — drives which modules are active

Tool-calling

Claude API pattern where the LLM decides which Python functions to call rather than generating raw text answers

---

*VendorPulse MVP Development Plan v2.0 — Zensar Technologies — 2026-04-01*