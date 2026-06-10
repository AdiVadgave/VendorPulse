# VendorPulse — Backend High-Level Design UML Diagrams

> **Format:** PlantUML | Render at: https://www.plantuml.com/plantuml/uml
> **Coverage:** System architecture · Workflow state machine · Agent pipeline · Tool-calling loop · Service layer · Data model

---

## Table of Contents

1. [High-Level System Architecture](#1-high-level-system-architecture)
2. [Workflow State Machine](#2-workflow-state-machine)
3. [Agent Pipeline Overview (Modules A–F)](#3-agent-pipeline-overview-modules-af)
4. [Agent Tool-Calling Loop (Claude API)](#4-agent-tool-calling-loop-claude-api)
5. [Service Layer & Dependencies](#5-service-layer--dependencies)
6. [Simplified Data Model (ERD)](#6-simplified-data-model-erd)

---

## 1. High-Level System Architecture

```plantuml
@startuml HLD_SystemArchitecture
skinparam componentStyle rectangle
skinparam backgroundColor #FAFAFA
skinparam component {
  BackgroundColor #DAE8F5
  BorderColor #0063B1
  FontColor #002D5C
  FontSize 11
}
skinparam package {
  BackgroundColor #F4F6F9
  BorderColor #BFBFBF
}
skinparam database {
  BackgroundColor #EFF5FB
  BorderColor #0063B1
}
skinparam cloud {
  BackgroundColor #FFF8E1
  BorderColor #C99A06
}
skinparam arrow {
  Color #0063B1
}

package "Frontend (React SPA)" {
  [React App\nDashboard · CycleDetail · Analytics] as FE
}

package "Backend (FastAPI — Async)" {

  package "API Routes Layer" {
    [cycles.py\nCycle CRUD + state] as R1
    [scheduling.py\nModule A] as R2
    [scorecard.py\nModule B] as R3
    [alignment.py\nModule C] as R4
    [vendor_prep.py\nModule D] as R5
    [meeting.py\nModule E] as R6
    [analytics.py\nModule F] as R7
  }

  package "Orchestration Layer" {
    [WorkflowEngine\n12-state machine] as WF
    [SchedulingAgent\nModule A] as AgA
    [ScorecardAgent\nModule B] as AgB
    [AlignmentAgent\nModule C] as AgC
    [VendorPrepAgent\nModule D] as AgD
    [MeetingAgent\nModule E] as AgE
    [MemoryAgent\nModule F] as AgF
  }

  package "Service Layer" {
    [LLMService\nClaude API wrapper] as LLM
    [ValidationService\nScorecard rules] as Val
    [AnalyticsService\nTrend engine] as Ana
    [MockCalendarService] as MCal
    [MockEmailService] as MEm
    [MockFormService] as MFm
    [MockNotificationService] as MNt
  }

  package "Data Access Layer" {
    [Repositories\nCycle · Vendor · Scorecard\nMeeting · Agent Run · …] as Repo
  }
}

database "SQLite DB\n(13 tables)" as DB
cloud "Anthropic\nClaude API\n(tool-calling)" as Claude

FE --> R1 : REST / HTTP
FE --> R2
FE --> R3
FE --> R4
FE --> R5
FE --> R6
FE --> R7

R1 --> WF : validate transitions
R2 --> AgA
R3 --> AgB
R4 --> AgC
R5 --> AgD
R6 --> AgE
R7 --> AgF

AgA --> LLM
AgB --> LLM
AgC --> LLM
AgD --> LLM
AgE --> LLM
AgF --> LLM

AgA --> MCal
AgA --> MEm
AgB --> MEm
AgD --> MEm
AgE --> MEm

AgB --> Val
AgF --> Ana

AgA --> Repo
AgB --> Repo
AgC --> Repo
AgD --> Repo
AgE --> Repo
AgF --> Repo

Repo --> DB
LLM --> Claude

@enduml
```

---

## 2. Workflow State Machine

```plantuml
@startuml HLD_WorkflowStateMachine
skinparam backgroundColor #FAFAFA
skinparam state {
  BackgroundColor #DAE8F5
  BorderColor #0063B1
  FontColor #002D5C
  FontSize 11
}
skinparam note {
  BackgroundColor #FFF8E1
  BorderColor #C99A06
  FontSize 10
}
skinparam arrow {
  Color #0063B1
}

title VendorPulse — Governance Cycle Workflow State Machine
note as Legend
  Rule: Forward transitions only.
  No skipping. No rollback.
  WorkflowViolationError → HTTP 409.
end note

[*] --> CYCLE_CREATED

CYCLE_CREATED --> ATTENDEE_REFRESH_SENT : [Module A]\nSchedulingAgent\nsends refresh emails\n(requires approval)

ATTENDEE_REFRESH_SENT --> AVAILABILITY_COLLECTED : Attendees respond\nto refresh form

AVAILABILITY_COLLECTED --> MEETING_SCHEDULED : [Module A]\nCoordinator approves\nranked slot\n(requires approval)

note right of MEETING_SCHEDULED
  Calendar invite sent
  via MockCalendarService
end note

MEETING_SCHEDULED --> SCORECARD_REQUEST_SENT : [Module B]\nScorecardAgent\ndispatches forms\n(requires approval)

SCORECARD_REQUEST_SENT --> SCORECARD_COLLECTION : Stakeholders\nsubmit scores

note right of SCORECARD_COLLECTION
  ScorecardAgent sends
  tiered reminders:
  reminder_1 → reminder_2
  → escalation
end note

SCORECARD_COLLECTION --> SCORECARD_COMPILED : [Module B]\nScorecardAgent compiles\nvalidates + flags outliers

SCORECARD_COMPILED --> INTERNAL_ALIGNMENT : [Module C]\nAlignmentAgent generates\nalignment document

note right of INTERNAL_ALIGNMENT
  Highlights score deltas
  Flags high-spread categories
  Extracts action items
  from alignment notes
end note

INTERNAL_ALIGNMENT --> VENDOR_PREP : [Module D]\nVendorPrepAgent\ngenerates vendor brief\n(requires approval)

note right of VENDOR_PREP
  Handles vendor pushback
  with AI-generated
  FACTUAL / NEUTRAL /
  ESCALATION responses
end note

VENDOR_PREP --> MEETING_IN_PROGRESS : [Module E]\nMeetingAgent provides\nfacilitator briefing

MEETING_IN_PROGRESS --> POST_MEETING_COMPLETE : [Module E]\nMeetingAgent generates\nminutes + action items\n(requires approval)

POST_MEETING_COMPLETE --> ARCHIVED : Cycle archived

ARCHIVED --> [*]

note bottom of ARCHIVED
  [Module F] MemoryAgent
  reads ARCHIVED cycles
  for trend analysis,
  recurring issue detection,
  and leadership briefings.
  (Cross-cycle, read-only)
end note

@enduml
```

---

## 3. Agent Pipeline Overview (Modules A–F)

```plantuml
@startuml HLD_AgentPipeline
skinparam backgroundColor #FAFAFA
skinparam classBackgroundColor #DAE8F5
skinparam classBorderColor #0063B1
skinparam classHeaderBackgroundColor #0063B1
skinparam classFontColor #002D5C
skinparam packageBackgroundColor #F4F6F9
skinparam packageBorderColor #BFBFBF

title Agent Modules A–F — Capabilities & Tools

abstract class BaseAgent {
  + agent_name: str
  + db: AsyncSession
  + cycle_id: str
  + llm: LLMService
  + run_id: UUID
  --
  + {abstract} get_system_prompt(): str
  + {abstract} get_tools(): list[dict]
  + {abstract} execute_tool(name, input): str
  + run(message): AgentResponse
  - _tool_calling_loop(message)
  - _create_run_record()
  - _update_run_record()
  - _build_response()
}

class SchedulingAgent {
  agent_name = "scheduling_agent"
  --
  Tools:
  get_cycle_attendees()
  send_attendee_refresh_emails() *
  get_availability()
  rank_slots()
  create_slot_proposal()
  approve_and_schedule() *
  --
  * = requires_approval
}

class ScorecardAgent {
  agent_name = "scorecard_agent"
  --
  Tools:
  dispatch_scorecard_requests() *
  get_submission_status()
  send_reminder() *
  compile_scorecard()
  flag_outliers()
  --
  * = requires_approval
}

class AlignmentAgent {
  agent_name = "alignment_agent"
  --
  Tools:
  get_score_diff()
  get_alignment_flags()
  generate_alignment_doc()
  update_face_off_model()
  extract_action_items()
}

class VendorPrepAgent {
  agent_name = "vendor_prep_agent"
  --
  Tools:
  get_compiled_scorecard()
  get_trend_data()
  generate_vendor_brief() *
  handle_pushback()
  resolve_pushback()
  --
  * = requires_approval
}

class MeetingAgent {
  agent_name = "meeting_agent"
  --
  Tools:
  get_meeting_context()
  capture_note()
  parse_transcript()
  generate_minutes()
  approve_minutes() *
  extract_actions_from_minutes()
  --
  * = requires_approval
}

class MemoryAgent {
  agent_name = "memory_agent"
  --
  Tools:
  get_multi_cycle_scores()
  detect_recurring_issues()
  get_cross_vendor_data()
  generate_leadership_brief()
  update_issue_record()
  --
  (read-only — cross-cycle)
}

BaseAgent <|-- SchedulingAgent
BaseAgent <|-- ScorecardAgent
BaseAgent <|-- AlignmentAgent
BaseAgent <|-- VendorPrepAgent
BaseAgent <|-- MeetingAgent
BaseAgent <|-- MemoryAgent

note right of SchedulingAgent
  Module A
  States: CYCLE_CREATED →
  MEETING_SCHEDULED
end note

note right of ScorecardAgent
  Module B
  States: MEETING_SCHEDULED →
  SCORECARD_COMPILED
end note

note right of AlignmentAgent
  Module C
  State: INTERNAL_ALIGNMENT
end note

note right of VendorPrepAgent
  Module D
  State: VENDOR_PREP
end note

note right of MeetingAgent
  Module E
  States: MEETING_IN_PROGRESS →
  POST_MEETING_COMPLETE
end note

note right of MemoryAgent
  Module F
  Reads: ARCHIVED cycles
  Cross-cycle analytics
end note

@enduml
```

---

## 4. Agent Tool-Calling Loop (Claude API)

```plantuml
@startuml HLD_ToolCallingLoop
skinparam backgroundColor #FAFAFA
skinparam sequence {
  ParticipantBackgroundColor #DAE8F5
  ParticipantBorderColor #0063B1
  ParticipantFontColor #002D5C
  ArrowColor #0063B1
  LifeLineBorderColor #0063B1
  NoteBackgroundColor #FFF8E1
  NoteBorderColor #C99A06
}

title BaseAgent — Claude API Tool-Calling Loop

participant "FastAPI\nRoute Handler" as Route
participant "Agent\n(subclass)" as Agent
participant "LLMService\n(Claude SDK)" as LLM
participant "Claude\nAPI" as Claude
participant "execute_tool()\n(per agent)" as Tool
database "SQLite\nDB" as DB
participant "Mock\nServices" as Mock

Route -> Agent : agent.run(user_message)
Agent -> DB : INSERT agent_runs (PENDING)
Agent -> LLM : call(system_prompt, tools, messages)
LLM -> Claude : POST /v1/messages\n{ tools, messages }

loop Tool-Calling Loop
  Claude --> LLM : Response

  alt stop_reason = "tool_use"
    LLM --> Agent : tool_name + tool_input
    Agent -> Tool : execute_tool(name, input)

    alt DB operation
      Tool -> DB : read / write
      DB --> Tool : result
    else Mock service call
      Tool -> Mock : send email / invite / form
      Mock --> Tool : mock confirmation
    end

    Tool --> Agent : result_string
    Agent -> LLM : append tool_result to messages
    LLM -> Claude : POST /v1/messages\n(continue loop)

  else stop_reason = "end_turn"
    LLM --> Agent : final text response
  end
end

Agent -> DB : UPDATE agent_runs\n(SUCCESS / FAILED / PARTIAL)
Agent --> Route : AgentResponse\n{ status, summary, data,\n  warnings, next_actions,\n  requires_approval, run_id }

note right of Agent
  Every response includes run_id
  linking to agent_runs record
  for full traceability.
end note

@enduml
```

---

## 5. Service Layer & Dependencies

```plantuml
@startuml HLD_ServiceLayer
skinparam classBackgroundColor #DAE8F5
skinparam classBorderColor #0063B1
skinparam classHeaderBackgroundColor #0063B1
skinparam classFontColor #002D5C
skinparam backgroundColor #FAFAFA
skinparam packageBackgroundColor #F4F6F9
skinparam packageBorderColor #BFBFBF

title Service Layer — Responsibilities & Agent Consumers

package "Core Services" {

  class LLMService {
    - client: Anthropic SDK
    - model: claude-opus-4-6
    --
    + call(system, tools, messages)
    + handle_tool_use(response)
    + retry_on_overload()
    + log_token_usage()
  }

  class ValidationService {
    --
    + validate_score(score): bool
    + check_range(score): flag[]
    + detect_duplicate(cycle, stakeholder): bool
    + flag_outlier(scores): bool
    + compute_spread(scores): float
  }

  class AnalyticsService {
    --
    + compute_trends(vendor, cycles): TrendData
    + detect_recurring_issues(vendor): Issue[]
    + cross_vendor_compare(vendors): CompareData
    + compute_delta(prev, curr): ScoreChange[]
  }
}

package "Mock External Services" {

  abstract class BaseMockService {
    + {abstract} execute()
    + log_call()
    + return_mock_response()
  }

  class MockCalendarService {
    --
    + send_invite(attendees, slot): confirmation
    + update_invite(meeting_id): confirmation
    + cancel_invite(meeting_id): confirmation
  }

  class MockEmailService {
    --
    + send(to, subject, body): message_id
    + send_bulk(recipients, template): results[]
    + log_delivery()
  }

  class MockFormService {
    --
    + generate_link(cycle, stakeholder): url
    + collect_responses(cycle): responses[]
    + mark_submitted(stakeholder_id)
  }

  class MockNotificationService {
    --
    + push(stakeholder, content): notification_id
    + send_nudge(stakeholder, type)
    + broadcast(cycle, message)
  }

  BaseMockService <|-- MockCalendarService
  BaseMockService <|-- MockEmailService
  BaseMockService <|-- MockFormService
  BaseMockService <|-- MockNotificationService
}

package "Agent Consumers" {
  class SchedulingAgent
  class ScorecardAgent
  class AlignmentAgent
  class VendorPrepAgent
  class MeetingAgent
  class MemoryAgent
}

SchedulingAgent --> LLMService
SchedulingAgent --> MockCalendarService
SchedulingAgent --> MockEmailService

ScorecardAgent --> LLMService
ScorecardAgent --> ValidationService
ScorecardAgent --> MockEmailService
ScorecardAgent --> MockFormService

AlignmentAgent --> LLMService
AlignmentAgent --> AnalyticsService

VendorPrepAgent --> LLMService
VendorPrepAgent --> MockEmailService

MeetingAgent --> LLMService
MeetingAgent --> MockEmailService
MeetingAgent --> MockNotificationService

MemoryAgent --> LLMService
MemoryAgent --> AnalyticsService

@enduml
```

---

## 6. Simplified Data Model (ERD)

```plantuml
@startuml HLD_DataModel
skinparam entityBackgroundColor #DAE8F5
skinparam entityBorderColor #0063B1
skinparam entityFontColor #002D5C
skinparam backgroundColor #FAFAFA
skinparam arrowColor #0063B1
skinparam packageBackgroundColor #F4F6F9
skinparam packageBorderColor #BFBFBF

title Simplified ERD — Core Entities & Relationships

entity "vendors" as Vendor {
  * vendor_id : TEXT PK
  --
  name : TEXT UNIQUE
  category : TEXT
  status : ACTIVE | INACTIVE
}

entity "governance_cycles" as Cycle {
  * cycle_id : TEXT PK
  --
  vendor_id : TEXT FK
  cycle_name : TEXT
  quarter : 1–4
  year : INT
  workflow_state : TEXT
  <<12 states>>
}

entity "stakeholders" as Stakeholder {
  * stakeholder_id : TEXT PK
  --
  name : TEXT
  email : TEXT UNIQUE
  role : VMO_COORDINATOR | INTERNAL_LEAD\n  | VENDOR_MANAGER | EGB_CHAIR\n  | TECHNICAL_LEAD | VENDOR_CONTACT
  organisation : SHELL | VENDOR
}

entity "cycle_attendees" as Attendee {
  * id : TEXT PK
  --
  cycle_id : TEXT FK
  stakeholder_id : TEXT FK
  is_key : BOOL
  invite_status : PENDING|ACCEPTED|DECLINED
  replacement_name : TEXT?
}

entity "scorecards" as Scorecard {
  * scorecard_id : TEXT PK
  --
  cycle_id : TEXT FK
  stakeholder_id : TEXT FK
  category : DELIVERY_QUALITY\n  | SLA_COMPLIANCE | INNOVATION\n  | COMMUNICATION | VALUE_FOR_MONEY
  score : 1.0–5.0
  is_valid : BOOL
  validation_flags : JSON[]
}

entity "meetings" as Meeting {
  * meeting_id : TEXT PK
  --
  cycle_id : TEXT FK
  meeting_type : INTERNAL_ALIGNMENT\n  | VENDOR_PREP | EGB_QBR
  scheduled_time : DATETIME
  minutes_approved : BOOL
}

entity "meeting_notes" as Note {
  * note_id : TEXT PK
  --
  meeting_id : TEXT FK
  note_type : QUESTION | OBJECTION\n  | DECISION | APPRECIATION | ACTION
  content : TEXT
  raised_by_role : TEXT
}

entity "action_items" as Action {
  * action_id : TEXT PK
  --
  cycle_id : TEXT FK
  source_module : ALIGNMENT\n  | VENDOR_PREP | MEETING
  description : TEXT
  owner : TEXT
  status : OPEN | IN_PROGRESS | CLOSED
}

entity "issues" as Issue {
  * issue_id : TEXT PK
  --
  vendor_id : TEXT FK
  description : TEXT
  occurrences : INT
  status : OPEN | RESOLVED
}

entity "slot_proposals" as Slot {
  * slot_id : TEXT PK
  --
  cycle_id : TEXT FK
  proposed_time : DATETIME
  rank_score : REAL
  organiser_available : BOOL
  exec_sponsor_available : BOOL
  is_approved : BOOL
}

entity "notifications" as Notif {
  * notification_id : TEXT PK
  --
  cycle_id : TEXT FK
  stakeholder_id : TEXT FK
  type : SCORECARD_REQUEST | REMINDER_1\n  | REMINDER_2 | ESCALATION\n  | INVITE | NUDGE
  status : SENT | DELIVERED | FAILED
}

entity "agent_runs" as AgentRun {
  * run_id : TEXT PK
  --
  agent_name : TEXT
  cycle_id : TEXT FK
  status : PENDING | SUCCESS\n  | FAILED | PARTIAL
  triggered_by : USER | SYSTEM
  input_payload : JSON
  output_payload : JSON
}

Vendor ||--o{ Cycle : "has"
Cycle ||--o{ Attendee : "has"
Stakeholder ||--o{ Attendee : "is"
Cycle ||--o{ Scorecard : "has"
Stakeholder ||--o{ Scorecard : "submits"
Cycle ||--o{ Meeting : "has"
Meeting ||--o{ Note : "has"
Cycle ||--o{ Action : "has"
Vendor ||--o{ Issue : "tracks"
Cycle ||--o{ Slot : "proposes"
Cycle ||--o{ Notif : "logs"
Cycle ||--o{ AgentRun : "records"

@enduml
```
