# VendorPulse — Backend Low-Level Design (LLD)

> **Version:** 1.0 | **Stack:** FastAPI + SQLAlchemy + SQLite + Anthropic Claude API  
> **Scope:** Complete backend architecture for VendorPulse MVP

---

## Table of Contents

1. [Technology Stack & Dependencies](#1-technology-stack--dependencies)
2. [Application Architecture](#2-application-architecture)
3. [Folder Structure (Detailed)](#3-folder-structure-detailed)
4. [Database Schema](#4-database-schema)
5. [SQLAlchemy ORM Models](#5-sqlalchemy-orm-models)
6. [Pydantic Schemas](#6-pydantic-schemas)
7. [Workflow Engine](#7-workflow-engine)
8. [Base Agent Pattern](#8-base-agent-pattern)
9. [Agent Implementations (A–F)](#9-agent-implementations-af)
10. [Service Layer](#10-service-layer)
11. [Mock Services](#11-mock-services)
12. [LLM Service (Claude API)](#12-llm-service-claude-api)
13. [Validation Service](#13-validation-service)
14. [Analytics Service](#14-analytics-service)
15. [Repository Pattern](#15-repository-pattern)
16. [API Routes (Detailed)](#16-api-routes-detailed)
17. [Utilities](#17-utilities)
18. [Seed Data](#18-seed-data)
19. [Error Handling](#19-error-handling)
20. [Logging & Traceability](#20-logging--traceability)
21. [Testing Strategy](#21-testing-strategy)
22. [Environment & Deployment](#22-environment--deployment)

---

## 1. Technology Stack & Dependencies

### Core

| Package | Version | Purpose |
|---|---|---|
| `fastapi` | 0.111.x | Async REST framework + auto OpenAPI |
| `uvicorn[standard]` | 0.30.x | ASGI server |
| `python` | 3.11+ | Runtime |

### Database

| Package | Version | Purpose |
|---|---|---|
| `sqlalchemy` | 2.0.x | Async ORM |
| `aiosqlite` | 0.20.x | Async SQLite driver |
| `alembic` | 1.13.x | DB migrations |

### Validation & Serialisation

| Package | Version | Purpose |
|---|---|---|
| `pydantic` | 2.x | Request/response schemas |
| `pydantic-settings` | 2.x | Environment variable management |

### AI

| Package | Version | Purpose |
|---|---|---|
| `anthropic` | 0.28.x | Claude API SDK (tool-calling) |

### Utilities

| Package | Version | Purpose |
|---|---|---|
| `python-dotenv` | latest | Load `.env` file |
| `httpx` | 0.27.x | Async HTTP client (for mock services) |
| `python-multipart` | latest | Form data support |
| `pytest` | 8.x | Testing framework |
| `pytest-asyncio` | latest | Async test support |
| `pytest-cov` | latest | Coverage reporting |
| `faker` | latest | Realistic seed data generation |

---

## 2. Application Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         FastAPI App                            │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    API Routes Layer                      │  │
│  │  cycles · scheduling · scorecard · alignment ·           │  │
│  │  vendor_prep · meeting · analytics                       │  │
│  └──────────────────────────┬───────────────────────────────┘  │
│                             │                                  │
│  ┌──────────────────────────▼───────────────────────────────┐  │
│  │                 Orchestration Layer                      │  │
│  │                                                          │  │
│  │  ┌────────────────────┐   ┌────────────────────────────┐ │  │
│  │  │  Workflow Engine   │   │   Agent Modules (A–F)      │ │  │
│  │  │  (state machine)   │   │   tool-calling pattern     │ │  │
│  │  └────────────────────┘   └────────────────────────────┘ │  │
│  └──────────────────────────┬───────────────────────────────┘  │
│                             │                                  │
│  ┌──────────────────────────▼───────────────────────────────┐  │
│  │                   Service Layer                          │  │
│  │  LLM · Validation · Analytics · Mock Services           │  │
│  └──────────────────────────┬───────────────────────────────┘  │
│                             │                                  │
│  ┌──────────────────────────▼───────────────────────────────┐  │
│  │                  Data Access Layer                       │  │
│  │  Repositories → SQLAlchemy (async) → SQLite             │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### Request Lifecycle

```
HTTP Request
    → FastAPI Router
    → Dependency Injection (DB session)
    → Route handler
    → Workflow Engine (validate state transition)
    → Agent / Service
    → Repository (DB read/write)
    → LLM Service (if needed — Claude API)
    → Log to agent_runs
    → Return AgentResponse
    → FastAPI serialises via Pydantic schema
    → HTTP Response
```

---

## 3. Folder Structure (Detailed)

```
backend/
├── app/
│   ├── main.py                       # FastAPI app creation, router registration, CORS
│   │
│   ├── api/
│   │   ├── deps.py                   # shared dependencies (get_db, get_current_cycle, etc.)
│   │   └── routes/
│   │       ├── cycles.py             # cycle CRUD + workflow state
│   │       ├── scheduling.py         # Module A endpoints
│   │       ├── scorecard.py          # Module B endpoints
│   │       ├── alignment.py          # Module C endpoints
│   │       ├── vendor_prep.py        # Module D endpoints
│   │       ├── meeting.py            # Module E endpoints
│   │       └── analytics.py          # Module F endpoints
│   │
│   ├── core/
│   │   ├── config.py                 # Settings via pydantic-settings
│   │   ├── database.py               # async engine, session factory, Base
│   │   └── workflow_engine.py        # WorkflowEngine class + state machine
│   │
│   ├── agents/
│   │   ├── base_agent.py             # BaseAgent with tool-calling loop
│   │   ├── scheduling_agent.py       # Module A
│   │   ├── scorecard_agent.py        # Module B
│   │   ├── alignment_agent.py        # Module C
│   │   ├── vendor_prep_agent.py      # Module D
│   │   ├── meeting_agent.py          # Module E
│   │   └── memory_agent.py           # Module F
│   │
│   ├── services/
│   │   ├── mock/
│   │   │   ├── base_mock.py          # abstract interface classes
│   │   │   ├── mock_calendar.py      # MockCalendarService
│   │   │   ├── mock_email.py         # MockEmailService
│   │   │   ├── mock_forms.py         # MockFormService
│   │   │   └── mock_notifications.py # MockNotificationService
│   │   ├── llm_service.py            # Claude API wrapper
│   │   ├── validation_service.py     # scorecard validation rules
│   │   └── analytics_service.py      # trend engine + recurring issue detection
│   │
│   ├── models/                       # SQLAlchemy ORM models
│   │   ├── vendor.py
│   │   ├── cycle.py
│   │   ├── stakeholder.py
│   │   ├── attendee.py
│   │   ├── scorecard.py
│   │   ├── meeting.py
│   │   ├── meeting_note.py
│   │   ├── action_item.py
│   │   ├── issue.py
│   │   ├── face_off.py
│   │   ├── notification.py
│   │   ├── slot_proposal.py
│   │   └── agent_run.py
│   │
│   ├── schemas/                      # Pydantic request/response schemas
│   │   ├── common.py                 # AgentResponse, PaginatedResponse
│   │   ├── cycle_schema.py
│   │   ├── scheduling_schema.py
│   │   ├── scorecard_schema.py
│   │   ├── alignment_schema.py
│   │   ├── vendor_prep_schema.py
│   │   ├── meeting_schema.py
│   │   └── analytics_schema.py
│   │
│   ├── repositories/
│   │   ├── base_repo.py              # generic CRUD base class
│   │   ├── cycle_repo.py
│   │   ├── vendor_repo.py
│   │   ├── stakeholder_repo.py
│   │   ├── attendee_repo.py
│   │   ├── scorecard_repo.py
│   │   ├── meeting_repo.py
│   │   ├── action_repo.py
│   │   ├── issue_repo.py
│   │   └── agent_run_repo.py
│   │
│   └── utils/
│       ├── prompts.py                # all Claude prompt templates (constants)
│       ├── slot_ranking.py           # deterministic slot ranking algorithm
│       ├── score_diff.py             # cycle comparison engine
│       ├── text_parsing.py           # action item extraction helpers
│       └── constants.py              # enums, magic numbers
│
├── seed/
│   └── seed_data.py                  # populates all tables with demo data
│
├── alembic/
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
│       └── 001_initial_schema.py
│
├── tests/
│   ├── conftest.py                   # shared fixtures (test db, client)
│   ├── unit/
│   │   ├── test_slot_ranking.py
│   │   ├── test_validation_service.py
│   │   ├── test_score_diff.py
│   │   └── test_workflow_engine.py
│   ├── integration/
│   │   ├── test_scheduling_flow.py
│   │   ├── test_scorecard_flow.py
│   │   └── test_meeting_flow.py
│   └── e2e/
│       └── test_demo_narrative.py    # 8-step demo flow
│
├── .env.example
├── requirements.txt
└── alembic.ini
```

---

## 4. Database Schema

### 4.1 `vendors`

```sql
CREATE TABLE vendors (
    vendor_id   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)))),
    name        TEXT NOT NULL UNIQUE,
    category    TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'ACTIVE'
                    CHECK(status IN ('ACTIVE', 'INACTIVE')),
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

### 4.2 `governance_cycles`

```sql
CREATE TABLE governance_cycles (
    cycle_id        TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)))),
    vendor_id       TEXT NOT NULL REFERENCES vendors(vendor_id),
    cycle_name      TEXT NOT NULL,
    quarter         INTEGER NOT NULL CHECK(quarter BETWEEN 1 AND 4),
    year            INTEGER NOT NULL,
    workflow_state  TEXT NOT NULL DEFAULT 'CYCLE_CREATED'
                        CHECK(workflow_state IN (
                            'CYCLE_CREATED', 'ATTENDEE_REFRESH_SENT',
                            'AVAILABILITY_COLLECTED', 'MEETING_SCHEDULED',
                            'SCORECARD_REQUEST_SENT', 'SCORECARD_COLLECTION',
                            'SCORECARD_COMPILED', 'INTERNAL_ALIGNMENT',
                            'VENDOR_PREP', 'MEETING_IN_PROGRESS',
                            'POST_MEETING_COMPLETE', 'ARCHIVED'
                        )),
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

### 4.3 `stakeholders`

```sql
CREATE TABLE stakeholders (
    stakeholder_id  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)))),
    name            TEXT NOT NULL,
    email           TEXT NOT NULL UNIQUE,
    role            TEXT NOT NULL
                        CHECK(role IN (
                            'VMO_COORDINATOR', 'INTERNAL_LEAD',
                            'VENDOR_MANAGER', 'EGB_CHAIR',
                            'TECHNICAL_LEAD', 'COMMERCIAL_LEAD',
                            'VENDOR_CONTACT'
                        )),
    organisation    TEXT NOT NULL CHECK(organisation IN ('SHELL', 'VENDOR')),
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

### 4.4 `cycle_attendees`

```sql
CREATE TABLE cycle_attendees (
    id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)))),
    cycle_id            TEXT NOT NULL REFERENCES governance_cycles(cycle_id),
    stakeholder_id      TEXT NOT NULL REFERENCES stakeholders(stakeholder_id),
    is_confirmed        INTEGER NOT NULL DEFAULT 1,
    is_key              INTEGER NOT NULL DEFAULT 0,   -- 1 = organiser or exec sponsor
    invite_status       TEXT NOT NULL DEFAULT 'PENDING'
                            CHECK(invite_status IN ('PENDING', 'ACCEPTED', 'DECLINED')),
    replacement_name    TEXT,
    replacement_email   TEXT,
    refresh_response    TEXT,                         -- raw text response from refresh form
    responded_at        DATETIME,
    UNIQUE(cycle_id, stakeholder_id)
);
```

---

### 4.5 `scorecards`

```sql
CREATE TABLE scorecards (
    scorecard_id        TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)))),
    cycle_id            TEXT NOT NULL REFERENCES governance_cycles(cycle_id),
    stakeholder_id      TEXT NOT NULL REFERENCES stakeholders(stakeholder_id),
    vendor_id           TEXT NOT NULL REFERENCES vendors(vendor_id),
    category            TEXT NOT NULL
                            CHECK(category IN (
                                'DELIVERY_QUALITY', 'SLA_COMPLIANCE',
                                'INNOVATION', 'COMMUNICATION', 'VALUE_FOR_MONEY'
                            )),
    score               REAL NOT NULL CHECK(score BETWEEN 1.0 AND 5.0),
    comment             TEXT,
    is_valid            INTEGER NOT NULL DEFAULT 1,
    validation_flags    TEXT DEFAULT '[]',           -- JSON array of flag strings
    submitted_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cycle_id, stakeholder_id, category)
);
```

---

### 4.6 `meetings`

```sql
CREATE TABLE meetings (
    meeting_id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)))),
    cycle_id            TEXT NOT NULL REFERENCES governance_cycles(cycle_id),
    meeting_type        TEXT NOT NULL
                            CHECK(meeting_type IN (
                                'INTERNAL_ALIGNMENT', 'VENDOR_PREP', 'EGB_QBR'
                            )),
    scheduled_time      DATETIME,
    location_or_dial_in TEXT,
    invite_sent_at      DATETIME,
    minutes_generated_at DATETIME,
    minutes_approved    INTEGER NOT NULL DEFAULT 0
);
```

---

### 4.7 `meeting_notes`

```sql
CREATE TABLE meeting_notes (
    note_id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)))),
    meeting_id      TEXT NOT NULL REFERENCES meetings(meeting_id),
    note_type       TEXT NOT NULL
                        CHECK(note_type IN (
                            'QUESTION', 'OBJECTION', 'DECISION',
                            'APPRECIATION', 'ACTION'
                        )),
    content         TEXT NOT NULL,
    raised_by_role  TEXT,
    timestamp       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_actioned     INTEGER NOT NULL DEFAULT 0
);
```

---

### 4.8 `action_items`

```sql
CREATE TABLE action_items (
    action_id       TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)))),
    cycle_id        TEXT NOT NULL REFERENCES governance_cycles(cycle_id),
    source_module   TEXT NOT NULL
                        CHECK(source_module IN ('ALIGNMENT', 'VENDOR_PREP', 'MEETING')),
    description     TEXT NOT NULL,
    owner           TEXT,
    due_date        DATE,
    status          TEXT NOT NULL DEFAULT 'OPEN'
                        CHECK(status IN ('OPEN', 'IN_PROGRESS', 'CLOSED')),
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

