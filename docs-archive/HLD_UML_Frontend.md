# VendorPulse — Frontend High-Level Design UML Diagrams

> **Format:** PlantUML | Render at: https://www.plantuml.com/plantuml/uml
> **Coverage:** System architecture · Module-workflow mapping · Data flow · State management · Agent integration

---

## Table of Contents

1. [High-Level Component Architecture](#1-high-level-component-architecture)
2. [Module-to-Workflow State Mapping](#2-module-to-workflow-state-mapping)
3. [State Management Architecture](#3-state-management-architecture)
4. [Full Data Flow Sequence](#4-full-data-flow-sequence)
5. [Agent Integration & Approval Flow](#5-agent-integration--approval-flow)
6. [Page & Routing Structure](#6-page--routing-structure)

---

## 1. High-Level Component Architecture

```plantuml
@startuml HLD_ComponentArchitecture
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
skinparam arrow {
  Color #0063B1
}

package "Browser — React SPA" {

  package "Entry & Routing" {
    [main.tsx\nQueryClient + BrowserRouter] as Entry
    [App.tsx\nRoutes] as App
  }

  package "Layout Shell" {
    [AppShell] as Shell
    [Sidebar\n(cycle nav)] as Sidebar
    [Topbar\n(notifications)] as Topbar
    [CycleWorkspaceTabs\n(A–F tabs)] as Tabs
  }

  package "Pages" {
    [Dashboard\n(all cycles)] as Dashboard
    [CycleDetail\n(active cycle workspace)] as CycleDetail
    [Analytics\n(Module F)] as Analytics
  }

  package "AI Modules (A–F)" {
    [Module A\nScheduling] as ModA
    [Module B\nScorecard] as ModB
    [Module C\nAlignment] as ModC
    [Module D\nVendor Prep] as ModD
    [Module E\nMeeting] as ModE
    [Module F\nAnalytics] as ModF
  }

  package "Shared Components" {
    [ApprovalPanel\n(human-in-the-loop)] as Approval
    [AgentStatusBadge\n(PENDING/SUCCESS/FAILED)] as AgentBadge
    [WorkflowProgressBar\n(12-state indicator)] as ProgressBar
    [AgentRunLog\n(audit trail)] as RunLog
    [NotificationsPanel] as Notifs
  }

  package "State Layer" {
    [TanStack Query\n(server state + cache)] as TSQ
    [Zustand\n(UI state)] as Zustand
  }

  package "API Client" {
    [axios instance\n+ typed wrappers] as Axios
  }
}

cloud "FastAPI Backend\n:8000" as Backend

Entry --> App
App --> Shell
Shell --> Sidebar
Shell --> Topbar
Shell --> Dashboard
Shell --> CycleDetail
Shell --> Analytics

CycleDetail --> Tabs
CycleDetail --> ProgressBar
Tabs --> ModA
Tabs --> ModB
Tabs --> ModC
Tabs --> ModD
Tabs --> ModE
Tabs --> ModF

ModA --> Approval
ModB --> Approval
ModD --> Approval
ModE --> Approval

ModA --> AgentBadge
ModB --> AgentBadge
ModC --> AgentBadge
ModD --> AgentBadge
ModE --> AgentBadge
ModF --> AgentBadge

CycleDetail --> RunLog
Shell --> Notifs

ModA --> TSQ
ModB --> TSQ
ModC --> TSQ
ModD --> TSQ
ModE --> TSQ
ModF --> TSQ
Dashboard --> TSQ
Analytics --> TSQ

Approval --> Zustand
Topbar --> Zustand
Sidebar --> Zustand

TSQ --> Axios
Axios --> Backend

@enduml
```

---

## 2. Module-to-Workflow State Mapping

```plantuml
@startuml HLD_WorkflowModuleMapping
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

title VendorPulse — Workflow States mapped to Frontend Modules

[*] --> CYCLE_CREATED

state "MODULE A — Scheduling" as ModA #E8F5E9 {
  CYCLE_CREATED --> ATTENDEE_REFRESH_SENT : Scheduling Agent\nsends refresh emails
  ATTENDEE_REFRESH_SENT --> AVAILABILITY_COLLECTED : Attendees respond
  AVAILABILITY_COLLECTED --> MEETING_SCHEDULED : Coordinator\napproves slot
}

state "MODULE B — Scorecard" as ModB #E3F2FD {
  MEETING_SCHEDULED --> SCORECARD_REQUEST_SENT : Scorecard Agent\ndispatches forms
  SCORECARD_REQUEST_SENT --> SCORECARD_COLLECTION : Stakeholders submit
  SCORECARD_COLLECTION --> SCORECARD_COMPILED : Scorecard Agent\ncompiles + validates
}

state "MODULE C — Alignment" as ModC #FFF3E0 {
  SCORECARD_COMPILED --> INTERNAL_ALIGNMENT : Alignment Agent\ngenerates alignment doc
}

state "MODULE D — Vendor Prep" as ModD #FCE4EC {
  INTERNAL_ALIGNMENT --> VENDOR_PREP : Vendor Prep Agent\ngenerates brief
}

state "MODULE E — Meeting" as ModE #F3E5F5 {
  VENDOR_PREP --> MEETING_IN_PROGRESS : Meeting Agent\nprovides briefing card
  MEETING_IN_PROGRESS --> POST_MEETING_COMPLETE : Meeting Agent\ngenerates minutes
}

state "MODULE F — Analytics" as ModF #E8EAF6 {
  POST_MEETING_COMPLETE --> ARCHIVED : Cycle archived
  ARCHIVED --> ARCHIVED : Memory Agent\nanalyses trends\n(cross-cycle)
}

ARCHIVED --> [*]

note right of ModA
  Components:
  AttendeeRefreshPanel
  SlotRankingPanel
  InviteApprovalPanel
  ConfirmationTracker
end note

note right of ModB
  Components:
  ScorecardDispatchPanel
  SubmissionTracker
  CompiledScorecardTable
  OutlierBadge
end note

note right of ModC
  Components:
  ChangeHighlightsPanel
  AlignmentFlagsPanel
  FaceOffModelEditor
  ExtractedActionsPreview
end note

note right of ModD
  Components:
  VendorBriefPanel
  PushbackInput
  PushbackResponseCards
  UnresolvedItemTracker
end note

note right of ModE
  Components:
  MeetingBriefingCard
  LiveCapturePanel
  TranscriptInput
  MeetingMinutesViewer
end note

note right of ModF
  Components:
  TrendLineChart
  RadarChart
  CrossVendorBarChart
  RecurringIssueAlerts
  LeadershipBriefCard
end note

@enduml
```

---

## 3. State Management Architecture

```plantuml
@startuml HLD_StateManagement
skinparam classBackgroundColor #DAE8F5
skinparam classBorderColor #0063B1
skinparam classHeaderBackgroundColor #0063B1
skinparam classFontColor #002D5C
skinparam backgroundColor #FAFAFA
skinparam packageBackgroundColor #F4F6F9
skinparam packageBorderColor #BFBFBF

title State Management — Two-Store System

package "Zustand (UI / Ephemeral State)" {

  class useCycleStore {
    + activeCycleId: string | null
    + activeVendorId: string | null
    + activeTab: TabKey
    --
    + setActiveCycleId(id)
    + setActiveVendorId(id)
    + setActiveTab(tab: TabKey)
  }

  class useApprovalStore {
    + pendingApproval: ApprovalItem | null
    + isApprovalOpen: boolean
    --
    + openApproval(item: ApprovalItem)
    + closeApproval()
    + confirmApproval(approvalId)
    + rejectApproval(approvalId)
  }

  class useUIStore {
    + sidebarCollapsed: boolean
    + notificationsOpen: boolean
    + agentRunLogOpen: boolean
    --
    + toggleSidebar()
    + toggleNotifications()
    + toggleAgentRunLog()
  }

  class ApprovalItem {
    + id: string
    + type: INVITE | SCORECARD_REQUEST\n   | VENDOR_BRIEF | MINUTES | REMINDER
    + summary: string
    + previewContent: string
    + recipients: string[]
    + agentRunId: string
  }

  useApprovalStore --> ApprovalItem : contains
}

package "TanStack Query (Server / Async State)" {

  class useCycles {
    + useGetCycles(): Cycle[]
    + useGetCycle(id): Cycle
    + useCreateCycle(): Mutation
  }

  class useScheduling {
    + useGetAttendees(cycleId): Attendee[]
    + useGetSlots(cycleId): SlotProposal[]
    + useRunSchedulingAgent(): Mutation
    + useApproveSlot(): Mutation
  }

  class useScorecard {
    + useGetScorecards(cycleId)
    + useSubmitScore(): Mutation
    + useCompileScorecard(): Mutation
    + useGetCompiledScorecard(cycleId)
  }

  class useAlignment {
    + useGetScoreDiff(cycleId)
    + useGetAlignmentFlags(cycleId)
    + useExtractActions(): Mutation
    + useGetActionItems(cycleId)
  }

  class useVendorPrep {
    + useGetVendorBrief(cycleId)
    + useGenerateBrief(): Mutation
    + useSubmitPushback(): Mutation
    + useGetPushbackItems(cycleId)
  }

  class useMeeting {
    + useGetMeetingContext(cycleId)
    + useCaptureNote(): Mutation
    + useParseTranscript(): Mutation
    + useGetMinutes(cycleId)
    + useApproveMinutes(): Mutation
  }

  class useAnalytics {
    + useGetTrends(vendorId)
    + useGetCrossVendorData()
    + useGetLeadershipBrief(vendorId)
    + useGetRecurringIssues(vendorId)
  }
}

package "API Client (axios)" {
  class AxiosClient {
    + baseURL: VITE_API_BASE_URL
    + interceptors: error handler
    --
    + get<T>(url): Promise<T>
    + post<T>(url, data): Promise<T>
    + patch<T>(url, data): Promise<T>
  }
}

useCycles --> AxiosClient
useScheduling --> AxiosClient
useScorecard --> AxiosClient
useAlignment --> AxiosClient
useVendorPrep --> AxiosClient
useMeeting --> AxiosClient
useAnalytics --> AxiosClient

@enduml
```

---

## 4. Full Data Flow Sequence

```plantuml
@startuml HLD_DataFlowSequence
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

title High-Level Data Flow — User Action to UI Update

actor Coordinator
participant "React\nComponent" as Component
participant "Zustand\nStore" as Zustand
participant "TanStack\nQuery" as TSQ
participant "Axios\nClient" as Axios
participant "FastAPI\nBackend" as Backend
participant "AI Agent\n(Claude)" as Agent
database "SQLite\nDB" as DB

== User Triggers Agent Action ==

Coordinator -> Component : Click "Run Agent" button
Component -> TSQ : mutation.mutate(payload)
TSQ -> Axios : POST /api/v1/cycles/{id}/[module]
Axios -> Backend : HTTP POST
Backend -> Agent : agent.run(message)
Agent -> DB : Read cycle context
Agent --> Backend : tool_results
Backend -> Agent : Claude API call (tool-calling loop)
Agent -> DB : Write results
Agent --> Backend : AgentResponse\n{ status, summary, data,\n  requires_approval, run_id }
Backend --> Axios : JSON response
Axios --> TSQ : Resolve promise

alt requires_approval = true
  TSQ -> Zustand : openApproval(item)
  Zustand -> Component : isApprovalOpen = true
  Component -> Coordinator : Show ApprovalPanel\n(preview + recipients)
  Coordinator -> Component : Click "Approve"
  Component -> TSQ : mutation.mutate(approvalId)
  TSQ -> Axios : POST /api/v1/approve
  Axios -> Backend : Send email / calendar invite
  Backend --> Axios : Confirmed
end

TSQ -> TSQ : Invalidate query cache\nfor this cycle
TSQ -> Component : Re-render with fresh data
Component -> Coordinator : Show toast: "Done"\n+ updated UI

@enduml
```

---

## 5. Agent Integration & Approval Flow

```plantuml
@startuml HLD_AgentApprovalFlow
skinparam backgroundColor #FAFAFA
skinparam activity {
  BackgroundColor #DAE8F5
  BorderColor #0063B1
  FontColor #002D5C
  FontSize 11
}
skinparam decision {
  BackgroundColor #FFF8E1
  BorderColor #C99A06
}
skinparam note {
  BackgroundColor #FFF8E1
  BorderColor #C99A06
  FontSize 10
}

title Agent Integration — Human-in-the-Loop Approval Pattern

start

:Coordinator clicks agent action\n(e.g. "Generate Scorecard Request");

:Frontend calls API via\nTanStack Query mutation;

:Backend runs AI Agent\n(Claude tool-calling loop);

:Backend returns AgentResponse;

if (requires_approval?) then (YES)
  :Open ApprovalPanel modal\nwith preview content\nand recipient list;

  note right
    Types requiring approval:
    • INVITE (calendar / email)
    • SCORECARD_REQUEST (email)
    • VENDOR_BRIEF (email)
    • MINUTES (distribution)
    • REMINDER (escalation email)
  end note

  if (Coordinator decision?) then (APPROVE)
    :Call approve endpoint;
    :Mock service sends\nemail / invite;
    :Workflow state advances;
  else (REJECT)
    :Close modal;
    :No action taken;
    :Agent run logged as\ncancelled by user;
  endif
else (NO)
  :Action applied immediately\n(e.g. save notes, rank slots);
endif

:Invalidate TanStack Query cache;
:UI re-renders with updated data;
:AgentStatusBadge → SUCCESS;
:Toast notification shown;

:Agent run logged to\nagent_runs table\nwith run_id;

stop

@enduml
```

---

## 6. Page & Routing Structure

```plantuml
@startuml HLD_RoutingStructure
skinparam componentStyle rectangle
skinparam backgroundColor #FAFAFA
skinparam component {
  BackgroundColor #DAE8F5
  BorderColor #0063B1
  FontColor #002D5C
  FontSize 10
}
skinparam package {
  BackgroundColor #F4F6F9
  BorderColor #BFBFBF
}
skinparam note {
  BackgroundColor #FFF8E1
  BorderColor #C99A06
  FontSize 10
}

title Routing Structure & Tab-Locking Strategy

package "Route: /" {
  [Dashboard\n• All vendors\n• All active cycles\n• Quick cycle creation\n• Agent run log] as Dash
}

package "Route: /cycles/:cycleId" {
  [WorkflowProgressBar\n12-state indicator] as WPB

  package "Tab: overview" {
    [Cycle metadata\nVendor info\nCurrent state] as OvTab
  }
  package "Tab: scheduling  [Module A]" {
    [AttendeeRefreshPanel\nSlotRankingPanel\nInviteApprovalPanel\nConfirmationTracker] as SchedTab
  }
  package "Tab: scorecard  [Module B]" {
    [ScorecardDispatchPanel\nSubmissionTracker\nCompiledScorecardTable\nOutlierBadge] as SCTab
  }
  package "Tab: alignment  [Module C]" {
    [ChangeHighlightsPanel\nAlignmentFlagsPanel\nFaceOffModelEditor\nExtractedActionsPreview] as AlignTab
  }
  package "Tab: vendor-prep  [Module D]" {
    [VendorBriefPanel\nPushbackInput\nPushbackResponseCards\nUnresolvedItemTracker] as VPTab
  }
  package "Tab: meeting  [Module E]" {
    [MeetingBriefingCard\nLiveCapturePanel\nTranscriptInput\nMeetingMinutesViewer] as MeetTab
  }
  package "Tab: actions" {
    [ActionItems table\nOpen / In-Progress / Closed\nFiltered by source module] as ActTab
  }
}

package "Route: /analytics" {
  [TrendLineChart\nRadarChart\nCrossVendorBarChart\nRecurringIssueAlerts\nLeadershipBriefCard] as AnaPage
}

WPB -down-> OvTab
WPB -down-> SchedTab
WPB -down-> SCTab
WPB -down-> AlignTab
WPB -down-> VPTab
WPB -down-> MeetTab
WPB -down-> ActTab

note bottom of SchedTab
  Locked until:
  CYCLE_CREATED
end note

note bottom of SCTab
  Locked until:
  MEETING_SCHEDULED
end note

note bottom of AlignTab
  Locked until:
  SCORECARD_COMPILED
end note

note bottom of VPTab
  Locked until:
  INTERNAL_ALIGNMENT
end note

note bottom of MeetTab
  Locked until:
  VENDOR_PREP
end note

@enduml
```
