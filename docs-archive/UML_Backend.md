# VendorPulse — Backend UML Diagrams

> **Format:** PlantUML | Render at: https://www.plantuml.com/plantuml/uml  
> **Coverage:** ERD · Class diagrams · Sequence flows · State machine · Component architecture

---

## Table of Contents

1. [System Architecture Component Diagram](#1-system-architecture-component-diagram)
2. [Entity Relationship Diagram (ERD)](#2-entity-relationship-diagram-erd)
3. [ORM Model Class Diagram](#3-orm-model-class-diagram)
4. [Agent Class Hierarchy Diagram](#4-agent-class-hierarchy-diagram)
5. [Service Layer Class Diagram](#5-service-layer-class-diagram)
6. [Repository Layer Class Diagram](#6-repository-layer-class-diagram)
7. [Pydantic Schema Class Diagram](#7-pydantic-schema-class-diagram)
8. [Workflow Engine Class & State Diagram](#8-workflow-engine-class--state-diagram)
9. [Mock Services Class Diagram](#9-mock-services-class-diagram)
10. [Sequence: Full Request Lifecycle](#10-sequence-full-request-lifecycle)
11. [Sequence: Agent Tool-Calling Loop (Claude API)](#11-sequence-agent-tool-calling-loop-claude-api)
12. [Sequence: Module A — Scheduling Agent Execution](#12-sequence-module-a--scheduling-agent-execution)
13. [Sequence: Module B — Scorecard Validation Pipeline](#13-sequence-module-b--scorecard-validation-pipeline)
14. [Sequence: Module C — Alignment & Action Extraction](#14-sequence-module-c--alignment--action-extraction)
15. [Sequence: Module D — Vendor Brief Generation](#15-sequence-module-d--vendor-brief-generation)
16. [Sequence: Module E — Minutes Generation](#16-sequence-module-e--minutes-generation)
17. [Sequence: Module F — Recurring Issue Detection](#17-sequence-module-f--recurring-issue-detection)
18. [Sequence: Seed Data Initialisation](#18-sequence-seed-data-initialisation)
19. [State Machine: Workflow Engine](#19-state-machine-workflow-engine)
20. [Activity: Scorecard Compilation Pipeline](#20-activity-scorecard-compilation-pipeline)
21. [Activity: LLM Service with Retry](#21-activity-llm-service-with-retry)
22. [Deployment Component Diagram](#22-deployment-component-diagram)

---

## 1. System Architecture Component Diagram

```plantuml
@startuml SystemArchitecture
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

package "Frontend (React + Vite)" {
  [Dashboard Page]
  [CycleDetail Page]
  [Analytics Page]
  [Shared Components]
  [API Client (axios)]
  [Zustand Stores]
  [TanStack Query]
}

package "Backend (FastAPI)" {
  package "API Routes Layer" {
    [cycles.py]
    [scheduling.py]
    [scorecard.py]
    [alignment.py]
    [vendor_prep.py]
    [meeting.py]
    [analytics.py]
  }
  package "Orchestration Layer" {
    [WorkflowEngine]
    [SchedulingAgent]
    [ScorecardAgent]
    [AlignmentAgent]
    [VendorPrepAgent]
    [MeetingAgent]
    [MemoryAgent]
  }
  package "Service Layer" {
    [LLMService]
    [ValidationService]
    [AnalyticsService]
    [MockCalendarService]
    [MockEmailService]
    [MockFormService]
    [MockNotificationService]
  }
  package "Data Layer" {
    [CycleRepository]
    [ScorecardRepository]
    [MeetingRepository]
    [ActionRepository]
    [IssueRepository]
    [AgentRunRepository]
  }
}

database "SQLite\nvendorpulse.db" as DB {
  [vendors]
  [governance_cycles]
  [stakeholders]
  [scorecards]
  [meetings]
  [meeting_notes]
  [action_items]
  [issues]
  [agent_runs]
  [notifications]
  [slot_proposals]
  [face_off_model]
  [cycle_attendees]
}

cloud "Anthropic Claude API\nclaude-sonnet-4-6" as Claude

[API Client (axios)] --> [cycles.py] : HTTP REST
[API Client (axios)] --> [scheduling.py] : HTTP REST
[API Client (axios)] --> [scorecard.py] : HTTP REST
[API Client (axios)] --> [alignment.py] : HTTP REST
[API Client (axios)] --> [vendor_prep.py] : HTTP REST
[API Client (axios)] --> [meeting.py] : HTTP REST
[API Client (axios)] --> [analytics.py] : HTTP REST

[cycles.py] --> [WorkflowEngine]
[scheduling.py] --> [SchedulingAgent]
[scorecard.py] --> [ScorecardAgent]
[alignment.py] --> [AlignmentAgent]
[vendor_prep.py] --> [VendorPrepAgent]
[meeting.py] --> [MeetingAgent]
[analytics.py] --> [MemoryAgent]

[SchedulingAgent] --> [LLMService]
[AlignmentAgent] --> [LLMService]
[VendorPrepAgent] --> [LLMService]
[MeetingAgent] --> [LLMService]
[MemoryAgent] --> [LLMService]

[ScorecardAgent] --> [ValidationService]
[AnalyticsService] --> [IssueRepository]

[LLMService] --> Claude : HTTPS

[CycleRepository] --> DB
[ScorecardRepository] --> DB
[MeetingRepository] --> DB
[ActionRepository] --> DB
[IssueRepository] --> DB
[AgentRunRepository] --> DB

@enduml
```

---

## 2. Entity Relationship Diagram (ERD)

```plantuml
@startuml ERD
skinparam classBackgroundColor #EFF5FB
skinparam classBorderColor #0063B1
skinparam classHeaderBackgroundColor #002D5C
skinparam classHeaderFontColor #FFFFFF
skinparam classFontColor #1A1A2E
skinparam classFontSize 9
skinparam arrowColor #0063B1

entity vendors {
  * vendor_id : TEXT <<PK>>
  --
  * name : TEXT UNIQUE
  * category : TEXT
  * status : TEXT DEFAULT 'ACTIVE'
  * created_at : DATETIME
}

entity governance_cycles {
  * cycle_id : TEXT <<PK>>
  --
  * vendor_id : TEXT <<FK>>
  * cycle_name : TEXT
  * quarter : INTEGER (1-4)
  * year : INTEGER
  * workflow_state : TEXT
  * created_at : DATETIME
  * updated_at : DATETIME
}

entity stakeholders {
  * stakeholder_id : TEXT <<PK>>
  --
  * name : TEXT
  * email : TEXT UNIQUE
  * role : TEXT
  * organisation : TEXT (SHELL|VENDOR)
  * is_active : INTEGER DEFAULT 1
  * created_at : DATETIME
}

entity cycle_attendees {
  * id : TEXT <<PK>>
  --
  * cycle_id : TEXT <<FK>>
  * stakeholder_id : TEXT <<FK>>
  * is_confirmed : INTEGER DEFAULT 1
  * is_key : INTEGER DEFAULT 0
  * invite_status : TEXT DEFAULT 'PENDING'
  replacement_name : TEXT
  replacement_email : TEXT
  refresh_response : TEXT
  responded_at : DATETIME
}

entity scorecards {
  * scorecard_id : TEXT <<PK>>
  --
  * cycle_id : TEXT <<FK>>
  * stakeholder_id : TEXT <<FK>>
  * vendor_id : TEXT <<FK>>
  * category : TEXT
  * score : REAL (1.0-5.0)
  comment : TEXT
  * is_valid : INTEGER DEFAULT 1
  validation_flags : TEXT (JSON)
  * submitted_at : DATETIME
}

entity meetings {
  * meeting_id : TEXT <<PK>>
  --
  * cycle_id : TEXT <<FK>>
  * meeting_type : TEXT
  scheduled_time : DATETIME
  location_or_dial_in : TEXT
  invite_sent_at : DATETIME
  minutes_generated_at : DATETIME
  * minutes_approved : INTEGER DEFAULT 0
}

entity meeting_notes {
  * note_id : TEXT <<PK>>
  --
  * meeting_id : TEXT <<FK>>
  * note_type : TEXT
  * content : TEXT
  raised_by_role : TEXT
  * timestamp : DATETIME
  * is_actioned : INTEGER DEFAULT 0
}

entity action_items {
  * action_id : TEXT <<PK>>
  --
  * cycle_id : TEXT <<FK>>
  * source_module : TEXT
  * description : TEXT
  owner : TEXT
  due_date : DATE
  * status : TEXT DEFAULT 'OPEN'
  * created_at : DATETIME
}

entity issues {
  * issue_id : TEXT <<PK>>
  --
  * vendor_id : TEXT <<FK>>
  * description : TEXT
  * first_seen_cycle_id : TEXT <<FK>>
  * occurrences : INTEGER DEFAULT 1
  * status : TEXT DEFAULT 'OPEN'
  last_owner : TEXT
  * last_updated : DATETIME
}

entity face_off_model {
  * id : TEXT <<PK>>
  --
  * cycle_id : TEXT <<FK>>
  * position_number : INTEGER
  shell_name : TEXT
  shell_role : TEXT
  vendor_name : TEXT
  vendor_role : TEXT
}

entity notifications {
  * notification_id : TEXT <<PK>>
  --
  * cycle_id : TEXT <<FK>>
  stakeholder_id : TEXT <<FK>>
  * type : TEXT
  * content : TEXT
  * sent_at : DATETIME
  * status : TEXT DEFAULT 'SENT'
}

entity slot_proposals {
  * slot_id : TEXT <<PK>>
  --
  * cycle_id : TEXT <<FK>>
  * proposed_time : DATETIME
  * timezone : TEXT
  * organiser_available : INTEGER
  * exec_sponsor_available : INTEGER
  attendee_availability : TEXT (JSON)
  * total_available : INTEGER
  * total_attendees : INTEGER
  * rank_score : REAL
  * is_approved : INTEGER DEFAULT 0
}

entity agent_runs {
  * run_id : TEXT <<PK>>
  --
  * agent_name : TEXT
  cycle_id : TEXT <<FK>>
  * input_payload : TEXT (JSON)
  * output_payload : TEXT (JSON)
  * status : TEXT DEFAULT 'PENDING'
  error_message : TEXT
  * triggered_by : TEXT
  * created_at : DATETIME
}

vendors ||--o{ governance_cycles : "has"
vendors ||--o{ scorecards : "evaluated in"
vendors ||--o{ issues : "has"

governance_cycles ||--o{ cycle_attendees : "has"
governance_cycles ||--o{ scorecards : "collects"
governance_cycles ||--o{ meetings : "schedules"
governance_cycles ||--o{ action_items : "tracks"
governance_cycles ||--o{ face_off_model : "defines"
governance_cycles ||--o{ notifications : "sends"
governance_cycles ||--o{ slot_proposals : "proposes"
governance_cycles ||--o{ agent_runs : "logs"

stakeholders ||--o{ cycle_attendees : "participates"
stakeholders ||--o{ scorecards : "submits"
stakeholders ||--o{ notifications : "receives"

meetings ||--o{ meeting_notes : "captures"

issues }o--|| governance_cycles : "first seen in"

@enduml
```

---

## 3. ORM Model Class Diagram

```plantuml
@startuml ORMModels
skinparam classBackgroundColor #EFF5FB
skinparam classBorderColor #0063B1
skinparam classHeaderBackgroundColor #002D5C
skinparam classHeaderFontColor #FFFFFF
skinparam classFontColor #1A1A2E
skinparam classFontSize 9
skinparam arrowColor #0063B1

abstract class Base <<SQLAlchemy>> {
  ' DeclarativeBase
}

class Vendor {
  +vendor_id: Column(String, PK)
  +name: Column(String, UNIQUE)
  +category: Column(String)
  +status: Column(String)
  +created_at: Column(DateTime)
  --
  +cycles: relationship[GovernanceCycle]
  +issues: relationship[Issue]
}

class GovernanceCycle {
  +cycle_id: Column(String, PK)
  +vendor_id: Column(String, FK)
  +cycle_name: Column(String)
  +quarter: Column(Integer)
  +year: Column(Integer)
  +workflow_state: Column(String)
  +created_at: Column(DateTime)
  +updated_at: Column(DateTime)
  --
  +vendor: relationship[Vendor]
  +attendees: relationship[CycleAttendee]
  +scorecards: relationship[Scorecard]
  +meetings: relationship[Meeting]
  +action_items: relationship[ActionItem]
  +agent_runs: relationship[AgentRun]
  +slot_proposals: relationship[SlotProposal]
}

class Stakeholder {
  +stakeholder_id: Column(String, PK)
  +name: Column(String)
  +email: Column(String, UNIQUE)
  +role: Column(String)
  +organisation: Column(String)
  +is_active: Column(Integer)
  +created_at: Column(DateTime)
  --
  +attendances: relationship[CycleAttendee]
  +scorecards: relationship[Scorecard]
}

class CycleAttendee {
  +id: Column(String, PK)
  +cycle_id: Column(String, FK)
  +stakeholder_id: Column(String, FK)
  +is_confirmed: Column(Integer)
  +is_key: Column(Integer)
  +invite_status: Column(String)
  +replacement_name: Column(String)
  +replacement_email: Column(String)
  +refresh_response: Column(String)
  +responded_at: Column(DateTime)
  --
  +cycle: relationship[GovernanceCycle]
  +stakeholder: relationship[Stakeholder]
}

class Scorecard {
  +scorecard_id: Column(String, PK)
  +cycle_id: Column(String, FK)
  +stakeholder_id: Column(String, FK)
  +vendor_id: Column(String, FK)
  +category: Column(String)
  +score: Column(Float)
  +comment: Column(Text)
  +is_valid: Column(Integer)
  -_validation_flags: Column(Text)
  +submitted_at: Column(DateTime)
  --
  +validation_flags: property[list[str]]
  +cycle: relationship[GovernanceCycle]
  +stakeholder: relationship[Stakeholder]
}

class Meeting {
  +meeting_id: Column(String, PK)
  +cycle_id: Column(String, FK)
  +meeting_type: Column(String)
  +scheduled_time: Column(DateTime)
  +location_or_dial_in: Column(String)
  +invite_sent_at: Column(DateTime)
  +minutes_generated_at: Column(DateTime)
  +minutes_approved: Column(Integer)
  --
  +cycle: relationship[GovernanceCycle]
  +notes: relationship[MeetingNote]
}

class MeetingNote {
  +note_id: Column(String, PK)
  +meeting_id: Column(String, FK)
  +note_type: Column(String)
  +content: Column(Text)
  +raised_by_role: Column(String)
  +timestamp: Column(DateTime)
  +is_actioned: Column(Integer)
  --
  +meeting: relationship[Meeting]
}

class ActionItem {
  +action_id: Column(String, PK)
  +cycle_id: Column(String, FK)
  +source_module: Column(String)
  +description: Column(Text)
  +owner: Column(String)
  +due_date: Column(Date)
  +status: Column(String)
  +created_at: Column(DateTime)
  --
  +cycle: relationship[GovernanceCycle]
}

class Issue {
  +issue_id: Column(String, PK)
  +vendor_id: Column(String, FK)
  +description: Column(Text)
  +first_seen_cycle_id: Column(String, FK)
  +occurrences: Column(Integer)
  +status: Column(String)
  +last_owner: Column(String)
  +last_updated: Column(DateTime)
  --
  +vendor: relationship[Vendor]
}

class AgentRun {
  +run_id: Column(String, PK)
  +agent_name: Column(String)
  +cycle_id: Column(String, FK)
  +input_payload: Column(Text)
  +output_payload: Column(Text)
  +status: Column(String)
  +error_message: Column(Text)
  +triggered_by: Column(String)
  +created_at: Column(DateTime)
  --
  +cycle: relationship[GovernanceCycle]
}

Base <|-- Vendor
Base <|-- GovernanceCycle
Base <|-- Stakeholder
Base <|-- CycleAttendee
Base <|-- Scorecard
Base <|-- Meeting
Base <|-- MeetingNote
Base <|-- ActionItem
Base <|-- Issue
Base <|-- AgentRun

GovernanceCycle "1" --> "0..*" CycleAttendee
GovernanceCycle "1" --> "0..*" Scorecard
GovernanceCycle "1" --> "0..*" Meeting
GovernanceCycle "1" --> "0..*" ActionItem
GovernanceCycle "1" --> "0..*" AgentRun
Vendor "1" --> "0..*" GovernanceCycle
Vendor "1" --> "0..*" Issue
Stakeholder "1" --> "0..*" CycleAttendee
Stakeholder "1" --> "0..*" Scorecard
Meeting "1" --> "0..*" MeetingNote

@enduml
```

---

## 4. Agent Class Hierarchy Diagram

```plantuml
@startuml AgentHierarchy
skinparam classBackgroundColor #F4F6F9
skinparam classBorderColor #002D5C
skinparam classHeaderBackgroundColor #002D5C
skinparam classHeaderFontColor #FFFFFF
skinparam classFontColor #1A1A2E
skinparam classFontSize 10
skinparam arrowColor #002D5C

abstract class BaseAgent {
  #agent_name: str
  #db: AsyncSession
  #cycle_id: str | None
  #llm: LLMService
  #_run_id: str
  --
  +{abstract} get_system_prompt(): str
  +{abstract} get_tools(): list[dict]
  +{abstract} execute_tool(name, input): str
  --
  +run(user_message, context): AgentResponse
  #_tool_calling_loop(message): dict
  #_extract_final_result(response): dict
  #_build_response(status, data): AgentResponse
  #_build_error_response(error): AgentResponse
  #_create_run_record(payload): AgentRun
  #_update_run_record(record, status, response): void
}

class SchedulingAgent {
  +agent_name = "scheduling_agent"
  --
  +get_system_prompt(): str
  +get_tools(): list[dict]
  +execute_tool(name, input): str
  --
  -_tool_get_attendee_list(): str
  -_tool_get_previous_attendees(): str
  -_tool_update_attendee(input): str
  -_tool_get_availability(input): str
  -_tool_rank_slots(input): str
  -_tool_create_invite_draft(input): str
  -_tool_send_invite(input): str
}

class ScorecardAgent {
  +agent_name = "scorecard_agent"
  --
  +get_system_prompt(): str
  +get_tools(): list[dict]
  +execute_tool(name, input): str
  --
  -_tool_validate_submission(input): str
  -_tool_calculate_averages(): str
  -_tool_detect_outliers(): str
  -_tool_compile_scorecard(): str
  note: No LLM calls in this agent.\nAll tools are deterministic.
}

class AlignmentAgent {
  +agent_name = "alignment_agent"
  --
  +get_system_prompt(): str
  +get_tools(): list[dict]
  +execute_tool(name, input): str
  --
  -_tool_compare_cycles(): str
  -_tool_detect_alignment_flags(): str
  -_tool_generate_change_summary(input): str
  -_tool_extract_action_items(input): str
  note: compare_cycles and detect_flags\nare deterministic.\nextract_action_items uses LLM.
}

class VendorPrepAgent {
  +agent_name = "vendor_prep_agent"
  --
  +get_system_prompt(): str
  +get_tools(): list[dict]
  +execute_tool(name, input): str
  --
  -_tool_get_scorecard_summary(): str
  -_tool_get_previous_cycle_scores(): str
  -_tool_get_open_issues(): str
  -_tool_get_stakeholder_comments(): str
  -_tool_categorise_pushback(input): str
  -_tool_draft_pushback_responses(input): str
  note: generate_vendor_brief and\ndraft_pushback_responses use LLM.
}

class MeetingAgent {
  +agent_name = "meeting_agent"
  --
  +get_system_prompt(): str
  +get_tools(): list[dict]
  +execute_tool(name, input): str
  --
  -_tool_get_all_notes(): str
  -_tool_get_attendees(): str
  -_tool_get_trend_briefing(): str
  -_tool_parse_transcript(input): str
  -_tool_generate_minutes(input): str
  -_tool_extract_action_items(input): str
  -_tool_merge_action_items(input): str
  note: parse_transcript, generate_minutes,\nextract_action_items use LLM.
}

class MemoryAgent {
  +agent_name = "memory_agent"
  --
  +get_system_prompt(): str
  +get_tools(): list[dict]
  +execute_tool(name, input): str
  --
  -_tool_get_trend_data(input): str
  -_tool_detect_recurring_issues(input): str
  -_tool_get_prior_agreements(): str
  -_tool_get_cross_vendor_comparison(): str
  -_tool_generate_leadership_brief(input): str
  note: detect_recurring_issues is deterministic.\ngenerate_leadership_brief uses LLM.
}

BaseAgent <|-- SchedulingAgent
BaseAgent <|-- ScorecardAgent
BaseAgent <|-- AlignmentAgent
BaseAgent <|-- VendorPrepAgent
BaseAgent <|-- MeetingAgent
BaseAgent <|-- MemoryAgent

@enduml
```

---

## 5. Service Layer Class Diagram

```plantuml
@startuml ServiceLayer
skinparam classBackgroundColor #EFF5FB
skinparam classBorderColor #007A87
skinparam classHeaderBackgroundColor #007A87
skinparam classHeaderFontColor #FFFFFF
skinparam classFontColor #1A1A2E
skinparam classFontSize 10
skinparam arrowColor #007A87

class LLMService {
  -client: AsyncAnthropic
  -MODEL: str = "claude-sonnet-4-6"
  -MAX_TOKENS: int = 4096
  --
  +call(system, messages, tools?): Message
  +call_simple(system, user_message): str
  +call_with_retry(system, messages, tools?, max_retries=3): Message
  -_handle_rate_limit(attempt): void
}

class ValidationService {
  +SCORE_MIN: float = 1.0
  +SCORE_MAX: float = 5.0
  +OUTLIER_SIGMA_THRESHOLD: float = 1.5
  --
  +validate(score, comment, category, group_scores): ValidationResult
  +calculate_averages(entries): dict[str, float]
  +detect_outliers(entries): list[str]
  -_check_range(score): list[str]
  -_check_comment_required(score, comment): list[str]
  -_check_outlier(score, group_scores): list[str]
}

class ValidationResult {
  +is_valid: bool
  +flags: list[str]
  +error_messages: list[str]
}

class AnalyticsService {
  --
  +get_trend_data(db, vendor_id, cycles=4): list[dict]
  +detect_recurring_issues(db, vendor_id, min_occurrences=2): list[Issue]
  +get_cross_vendor_comparison(db, cycle_ids): dict
  +get_radar_data(db, vendor_id, cycle_id): dict
  -_compute_cycle_averages(db, cycle_id): dict
}

ValidationService --> ValidationResult : returns
LLMService ..> BaseAgent : injected into

@enduml
```

---

## 6. Repository Layer Class Diagram

```plantuml
@startuml RepositoryLayer
skinparam classBackgroundColor #F4F6F9
skinparam classBorderColor #002D5C
skinparam classHeaderBackgroundColor #0063B1
skinparam classHeaderFontColor #FFFFFF
skinparam classFontColor #1A1A2E
skinparam classFontSize 10
skinparam arrowColor #002D5C

abstract class BaseRepository {
  #model: Type
  --
  +get(db, id): Model | None
  +get_all(db): list[Model]
  +create(db, obj): Model
  +update(db, obj): Model
  +delete(db, id): bool
}

class CycleRepository {
  --
  +get_by_vendor(db, vendor_id): list[GovernanceCycle]
  +get_recent(db, vendor_id, limit=4): list[GovernanceCycle]
  +get_all_filtered(db, vendor_id?): list[GovernanceCycle]
  +update_workflow_state(db, cycle_id, state): void
}

class VendorRepository {
  --
  +get_by_name(db, name): Vendor | None
  +get_active(db): list[Vendor]
}

class StakeholderRepository {
  --
  +get_active(db): list[Stakeholder]
  +get_by_role(db, role): list[Stakeholder]
  +get_by_email(db, email): Stakeholder | None
}

class AttendeeRepository {
  --
  +get_by_cycle(db, cycle_id): list[CycleAttendee]
  +get_key_attendees(db, cycle_id): list[CycleAttendee]
  +update_status(db, id, status): CycleAttendee
  +bulk_confirm(db, cycle_id): void
}

class ScorecardRepository {
  --
  +get_by_cycle(db, cycle_id): list[Scorecard]
  +get_valid(db, cycle_id): list[Scorecard]
  +get_by_stakeholder(db, cycle_id, stakeholder_id): list[Scorecard]
  +get_averages(db, cycle_id): dict[str, float]
  +get_previous_cycle_averages(db, cycle_id): dict[str, float]
  +get_submission_status(db, cycle_id, stakeholder_ids): list[dict]
}

class MeetingRepository {
  --
  +get_by_cycle(db, cycle_id): list[Meeting]
  +get_by_type(db, cycle_id, meeting_type): Meeting | None
  +get_notes(db, meeting_id): list[MeetingNote]
  +add_note(db, note): MeetingNote
  +approve_minutes(db, meeting_id): void
}

class ActionRepository {
  --
  +get_by_cycle(db, cycle_id): list[ActionItem]
  +get_by_module(db, cycle_id, source_module): list[ActionItem]
  +get_open(db, cycle_id): list[ActionItem]
  +update_status(db, action_id, status): ActionItem
  +bulk_create(db, actions): list[ActionItem]
}

class IssueRepository {
  --
  +get_by_vendor(db, vendor_id): list[Issue]
  +get_recurring(db, vendor_id, min_occurrences=2): list[Issue]
  +increment_occurrence(db, issue_id): Issue
  +resolve(db, issue_id): Issue
}

class AgentRunRepository {
  --
  +get_by_cycle(db, cycle_id): list[AgentRun]
  +get_recent(db, limit=20): list[AgentRun]
  +get_failures(db): list[AgentRun]
  +create_run(db, agent_name, cycle_id, input): AgentRun
  +complete_run(db, run_id, output, status): AgentRun
}

class SlotRepository {
  --
  +get_by_cycle(db, cycle_id): list[SlotProposal]
  +get_approved(db, cycle_id): SlotProposal | None
  +create_batch(db, slots): list[SlotProposal]
  +approve(db, slot_id): SlotProposal
}

BaseRepository <|-- CycleRepository
BaseRepository <|-- VendorRepository
BaseRepository <|-- StakeholderRepository
BaseRepository <|-- AttendeeRepository
BaseRepository <|-- ScorecardRepository
BaseRepository <|-- MeetingRepository
BaseRepository <|-- ActionRepository
BaseRepository <|-- IssueRepository
BaseRepository <|-- AgentRunRepository
BaseRepository <|-- SlotRepository

@enduml
```

---

## 7. Pydantic Schema Class Diagram

```plantuml
@startuml PydanticSchemas
skinparam classBackgroundColor #DAE8F5
skinparam classBorderColor #0063B1
skinparam classHeaderBackgroundColor #0063B1
skinparam classHeaderFontColor #FFFFFF
skinparam classFontColor #1A1A2E
skinparam classFontSize 9
skinparam arrowColor #002D5C
skinparam packageBackgroundColor #F4F6F9
skinparam packageBorderColor #BFBFBF

package "common.py" {
  class AgentResponse<T> {
    +status: str
    +agent: str
    +summary: str
    +data: T
    +warnings: list[str]
    +next_actions: list[str]
    +requires_approval: bool
    +run_id: str
  }
  class ErrorResponse {
    +detail: str
    +code: str
  }
}

package "cycle_schema.py" {
  class CycleCreateIn {
    +vendor_id: str
    +cycle_name: str
    +quarter: int
    +year: int
  }
  class CycleOut {
    +cycle_id: str
    +vendor_id: str
    +vendor_name: str
    +cycle_name: str
    +quarter: int
    +year: int
    +workflow_state: str
    +created_at: datetime
    +updated_at: datetime
  }
}

package "scheduling_schema.py" {
  class AttendeeOut {
    +id: str
    +stakeholder_id: str
    +name: str
    +email: str
    +role: str
    +is_key: bool
    +is_confirmed: bool
    +invite_status: str
    +replacement_name: str | None
    +replacement_email: str | None
  }
  class SlotProposalOut {
    +slot_id: str
    +proposed_time: datetime
    +timezone: str
    +rank_score: float
    +organiser_available: bool
    +exec_sponsor_available: bool
    +attendee_availability: dict[str,bool]
    +total_available: int
    +total_attendees: int
    +is_approved: bool
  }
  class ApproveSlotIn {
    +slot_id: str
  }
}

package "scorecard_schema.py" {
  class ScorecardSubmitIn {
    +stakeholder_id: str
    +scores: dict[str, float]
    +comments: dict[str, str]
  }
  class ScorecardEntryOut {
    +scorecard_id: str
    +stakeholder_id: str
    +stakeholder_name: str
    +category: str
    +score: float
    +comment: str | None
    +is_valid: bool
    +validation_flags: list[str]
    +submitted_at: datetime
  }
  class CompiledScorecardOut {
    +cycle_id: str
    +vendor_id: str
    +entries: list[ScorecardEntryOut]
    +averages: dict[str,float]
    +overall_average: float
    +outlier_count: int
    +missing_count: int
    +compiled_at: datetime
  }
}

package "alignment_schema.py" {
  class ScoreChangeOut {
    +category: str
    +previous_score: float
    +current_score: float
    +delta: float
    +is_significant: bool
  }
  class AlignmentFlagOut {
    +category: str
    +min_score: float
    +max_score: float
    +spread: float
    +prompt_question: str
    +stakeholders_involved: list[str]
  }
  class ExtractActionsIn {
    +raw_notes: str
  }
  class ActionItemOut {
    +action_id: str
    +source_module: str
    +description: str
    +owner: str | None
    +due_date: date | None
    +status: str
    +created_at: datetime
  }
}

package "vendor_prep_schema.py" {
  class VendorBriefOut {
    +overall_score: float
    +overall_trend: str
    +category_ratings: list[dict]
    +key_concerns: list[str]
    +positive_areas: list[str]
    +generated_at: datetime
  }
  class PushbackItemIn {
    +description: str
    +category: str
  }
  class PushbackItemOut {
    +id: str
    +description: str
    +category: str
    +requires_legal_review: bool
    +status: str
    +responses: list[PushbackResponseOut]
  }
  class PushbackResponseOut {
    +stance: str
    +content: str
    +is_selected: bool
  }
}

package "meeting_schema.py" {
  class CaptureNoteIn {
    +note_type: str
    +content: str
    +raised_by_role: str | None
  }
  class MeetingNoteOut {
    +note_id: str
    +note_type: str
    +content: str
    +raised_by_role: str | None
    +timestamp: datetime
    +is_actioned: bool
  }
  class ParseTranscriptIn {
    +transcript: str
  }
  class MeetingMinutesOut {
    +meeting_id: str
    +generated_at: datetime
    +metadata: dict
    +executive_summary: str
    +agenda_summaries: list[dict]
    +key_decisions: list[str]
    +qa_log: list[MeetingNoteOut]
    +action_items: list[ActionItemOut]
    +approved: bool
  }
}

CompiledScorecardOut --> ScorecardEntryOut
MeetingMinutesOut --> MeetingNoteOut
MeetingMinutesOut --> ActionItemOut
PushbackItemOut --> PushbackResponseOut

@enduml
```

---

## 8. Workflow Engine Class & State Diagram

```plantuml
@startuml WorkflowEngineClass
skinparam classBackgroundColor #EFF5FB
skinparam classBorderColor #0063B1
skinparam classHeaderBackgroundColor #002D5C
skinparam classHeaderFontColor #FFFFFF
skinparam classFontColor #1A1A2E
skinparam classFontSize 10
skinparam arrowColor #002D5C

enum WorkflowState {
  CYCLE_CREATED
  ATTENDEE_REFRESH_SENT
  AVAILABILITY_COLLECTED
  MEETING_SCHEDULED
  SCORECARD_REQUEST_SENT
  SCORECARD_COLLECTION
  SCORECARD_COMPILED
  INTERNAL_ALIGNMENT
  VENDOR_PREP
  MEETING_IN_PROGRESS
  POST_MEETING_COMPLETE
  ARCHIVED
}

class WorkflowEngine {
  -TRANSITIONS: dict[WorkflowState, WorkflowState]
  --
  +can_transition(current, target): bool
  +next_state(current): WorkflowState | None
  +assert_at_least(current, required): void
  +assert_exactly(current, required): void
  +transition(cycle, target, db): Coroutine
}

class WorkflowViolationError {
  +message: str
}

WorkflowEngine --> WorkflowState : uses
WorkflowEngine ..> WorkflowViolationError : raises

note right of WorkflowEngine
  TRANSITIONS map (one-way):
  CYCLE_CREATED → ATTENDEE_REFRESH_SENT
  ATTENDEE_REFRESH_SENT → AVAILABILITY_COLLECTED
  AVAILABILITY_COLLECTED → MEETING_SCHEDULED
  MEETING_SCHEDULED → SCORECARD_REQUEST_SENT
  SCORECARD_REQUEST_SENT → SCORECARD_COLLECTION
  SCORECARD_COLLECTION → SCORECARD_COMPILED
  SCORECARD_COMPILED → INTERNAL_ALIGNMENT
  INTERNAL_ALIGNMENT → VENDOR_PREP
  VENDOR_PREP → MEETING_IN_PROGRESS
  MEETING_IN_PROGRESS → POST_MEETING_COMPLETE
  POST_MEETING_COMPLETE → ARCHIVED
end note

@enduml
```

---

## 9. Mock Services Class Diagram

```plantuml
@startuml MockServices
skinparam classBackgroundColor #F4F6F9
skinparam classBorderColor #007A87
skinparam classHeaderBackgroundColor #007A87
skinparam classHeaderFontColor #FFFFFF
skinparam classFontColor #1A1A2E
skinparam classFontSize 10
skinparam arrowColor #007A87

abstract class AbstractCalendarService {
  +{abstract} get_availability(stakeholder_ids, date_range): dict
}

abstract class AbstractEmailService {
  +{abstract} send(to, subject, body): dict
}

abstract class AbstractFormService {
  +{abstract} create_form(type, fields, recipients): dict
}

abstract class AbstractNotificationService {
  +{abstract} send_reminder(stakeholder_id, cycle_id, level, db, vendor_name, stakeholder_name): dict
}

class MockCalendarService {
  -AVAILABILITY_FIXTURE: dict[str, list[str]]
  --
  +get_availability(stakeholder_ids, date_range): dict
  -_is_stakeholder_free(stakeholder_id, slot_time): bool
}

class MockEmailService {
  --
  +send(to, subject, body, db?): dict
  -_build_html_preview(subject, body, to): str
  -_store_to_outbox(preview_id, payload, db): void
}

class MockFormService {
  -FORM_TEMPLATES: dict[str, dict]
  --
  +create_form(type, fields, recipients): dict
  +get_simulated_responses(form_id, cycle_id): list[dict]
}

class MockNotificationService {
  -REMINDER_TEMPLATES: dict[int, str]
  --
  +send_reminder(stakeholder_id, cycle_id, level, db, vendor_name, stakeholder_name): dict
  +send_invite(cycle_id, attendee_ids, invite_content, db): dict
  -_get_tone_label(level): str
}

AbstractCalendarService <|-- MockCalendarService
AbstractEmailService <|-- MockEmailService
AbstractFormService <|-- MockFormService
AbstractNotificationService <|-- MockNotificationService

note bottom of MockCalendarService
  Returns pre-seeded fixture data.
  Deterministic: same stakeholder_id
  always returns same availability.
end note

note bottom of MockEmailService
  Writes to notifications table.
  Returns HTML preview_id for
  ApprovalPanel rendering.
end note

@enduml
```

---

## 10. Sequence: Full Request Lifecycle

```plantuml
@startuml RequestLifecycle
skinparam participantBackgroundColor #DAE8F5
skinparam participantBorderColor #0063B1
skinparam participantFontColor #002D5C
skinparam sequenceArrowColor #002D5C
skinparam sequenceLifeLineBackgroundColor #EFF5FB
skinparam noteBorderColor #C99A06
skinparam noteBackgroundColor #FFF8E1

participant "React Frontend" as FE
participant "axios Client" as Axios
participant "FastAPI Router" as Router
participant "Depends(get_db)" as Dep
participant "Route Handler" as Handler
participant "WorkflowEngine" as WE
participant "Agent / Service" as Agent
participant "Repository" as Repo
participant "SQLAlchemy\nAsyncSession" as DB
participant "LLMService\n(optional)" as LLM
participant "AgentRunRepo" as AuditLog

FE -> Axios : api call (typed function)
activate Axios
Axios -> Router : HTTP POST /api/cycles/{id}/vendor-prep/generate-brief
activate Router

Router -> Dep : yield AsyncSession
activate Dep
Dep -> DB : open session
DB --> Dep : session
Dep --> Router : db injected

Router -> Handler : invoke route handler(cycle, db)
activate Handler

Handler -> WE : assert_at_least(current_state, VENDOR_PREP)
alt State violation
  WE --> Handler : raise WorkflowViolationError
  Handler --> Router : 409 Conflict
  Router --> Axios : { detail: "...", code: "WORKFLOW_VIOLATION" }
  Axios --> FE : error
else State OK
  WE --> Handler : pass
end

Handler -> Agent : VendorPrepAgent(db, cycle_id).run(message)
activate Agent

Agent -> AuditLog : create_run_record(input_payload)
AuditLog -> DB : INSERT agent_runs (PENDING)
DB --> AuditLog : run record

Agent -> LLM : tool-calling loop
activate LLM
LLM --> Agent : structured result
deactivate LLM

Agent -> Repo : read/write operations
Repo -> DB : SQLAlchemy queries
DB --> Repo : data

Agent -> AuditLog : update_run_record(SUCCESS)
AuditLog -> DB : UPDATE agent_runs

Agent --> Handler : AgentResponse
deactivate Agent

Handler -> WE : transition(cycle, NEXT_STATE, db)
WE -> DB : UPDATE governance_cycles.workflow_state

Handler --> Router : AgentResponse JSON
deactivate Handler

Router --> Dep : commit session
Dep -> DB : COMMIT
deactivate Dep

Router --> Axios : 200 OK AgentResponse
deactivate Router

Axios --> FE : typed response
deactivate Axios
FE -> FE : TanStack Query invalidates cache

@enduml
```

---

## 11. Sequence: Agent Tool-Calling Loop (Claude API)

```plantuml
@startuml ToolCallingLoop
skinparam participantBackgroundColor #DAE8F5
skinparam participantBorderColor #0063B1
skinparam participantFontColor #002D5C
skinparam sequenceArrowColor #002D5C
skinparam sequenceLifeLineBackgroundColor #EFF5FB
skinparam noteBorderColor #C99A06
skinparam noteBackgroundColor #FFF8E1

participant "Route Handler" as Route
participant "ConcreteAgent\n(e.g. VendorPrepAgent)" as Agent
participant "BaseAgent._tool_calling_loop" as Loop
participant "LLMService" as LLM
participant "Anthropic Claude API" as Claude
participant "execute_tool()" as Tool
participant "Repository / Service" as Repo

Route -> Agent : run(user_message)
activate Agent

Agent -> Loop : _tool_calling_loop(user_message)
activate Loop
Loop -> Loop : messages = [{ role: user, content: user_message }]
Loop -> Loop : tools = get_tools()
Loop -> Loop : system = get_system_prompt()

loop Until stop_reason = "end_turn"
  Loop -> LLM : call(system, messages, tools)
  activate LLM
  LLM -> Claude : POST /v1/messages { tools, messages }
  activate Claude

  alt Claude requests tool calls
    Claude --> LLM : { stop_reason: "tool_use", content: [tool_use_block, ...] }
    deactivate Claude
    LLM --> Loop : Message object

    loop For each tool_use_block
      Loop -> Tool : execute_tool(block.name, block.input)
      activate Tool
      Tool -> Repo : DB query or service call
      Repo --> Tool : data
      Tool --> Loop : JSON string result
      deactivate Tool

      Loop -> Loop : append tool_result to messages
    end

    Loop -> Loop : append assistant response to messages
    note right : Continue loop — next iteration\nfeeds tool results back to Claude

  else Claude done
    Claude --> LLM : { stop_reason: "end_turn", content: [text_block] }
    deactivate Claude
    LLM --> Loop : Message object
    deactivate LLM
    Loop -> Loop : _extract_final_result(response)
    Loop -> Loop : parse JSON from text_block
    Loop --> Agent : structured result dict
    deactivate Loop
  end
end

Agent -> Agent : _build_response("success", result)
Agent --> Route : AgentResponse

deactivate Agent

@enduml
```

---

## 12. Sequence: Module A — Scheduling Agent Execution

```plantuml
@startuml SchedulingAgentExecution
skinparam participantBackgroundColor #DAE8F5
skinparam participantBorderColor #0063B1
skinparam participantFontColor #002D5C
skinparam sequenceArrowColor #002D5C
skinparam sequenceLifeLineBackgroundColor #EFF5FB

participant "scheduling.py\n(Route)" as Route
participant "SchedulingAgent" as Agent
participant "AttendeeRepository" as AttendeeRepo
participant "SlotRepository" as SlotRepo
participant "slot_ranking.py" as Ranker
participant "MockCalendarService" as Calendar
participant "MockEmailService" as Email
participant "WorkflowEngine" as WE
participant "SQLite DB" as DB

Route -> Agent : run("Start attendee refresh")
Agent -> AttendeeRepo : get_by_cycle(db, cycle_id)
AttendeeRepo -> DB : SELECT cycle_attendees WHERE cycle_id=?
DB --> AttendeeRepo : CycleAttendee[]
AttendeeRepo --> Agent : attendees (9 records)

Agent -> Agent : Claude: generate_refresh_form_content(attendees)
Agent -> Route : AgentResponse { requires_approval: true, data: form_content }

Route -> WE : transition(cycle, ATTENDEE_REFRESH_SENT, db)
WE -> DB : UPDATE governance_cycles SET workflow_state = 'ATTENDEE_REFRESH_SENT'

note over Route : [SIMULATE RESPONSES endpoint called]

Route -> AttendeeRepo : bulk_confirm(db, cycle_id)
AttendeeRepo -> DB : UPDATE cycle_attendees SET is_confirmed=1, invite_status='ACCEPTED'

Route -> Calendar : get_availability(stakeholder_ids, date_range)
Calendar -> Calendar : Return AVAILABILITY_FIXTURE for each stakeholder
Calendar --> Route : {stakeholder_id: [free_slots]}

Route -> Ranker : rank(attendees, proposed_times, organiser_id, exec_sponsor_id)
activate Ranker
loop for each proposed_time
  Ranker -> Ranker : check organiser_available (hard constraint)
  Ranker -> Ranker : check exec_sponsor_available (hard constraint)
  alt Both key attendees free
    Ranker -> Ranker : score = (total_available/total) * 100
    Ranker -> Ranker : score -= non_key_conflicts * 10
    Ranker -> Ranker : score += 5 if business_hours
  else Key attendee blocked
    Ranker -> Ranker : score = 0.0 (invalid slot)
  end
end
Ranker -> Ranker : sort by rank_score descending
Ranker --> Route : SlotProposal[3]
deactivate Ranker

Route -> SlotRepo : create_batch(db, slots)
SlotRepo -> DB : INSERT slot_proposals (3 records)

Route -> WE : transition(cycle, AVAILABILITY_COLLECTED, db)

note over Route : [APPROVE SLOT endpoint called]

Route -> SlotRepo : approve(db, slot_id)
SlotRepo -> DB : UPDATE slot_proposals SET is_approved=1
Route -> WE : transition(cycle, MEETING_SCHEDULED, db)

Agent -> Agent : create_invite_draft_tool(approved_slot)
Agent -> Email : send(to=recipients, subject=..., body=...)
Email --> Agent : { preview_id, html_preview }
Agent --> Route : AgentResponse { requires_approval: true, data: invite_draft }

@enduml
```

---

## 13. Sequence: Module B — Scorecard Validation Pipeline

```plantuml
@startuml ScorecardValidationPipeline
skinparam participantBackgroundColor #DAE8F5
skinparam participantBorderColor #0063B1
skinparam participantFontColor #002D5C
skinparam sequenceArrowColor #002D5C
skinparam sequenceLifeLineBackgroundColor #EFF5FB

participant "scorecard.py\n(Route)" as Route
participant "ScorecardAgent" as Agent
participant "ValidationService" as VS
participant "ScorecardRepository" as Repo
participant "MockNotificationService" as Notify
participant "WorkflowEngine" as WE
participant "SQLite DB" as DB

Route -> Notify : send_reminder(stakeholders, cycle_id, level=1)
Notify -> DB : INSERT notifications (REMINDER_1, 8 records)

note over Route : [SIMULATE SUBMISSIONS called — 8 stakeholders]

loop for each stakeholder_submission
  Route -> Repo : get_valid(db, cycle_id) [for outlier calculation]
  Repo -> DB : SELECT scorecards WHERE cycle_id=? AND is_valid=1
  DB --> Repo : existing_entries[]

  loop for each (category, score, comment)
    Route -> VS : validate(score, comment, category, group_scores)
    activate VS
    VS -> VS : Rule 1: range check
    VS -> VS : Rule 2: extreme score comment
    VS -> VS : Rule 3: outlier detection (stdev)
    VS --> Route : ValidationResult { is_valid, flags, errors }
    deactivate VS

    Route -> DB : INSERT scorecards { score, is_valid, validation_flags }
  end

  alt Any invalid entries
    Route -> Route : collect warnings
  end
end

Route -> WE : transition(cycle, SCORECARD_COLLECTION, db)

note over Route : [COMPILE SCORECARD called]

Route -> Agent : run("Compile final scorecard")
Agent -> Repo : get_valid(db, cycle_id)
Repo -> DB : SELECT all valid scorecards
DB --> Repo : valid_entries[]

Agent -> VS : calculate_averages(valid_entries)
VS -> VS : group by category
VS -> VS : mean per category
VS --> Agent : { DELIVERY_QUALITY: 3.6, ... }

Agent -> VS : detect_outliers(valid_entries)
VS -> VS : stdev per category
VS -> VS : flag |score - mean| > 1.5σ
VS --> Agent : outlier_scorecard_ids[]

Agent -> Repo : mark_outliers(db, outlier_ids)
Repo -> DB : UPDATE scorecards SET validation_flags=JSON(['OUTLIER'])

Route -> WE : transition(cycle, SCORECARD_COMPILED, db)
Route --> Route : AgentResponse { summary: "Compiled 40 entries, 2 outliers" }

@enduml
```

---

## 14. Sequence: Module C — Alignment & Action Extraction

```plantuml
@startuml AlignmentFlow
skinparam participantBackgroundColor #DAE8F5
skinparam participantBorderColor #0063B1
skinparam participantFontColor #002D5C
skinparam sequenceArrowColor #002D5C
skinparam sequenceLifeLineBackgroundColor #EFF5FB

participant "alignment.py\n(Route)" as Route
participant "AlignmentAgent" as Agent
participant "ScorecardRepository" as ScoreRepo
participant "score_diff.py\n(Utility)" as Diff
participant "analytics_service.py" as Analytics
participant "LLMService\n(Claude)" as LLM
participant "ActionRepository" as ActionRepo
participant "SQLite DB" as DB

Route -> ScoreRepo : get_averages(db, current_cycle_id)
ScoreRepo -> DB : SELECT scorecards (current cycle)
DB --> ScoreRepo : current_averages

Route -> ScoreRepo : get_previous_cycle_averages(db, current_cycle_id)
ScoreRepo -> DB : SELECT scorecards (previous cycle, same vendor)
DB --> ScoreRepo : previous_averages

Route -> Diff : compare(current_averages, previous_averages)
activate Diff
Diff -> Diff : for each category: delta = current - previous
Diff -> Diff : is_significant = abs(delta) >= 1.0
Diff -> Diff : sort by abs(delta) descending
Diff --> Route : ScoreChange[] (e.g. INNOVATION +1.8, COMMUNICATION -0.9)
deactivate Diff

Route -> Analytics : detect_alignment_flags(current_entries, threshold=1.5)
activate Analytics
Analytics -> Analytics : group entries by category
Analytics -> Analytics : for each category: spread = max_score - min_score
Analytics -> Analytics : if spread >= 1.5: build prompt_question
Analytics --> Route : AlignmentFlag[] (e.g. DELIVERY_QUALITY spread=2.5)
deactivate Analytics

note over Route : [EXTRACT ACTIONS endpoint called with raw notes]

Route -> Agent : run("Extract actions from: '<pasted notes>'")
Agent -> Agent : _tool_calling_loop()
Agent -> LLM : Claude API call with ACTION_EXTRACTION_PROMPT
LLM --> Agent : [{ description, owner, due_date }, ...]

Agent -> ActionRepo : bulk_create(db, extracted_actions)
ActionRepo -> DB : INSERT action_items (source_module='ALIGNMENT')
DB --> ActionRepo : ActionItem[]

Route --> Route : AgentResponse { data: { actions_created: 4 } }

@enduml
```

---

## 15. Sequence: Module D — Vendor Brief Generation

```plantuml
@startuml VendorBriefGeneration
skinparam participantBackgroundColor #DAE8F5
skinparam participantBorderColor #0063B1
skinparam participantFontColor #002D5C
skinparam sequenceArrowColor #002D5C
skinparam sequenceLifeLineBackgroundColor #EFF5FB

participant "vendor_prep.py\n(Route)" as Route
participant "VendorPrepAgent" as Agent
participant "ScorecardRepository" as ScoreRepo
participant "IssueRepository" as IssueRepo
participant "ActionRepository" as ActionRepo
participant "LLMService\n(Claude)" as LLM
participant "Claude API" as Claude
participant "SQLite DB" as DB

Route -> Agent : run("Generate vendor brief for CoreSystems Ltd")

Agent -> Agent : _tool_calling_loop()
note right : Claude decides which tools to call

Agent -> ScoreRepo : get_scorecard_summary tool
ScoreRepo -> DB : SELECT scorecards (current, valid)
DB --> ScoreRepo : entries + averages
ScoreRepo --> Agent : scorecard summary JSON

Agent -> ScoreRepo : get_previous_cycle_scores tool
ScoreRepo -> DB : SELECT scorecards (previous cycle)
DB --> ScoreRepo : previous averages
ScoreRepo --> Agent : previous cycle JSON

Agent -> ScoreRepo : get_stakeholder_comments tool
ScoreRepo -> DB : SELECT comment FROM scorecards WHERE comment IS NOT NULL
DB --> ScoreRepo : comments per category
ScoreRepo --> Agent : comments JSON

Agent -> IssueRepo : get_open_issues tool
IssueRepo -> DB : SELECT issues WHERE vendor_id=? AND status='OPEN'
DB --> IssueRepo : Issue[]
IssueRepo --> Agent : issues JSON

Agent -> ActionRepo : get_open_actions tool
ActionRepo -> DB : SELECT action_items WHERE cycle_id=? AND status='OPEN'
DB --> ActionRepo : ActionItem[]
ActionRepo --> Agent : actions JSON

Agent -> LLM : call(VENDOR_BRIEF_SYSTEM_PROMPT, messages_with_all_tool_results, tools)
LLM -> Claude : POST /v1/messages
Claude -> Claude : Generate structured brief narrative
Claude --> LLM : { stop_reason: "end_turn", content: [text: VendorBrief JSON] }
LLM --> Agent : Message

Agent -> Agent : _extract_final_result() → VendorBrief dict
Agent --> Route : AgentResponse { requires_approval: true, data: VendorBrief }

Route --> Route : return to frontend for approval

@enduml
```

---

## 16. Sequence: Module E — Minutes Generation

```plantuml
@startuml MinutesGeneration
skinparam participantBackgroundColor #DAE8F5
skinparam participantBorderColor #0063B1
skinparam participantFontColor #002D5C
skinparam sequenceArrowColor #002D5C
skinparam sequenceLifeLineBackgroundColor #EFF5FB

participant "meeting.py\n(Route)" as Route
participant "MeetingAgent" as Agent
participant "MeetingRepository" as MeetRepo
participant "ActionRepository" as ActionRepo
participant "LLMService\n(Claude)" as LLM
participant "WorkflowEngine" as WE
participant "SQLite DB" as DB

note over Route : Meeting notes already captured\nvia POST /meeting/capture

Route -> Agent : run("Generate meeting minutes")
Agent -> Agent : _tool_calling_loop()

Agent -> MeetRepo : get_all_notes tool
MeetRepo -> DB : SELECT meeting_notes WHERE meeting_id=?
DB --> MeetRepo : MeetingNote[] (timestamped)
MeetRepo --> Agent : notes JSON

Agent -> MeetRepo : get_attendees tool
MeetRepo -> DB : SELECT cycle_attendees (ACCEPTED status)
DB --> MeetRepo : attendees list
MeetRepo --> Agent : attendees JSON

Agent -> LLM : Claude call with MINUTES_SYSTEM_PROMPT + notes + attendees
activate LLM
LLM -> LLM : Claude generates:
LLM -> LLM : - executive summary (2-3 sentences)
LLM -> LLM : - agenda summaries
LLM -> LLM : - key decisions list
LLM -> LLM : - Q&A log structured
LLM -> LLM : - action items extracted
LLM --> Agent : MeetingMinutes JSON
deactivate LLM

Agent -> ActionRepo : bulk_create(db, extracted_actions)
ActionRepo -> DB : INSERT action_items (source_module='MEETING')

Agent -> ActionRepo : get_open(db, cycle_id) — merge ALL module actions
ActionRepo -> DB : SELECT action_items WHERE cycle_id=? AND status='OPEN'
DB --> ActionRepo : all open actions (ALIGNMENT + VENDOR_PREP + MEETING)
ActionRepo --> Agent : merged action list

Agent --> Route : AgentResponse { requires_approval: true, data: MeetingMinutes }

note over Route : [APPROVE MINUTES endpoint called]

Route -> MeetRepo : approve_minutes(db, meeting_id)
MeetRepo -> DB : UPDATE meetings SET minutes_approved=1
Route -> WE : transition(cycle, POST_MEETING_COMPLETE, db)
WE -> DB : UPDATE governance_cycles

@enduml
```

---

## 17. Sequence: Module F — Recurring Issue Detection

```plantuml
@startuml RecurringIssueDetection
skinparam participantBackgroundColor #DAE8F5
skinparam participantBorderColor #0063B1
skinparam participantFontColor #002D5C
skinparam sequenceArrowColor #002D5C
skinparam sequenceLifeLineBackgroundColor #EFF5FB

participant "analytics.py\n(Route)" as Route
participant "AnalyticsService" as Service
participant "MemoryAgent\n(Claude)" as Agent
participant "IssueRepository" as IssueRepo
participant "ScorecardRepository" as ScoreRepo
participant "LLMService\n(Claude)" as LLM
participant "SQLite DB" as DB

Route -> Service : detect_recurring_issues(db, vendor_id="CoreSystems", min_occurrences=2)
activate Service
Service -> IssueRepo : get_recurring(db, vendor_id, min_occurrences=2)
IssueRepo -> DB : SELECT * FROM issues\nWHERE vendor_id=?\nAND occurrences >= 2\nAND status = 'OPEN'\nORDER BY occurrences DESC
DB --> IssueRepo : Issue[2]
note right : CoreSystems has:\n1. "Delivery Quality below SLA" (3 occurrences)\n2. "Delayed invoices" (2 occurrences)
IssueRepo --> Service : recurring_issues
Service --> Route : RecurringIssue[2]
deactivate Service

Route -> Service : get_trend_data(db, vendor_id, cycles=4)
Service -> ScoreRepo : get_averages for last 4 cycles
ScoreRepo -> DB : SELECT + aggregate scorecards (4 queries)
DB --> ScoreRepo : TrendDataPoint[4]
Service --> Route : trend_data

note over Route : [GENERATE LEADERSHIP BRIEF called]

Route -> Agent : run("Generate leadership brief for CoreSystems")
Agent -> Agent : _tool_calling_loop()

Agent -> Agent : get_trend_data tool → loads 4-cycle trend
Agent -> Agent : detect_recurring_issues tool → loads OPEN recurring issues
Agent -> Agent : get_prior_agreements tool → loads CLOSED action items from prior cycles
Agent -> Agent : get_cross_vendor_comparison tool → current cycle all 3 vendors

Agent -> LLM : Claude call with all structured data
LLM --> Agent : LeadershipBrief JSON {\n  trajectory: "DECLINING",\n  recurring_issues: [...],\n  prior_commitments: [...],\n  recommended_focus_areas: [...]\n}

Agent --> Route : AgentResponse { status: "success", data: LeadershipBrief }

@enduml
```

---

## 18. Sequence: Seed Data Initialisation

```plantuml
@startuml SeedData
skinparam participantBackgroundColor #F4F6F9
skinparam participantBorderColor #007A87
skinparam participantFontColor #1A1A2E
skinparam sequenceArrowColor #007A87

participant "seed_data.py" as Seed
participant "SQLAlchemy Session" as DB

Seed -> DB : Create 3 Vendor records\n(NovaTech, CoreSystems, Meridian IT)
Seed -> DB : Create 9 Stakeholder records\n(Shell VMO, IDT, Vendor contacts)

loop for each vendor (3 vendors)
  loop for each quarter Q1-Q4 of 2025 (4 cycles)
    Seed -> DB : INSERT governance_cycles (workflow_state='ARCHIVED')
    Seed -> DB : INSERT cycle_attendees (9 per cycle)

    loop for each stakeholder (6 Shell stakeholders)
      loop for each category (5 categories)
        Seed -> DB : INSERT scorecards\n(score from SCORE_MATRIX, is_valid=1)
      end
    end

    Seed -> DB : INSERT meetings (EGB_QBR, minutes_approved=1)
    Seed -> DB : INSERT action_items (2 OPEN, 1 CLOSED per cycle)
  end
end

Seed -> DB : INSERT issues (3 recurring issues across vendors)
note right : CoreSystems: 2 OPEN (3 + 2 occurrences)\nNovaTech: 1 RESOLVED

loop for each cycle (12 total)
  Seed -> DB : INSERT slot_proposals (3 per cycle, 1 approved)
  Seed -> DB : INSERT face_off_model (6 positions per cycle)
  Seed -> DB : INSERT notifications (reminders for scorecards)
end

Seed -> DB : COMMIT
Seed -> Seed : Print: "Seeded 3 vendors, 12 cycles, 360 scorecard entries"

@enduml
```

---

## 19. State Machine: Workflow Engine

```plantuml
@startuml WorkflowStateMachine
skinparam stateBackgroundColor #DAE8F5
skinparam stateBorderColor #0063B1
skinparam stateFontColor #002D5C
skinparam arrowColor #0063B1
skinparam noteBackgroundColor #FFF8E1
skinparam noteBorderColor #C99A06

[*] --> CYCLE_CREATED : POST /cycles

state "MODULE A: SCHEDULING" as A {
  CYCLE_CREATED --> ATTENDEE_REFRESH_SENT : start_scheduling()\n[organiser approves dispatch]
  ATTENDEE_REFRESH_SENT --> AVAILABILITY_COLLECTED : simulate_responses()\n[all key attendees confirmed]
  AVAILABILITY_COLLECTED --> MEETING_SCHEDULED : approve_slot()\n[organiser selects slot]
}

state "MODULE B: SCORECARD" as B {
  MEETING_SCHEDULED --> SCORECARD_REQUEST_SENT : send_scorecard_request()\n[organiser approves dispatch]
  SCORECARD_REQUEST_SENT --> SCORECARD_COLLECTION : submit_scorecard()\n[first submission received]
  SCORECARD_COLLECTION --> SCORECARD_COMPILED : compile_scorecard()\n[deadline or manual trigger]
}

state "MODULE C: ALIGNMENT" as C {
  SCORECARD_COMPILED --> INTERNAL_ALIGNMENT : compare_cycles()\n[auto-triggered]
}

state "MODULE D: VENDOR PREP" as D {
  INTERNAL_ALIGNMENT --> VENDOR_PREP : save_alignment_notes()\n[notes saved]
}

state "MODULE E: MEETING" as E {
  VENDOR_PREP --> MEETING_IN_PROGRESS : start_meeting()\n[facilitator clicks Start]
  MEETING_IN_PROGRESS --> POST_MEETING_COMPLETE : approve_minutes()\n[minutes reviewed and approved]
}

state "MODULE F: ARCHIVE" as F {
  POST_MEETING_COMPLETE --> ARCHIVED : manual trigger\n[all open actions reviewed]
}

ARCHIVED --> [*]

note right of CYCLE_CREATED
  Entry point.
  Cycle record created.
  Vendor and attendees
  loaded from prior cycle.
end note

note right of SCORECARD_COMPILED
  Alignment module auto-triggers
  here. Score diff and flags
  calculated immediately.
end note

note right of POST_MEETING_COMPLETE
  Action items from Modules C, D, E
  are merged into unified log.
  Leadership brief available.
end note

@enduml
```

---

## 20. Activity: Scorecard Compilation Pipeline

```plantuml
@startuml ScorecardCompilation
skinparam activityBackgroundColor #EFF5FB
skinparam activityBorderColor #0063B1
skinparam activityFontColor #1A1A2E
skinparam arrowColor #0063B1
skinparam noteBackgroundColor #FFF8E1
skinparam noteBorderColor #C99A06

|Route Handler|
start
:POST /cycles/{id}/scorecard/compile;
:Load all scorecards for cycle_id;

|ValidationService|
:Separate VALID from INVALID entries;
if (valid_count >= minimum threshold?) then (no)
  |Route Handler|
  :Return 400: "Insufficient submissions";
  stop
else (yes)
  :Proceed with valid entries;
endif

:Group entries by CATEGORY;
:Calculate mean per category;
:Calculate overall_average;
note right: weighted average across\nall 5 categories

:Run outlier detection per category;
loop for each category group
  if (group_size >= 3?) then (yes)
    :Calculate stdev;
    loop for each entry in group
      if (|score - mean| > 1.5 * stdev?) then (yes)
        :Mark entry: OUTLIER flag;
        :UPDATE scorecards SET validation_flags;
      else (no)
        :Entry is clean;
      endif
    end
  else (no)
    :Skip outlier check (too few entries);
  endif
end

|Route Handler|
:Build CompiledScorecardOut;
:averages per category;
:outlier_count;
:missing_count (stakeholders without submission);
:compiled_at = now();

:UPDATE governance_cycles\nSET workflow_state = SCORECARD_COMPILED;

:Log to agent_runs (status=SUCCESS);
:Return AgentResponse;

|AlignmentModule (auto-triggered)|
:score_diff.compare(current, previous);
:detect_alignment_flags(current_entries);
:UPDATE governance_cycles\nSET workflow_state = INTERNAL_ALIGNMENT;

stop

@enduml
```

---

## 21. Activity: LLM Service with Retry

```plantuml
@startuml LLMRetry
skinparam activityBackgroundColor #EFF5FB
skinparam activityBorderColor #007A87
skinparam activityFontColor #1A1A2E
skinparam arrowColor #007A87
skinparam noteBackgroundColor #FFF8E1
skinparam noteBorderColor #C99A06

|LLMService.call_with_retry|
start
:attempt = 0;
:max_retries = 3;

repeat
  :POST /v1/messages to Anthropic API;

  if (Response OK?) then (yes)
    :Return Message object;
    stop
  else (no)
    if (RateLimitError?) then (yes)
      :attempt += 1;
      if (attempt < max_retries?) then (yes)
        :sleep(2 ^ attempt seconds);
        note right: Exponential backoff:\n2s, 4s, 8s
      else (no)
        :raise RateLimitError;
        stop
      endif
    else if (APIConnectionError?) then (yes)
      :attempt += 1;
      if (attempt < max_retries?) then (yes)
        :sleep(1 second);
      else (no)
        :Build error AgentResponse;
        :status = "failed";
        :warnings = ["LLM unavailable"];
        :next_actions = ["RETRY"];
        :Return fallback AgentResponse;
        stop
      endif
    else if (JSONDecodeError on output?) then (yes)
      :Log raw_output to agent_runs;
      :Return AgentResponse {\n  status: "partial",\n  data: { raw_output: ... }\n};
      stop
    else
      :Unexpected error;
      :Log full traceback;
      :raise Exception;
      stop
    endif
  endif
repeat while (attempt < max_retries)

stop

@enduml
```

---

## 22. Deployment Component Diagram

```plantuml
@startuml Deployment
skinparam nodeBackgroundColor #DAE8F5
skinparam nodeBorderColor #0063B1
skinparam nodeFontColor #002D5C
skinparam componentBackgroundColor #F4F6F9
skinparam componentBorderColor #007A87
skinparam databaseBackgroundColor #EFF5FB
skinparam databaseBorderColor #0063B1
skinparam cloudBackgroundColor #FFF8E1
skinparam cloudBorderColor #C99A06
skinparam arrowColor #002D5C

actor "Shell Executive\n(Browser)" as User

node "Vercel CDN\n(Frontend)" as Vercel {
  component "React SPA\n(dist/index.html)" as FE
  component "Vite Build\n(assets/*.js, *.css)" as Assets
}

node "Render.com / Fly.io\n(Backend)" as Backend {
  component "uvicorn\n(ASGI server)" as Uvicorn
  component "FastAPI App\n(app/main.py)" as App
  component "Agent Modules\n(6 agents)" as Agents
  component "Service Layer\n(LLM, Validation, Analytics)" as Services
  database "SQLite\n(/data/vendorpulse.db)" as SQLite
}

cloud "Anthropic API\n(External)" as Anthropic {
  component "claude-sonnet-4-6\nTool-calling endpoint" as Claude
}

User --> Vercel : HTTPS
Vercel --> Backend : HTTPS API calls\n/api/*
Backend --> Anthropic : HTTPS\nPOST /v1/messages

FE --> Assets : bundles
FE --> App : axios REST calls
Uvicorn --> App : routes
App --> Agents
App --> Services
Agents --> Services
Services --> SQLite
Services --> Claude

note right of Backend
  Environment variables:
  - ANTHROPIC_API_KEY
  - DATABASE_URL
  - CORS_ORIGINS
end note

note right of SQLite
  Persisted via volume mount.
  Seed data loaded at startup.
  Reset-friendly for demo.
end note

@enduml
```

---

*VendorPulse Backend UML v1.0 — Zensar Technologies — 2026-04-01*