### 4.9 `issues`

```sql
CREATE TABLE issues (
    issue_id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)))),
    vendor_id           TEXT NOT NULL REFERENCES vendors(vendor_id),
    description         TEXT NOT NULL,
    first_seen_cycle_id TEXT NOT NULL REFERENCES governance_cycles(cycle_id),
    occurrences         INTEGER NOT NULL DEFAULT 1,
    status              TEXT NOT NULL DEFAULT 'OPEN'
                            CHECK(status IN ('OPEN', 'RESOLVED')),
    last_owner          TEXT,
    last_updated        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

### 4.10 `face_off_model`

```sql
CREATE TABLE face_off_model (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)))),
    cycle_id        TEXT NOT NULL REFERENCES governance_cycles(cycle_id),
    position_number INTEGER NOT NULL,
    shell_name      TEXT,
    shell_role      TEXT,
    vendor_name     TEXT,
    vendor_role     TEXT,
    UNIQUE(cycle_id, position_number)
);
```

---

### 4.11 `notifications`

```sql
CREATE TABLE notifications (
    notification_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)))),
    cycle_id        TEXT NOT NULL REFERENCES governance_cycles(cycle_id),
    stakeholder_id  TEXT REFERENCES stakeholders(stakeholder_id),
    type            TEXT NOT NULL
                        CHECK(type IN (
                            'SCORECARD_REQUEST', 'REMINDER_1', 'REMINDER_2',
                            'ESCALATION', 'INVITE', 'NUDGE'
                        )),
    content         TEXT NOT NULL,
    sent_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status          TEXT NOT NULL DEFAULT 'SENT'
                        CHECK(status IN ('SENT', 'DELIVERED', 'FAILED'))
);
```

---

### 4.12 `slot_proposals`

```sql
CREATE TABLE slot_proposals (
    slot_id                     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)))),
    cycle_id                    TEXT NOT NULL REFERENCES governance_cycles(cycle_id),
    proposed_time               DATETIME NOT NULL,
    timezone                    TEXT NOT NULL DEFAULT 'Europe/London',
    organiser_available         INTEGER NOT NULL DEFAULT 0,
    exec_sponsor_available      INTEGER NOT NULL DEFAULT 0,
    attendee_availability       TEXT NOT NULL DEFAULT '{}',   -- JSON {stakeholder_id: bool}
    total_available             INTEGER NOT NULL DEFAULT 0,
    total_attendees             INTEGER NOT NULL DEFAULT 0,
    rank_score                  REAL NOT NULL DEFAULT 0.0,
    is_approved                 INTEGER NOT NULL DEFAULT 0
);
```

---

### 4.13 `agent_runs`

```sql
CREATE TABLE agent_runs (
    run_id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)))),
    agent_name      TEXT NOT NULL,
    cycle_id        TEXT REFERENCES governance_cycles(cycle_id),
    input_payload   TEXT NOT NULL DEFAULT '{}',    -- JSON
    output_payload  TEXT NOT NULL DEFAULT '{}',    -- JSON
    status          TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK(status IN ('PENDING', 'SUCCESS', 'FAILED', 'PARTIAL')),
    error_message   TEXT,
    triggered_by    TEXT NOT NULL DEFAULT 'USER',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. SQLAlchemy ORM Models

### `app/core/database.py`

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL = "sqlite+aiosqlite:///./vendorpulse.db"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

### Example ORM Model — `GovernanceCycle`

```python
# app/models/cycle.py
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.core.database import Base

class GovernanceCycle(Base):
    __tablename__ = "governance_cycles"

    cycle_id       = Column(String, primary_key=True, default=lambda: uuid4().hex[:8])
    vendor_id      = Column(String, ForeignKey("vendors.vendor_id"), nullable=False)
    cycle_name     = Column(String, nullable=False)
    quarter        = Column(Integer, nullable=False)
    year           = Column(Integer, nullable=False)
    workflow_state = Column(String, nullable=False, default="CYCLE_CREATED")
    created_at     = Column(DateTime, server_default=func.now())
    updated_at     = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    vendor         = relationship("Vendor", back_populates="cycles")
    attendees      = relationship("CycleAttendee", back_populates="cycle")
    scorecards     = relationship("Scorecard", back_populates="cycle")
    meetings       = relationship("Meeting", back_populates="cycle")
    action_items   = relationship("ActionItem", back_populates="cycle")
    agent_runs     = relationship("AgentRun", back_populates="cycle")
    slot_proposals = relationship("SlotProposal", back_populates="cycle")
```

### Example ORM Model — `Scorecard`

```python
# app/models/scorecard.py
import json
from sqlalchemy import Column, String, Float, Integer, DateTime, ForeignKey, func, Text

class Scorecard(Base):
    __tablename__ = "scorecards"

    scorecard_id     = Column(String, primary_key=True, default=lambda: uuid4().hex[:8])
    cycle_id         = Column(String, ForeignKey("governance_cycles.cycle_id"), nullable=False)
    stakeholder_id   = Column(String, ForeignKey("stakeholders.stakeholder_id"), nullable=False)
    vendor_id        = Column(String, ForeignKey("vendors.vendor_id"), nullable=False)
    category         = Column(String, nullable=False)
    score            = Column(Float, nullable=False)
    comment          = Column(Text)
    is_valid         = Column(Integer, default=1)
    _validation_flags = Column("validation_flags", Text, default="[]")
    submitted_at     = Column(DateTime, server_default=func.now())

    @property
    def validation_flags(self) -> list[str]:
        return json.loads(self._validation_flags or "[]")

    @validation_flags.setter
    def validation_flags(self, value: list[str]):
        self._validation_flags = json.dumps(value)
```

---

## 6. Pydantic Schemas

### `app/schemas/common.py`

```python
from pydantic import BaseModel
from typing import Generic, TypeVar, Any

T = TypeVar("T")

class AgentResponse(BaseModel, Generic[T]):
    status:            str   # success | failed | partial | pending_approval
    agent:             str
    summary:           str
    data:              T
    warnings:          list[str] = []
    next_actions:      list[str] = []
    requires_approval: bool = False
    run_id:            str

class ErrorResponse(BaseModel):
    detail: str
    code:   str = "INTERNAL_ERROR"
```

### `app/schemas/scheduling_schema.py`

```python
class AttendeeOut(BaseModel):
    id:                 str
    stakeholder_id:     str
    name:               str
    email:              str
    role:               str
    is_key:             bool
    is_confirmed:       bool
    invite_status:      str
    replacement_name:   str | None = None
    replacement_email:  str | None = None

class SlotProposalOut(BaseModel):
    slot_id:                str
    proposed_time:          datetime
    timezone:               str
    rank_score:             float
    organiser_available:    bool
    exec_sponsor_available: bool
    attendee_availability:  dict[str, bool]
    total_available:        int
    total_attendees:        int
    is_approved:            bool

class ApproveSlotIn(BaseModel):
    slot_id: str
```

### `app/schemas/scorecard_schema.py`

```python
class ScorecardSubmitIn(BaseModel):
    stakeholder_id: str
    scores: dict[str, float]       # category → score
    comments: dict[str, str] = {}  # category → comment

class ScorecardEntryOut(BaseModel):
    scorecard_id:      str
    stakeholder_id:    str
    stakeholder_name:  str
    category:          str
    score:             float
    comment:           str | None
    is_valid:          bool
    validation_flags:  list[str]
    submitted_at:      datetime

class CompiledScorecardOut(BaseModel):
    cycle_id:        str
    vendor_id:       str
    entries:         list[ScorecardEntryOut]
    averages:        dict[str, float]
    overall_average: float
    outlier_count:   int
    missing_count:   int
    compiled_at:     datetime
```

### `app/schemas/alignment_schema.py`

```python
class ScoreChangeOut(BaseModel):
    category:        str
    previous_score:  float
    current_score:   float
    delta:           float
    is_significant:  bool

class AlignmentFlagOut(BaseModel):
    category:              str
    min_score:             float
    max_score:             float
    spread:                float
    prompt_question:       str
    stakeholders_involved: list[str]

class ExtractActionsIn(BaseModel):
    raw_notes: str              # pasted meeting notes text

class ActionItemOut(BaseModel):
    action_id:     str
    source_module: str
    description:   str
    owner:         str | None
    due_date:      date | None
    status:        str
    created_at:    datetime
```

### `app/schemas/vendor_prep_schema.py`

```python
class VendorBriefOut(BaseModel):
    overall_score:     float
    overall_trend:     str
    category_ratings:  list[dict]
    key_concerns:      list[str]
    positive_areas:    list[str]
    generated_at:      datetime

class PushbackItemIn(BaseModel):
    description: str
    category:    str   # DATA_DISPUTE | PROCESS_CONCERN | RESOURCE_CONSTRAINT | etc.

class PushbackResponseOut(BaseModel):
    stance:     str    # FACTUAL | NEUTRAL | ESCALATION
    content:    str
    is_selected: bool

class PushbackItemOut(BaseModel):
    id:                    str
    description:           str
    category:              str
    requires_legal_review: bool
    status:                str
    responses:             list[PushbackResponseOut] = []
```

### `app/schemas/meeting_schema.py`

```python
class CaptureNoteIn(BaseModel):
    note_type:      str    # QUESTION | OBJECTION | DECISION | APPRECIATION | ACTION
    content:        str
    raised_by_role: str | None = None

class ParseTranscriptIn(BaseModel):
    transcript: str

class MeetingMinutesOut(BaseModel):
    meeting_id:        str
    generated_at:      datetime
    metadata:          dict
    executive_summary: str
    agenda_summaries:  list[dict]
    key_decisions:     list[str]
    qa_log:            list[dict]
    action_items:      list[ActionItemOut]
    approved:          bool
```

---

## 7. Workflow Engine

```python
# app/core/workflow_engine.py

from enum import Enum

class WorkflowState(str, Enum):
    CYCLE_CREATED           = "CYCLE_CREATED"
    ATTENDEE_REFRESH_SENT   = "ATTENDEE_REFRESH_SENT"
    AVAILABILITY_COLLECTED  = "AVAILABILITY_COLLECTED"
    MEETING_SCHEDULED       = "MEETING_SCHEDULED"
    SCORECARD_REQUEST_SENT  = "SCORECARD_REQUEST_SENT"
    SCORECARD_COLLECTION    = "SCORECARD_COLLECTION"
    SCORECARD_COMPILED      = "SCORECARD_COMPILED"
    INTERNAL_ALIGNMENT      = "INTERNAL_ALIGNMENT"
    VENDOR_PREP             = "VENDOR_PREP"
    MEETING_IN_PROGRESS     = "MEETING_IN_PROGRESS"
    POST_MEETING_COMPLETE   = "POST_MEETING_COMPLETE"
    ARCHIVED                = "ARCHIVED"


# Valid forward transitions — only these are allowed
TRANSITIONS: dict[WorkflowState, WorkflowState] = {
    WorkflowState.CYCLE_CREATED:          WorkflowState.ATTENDEE_REFRESH_SENT,
    WorkflowState.ATTENDEE_REFRESH_SENT:  WorkflowState.AVAILABILITY_COLLECTED,
    WorkflowState.AVAILABILITY_COLLECTED: WorkflowState.MEETING_SCHEDULED,
    WorkflowState.MEETING_SCHEDULED:      WorkflowState.SCORECARD_REQUEST_SENT,
    WorkflowState.SCORECARD_REQUEST_SENT: WorkflowState.SCORECARD_COLLECTION,
    WorkflowState.SCORECARD_COLLECTION:   WorkflowState.SCORECARD_COMPILED,
    WorkflowState.SCORECARD_COMPILED:     WorkflowState.INTERNAL_ALIGNMENT,
    WorkflowState.INTERNAL_ALIGNMENT:     WorkflowState.VENDOR_PREP,
    WorkflowState.VENDOR_PREP:            WorkflowState.MEETING_IN_PROGRESS,
    WorkflowState.MEETING_IN_PROGRESS:    WorkflowState.POST_MEETING_COMPLETE,
    WorkflowState.POST_MEETING_COMPLETE:  WorkflowState.ARCHIVED,
}


class WorkflowEngine:

    def can_transition(self, current: WorkflowState, target: WorkflowState) -> bool:
        return TRANSITIONS.get(current) == target

    def next_state(self, current: WorkflowState) -> WorkflowState | None:
        return TRANSITIONS.get(current)

    def assert_at_least(self, current: WorkflowState, required: WorkflowState) -> None:
        """Raise if the cycle hasn't reached the required state yet."""
        states = list(WorkflowState)
        if states.index(current) < states.index(required):
            raise WorkflowViolationError(
                f"Action requires state '{required}'. Current state: '{current}'"
            )

    async def transition(self, cycle, target: WorkflowState, db) -> None:
        """Move cycle to next state with validation."""
        if not self.can_transition(WorkflowState(cycle.workflow_state), target):
            raise WorkflowViolationError(
                f"Cannot transition from '{cycle.workflow_state}' to '{target}'"
            )
        cycle.workflow_state = target.value
        await db.flush()


class WorkflowViolationError(Exception):
    """Raised when a state transition is attempted that isn't allowed."""
    pass
```

---

## 8. Base Agent Pattern

```python
# app/agents/base_agent.py

import json
import uuid
from datetime import datetime
from abc import ABC, abstractmethod
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.common import AgentResponse
from app.services.llm_service import LLMService
from app.models.agent_run import AgentRun


class BaseAgent(ABC):
    """
    All agents inherit from this. Provides:
    - Standard tool-calling loop
    - agent_runs logging
    - Standardised AgentResponse output
    """

    agent_name: str = "base_agent"

    def __init__(self, db: AsyncSession, cycle_id: str | None = None):
        self.db = db
        self.cycle_id = cycle_id
        self.llm = LLMService()
        self._run_id = str(uuid.uuid4())

    @abstractmethod
    def get_system_prompt(self) -> str:
        """Return the system prompt for this agent."""
        ...

    @abstractmethod
    def get_tools(self) -> list[dict]:
        """Return tool definitions for Claude API tool-calling."""
        ...

    @abstractmethod
    async def execute_tool(self, tool_name: str, tool_input: dict) -> str:
        """Execute a tool call and return result as string."""
        ...

    async def run(self, user_message: str, context: dict | None = None) -> AgentResponse:
        """Main entry point. Runs the tool-calling loop."""
        input_payload = {"user_message": user_message, "context": context or {}}
        run_record = await self._create_run_record(input_payload)

        try:
            result = await self._tool_calling_loop(user_message)
            response = self._build_response("success", result)
            await self._update_run_record(run_record, "SUCCESS", response)
            return response

        except Exception as e:
            error_response = self._build_error_response(str(e))
            await self._update_run_record(run_record, "FAILED", error_response, str(e))
            return error_response

    async def _tool_calling_loop(self, user_message: str) -> dict:
        """Runs the Claude tool-calling loop until Claude stops calling tools."""
        messages = [{"role": "user", "content": user_message}]
        tools = self.get_tools()
        system = self.get_system_prompt()

        while True:
            response = await self.llm.call(
                system=system,
                messages=messages,
                tools=tools,
            )

            # If Claude is done (stop_reason = 'end_turn'), extract result
            if response.stop_reason == "end_turn":
                return self._extract_final_result(response)

            # If Claude wants to call tools
            if response.stop_reason == "tool_use":
                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        tool_result = await self.execute_tool(block.name, block.input)
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": tool_result,
                        })

                # Add assistant response + tool results to conversation
                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": tool_results})

    def _extract_final_result(self, response) -> dict:
        """Extract text from Claude's final response and parse as JSON if possible."""
        for block in response.content:
            if hasattr(block, "text"):
                try:
                    return json.loads(block.text)
                except json.JSONDecodeError:
                    return {"raw_output": block.text}
        return {}

    def _build_response(self, status: str, data: dict) -> AgentResponse:
        return AgentResponse(
            status=status,
            agent=self.agent_name,
            summary=data.get("summary", ""),
            data=data.get("data", {}),
            warnings=data.get("warnings", []),
            next_actions=data.get("next_actions", []),
            requires_approval=data.get("requires_approval", False),
            run_id=self._run_id,
        )

    def _build_error_response(self, error: str) -> AgentResponse:
        return AgentResponse(
            status="failed",
            agent=self.agent_name,
            summary=f"Agent failed: {error}",
            data={},
            warnings=[],
            next_actions=["RETRY"],
            requires_approval=False,
            run_id=self._run_id,
        )

    async def _create_run_record(self, input_payload: dict) -> AgentRun:
        record = AgentRun(
            run_id=self._run_id,
            agent_name=self.agent_name,
            cycle_id=self.cycle_id,
            input_payload=json.dumps(input_payload),
            status="PENDING",
            triggered_by="USER",
        )
        self.db.add(record)
        await self.db.flush()
        return record

    async def _update_run_record(self, record: AgentRun, status: str,
                                  response: AgentResponse, error: str | None = None):
        record.status = status
        record.output_payload = json.dumps(response.model_dump())
        record.error_message = error
        await self.db.flush()
```

---

## 9. Agent Implementations (A–F)

### 9.1 `SchedulingAgent`

```python
class SchedulingAgent(BaseAgent):
    agent_name = "scheduling_agent"

    def get_system_prompt(self) -> str:
        return prompts.SCHEDULING_SYSTEM_PROMPT

    def get_tools(self) -> list[dict]:
        return [
            {"name": "get_attendee_list",     "description": "Get current attendees for this cycle"},
            {"name": "get_previous_attendees", "description": "Get attendees from last cycle"},
            {"name": "update_attendee",        "description": "Update attendee confirmation status"},
            {"name": "get_availability",       "description": "Get calendar availability from mock service"},
            {"name": "rank_slots",             "description": "Run deterministic slot ranking algorithm"},
            {"name": "create_invite_draft",    "description": "Generate meeting invite content"},
            {"name": "send_invite",            "description": "Send invite via mock email service"},
        ]

    async def execute_tool(self, tool_name: str, tool_input: dict) -> str:
        if tool_name == "get_attendee_list":
            attendees = await attendee_repo.get_by_cycle(self.db, self.cycle_id)
            return json.dumps([a.to_dict() for a in attendees])

        if tool_name == "rank_slots":
            attendees = await attendee_repo.get_by_cycle(self.db, self.cycle_id)
            slots = slot_ranking.rank(attendees, tool_input.get("proposed_times", []))
            return json.dumps(slots)

        if tool_name == "send_invite":
            result = await mock_email.send(
                to=tool_input["recipients"],
                subject=tool_input["subject"],
                body=tool_input["body"],
            )
            return json.dumps(result)
        # ... other tools
```

**Deterministic Tools** (no LLM call):
- `rank_slots` → delegates to `slot_ranking.py`
- `get_attendee_list` → direct DB query

**LLM-generated outputs:**
- Attendee refresh form content
- Invite body text

---

### 9.2 `ScorecardAgent`

**Deterministic tools:** `validate_submission`, `calculate_averages`, `detect_outliers`, `compile_scorecard`

**No LLM used** — all scorecard processing is deterministic. LLM is only invoked if a narrative summary of the compiled scorecard is explicitly requested.

```python
async def execute_tool(self, tool_name: str, tool_input: dict) -> str:
    if tool_name == "validate_submission":
        result = validation_service.validate(tool_input["submission"])
        return json.dumps(result.model_dump())

    if tool_name == "calculate_averages":
        entries = await scorecard_repo.get_valid(self.db, self.cycle_id)
        averages = validation_service.calculate_averages(entries)
        return json.dumps(averages)

    if tool_name == "detect_outliers":
        entries = await scorecard_repo.get_valid(self.db, self.cycle_id)
        flagged = validation_service.detect_outliers(entries)
        return json.dumps(flagged)
```

---

### 9.3 `AlignmentAgent`

**Deterministic tools:** `compare_cycles`, `detect_alignment_flags`

**LLM tools:** `generate_change_summary`, `extract_action_items`

```python
async def execute_tool(self, tool_name: str, tool_input: dict) -> str:
    if tool_name == "compare_cycles":
        current = await scorecard_repo.get_compiled(self.db, self.cycle_id)
        previous = await scorecard_repo.get_previous_cycle(self.db, self.cycle_id)
        diff = score_diff.compare(current, previous)
        return json.dumps(diff)

    if tool_name == "extract_action_items":
        # LLM does the extraction — result returned as structured JSON
        # Claude parses raw_notes text and returns action items list
        return tool_input.get("raw_notes", "")
```

---

### 9.4 `VendorPrepAgent`

**LLM tools:** `generate_vendor_brief`, `draft_pushback_responses`

**Deterministic tools:** `get_scorecard_summary`, `get_open_issues`, `categorise_pushback`

```python
async def execute_tool(self, tool_name: str, tool_input: dict) -> str:
    if tool_name == "get_scorecard_summary":
        compiled = await scorecard_repo.get_compiled(self.db, self.cycle_id)
        return json.dumps(compiled.model_dump())

    if tool_name == "categorise_pushback":
        # Rule-based categorisation first; LLM fallback if confidence low
        category = self._categorise(tool_input["description"])
        return json.dumps({"category": category})

    # generate_vendor_brief and draft_pushback_responses handled by Claude
```

---

### 9.5 `MeetingAgent`

**LLM tools:** `parse_transcript`, `generate_minutes`, `extract_action_items`

**Deterministic tools:** `get_all_notes`, `get_trend_briefing`, `merge_action_items`

---

### 9.6 `MemoryAgent`

**All deterministic** — reads from DB aggregations, no LLM for detection.

**LLM tool:** `generate_leadership_brief` — takes structured data, produces narrative.

```python
async def execute_tool(self, tool_name: str, tool_input: dict) -> str:
    if tool_name == "detect_recurring_issues":
        issues = await issue_repo.get_recurring(self.db, vendor_id=tool_input["vendor_id"])
        return json.dumps([i.to_dict() for i in issues])

    if tool_name == "get_trend_data":
        data = await analytics_service.get_trend_data(
            self.db,
            vendor_id=tool_input["vendor_id"],
            cycles=4
        )
        return json.dumps(data)
```

---

## 10. Service Layer

### `app/services/validation_service.py`

Entirely deterministic. No LLM.

```python
import statistics
from dataclasses import dataclass

SCORE_MIN = 1.0
SCORE_MAX = 5.0
OUTLIER_SIGMA_THRESHOLD = 1.5

@dataclass
class ValidationResult:
    is_valid: bool
    flags: list[str]
    error_messages: list[str]

class ValidationService:

    def validate(self, score: float, comment: str | None,
                 category: str, group_scores: list[float]) -> ValidationResult:
        flags = []
        errors = []

        # Rule 1: Range check
        if not (SCORE_MIN <= score <= SCORE_MAX):
            flags.append("OUT_OF_RANGE")
            errors.append(f"Score {score} is outside valid range 1–5")

        # Rule 2: Comment required for extreme scores
        if score in (1.0, 5.0) and not (comment and comment.strip()):
            flags.append("COMMENT_REQUIRED")
            errors.append(f"A comment is required when score is {int(score)}")

        # Rule 3: Statistical outlier detection
        if len(group_scores) >= 3:
            mean = statistics.mean(group_scores)
            stdev = statistics.stdev(group_scores)
            if stdev > 0 and abs(score - mean) > OUTLIER_SIGMA_THRESHOLD * stdev:
                flags.append("OUTLIER")
                # Not an error — just a warning

        return ValidationResult(
            is_valid=len([f for f in flags if f != "OUTLIER"]) == 0,
            flags=flags,
            error_messages=errors,
        )

    def calculate_averages(self, entries: list) -> dict[str, float]:
        from collections import defaultdict
        category_scores: dict[str, list[float]] = defaultdict(list)
        for e in entries:
            if e.is_valid:
                category_scores[e.category].append(e.score)
        return {cat: round(statistics.mean(scores), 2)
                for cat, scores in category_scores.items() if scores}

    def detect_outliers(self, entries: list) -> list[str]:
        """Return list of scorecard_ids that are outliers."""
        from collections import defaultdict
        by_category: dict[str, list] = defaultdict(list)
        for e in entries:
            if e.is_valid:
                by_category[e.category].append(e)

        outlier_ids = []
        for category, category_entries in by_category.items():
            scores = [e.score for e in category_entries]
            if len(scores) < 3:
                continue
            mean = statistics.mean(scores)
            stdev = statistics.stdev(scores)
            if stdev == 0:
                continue
            for entry in category_entries:
                if abs(entry.score - mean) > OUTLIER_SIGMA_THRESHOLD * stdev:
                    outlier_ids.append(entry.scorecard_id)
        return outlier_ids
```

---

### `app/services/analytics_service.py`

```python
class AnalyticsService:

    async def get_trend_data(self, db: AsyncSession,
                              vendor_id: str, cycles: int = 4) -> list[dict]:
        """Returns the last N cycles of average scores per category."""
        recent_cycles = await cycle_repo.get_recent(db, vendor_id, limit=cycles)
        result = []
        for cycle in recent_cycles:
            scores = await scorecard_repo.get_averages(db, cycle.cycle_id)
            result.append({
                "cycle_id":    cycle.cycle_id,
                "cycle_name":  cycle.cycle_name,
                "quarter":     cycle.quarter,
                "year":        cycle.year,
                "averages":    scores,
            })
        return result

    async def detect_recurring_issues(self, db: AsyncSession,
                                       vendor_id: str) -> list[dict]:
        """Find issues flagged >= 2 times with status = OPEN."""
        issues = await issue_repo.get_recurring(db, vendor_id, min_occurrences=2)
        return [i.to_dict() for i in issues]

    async def get_cross_vendor_comparison(self, db: AsyncSession,
                                           cycle_ids: list[str]) -> dict:
        """Get current-cycle averages for all vendors."""
        result = {}
        for cycle_id in cycle_ids:
            cycle = await cycle_repo.get(db, cycle_id)
            averages = await scorecard_repo.get_averages(db, cycle_id)
            result[cycle.vendor.name] = averages
        return result
```

---

## 11. Mock Services

### `app/services/mock/base_mock.py`

```python
from abc import ABC, abstractmethod

class AbstractCalendarService(ABC):
    @abstractmethod
    async def get_availability(self, stakeholder_ids: list[str],
                                date_range: dict) -> dict[str, list[str]]:
        ...

class AbstractEmailService(ABC):
    @abstractmethod
    async def send(self, to: list[str], subject: str, body: str) -> dict:
        ...

class AbstractFormService(ABC):
    @abstractmethod
    async def create_form(self, form_type: str, fields: list,
                           recipients: list[str]) -> dict:
        ...

class AbstractNotificationService(ABC):
    @abstractmethod
    async def send_reminder(self, stakeholder_id: str,
                             cycle_id: str, level: int) -> dict:
        ...
```

### `app/services/mock/mock_calendar.py`

```python
class MockCalendarService(AbstractCalendarService):
    """
    Returns deterministic fixture availability based on stakeholder_id.
    Seeded so the same stakeholder always has the same free slots.
    """

    # Pre-defined free slots per stakeholder (loaded from seed data)
    AVAILABILITY_FIXTURE: dict[str, list[str]] = {
        "organiser_1":  ["2026-05-14T10:00:00Z", "2026-05-16T14:00:00Z"],
        "exec_sponsor": ["2026-05-14T10:00:00Z", "2026-05-15T09:00:00Z"],
        # ... per stakeholder
    }

    async def get_availability(self, stakeholder_ids: list[str],
                                date_range: dict) -> dict[str, list[str]]:
        return {
            sid: self.AVAILABILITY_FIXTURE.get(sid, ["2026-05-14T10:00:00Z"])
            for sid in stakeholder_ids
        }
```

### `app/services/mock/mock_email.py`

```python
class MockEmailService(AbstractEmailService):
    """
    Stores all 'sent' emails in the mock_outbox table.
    Returns a preview object the UI renders in ApprovalPanel.
    """
    async def send(self, to: list[str], subject: str,
                   body: str, db: AsyncSession = None) -> dict:
        preview_id = str(uuid.uuid4())
        # In real implementation: write to mock_outbox table
        return {
            "preview_id":   preview_id,
            "to":           to,
            "subject":      subject,
            "html_preview": f"<p>{body}</p>",
            "sent_at":      datetime.utcnow().isoformat(),
        }
```

### `app/services/mock/mock_notifications.py`

```python
REMINDER_TEMPLATES = {
    1: "Friendly reminder: your scorecard input for {vendor} is due in 5 days.",
    2: "Important: your scorecard input for {vendor} is due in 2 days. Please submit today.",
    3: "ESCALATION: {stakeholder} has not submitted their scorecard. Flagging to organiser.",
}

class MockNotificationService(AbstractNotificationService):
    async def send_reminder(self, stakeholder_id: str,
                             cycle_id: str, level: int,
                             db: AsyncSession, vendor_name: str,
                             stakeholder_name: str) -> dict:
        content = REMINDER_TEMPLATES[level].format(
            vendor=vendor_name, stakeholder=stakeholder_name
        )
        notification = Notification(
            cycle_id=cycle_id,
            stakeholder_id=stakeholder_id,
            type=f"REMINDER_{level}" if level < 3 else "ESCALATION",
            content=content,
            status="SENT",
        )
        db.add(notification)
        await db.flush()
        return {"notification_id": notification.notification_id, "content": content}
```

---

## 12. LLM Service (Claude API)

```python
# app/services/llm_service.py

import anthropic
from app.core.config import settings

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 4096

class LLMService:
    def __init__(self):
        self.client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def call(self, system: str, messages: list[dict],
                   tools: list[dict] | None = None) -> anthropic.types.Message:
        """Make a Claude API call with optional tools."""
        kwargs = {
            "model":      MODEL,
            "max_tokens": MAX_TOKENS,
            "system":     system,
            "messages":   messages,
        }
        if tools:
            kwargs["tools"] = tools

        return await self.client.messages.create(**kwargs)

    async def call_simple(self, system: str, user_message: str) -> str:
        """Simple text-in text-out call. No tool-calling."""
        response = await self.client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=system,
            messages=[{"role": "user", "content": user_message}],
        )
        return response.content[0].text

    async def call_with_retry(self, system: str, messages: list[dict],
                               tools: list[dict] | None = None,
                               max_retries: int = 3):
        """Retries on rate-limit or transient errors."""
        for attempt in range(max_retries):
            try:
                return await self.call(system, messages, tools)
            except anthropic.RateLimitError:
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)
                else:
                    raise
```

---

## 13. Validation Service

See Section 10. Key rules:

| Rule | Implementation | Type |
|---|---|---|
| Score 1–5 range | `SCORE_MIN <= score <= SCORE_MAX` | ERROR (blocks save) |
| Comment for extreme scores | `score in (1.0, 5.0) and not comment` | ERROR (blocks save) |
| Statistical outlier | `abs(score - mean) > 1.5 * stdev` | WARNING (allows save, flags) |
| Required field missing | Schema-level via Pydantic | ERROR (rejected at API layer) |

---

## 14. Analytics Service

### Trend Data Query

```python
async def get_trend_data(self, db, vendor_id, cycles=4):
    stmt = (
        select(GovernanceCycle)
        .where(GovernanceCycle.vendor_id == vendor_id)
        .where(GovernanceCycle.workflow_state == "ARCHIVED")
        .order_by(GovernanceCycle.year.desc(), GovernanceCycle.quarter.desc())
        .limit(cycles)
    )
    # ... load scorecards and compute averages per cycle
```

### Recurring Issue Detection

```python
async def detect_recurring_issues(self, db, vendor_id, min_occurrences=2):
    stmt = (
        select(Issue)
        .where(Issue.vendor_id == vendor_id)
        .where(Issue.occurrences >= min_occurrences)
        .where(Issue.status == "OPEN")
        .order_by(Issue.occurrences.desc())
    )
    return (await db.execute(stmt)).scalars().all()
```

### Score Diff Engine (`app/utils/score_diff.py`)

```python
def compare(current: list[ScorecardEntry],
            previous: list[ScorecardEntry]) -> list[ScoreChange]:
    """
    Compare two compiled scorecards and return significant changes.
    Significant = delta >= 1.0 point (absolute).
    """
    prev_map = {e.category: e.average_score for e in previous}
    curr_map = {e.category: e.average_score for e in current}

    changes = []
    for category in curr_map:
        prev_score = prev_map.get(category, 0)
        curr_score = curr_map[category]
        delta = curr_score - prev_score
        changes.append(ScoreChange(
            category=category,
            previous_score=prev_score,
            current_score=curr_score,
            delta=round(delta, 2),
            is_significant=abs(delta) >= 1.0,
        ))
    return sorted(changes, key=lambda x: abs(x.delta), reverse=True)
```

### Alignment Flag Detection

```python
def detect_alignment_flags(entries: list[ScorecardEntry],
                             threshold: float = 1.5) -> list[AlignmentFlag]:
    """
    Per category: if spread between max and min stakeholder score >= threshold,
    generate a flag with a prompt question.
    """
    from collections import defaultdict
    by_category = defaultdict(list)
    for e in entries:
        by_category[e.category].append(e)

    flags = []
    for category, cat_entries in by_category.items():
        scores = [(e.stakeholder_name, e.score) for e in cat_entries]
        min_score = min(s for _, s in scores)
        max_score = max(s for _, s in scores)
        spread = max_score - min_score
        if spread >= threshold:
            flags.append(AlignmentFlag(
                category=category,
                min_score=min_score,
                max_score=max_score,
                spread=spread,
                prompt_question=_build_prompt(category, scores, spread),
                stakeholders_involved=[n for n, _ in scores],
            ))
    return flags

def _build_prompt(category: str, scores: list, spread: float) -> str:
    low = min(scores, key=lambda x: x[1])
    high = max(scores, key=lambda x: x[1])
    return (
        f"{low[0]} and {high[0]} differ by {spread:.1f} points on "
        f"{category.replace('_', ' ').title()} — resolve before the vendor call."
    )
```

---

## 15. Repository Pattern

### Base Repository

```python
# app/repositories/base_repo.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

class BaseRepository:
    def __init__(self, model):
        self.model = model

    async def get(self, db: AsyncSession, id: str):
        result = await db.execute(select(self.model).where(self.model.id == id))
        return result.scalar_one_or_none()

    async def get_all(self, db: AsyncSession) -> list:
        result = await db.execute(select(self.model))
        return result.scalars().all()

    async def create(self, db: AsyncSession, obj) -> any:
        db.add(obj)
        await db.flush()
        await db.refresh(obj)
        return obj

    async def update(self, db: AsyncSession, obj) -> any:
        await db.flush()
        await db.refresh(obj)
        return obj

    async def delete(self, db: AsyncSession, id: str) -> bool:
        obj = await self.get(db, id)
        if obj:
            await db.delete(obj)
            await db.flush()
            return True
        return False
```

### `ScorecardRepository`

```python
class ScorecardRepository(BaseRepository):
    def __init__(self):
        super().__init__(Scorecard)

    async def get_by_cycle(self, db, cycle_id: str) -> list[Scorecard]:
        result = await db.execute(
            select(Scorecard).where(Scorecard.cycle_id == cycle_id)
        )
        return result.scalars().all()

    async def get_valid(self, db, cycle_id: str) -> list[Scorecard]:
        result = await db.execute(
            select(Scorecard)
            .where(Scorecard.cycle_id == cycle_id)
            .where(Scorecard.is_valid == 1)
        )
        return result.scalars().all()

    async def get_averages(self, db, cycle_id: str) -> dict[str, float]:
        entries = await self.get_valid(db, cycle_id)
        return validation_service.calculate_averages(entries)

    async def get_submission_status(self, db, cycle_id: str,
                                     stakeholder_ids: list[str]) -> list[dict]:
        submitted = {e.stakeholder_id for e in await self.get_by_cycle(db, cycle_id)}
        return [
            {"stakeholder_id": sid, "submitted": sid in submitted}
            for sid in stakeholder_ids
        ]
```

---

## 16. API Routes (Detailed)

### `app/api/deps.py`

```python
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import AsyncSessionLocal

async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session

async def get_cycle(cycle_id: str, db: AsyncSession = Depends(get_db)):
    cycle = await cycle_repo.get(db, cycle_id)
    if not cycle:
        raise HTTPException(status_code=404, detail=f"Cycle {cycle_id} not found")
    return cycle
```

### `app/api/routes/cycles.py`

```python
router = APIRouter(prefix="/cycles", tags=["cycles"])

@router.post("/", response_model=CycleOut, status_code=201)
async def create_cycle(payload: CycleCreateIn, db: AsyncSession = Depends(get_db)):
    cycle = GovernanceCycle(
        vendor_id=payload.vendor_id,
        cycle_name=payload.cycle_name,
        quarter=payload.quarter,
        year=payload.year,
    )
    return await cycle_repo.create(db, cycle)

@router.get("/", response_model=list[CycleOut])
async def list_cycles(vendor_id: str | None = None, db: AsyncSession = Depends(get_db)):
    return await cycle_repo.get_all_filtered(db, vendor_id=vendor_id)

@router.get("/{cycle_id}", response_model=CycleOut)
async def get_cycle(cycle = Depends(get_cycle)):
    return cycle
```

### `app/api/routes/scheduling.py`

```python
router = APIRouter(prefix="/cycles/{cycle_id}/scheduling", tags=["scheduling"])

@router.post("/start", response_model=AgentResponse)
async def start_scheduling(
    cycle = Depends(get_cycle),
    db: AsyncSession = Depends(get_db)
):
    workflow.assert_at_least(cycle.workflow_state, "CYCLE_CREATED")
    agent = SchedulingAgent(db=db, cycle_id=cycle.cycle_id)
    response = await agent.run("Start attendee refresh for new cycle")
    await workflow.transition(cycle, WorkflowState.ATTENDEE_REFRESH_SENT, db)
    return response

@router.post("/simulate-responses", response_model=AgentResponse)
async def simulate_responses(
    cycle = Depends(get_cycle),
    db: AsyncSession = Depends(get_db)
):
    """Demo endpoint: populates mock responses from seed data."""
    attendees = await attendee_repo.get_by_cycle(db, cycle.cycle_id)
    for attendee in attendees:
        attendee.is_confirmed = True
        attendee.invite_status = "ACCEPTED"
    await db.flush()
    return AgentResponse(
        status="success", agent="mock", run_id=str(uuid4()),
        summary=f"Simulated responses for {len(attendees)} attendees",
        data={"confirmed": len(attendees)},
        next_actions=["VIEW_SLOTS"],
    )

@router.get("/slots", response_model=list[SlotProposalOut])
async def get_ranked_slots(
    cycle = Depends(get_cycle),
    db: AsyncSession = Depends(get_db)
):
    return await slot_repo.get_by_cycle(db, cycle.cycle_id)

@router.post("/approve-slot", response_model=AgentResponse)
async def approve_slot(
    payload: ApproveSlotIn,
    cycle = Depends(get_cycle),
    db: AsyncSession = Depends(get_db)
):
    slot = await slot_repo.get(db, payload.slot_id)
    slot.is_approved = True
    await workflow.transition(cycle, WorkflowState.MEETING_SCHEDULED, db)
    return AgentResponse(
        status="pending_approval", agent="scheduling_agent", run_id=str(uuid4()),
        summary="Invite draft ready for review",
        data={"slot_id": slot.slot_id, "scheduled_time": slot.proposed_time.isoformat()},
        requires_approval=True,
        next_actions=["APPROVE_INVITE"],
    )
```

### `app/api/routes/scorecard.py`

```python
@router.post("/submit", response_model=AgentResponse)
async def submit_scorecard(
    payload: ScorecardSubmitIn,
    cycle = Depends(get_cycle),
    db: AsyncSession = Depends(get_db)
):
    workflow.assert_at_least(cycle.workflow_state, "SCORECARD_REQUEST_SENT")

    # Get existing valid entries for outlier calculation
    existing = await scorecard_repo.get_valid(db, cycle.cycle_id)

    entries_created = []
    warnings = []

    for category, score in payload.scores.items():
        group_scores = [e.score for e in existing if e.category == category]
        comment = payload.comments.get(category)

        result = validation_service.validate(score, comment, category, group_scores)

        entry = Scorecard(
            cycle_id=cycle.cycle_id,
            stakeholder_id=payload.stakeholder_id,
            vendor_id=cycle.vendor_id,
            category=category,
            score=score,
            comment=comment,
            is_valid=result.is_valid,
            validation_flags=result.flags,
        )
        db.add(entry)
        entries_created.append(entry)

        if not result.is_valid:
            warnings.extend(result.error_messages)
        elif "OUTLIER" in result.flags:
            warnings.append(f"{category}: score flagged as statistical outlier")

    await db.flush()

    # Update cycle state
    if cycle.workflow_state == "SCORECARD_REQUEST_SENT":
        await workflow.transition(cycle, WorkflowState.SCORECARD_COLLECTION, db)

    return AgentResponse(
        status="partial" if warnings else "success",
        agent="scorecard_agent",
        run_id=str(uuid4()),
        summary=f"Submitted {len(entries_created)} scorecard entries",
        data={"entries_created": len(entries_created)},
        warnings=warnings,
        next_actions=["VIEW_STATUS"],
    )

@router.post("/compile", response_model=AgentResponse)
async def compile_scorecard(
    cycle = Depends(get_cycle),
    db: AsyncSession = Depends(get_db)
):
    workflow.assert_at_least(cycle.workflow_state, "SCORECARD_COLLECTION")
    agent = ScorecardAgent(db=db, cycle_id=cycle.cycle_id)
    response = await agent.run("Compile final scorecard")
    await workflow.transition(cycle, WorkflowState.SCORECARD_COMPILED, db)
    return response
```

---

## 17. Utilities

### `app/utils/slot_ranking.py`

```python
def rank(attendees: list, proposed_times: list[str],
         organiser_id: str, exec_sponsor_id: str) -> list[dict]:
    """
    Deterministic slot ranking. Returns slots sorted by rank_score descending.
    """
    results = []
    for time_str in proposed_times:
        slot_time = datetime.fromisoformat(time_str)
        availability = _get_mock_availability(attendees, slot_time)

        # Hard constraints
        organiser_free = availability.get(organiser_id, False)
        exec_free = availability.get(exec_sponsor_id, False)

        if not organiser_free or not exec_free:
            score = 0.0  # Invalid slot
        else:
            key_count = sum(1 for a in attendees if a.is_key and availability.get(a.stakeholder_id))
            non_key_conflicts = sum(1 for a in attendees
                                     if not a.is_key and not availability.get(a.stakeholder_id, True))
            total_available = sum(1 for a in attendees if availability.get(a.stakeholder_id))

            score = (total_available / len(attendees)) * 100
            score -= non_key_conflicts * 10
            if _is_business_hours(slot_time):
                score += 5

        results.append({
            "proposed_time":           time_str,
            "rank_score":              round(score, 2),
            "organiser_available":     organiser_free,
            "exec_sponsor_available":  exec_free,
            "attendee_availability":   availability,
            "total_available":         total_available if score > 0 else 0,
            "total_attendees":         len(attendees),
        })

    return sorted(results, key=lambda x: x["rank_score"], reverse=True)

def _is_business_hours(dt: datetime) -> bool:
    return 9 <= dt.hour <= 17 and dt.weekday() < 5
```

### `app/utils/prompts.py`

All Claude prompt templates stored as constants. Example:

```python
SCHEDULING_SYSTEM_PROMPT = """
You are the VendorPulse Scheduling Agent for Shell's EGB/QBR governance cycles.
Your role is to manage meeting coordination for governance meetings.

You have access to tools to:
- Retrieve and update the attendee list
- Check stakeholder calendar availability
- Rank proposed meeting slots using deterministic logic
- Generate professional meeting invite content

Rules:
- Always use the rank_slots tool for slot recommendations — never guess availability
- Always require organiser approval before any send action
- Format all meeting invites professionally
- Never schedule outside of business hours (09:00–17:00 local time)

Return your final output as a valid JSON object with this structure:
{
  "summary": "...",
  "data": {...},
  "warnings": [...],
  "next_actions": [...],
  "requires_approval": true/false
}
"""

VENDOR_BRIEF_SYSTEM_PROMPT = """
You are the VendorPulse Vendor Prep Agent for Shell's EGB/QBR governance cycles.
Generate a structured, professional vendor brief based on scorecard data.

The brief must include:
1. Overall score and trend vs prior cycle
2. Per-category ratings with rationale (drawn from stakeholder comments)
3. Key concerns to raise with the vendor
4. Positive areas to acknowledge

Tone: factual, professional, no emotional language.
Never fabricate data — use only what the tools return.
...
"""

MINUTES_SYSTEM_PROMPT = """
You are the VendorPulse Meeting Support Agent.
Generate structured, professional meeting minutes from the captured notes.

Format:
1. Meeting metadata (date, attendees, cycle reference)
2. Executive summary (2–3 sentences)
3. Agenda item summaries
4. Key decisions (numbered list)
5. Q&A and objection log
6. Action items (structured: description, owner, due date)

Tone: formal, neutral, factual. Do not add interpretation beyond what was captured.
"""

ACTION_EXTRACTION_PROMPT = """
Extract structured action items from the following meeting notes.
For each action item, extract:
- description (what needs to be done)
- owner (person responsible, if mentioned)
- due_date (if mentioned, in ISO format YYYY-MM-DD)

Return as a JSON array:
[{"description": "...", "owner": "...", "due_date": "..."}]

If owner or due_date is not mentioned, use null.
Notes:
{notes}
"""

PUSHBACK_RESPONSE_PROMPT = """
Draft 3 professional response options for the following vendor objection raised during a Shell EGB/QBR governance meeting.

Objection: {objection}
Category: {category}
Relevant scorecard context: {context}

Draft responses with these three stances:
1. FACTUAL — data-backed, references specific metrics, neutral tone
2. NEUTRAL — collaborative, acknowledges vendor perspective, solution-focused
3. ESCALATION — firm, references contractual obligations, requests formal escalation

Return as JSON:
[
  {"stance": "FACTUAL",    "content": "..."},
  {"stance": "NEUTRAL",    "content": "..."},
  {"stance": "ESCALATION", "content": "..."}
]
"""
```

---

## 18. Seed Data

```python
# seed/seed_data.py

VENDORS = [
    {"name": "NovaTech Services",  "category": "IT Services", "status": "ACTIVE"},
    {"name": "CoreSystems Ltd",    "category": "IT Services", "status": "ACTIVE"},
    {"name": "Meridian IT",        "category": "IT Services", "status": "ACTIVE"},
]

STAKEHOLDERS = [
    {"name": "Alex Chen",      "email": "alex.chen@zensar.com",    "role": "VMO_COORDINATOR",  "organisation": "SHELL"},
    {"name": "Priya Kapoor",   "email": "priya.kapoor@zensar.com", "role": "INTERNAL_LEAD",    "organisation": "SHELL"},
    {"name": "Marcus Webb",    "email": "marcus.webb@zensar.com",  "role": "VENDOR_MANAGER",   "organisation": "SHELL"},
    {"name": "Sandra Mills",   "email": "sandra.mills@zensar.com", "role": "EGB_CHAIR",        "organisation": "SHELL"},
    {"name": "David Park",     "email": "david.park@zensar.com",   "role": "TECHNICAL_LEAD",   "organisation": "SHELL"},
    {"name": "Fatima Al-Said", "email": "fatima@zensar.com",       "role": "COMMERCIAL_LEAD",  "organisation": "SHELL"},
    {"name": "James Okafor",   "email": "j.okafor@novatech.com",  "role": "VENDOR_CONTACT",   "organisation": "VENDOR"},
    {"name": "Li Wei",         "email": "l.wei@coresystems.com",  "role": "VENDOR_CONTACT",   "organisation": "VENDOR"},
    {"name": "Anna Richter",   "email": "a.richter@meridian.com", "role": "VENDOR_CONTACT",   "organisation": "VENDOR"},
]

# Score trajectories — one entry per (vendor, quarter, year, category)
SCORE_MATRIX = {
    "NovaTech Services": {
        (1, 2025): {"DELIVERY_QUALITY": 3.0, "SLA_COMPLIANCE": 2.2, "INNOVATION": 3.0, "COMMUNICATION": 3.1, "VALUE_FOR_MONEY": 3.0},
        (2, 2025): {"DELIVERY_QUALITY": 3.2, "SLA_COMPLIANCE": 3.0, "INNOVATION": 3.1, "COMMUNICATION": 3.8, "VALUE_FOR_MONEY": 3.1},
        (3, 2025): {"DELIVERY_QUALITY": 3.8, "SLA_COMPLIANCE": 3.2, "INNOVATION": 4.0, "COMMUNICATION": 3.9, "VALUE_FOR_MONEY": 3.2},
        (4, 2025): {"DELIVERY_QUALITY": 4.1, "SLA_COMPLIANCE": 3.9, "INNOVATION": 4.8, "COMMUNICATION": 4.0, "VALUE_FOR_MONEY": 3.8},
    },
    "CoreSystems Ltd": {
        (1, 2025): {"DELIVERY_QUALITY": 3.9, "SLA_COMPLIANCE": 3.2, "INNOVATION": 3.0, "COMMUNICATION": 4.0, "VALUE_FOR_MONEY": 4.1},
        (2, 2025): {"DELIVERY_QUALITY": 3.2, "SLA_COMPLIANCE": 3.0, "INNOVATION": 2.5, "COMMUNICATION": 3.2, "VALUE_FOR_MONEY": 3.8},
        (3, 2025): {"DELIVERY_QUALITY": 2.8, "SLA_COMPLIANCE": 2.2, "INNOVATION": 2.2, "COMMUNICATION": 2.9, "VALUE_FOR_MONEY": 3.1},
        (4, 2025): {"DELIVERY_QUALITY": 2.2, "SLA_COMPLIANCE": 2.1, "INNOVATION": 2.0, "COMMUNICATION": 2.5, "VALUE_FOR_MONEY": 3.0},
    },
    "Meridian IT": {
        (1, 2025): {"DELIVERY_QUALITY": 3.1, "SLA_COMPLIANCE": 3.9, "INNOVATION": 3.0, "COMMUNICATION": 3.2, "VALUE_FOR_MONEY": 3.1},
        (2, 2025): {"DELIVERY_QUALITY": 3.0, "SLA_COMPLIANCE": 4.0, "INNOVATION": 3.1, "COMMUNICATION": 3.0, "VALUE_FOR_MONEY": 3.0},
        (3, 2025): {"DELIVERY_QUALITY": 3.2, "SLA_COMPLIANCE": 3.1, "INNOVATION": 3.0, "COMMUNICATION": 3.8, "VALUE_FOR_MONEY": 3.1},
        (4, 2025): {"DELIVERY_QUALITY": 3.1, "SLA_COMPLIANCE": 3.9, "INNOVATION": 3.0, "COMMUNICATION": 3.1, "VALUE_FOR_MONEY": 3.2},
    },
}

RECURRING_ISSUES = [
    {
        "vendor": "CoreSystems Ltd",
        "description": "Delivery Quality consistently below SLA threshold",
        "first_quarter": 2, "first_year": 2025, "occurrences": 3, "status": "OPEN",
    },
    {
        "vendor": "CoreSystems Ltd",
        "description": "Delayed invoice submissions causing payment cycle disruption",
        "first_quarter": 3, "first_year": 2025, "occurrences": 2, "status": "OPEN",
    },
    {
        "vendor": "NovaTech Services",
        "description": "Innovation KPIs not aligned to contract commitments",
        "first_quarter": 2, "first_year": 2025, "occurrences": 2, "status": "RESOLVED",
    },
]
```

---

## 19. Error Handling

### FastAPI Exception Handlers

```python
# app/main.py

@app.exception_handler(WorkflowViolationError)
async def workflow_violation_handler(request, exc):
    return JSONResponse(
        status_code=409,
        content={"detail": str(exc), "code": "WORKFLOW_VIOLATION"}
    )

@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(
        status_code=404,
        content={"detail": "Resource not found", "code": "NOT_FOUND"}
    )

@app.exception_handler(Exception)
async def generic_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "code": "INTERNAL_ERROR"}
    )
```

### LLM Error Strategy

| Error Type | Strategy |
|---|---|
| `RateLimitError` | Exponential backoff, 3 retries |
| `APIConnectionError` | Return graceful fallback `AgentResponse` with `status=failed` |
| `JSONDecodeError` (bad output) | Log raw output, return `raw_output` field in data |
| Timeout (>30s) | Cancel and return `status=failed` with "try again" next_action |

### Agent Fallback Pattern

```python
async def run(self, user_message: str, ...) -> AgentResponse:
    try:
        result = await self._tool_calling_loop(user_message)
        return self._build_response("success", result)
    except anthropic.APIError as e:
        # LLM unavailable — return what we can from deterministic data
        fallback = await self._get_deterministic_fallback()
        return AgentResponse(
            status="partial",
            summary="AI generation unavailable — showing cached data",
            data=fallback,
            warnings=["LLM service unavailable. Retry for full AI output."],
            next_actions=["RETRY"],
        )
```

---

## 20. Logging & Traceability

### Structured Logging

```python
# app/core/config.py
import logging

logging.basicConfig(
    format='%(asctime)s | %(levelname)s | %(name)s | %(message)s',
    level=logging.INFO,
)
logger = logging.getLogger("vendorpulse")
```

Every agent run logs:

```python
logger.info(f"Agent {self.agent_name} started | cycle={self.cycle_id} | run={self._run_id}")
logger.info(f"Tool called: {tool_name} | input={json.dumps(tool_input)[:200]}")
logger.info(f"Agent {self.agent_name} completed | status=SUCCESS | run={self._run_id}")
logger.error(f"Agent {self.agent_name} failed | error={str(e)} | run={self._run_id}")
```

### `agent_runs` Table — Query Patterns

```sql
-- Recent failures
SELECT * FROM agent_runs WHERE status = 'FAILED' ORDER BY created_at DESC LIMIT 20;

-- All runs for a cycle
SELECT * FROM agent_runs WHERE cycle_id = ? ORDER BY created_at;

-- Average agent execution time
SELECT agent_name, COUNT(*) as runs, AVG(julianday(updated_at) - julianday(created_at)) * 86400 as avg_seconds
FROM agent_runs GROUP BY agent_name;
```

---

## 21. Testing Strategy

### Unit Tests

| File | What Is Tested |
|---|---|
| `test_slot_ranking.py` | All combinations of key/non-key availability, business hours bonus |
| `test_validation_service.py` | All 4 validation rules, edge cases (score=1 with comment, score=5 without) |
| `test_score_diff.py` | Delta calculation, significant threshold, sort order |
| `test_workflow_engine.py` | Valid transitions, invalid transitions, assert_at_least |

### Integration Tests

| File | What Is Tested |
|---|---|
| `test_scheduling_flow.py` | `POST /start` → simulate responses → `GET /slots` → `POST /approve-slot` |
| `test_scorecard_flow.py` | Send request → submit valid + invalid → compile → get compiled |
| `test_meeting_flow.py` | Capture notes → generate minutes → approve → get merged actions |

### E2E Demo Test

```python
# tests/e2e/test_demo_narrative.py

async def test_full_demo_narrative(client, seeded_db):
    """
    Runs the complete 8-step demo flow end-to-end.
    Must pass without errors and all workflow states must advance correctly.
    """
    # Step 1: Create cycle
    r = await client.post("/api/cycles", json={...})
    cycle_id = r.json()["cycle_id"]

    # Step 2: Start scheduling
    r = await client.post(f"/api/cycles/{cycle_id}/scheduling/start")
    assert r.json()["status"] == "success"

    # Step 3: Simulate responses
    await client.post(f"/api/cycles/{cycle_id}/scheduling/simulate-responses")

    # Step 4: Get slots and approve
    slots = await client.get(f"/api/cycles/{cycle_id}/scheduling/slots")
    top_slot = slots.json()[0]["slot_id"]
    await client.post(f"/api/cycles/{cycle_id}/scheduling/approve-slot",
                      json={"slot_id": top_slot})

    # Step 5: Send scorecard and simulate submissions
    await client.post(f"/api/cycles/{cycle_id}/scorecard/send-request")
    await client.post(f"/api/cycles/{cycle_id}/scorecard/simulate-submissions")
    await client.post(f"/api/cycles/{cycle_id}/scorecard/compile")

    # Step 6: Alignment
    changes = await client.get(f"/api/cycles/{cycle_id}/alignment/changes")
    assert len(changes.json()) > 0

    # Step 7: Vendor brief
    brief = await client.post(f"/api/cycles/{cycle_id}/vendor-prep/generate-brief")
    assert brief.json()["status"] in ("success", "pending_approval")

    # Step 8: Analytics
    issues = await client.get("/api/analytics/recurring-issues")
    assert len(issues.json()) >= 1    # CoreSystems recurring issues must fire
```

---

## 22. Environment & Deployment

### `.env.example`

```env
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=sqlite+aiosqlite:///./vendorpulse.db
ENVIRONMENT=development       # development | production
LOG_LEVEL=INFO
CORS_ORIGINS=http://localhost:3000
```

### `app/core/config.py`

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    ANTHROPIC_API_KEY:  str
    DATABASE_URL:       str = "sqlite+aiosqlite:///./vendorpulse.db"
    ENVIRONMENT:        str = "development"
    LOG_LEVEL:          str = "INFO"
    CORS_ORIGINS:       list[str] = ["http://localhost:3000"]

    class Config:
        env_file = ".env"

settings = Settings()
```

### `app/main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.routes import cycles, scheduling, scorecard, alignment, vendor_prep, meeting, analytics

app = FastAPI(title="VendorPulse API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cycles.router,      prefix="/api")
app.include_router(scheduling.router,  prefix="/api")
app.include_router(scorecard.router,   prefix="/api")
app.include_router(alignment.router,   prefix="/api")
app.include_router(vendor_prep.router, prefix="/api")
app.include_router(meeting.router,     prefix="/api")
app.include_router(analytics.router,   prefix="/api")
```

### Startup Command

```bash
# Development
uvicorn app.main:app --reload --port 8000

# Production
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
```

### Deployment

| Service | Platform | Config |
|---|---|---|
| FastAPI | Render.com / Fly.io | `Dockerfile` or native Python buildpack |
| SQLite | Persisted via volume mount | `/data/vendorpulse.db` |
| Env vars | Platform secrets manager | `ANTHROPIC_API_KEY`, `DATABASE_URL` |

### `Dockerfile`

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN python seed/seed_data.py
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

*VendorPulse Backend LLD v1.0 — Zensar Technologies — 2026-04-01*
