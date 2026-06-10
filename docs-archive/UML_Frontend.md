# VendorPulse — Frontend UML Diagrams

> **Format:** PlantUML | Render at: https://www.plantuml.com/plantuml/uml  
> **Coverage:** Component hierarchy · State management · Type system · Sequence flows · Activity flows

---

## Table of Contents

1. [Component Tree Diagram](#1-component-tree-diagram)
2. [Shared Component Class Diagram](#2-shared-component-class-diagram)
3. [Module Components Class Diagram](#3-module-components-class-diagram)
4. [Zustand Store Class Diagram](#4-zustand-store-class-diagram)
5. [TypeScript Type System Class Diagram](#5-typescript-type-system-class-diagram)
6. [API Client Layer Class Diagram](#6-api-client-layer-class-diagram)
7. [TanStack Query Hooks Class Diagram](#7-tanstack-query-hooks-class-diagram)
8. [Sequence: Approval Flow](#8-sequence-approval-flow)
9. [Sequence: Module A — Scheduling Flow](#9-sequence-module-a--scheduling-flow)
10. [Sequence: Module B — Scorecard Submission](#10-sequence-module-b--scorecard-submission)
11. [Sequence: Module D — Vendor Brief & Pushback](#11-sequence-module-d--vendor-brief--pushback)
12. [Sequence: Module E — Live Meeting Capture & Minutes](#12-sequence-module-e--live-meeting-capture--minutes)
13. [Sequence: Module F — Analytics & Leadership Brief](#13-sequence-module-f--analytics--leadership-brief)
14. [Sequence: TanStack Query Cache Invalidation](#14-sequence-tanstack-query-cache-invalidation)
15. [Activity: Cycle Workspace Tab Navigation](#15-activity-cycle-workspace-tab-navigation)
16. [Activity: Scorecard Validation Flow](#16-activity-scorecard-validation-flow)
17. [State: AgentStatusBadge States](#17-state-agentstatusbadge-states)
18. [State: ApprovalPanel States](#18-state-approvalpanel-states)

---

## 1. Component Tree Diagram

```plantuml
@startuml ComponentTree
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

package "main.tsx" {
  [BrowserRouter] --> [QueryClientProvider]
  [QueryClientProvider] --> [App]
}

package "App.tsx" {
  [App] --> [AppShell]
  [AppShell] --> [Sidebar]
  [AppShell] --> [Topbar]
  [AppShell] --> [Outlet]
}

package "Pages (Routes)" {
  [Outlet] --> [Dashboard]
  [Outlet] --> [CycleDetail]
  [Outlet] --> [Analytics]
}

package "Dashboard" {
  [Dashboard] --> [CycleCard]
  [Dashboard] --> [AgentRunLog]
}

package "CycleDetail" {
  [CycleDetail] --> [WorkflowProgressBar]
  [CycleDetail] --> [CycleWorkspaceTabs]
  [CycleWorkspaceTabs] --> [OverviewTab]
  [CycleWorkspaceTabs] --> [SchedulingTab]
  [CycleWorkspaceTabs] --> [ScorecardTab]
  [CycleWorkspaceTabs] --> [AlignmentTab]
  [CycleWorkspaceTabs] --> [VendorPrepTab]
  [CycleWorkspaceTabs] --> [MeetingTab]
  [CycleWorkspaceTabs] --> [ActionsTab]
}

package "Analytics Page" {
  [Analytics] --> [VendorSelector]
  [Analytics] --> [TrendLineChart]
  [Analytics] --> [RadarChart]
  [Analytics] --> [CrossVendorBarChart]
  [Analytics] --> [RecurringIssueAlerts]
  [Analytics] --> [LeadershipBriefCard]
}

package "Module Tabs" {
  [SchedulingTab] --> [AttendeeRefreshPanel]
  [SchedulingTab] --> [SlotRankingPanel]
  [SchedulingTab] --> [InviteApprovalPanel]
  [SchedulingTab] --> [ConfirmationTracker]

  [ScorecardTab] --> [ScorecardDispatchPanel]
  [ScorecardTab] --> [SubmissionTracker]
  [ScorecardTab] --> [CompiledScorecardTable]

  [AlignmentTab] --> [ChangeHighlightsPanel]
  [AlignmentTab] --> [AlignmentFlagsPanel]
  [AlignmentTab] --> [FaceOffModelEditor]
  [AlignmentTab] --> [NotesInputPanel]
  [AlignmentTab] --> [ActionLog]

  [VendorPrepTab] --> [VendorBriefPanel]
  [VendorPrepTab] --> [PushbackInput]
  [VendorPrepTab] --> [PushbackResponseCards]
  [VendorPrepTab] --> [UnresolvedItemTracker]

  [MeetingTab] --> [MeetingBriefingCard]
  [MeetingTab] --> [LiveCapturePanel]
  [MeetingTab] --> [TranscriptInput]
  [MeetingTab] --> [MeetingMinutesViewer]

  [ActionsTab] --> [ActionLog]
}

package "Shared Components" {
  [ApprovalPanel]
  [ActionLog]
  [AgentStatusBadge]
  [WorkflowProgressBar]
  [EmptyState]
  [SectionHeader]
  [NotificationsPanel]
  [AgentRunLog]
  [ConfirmDialog]
}

[Topbar] --> [NotificationsPanel]
[Topbar] --> [AgentRunLog]

@enduml
```

---

## 2. Shared Component Class Diagram

```plantuml
@startuml SharedComponents
skinparam classBackgroundColor #DAE8F5
skinparam classBorderColor #0063B1
skinparam classHeaderBackgroundColor #002D5C
skinparam classHeaderFontColor #FFFFFF
skinparam classFontColor #1A1A2E
skinparam classFontSize 10
skinparam arrowColor #0063B1

class ApprovalPanel {
  +isOpen: boolean
  +type: ApprovalType
  +summary: string
  +previewContent: string
  +recipients: string[]
  +isLoading: boolean
  --
  +onApprove(): void
  +onEdit(): void
  +onCancel(): void
}

enum ApprovalType {
  INVITE
  SCORECARD_REQUEST
  VENDOR_BRIEF
  MINUTES
  REMINDER
}

class WorkflowProgressBar {
  +currentState: WorkflowState
  --
  -computeStepStatus(step): StepStatus
  -renderStep(step, status): JSX
}

enum StepStatus {
  COMPLETED
  ACTIVE
  LOCKED
}

class AgentStatusBadge {
  +status: AgentBadgeStatus
  +agentName: string
  --
  -getBadgeVariant(): string
  -getIcon(): LucideIcon
}

enum AgentBadgeStatus {
  IDLE
  RUNNING
  AWAITING_APPROVAL
  COMPLETE
  FAILED
}

class ActionLog {
  +cycleId: string
  +sourceFilter: SourceModule
  +readOnly: boolean
  --
  -useActionItems(cycleId): ActionItem[]
  -handleStatusChange(id, status): void
  -renderStatusBadge(status): JSX
}

enum SourceModule {
  ALIGNMENT
  VENDOR_PREP
  MEETING
}

class EmptyState {
  +icon: LucideIcon
  +title: string
  +description: string
  +action: ActionConfig
}

class SectionHeader {
  +title: string
  +description: string
  +agentStatus: AgentBadgeStatus
  +actions: ReactNode
}

class NotificationsPanel {
  +cycleId: string
  --
  -groupByType(notifications): Map
  -renderNotificationItem(n): JSX
}

class AgentRunLog {
  +cycleId: string
  --
  -renderStatusIcon(status): JSX
  -formatDuration(run): string
}

class ConfirmDialog {
  +isOpen: boolean
  +title: string
  +description: string
  +confirmLabel: string
  +variant: "default" | "destructive"
  --
  +onConfirm(): void
  +onCancel(): void
}

ApprovalPanel --> ApprovalType
WorkflowProgressBar --> StepStatus
AgentStatusBadge --> AgentBadgeStatus
ActionLog --> SourceModule

@enduml
```

---

## 3. Module Components Class Diagram

```plantuml
@startuml ModuleComponents
skinparam classBackgroundColor #F4F6F9
skinparam classBorderColor #007A87
skinparam classHeaderBackgroundColor #007A87
skinparam classHeaderFontColor #FFFFFF
skinparam classFontColor #1A1A2E
skinparam classFontSize 10
skinparam arrowColor #007A87
skinparam packageBackgroundColor #EAF7F8
skinparam packageBorderColor #007A87

package "Module A — Scheduling" {
  class AttendeeRefreshPanel {
    +cycleId: string
    --
    -useAttendees(cycleId)
    -useStartScheduling()
    -useSimulateResponses()
    +handleDispatch(): void
    +handleSimulate(): void
  }

  class SlotRankingPanel {
    +cycleId: string
    --
    -useRankedSlots(cycleId)
    -useApproveSlot()
    +handleApprove(slotId): void
  }

  class SlotCard {
    +slot: SlotProposal
    +rank: 1|2|3
    --
    +onApprove(slotId): void
    -renderAvailabilityBreakdown(): JSX
  }

  class InviteApprovalPanel {
    +cycleId: string
    --
    -useInviteDraft(cycleId)
    -useSendInvite()
    +handleApprove(): void
  }

  class ConfirmationTracker {
    +cycleId: string
    --
    -useAttendees(cycleId)
    -renderStatusBadge(status): JSX
  }
}

package "Module B — Scorecard" {
  class ScorecardDispatchPanel {
    +cycleId: string
    --
    -useSendScorecardRequest()
    +handleDispatch(): void
  }

  class SubmissionTracker {
    +cycleId: string
    --
    -useSubmissionStatus(cycleId)
    +expandRow(stakeholderId): void
  }

  class ReminderHistory {
    +notifications: Notification[]
    --
    -renderTimeline(): JSX
    -getToneLabel(type): string
  }

  class CompiledScorecardTable {
    +cycleId: string
    --
    -useCompiledScorecard(cycleId)
    -renderOutlierCell(entry): JSX
    -renderAveragesRow(): JSX
  }

  class OutlierBadge {
    +score: number
    +groupAvg: number
    +deviation: number
  }
}

package "Module C — Alignment" {
  class ChangeHighlightsPanel {
    +cycleId: string
    --
    -useAlignmentChanges(cycleId)
    -renderDeltaIndicator(delta): JSX
  }

  class AlignmentFlagsPanel {
    +cycleId: string
    --
    -useAlignmentFlags(cycleId)
    -handleMarkResolved(flagId): void
  }

  class FaceOffModelEditor {
    +cycleId: string
    --
    -useFaceOffModel(cycleId)
    -useUpdateFaceOff()
    +handleInlineEdit(posId, field, value): void
  }

  class NotesInputPanel {
    +cycleId: string
    --
    -useExtractActions()
    +handleExtract(): void
  }

  class ExtractedActionsPreview {
    +actions: ActionItem[]
    --
    +onEdit(id, field, value): void
    +onConfirm(): void
    +onDiscard(): void
  }
}

package "Module D — Vendor Prep" {
  class VendorBriefPanel {
    +cycleId: string
    --
    -useVendorBrief(cycleId)
    -useGenerateBrief()
    +handleGenerate(): void
    +handleApprove(): void
    -renderCategoryRow(cat): JSX
  }

  class PushbackInput {
    +cycleId: string
    --
    -form: UseFormReturn
    -useAddPushback()
    +handleSubmit(data): void
  }

  class PushbackResponseCards {
    +pushbackId: string
    +responses: PushbackResponse[]
    --
    -useSelectResponse()
    +handleSelect(stance): void
    -renderLegalFlag(): JSX
  }

  class UnresolvedItemTracker {
    +cycleId: string
    --
    -usePushbackItems(cycleId)
    -renderCategoryBadge(cat): JSX
  }
}

package "Module E — Meeting" {
  class MeetingBriefingCard {
    +cycleId: string
    --
    -useMeetingBriefing(cycleId)
    -renderMiniChart(data): JSX
  }

  class LiveCapturePanel {
    +cycleId: string
    --
    -useCapture(cycleId)
    -useCaptureNote()
    +selectedType: NoteType
    +handleAddNote(): void
  }

  class CaptureNoteItem {
    +note: MeetingNote
    --
    +onDelete(noteId): void
    -renderTypeBadge(): JSX
  }

  class TranscriptInput {
    +cycleId: string
    --
    -useParseTranscript()
    +handleParse(): void
  }

  class MeetingMinutesViewer {
    +cycleId: string
    --
    -useMeetingMinutes(cycleId)
    -useApproveMinutes()
    +handleCopyToClipboard(): void
    +handleApprove(): void
  }
}

package "Module F — Analytics" {
  class TrendLineChart {
    +vendorId: string
    +data: TrendDataPoint[]
    --
    -buildChartData(): object[]
    -CATEGORY_COLOURS: Record
  }

  class RadarChart {
    +currentCycleData: Record
    +previousCycleData: Record
    --
    -buildRadarData(): object[]
  }

  class CrossVendorBarChart {
    +cycleId: string
    +data: VendorComparison[]
    --
    -buildGroupedData(): object[]
  }

  class RecurringIssueAlerts {
    +issues: RecurringIssue[]
    --
    -useMarkResolved()
    +handleResolve(issueId): void
  }

  class LeadershipBriefCard {
    +cycleId: string
    --
    -useLeadershipBrief(cycleId)
    -useGenerateLeadershipBrief()
    +handleGenerate(): void
    -renderSection(label, items): JSX
  }

  class VendorSelector {
    +vendors: Vendor[]
    +selected: string
    --
    +onChange(vendorId): void
  }
}

SubmissionTracker --> ReminderHistory
SlotRankingPanel --> SlotCard
LiveCapturePanel --> CaptureNoteItem
CompiledScorecardTable --> OutlierBadge
NotesInputPanel --> ExtractedActionsPreview
PushbackInput --> PushbackResponseCards

@enduml
```

---

## 4. Zustand Store Class Diagram

```plantuml
@startuml ZustandStores
skinparam classBackgroundColor #DAE8F5
skinparam classBorderColor #0063B1
skinparam classHeaderBackgroundColor #002D5C
skinparam classHeaderFontColor #FFFFFF
skinparam classFontColor #1A1A2E
skinparam classFontSize 10
skinparam arrowColor #002D5C

class CycleStore <<Zustand Store>> {
  +activeCycleId: string | null
  +activeVendorId: string | null
  +activeTab: TabKey
  --
  +setActiveCycleId(id: string): void
  +setActiveVendorId(id: string): void
  +setActiveTab(tab: TabKey): void
}

enum TabKey {
  overview
  scheduling
  scorecard
  alignment
  vendor_prep
  meeting
  actions
}

class ApprovalStore <<Zustand Store>> {
  +pendingApproval: ApprovalItem | null
  +isApprovalOpen: boolean
  --
  +openApproval(item: ApprovalItem): void
  +closeApproval(): void
  +confirmApproval(id: string): void
  +rejectApproval(id: string): void
}

class ApprovalItem {
  +id: string
  +type: ApprovalType
  +summary: string
  +previewContent: string
  +recipients: string[]
  +agentRunId: string
}

enum ApprovalType {
  INVITE
  SCORECARD_REQUEST
  VENDOR_BRIEF
  MINUTES
  REMINDER
}

class UIStore <<Zustand Store>> {
  +sidebarCollapsed: boolean
  +notificationsOpen: boolean
  +agentRunLogOpen: boolean
  --
  +toggleSidebar(): void
  +toggleNotifications(): void
  +toggleAgentRunLog(): void
}

note right of CycleStore
  Persisted to sessionStorage.
  Drives URL sync via
  useSearchParams hook.
end note

note right of ApprovalStore
  Modal open/close driven
  entirely by this store.
  Components never manage
  their own approval modal.
end note

CycleStore --> TabKey
ApprovalStore --> ApprovalItem
ApprovalItem --> ApprovalType

@enduml
```

---

## 5. TypeScript Type System Class Diagram

```plantuml
@startuml TypeSystem
skinparam classBackgroundColor #F4F6F9
skinparam classBorderColor #002D5C
skinparam classHeaderBackgroundColor #0063B1
skinparam classHeaderFontColor #FFFFFF
skinparam classFontColor #1A1A2E
skinparam classFontSize 9
skinparam arrowColor #002D5C
skinparam packageBackgroundColor #EFF5FB
skinparam packageBorderColor #0063B1

package "agent.types" {
  class AgentResponse<T> {
    +status: AgentStatus
    +agent: string
    +summary: string
    +data: T
    +warnings: string[]
    +next_actions: string[]
    +requires_approval: boolean
    +run_id: string
  }
  enum AgentStatus {
    success
    failed
    partial
    pending_approval
  }
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
}

package "cycle.types" {
  class Cycle {
    +cycle_id: string
    +vendor_id: string
    +vendor_name: string
    +cycle_name: string
    +quarter: number
    +year: number
    +workflow_state: WorkflowState
    +created_at: string
    +updated_at: string
  }
  class Vendor {
    +vendor_id: string
    +name: string
    +category: string
    +status: string
  }
}

package "scheduling.types" {
  class Attendee {
    +id: string
    +stakeholder_id: string
    +name: string
    +email: string
    +role: string
    +is_key: boolean
    +is_confirmed: boolean
    +invite_status: InviteStatus
    +replacement_name: string | null
    +replacement_email: string | null
  }
  class SlotProposal {
    +slot_id: string
    +proposed_time: string
    +timezone: string
    +rank_score: number
    +organiser_available: boolean
    +exec_sponsor_available: boolean
    +attendee_availability: Record<string,boolean>
    +total_available: number
    +total_attendees: number
    +is_approved: boolean
  }
  class InviteDraft {
    +subject: string
    +body: string
    +recipients: string[]
    +dial_in_details: string
    +scheduled_time: string
  }
  enum InviteStatus {
    PENDING
    ACCEPTED
    DECLINED
  }
}

package "scorecard.types" {
  class ScorecardEntry {
    +scorecard_id: string
    +stakeholder_id: string
    +stakeholder_name: string
    +category: ScorecardCategory
    +score: number
    +comment: string | null
    +is_valid: boolean
    +validation_flags: ValidationFlag[]
    +submitted_at: string
  }
  class CompiledScorecard {
    +cycle_id: string
    +vendor_id: string
    +entries: ScorecardEntry[]
    +averages: Record<ScorecardCategory,number>
    +overall_average: number
    +outlier_count: number
    +missing_count: number
    +compiled_at: string
  }
  enum ScorecardCategory {
    DELIVERY_QUALITY
    SLA_COMPLIANCE
    INNOVATION
    COMMUNICATION
    VALUE_FOR_MONEY
  }
  enum ValidationFlag {
    OUT_OF_RANGE
    COMMENT_REQUIRED
    OUTLIER
  }
}

package "alignment.types" {
  class ScoreChange {
    +category: ScorecardCategory
    +previous_score: number
    +current_score: number
    +delta: number
    +is_significant: boolean
  }
  class AlignmentFlag {
    +category: ScorecardCategory
    +min_score: number
    +max_score: number
    +spread: number
    +prompt_question: string
    +stakeholders_involved: string[]
  }
  class ActionItem {
    +action_id: string
    +cycle_id: string
    +source_module: SourceModule
    +description: string
    +owner: string | null
    +due_date: string | null
    +status: ActionStatus
    +created_at: string
  }
  enum ActionStatus {
    OPEN
    IN_PROGRESS
    CLOSED
  }
}

package "vendorPrep.types" {
  class VendorBrief {
    +overall_score: number
    +overall_trend: Trend
    +category_ratings: CategoryRating[]
    +key_concerns: string[]
    +positive_areas: string[]
    +generated_at: string
  }
  class PushbackItem {
    +id: string
    +description: string
    +category: PushbackCategory
    +requires_legal_review: boolean
    +status: string
    +responses: PushbackResponse[]
  }
  class PushbackResponse {
    +stance: ResponseStance
    +content: string
    +is_selected: boolean
  }
  enum PushbackCategory {
    DATA_DISPUTE
    PROCESS_CONCERN
    RESOURCE_CONSTRAINT
    SCOPE_DISAGREEMENT
    OTHER
  }
  enum ResponseStance {
    FACTUAL
    NEUTRAL
    ESCALATION
  }
  enum Trend {
    IMPROVING
    STABLE
    DECLINING
  }
}

package "meeting.types" {
  class MeetingNote {
    +note_id: string
    +note_type: NoteType
    +content: string
    +raised_by_role: string | null
    +timestamp: string
    +is_actioned: boolean
  }
  class MeetingMinutes {
    +meeting_id: string
    +generated_at: string
    +metadata: MinutesMeta
    +executive_summary: string
    +agenda_summaries: AgendaItem[]
    +key_decisions: string[]
    +qa_log: MeetingNote[]
    +action_items: ActionItem[]
    +approved: boolean
  }
  enum NoteType {
    QUESTION
    OBJECTION
    DECISION
    APPRECIATION
    ACTION
  }
}

package "analytics.types" {
  class TrendDataPoint {
    +cycle_id: string
    +cycle_name: string
    +quarter: number
    +year: number
    +scores: Record<ScorecardCategory,number>
  }
  class RecurringIssue {
    +issue_id: string
    +vendor_id: string
    +vendor_name: string
    +description: string
    +first_seen_cycle: string
    +occurrences: number
    +status: string
    +last_owner: string
  }
  class LeadershipBrief {
    +vendor_name: string
    +trajectory: Trend
    +recurring_issues: RecurringIssue[]
    +prior_commitments: string[]
    +recommended_focus_areas: string[]
    +generated_at: string
  }
}

Cycle --> WorkflowState
AgentResponse --> AgentStatus
CompiledScorecard --> ScorecardEntry
ScorecardEntry --> ScorecardCategory
ScorecardEntry --> ValidationFlag
ScoreChange --> ScorecardCategory
VendorBrief --> Trend
PushbackItem --> PushbackCategory
PushbackItem --> PushbackResponse
PushbackResponse --> ResponseStance
MeetingMinutes --> MeetingNote
MeetingMinutes --> ActionItem
LeadershipBrief --> RecurringIssue
LeadershipBrief --> Trend

@enduml
```

---

## 6. API Client Layer Class Diagram

```plantuml
@startuml APIClient
skinparam classBackgroundColor #DAE8F5
skinparam classBorderColor #0063B1
skinparam classHeaderBackgroundColor #002D5C
skinparam classHeaderFontColor #FFFFFF
skinparam classFontColor #1A1A2E
skinparam classFontSize 10
skinparam arrowColor #002D5C

class AxiosClient <<singleton>> {
  -baseURL: string
  -timeout: number
  --
  +get<T>(url): Promise<T>
  +post<T>(url, data): Promise<T>
  +put<T>(url, data): Promise<T>
  +patch<T>(url, data): Promise<T>
  +delete<T>(url): Promise<T>
  --
  -requestInterceptor(): void
  -responseInterceptor(): void
  -errorNormaliser(error): never
}

class CyclesApi {
  +create(payload: CycleCreateIn): Promise<Cycle>
  +list(vendorId?: string): Promise<Cycle[]>
  +getById(cycleId: string): Promise<Cycle>
}

class SchedulingApi {
  +start(cycleId: string): Promise<AgentResponse>
  +simulateResponses(cycleId: string): Promise<AgentResponse>
  +getAttendees(cycleId: string): Promise<Attendee[]>
  +getRankedSlots(cycleId: string): Promise<SlotProposal[]>
  +approveSlot(cycleId, slotId): Promise<AgentResponse>
  +getInviteDraft(cycleId: string): Promise<InviteDraft>
  +sendInvite(cycleId: string): Promise<AgentResponse>
}

class ScorecardApi {
  +sendRequest(cycleId: string): Promise<AgentResponse>
  +simulateSubmissions(cycleId: string): Promise<AgentResponse>
  +submit(cycleId, payload: ScorecardSubmitIn): Promise<AgentResponse>
  +getStatus(cycleId: string): Promise<SubmissionStatus[]>
  +compile(cycleId: string): Promise<AgentResponse>
  +getCompiled(cycleId: string): Promise<CompiledScorecard>
}

class AlignmentApi {
  +getChanges(cycleId: string): Promise<ScoreChange[]>
  +getFlags(cycleId: string): Promise<AlignmentFlag[]>
  +extractActions(cycleId, notes: string): Promise<AgentResponse>
  +getActions(cycleId: string): Promise<ActionItem[]>
  +updateFaceOff(cycleId, positions): Promise<void>
  +getFaceOff(cycleId: string): Promise<FaceOffPosition[]>
}

class VendorPrepApi {
  +generateBrief(cycleId: string): Promise<AgentResponse>
  +getBrief(cycleId: string): Promise<VendorBrief>
  +addPushback(cycleId, payload): Promise<AgentResponse>
  +getPushback(cycleId: string): Promise<PushbackItem[]>
  +getResponses(cycleId, pushbackId): Promise<PushbackResponse[]>
  +selectResponse(cycleId, pushbackId, stance): Promise<void>
}

class MeetingApi {
  +getBriefing(cycleId: string): Promise<object>
  +captureNote(cycleId, payload): Promise<MeetingNote>
  +getNotes(cycleId: string): Promise<MeetingNote[]>
  +parseTranscript(cycleId, transcript): Promise<AgentResponse>
  +generateMinutes(cycleId: string): Promise<AgentResponse>
  +getMinutes(cycleId: string): Promise<MeetingMinutes>
  +approveMinutes(cycleId: string): Promise<void>
}

class AnalyticsApi {
  +getTrends(vendorId: string): Promise<TrendDataPoint[]>
  +getRadarData(vendorId, cycleId): Promise<object>
  +getCrossVendorComparison(cycleId): Promise<object>
  +getRecurringIssues(): Promise<RecurringIssue[]>
  +generateLeadershipBrief(cycleId): Promise<AgentResponse>
  +getLeadershipBrief(cycleId): Promise<LeadershipBrief>
}

AxiosClient <.. CyclesApi : uses
AxiosClient <.. SchedulingApi : uses
AxiosClient <.. ScorecardApi : uses
AxiosClient <.. AlignmentApi : uses
AxiosClient <.. VendorPrepApi : uses
AxiosClient <.. MeetingApi : uses
AxiosClient <.. AnalyticsApi : uses

@enduml
```

---

## 7. TanStack Query Hooks Class Diagram

```plantuml
@startuml QueryHooks
skinparam classBackgroundColor #F4F6F9
skinparam classBorderColor #007A87
skinparam classHeaderBackgroundColor #007A87
skinparam classHeaderFontColor #FFFFFF
skinparam classFontColor #1A1A2E
skinparam classFontSize 10
skinparam arrowColor #007A87

class useCycles <<hook>> {
  +useCycleList(vendorId?): QueryResult<Cycle[]>
  +useCycleDetail(cycleId): QueryResult<Cycle>
  +useCreateCycle(): MutationResult
}

class useScheduling <<hook>> {
  +useAttendees(cycleId): QueryResult<Attendee[]>
  +useRankedSlots(cycleId): QueryResult<SlotProposal[]>
  +useInviteDraft(cycleId): QueryResult<InviteDraft>
  +useStartScheduling(): MutationResult
  +useSimulateResponses(): MutationResult
  +useApproveSlot(): MutationResult
  +useSendInvite(): MutationResult
}

class useScorecard <<hook>> {
  +useSubmissionStatus(cycleId): QueryResult
  +useCompiledScorecard(cycleId): QueryResult<CompiledScorecard>
  +useSendScorecardRequest(): MutationResult
  +useSimulateSubmissions(): MutationResult
  +useSubmitScorecard(): MutationResult
  +useCompileScorecard(): MutationResult
}

class useAlignment <<hook>> {
  +useAlignmentChanges(cycleId): QueryResult<ScoreChange[]>
  +useAlignmentFlags(cycleId): QueryResult<AlignmentFlag[]>
  +useActionItems(cycleId): QueryResult<ActionItem[]>
  +useFaceOffModel(cycleId): QueryResult<FaceOffPosition[]>
  +useExtractActions(): MutationResult
  +useUpdateFaceOff(): MutationResult
}

class useVendorPrep <<hook>> {
  +useVendorBrief(cycleId): QueryResult<VendorBrief>
  +usePushbackItems(cycleId): QueryResult<PushbackItem[]>
  +useGenerateBrief(): MutationResult
  +useAddPushback(): MutationResult
  +useSelectResponse(): MutationResult
}

class useMeeting <<hook>> {
  +useMeetingBriefing(cycleId): QueryResult
  +useMeetingNotes(cycleId): QueryResult<MeetingNote[]>
  +useMeetingMinutes(cycleId): QueryResult<MeetingMinutes>
  +useCaptureNote(): MutationResult
  +useParseTranscript(): MutationResult
  +useGenerateMinutes(): MutationResult
  +useApproveMinutes(): MutationResult
}

class useAnalytics <<hook>> {
  +useTrendData(vendorId): QueryResult<TrendDataPoint[]>
  +useRadarData(vendorId, cycleId): QueryResult
  +useCrossVendorComparison(cycleId): QueryResult
  +useRecurringIssues(): QueryResult<RecurringIssue[]>
  +useLeadershipBrief(cycleId): QueryResult<LeadershipBrief>
  +useGenerateLeadershipBrief(): MutationResult
}

note bottom of useScheduling
  All mutations call
  queryClient.invalidateQueries()
  on success to keep UI in sync.
end note

@enduml
```

---

## 8. Sequence: Approval Flow

```plantuml
@startuml ApprovalFlow
skinparam sequenceBackgroundColor #FAFAFA
skinparam participantBackgroundColor #DAE8F5
skinparam participantBorderColor #0063B1
skinparam participantFontColor #002D5C
skinparam sequenceArrowColor #002D5C
skinparam sequenceLifeLineBackgroundColor #EFF5FB
skinparam noteBorderColor #C99A06
skinparam noteBackgroundColor #FFF8E1

actor "User (Alex)" as User
participant "Module Component" as Comp
participant "useApprovalStore\n(Zustand)" as ApprovalStore
participant "ApprovalPanel" as Panel
participant "API Client" as API
participant "TanStack Query" as TQ
participant "FastAPI Backend" as BE

User -> Comp : Clicks "Send Scorecard Request"
activate Comp

Comp -> TQ : useSendScorecardRequest() [pending approval]
note right of TQ : Mutation called but NOT yet\nexecuted — waits for user approval

Comp -> ApprovalStore : openApproval({\n  type: SCORECARD_REQUEST,\n  preview: formContent,\n  recipients: [...]\n})
activate ApprovalStore
ApprovalStore -> ApprovalStore : isApprovalOpen = true
ApprovalStore -> Panel : render (isOpen=true)
deactivate ApprovalStore
activate Panel

Panel -> User : Shows preview + recipients
User -> Panel : Clicks "Approve & Send"

Panel -> ApprovalStore : confirmApproval(approvalId)
activate ApprovalStore
ApprovalStore -> TQ : execute mutation
deactivate ApprovalStore

TQ -> API : POST /cycles/{id}/scorecard/send-request
activate API
API -> BE : HTTP POST
activate BE
BE --> API : AgentResponse { status: "success" }
deactivate BE
API --> TQ : Response
deactivate API

TQ -> TQ : invalidateQueries(['scorecard','status',cycleId])
TQ -> Comp : refetch SubmissionTracker data
Comp -> User : SubmissionTracker re-renders

Panel -> ApprovalStore : closeApproval()
Panel -> Panel : unmounts
deactivate Panel
deactivate Comp

TQ -> User : Toast: "Scorecard request sent to 8 stakeholders"

@enduml
```

---

## 9. Sequence: Module A — Scheduling Flow

```plantuml
@startuml SchedulingFlow
skinparam sequenceBackgroundColor #FAFAFA
skinparam participantBackgroundColor #DAE8F5
skinparam participantBorderColor #0063B1
skinparam participantFontColor #002D5C
skinparam sequenceArrowColor #002D5C
skinparam sequenceLifeLineBackgroundColor #EFF5FB

actor "Alex (Coordinator)" as Alex
participant "Dashboard" as Dash
participant "CycleDetail\nScheduling Tab" as ST
participant "AttendeeRefreshPanel" as ARP
participant "SlotRankingPanel" as SRP
participant "InviteApprovalPanel" as IAP
participant "ConfirmationTracker" as CT
participant "API Client" as API
participant "FastAPI" as BE

Alex -> Dash : Clicks "Start New Cycle"
Dash -> API : POST /cycles
API -> BE : Create cycle record
BE --> API : Cycle { cycle_id, workflow_state: CYCLE_CREATED }
Dash -> Alex : Navigates to /cycles/:id?tab=scheduling

Alex -> ST : Views Scheduling Tab
ST -> ARP : renders
ARP -> API : GET /cycles/{id}/scheduling/attendees
API -> BE : Load from previous cycle
BE --> API : Attendee[]
ARP -> Alex : Shows attendee list

Alex -> ARP : Clicks "Start Scheduling" → Approves dispatch
ARP -> API : POST /cycles/{id}/scheduling/start
API -> BE : SchedulingAgent runs
BE --> API : AgentResponse { requires_approval: true }
ARP -> Alex : ApprovalPanel shows refresh form preview
Alex -> ARP : Approves
API -> BE : POST /cycles/{id}/scheduling/send-invite (mock)

Alex -> ARP : Clicks "Simulate Responses" (demo)
ARP -> API : POST /cycles/{id}/scheduling/simulate-responses
API -> BE : Seeds mock responses
BE --> API : AgentResponse { summary: "9 confirmed" }
ARP -> Alex : Attendee list updates — all CONFIRMED

ST -> SRP : renders (workflow_state >= AVAILABILITY_COLLECTED)
SRP -> API : GET /cycles/{id}/scheduling/slots
API -> BE : slot_ranking.rank() runs deterministically
BE --> API : SlotProposal[] sorted by rank_score
SRP -> Alex : Shows 3 ranked SlotCards

Alex -> SRP : Clicks "Approve This Slot" on Rank #1
SRP -> API : POST /cycles/{id}/scheduling/approve-slot { slot_id }
API -> BE : Slot marked approved, state → MEETING_SCHEDULED
BE --> API : AgentResponse { requires_approval: true, data: InviteDraft }

IAP -> Alex : ApprovalPanel shows email preview
Alex -> IAP : Clicks "Approve & Send"
IAP -> API : POST /cycles/{id}/scheduling/send-invite
API -> BE : MockEmailService.send()
BE --> API : { preview_id, sent_at }

CT -> Alex : ConfirmationTracker shows PENDING for all attendees
note right of CT : Refreshes every 10s\nvia TanStack Query\nrefetchInterval

@enduml
```

---

## 10. Sequence: Module B — Scorecard Submission

```plantuml
@startuml ScorecardSubmission
skinparam participantBackgroundColor #DAE8F5
skinparam participantBorderColor #0063B1
skinparam participantFontColor #002D5C
skinparam sequenceArrowColor #002D5C
skinparam sequenceLifeLineBackgroundColor #EFF5FB
skinparam noteBorderColor #C99A06
skinparam noteBackgroundColor #FFF8E1

actor "Alex" as Alex
participant "ScorecardTab" as ST
participant "SubmissionTracker" as Tracker
participant "CompiledScorecardTable" as Compiled
participant "API Client" as API
participant "FastAPI\nScorecardRoute" as Route
participant "ValidationService" as VS

Alex -> ST : Views Scorecard Tab
ST -> API : GET /cycles/{id}/scorecard/status
API -> Route : load submission status
Route --> API : SubmissionStatus[]
Tracker -> Alex : Shows per-stakeholder submission grid

Alex -> ST : Clicks "Send Scorecard Request" → Approves
ST -> API : POST /cycles/{id}/scorecard/send-request
API -> Route : Dispatch mock notifications
Route --> API : AgentResponse { summary: "Sent to 8" }
Tracker -> Alex : Reminder schedule shows: T-5, T-2, T-day

Alex -> ST : Clicks "Simulate Submissions" (demo)
ST -> API : POST /cycles/{id}/scorecard/simulate-submissions
API -> Route : Seed 8 stakeholder submissions
loop for each submission
  Route -> VS : validate(score, comment, category, group_scores)
  VS -> VS : check range (1-5)
  VS -> VS : check comment required (score=1 or 5)
  VS -> VS : check outlier (|score - mean| > 1.5σ)
  VS --> Route : ValidationResult { is_valid, flags }
  Route -> Route : save Scorecard record
end
Route --> API : AgentResponse { warnings: ["1 outlier flagged"] }
Tracker -> Alex : 8/8 submitted, 1 outlier badge shown

Alex -> ST : Clicks "Compile Scorecard"
ST -> API : POST /cycles/{id}/scorecard/compile
API -> Route : ScorecardAgent.run()
Route -> Route : calculate_averages()
Route -> Route : detect_outliers()
Route -> Route : state → SCORECARD_COMPILED
Route --> API : AgentResponse { status: "success" }

ST -> API : GET /cycles/{id}/scorecard/compiled
API -> Route : Load compiled scorecard
Route --> API : CompiledScorecard
Compiled -> Alex : Renders table with averages row\nOutlier cell highlighted in amber\nMissing cells in light red

note right of VS
  Validation is 100% deterministic.
  No LLM involved in this module.
end note

@enduml
```

---

## 11. Sequence: Module D — Vendor Brief & Pushback

```plantuml
@startuml VendorPrepFlow
skinparam participantBackgroundColor #DAE8F5
skinparam participantBorderColor #0063B1
skinparam participantFontColor #002D5C
skinparam sequenceArrowColor #002D5C
skinparam sequenceLifeLineBackgroundColor #EFF5FB

actor "Marcus (Vendor Manager)" as Marcus
participant "VendorPrepTab" as VP
participant "VendorBriefPanel" as Brief
participant "PushbackInput" as PI
participant "PushbackResponseCards" as PRC
participant "API Client" as API
participant "FastAPI\nVendorPrepRoute" as Route
participant "VendorPrepAgent\n(Claude)" as Agent

Marcus -> VP : Views Vendor Prep Tab
VP -> Brief : renders (AgentStatusBadge: IDLE)

Marcus -> Brief : Clicks "Generate Vendor Brief"
Brief -> Brief : AgentStatusBadge → RUNNING
Brief -> API : POST /cycles/{id}/vendor-prep/generate-brief
API -> Route : VendorPrepAgent.run()
activate Agent
Agent -> Agent : get_scorecard_summary tool
Agent -> Agent : get_previous_cycle_scores tool
Agent -> Agent : get_stakeholder_comments tool
Agent -> Agent : get_open_issues tool
Agent -> Agent : Claude API call: generate narrative
Agent --> Route : VendorBrief JSON
deactivate Agent
Route --> API : AgentResponse { requires_approval: true }

Brief -> Brief : AgentStatusBadge → AWAITING_APPROVAL
Brief -> Marcus : ApprovalPanel shows brief preview
Marcus -> Brief : Clicks "Approve Brief"
Brief -> Marcus : Brief rendered in full

Marcus -> PI : Enters pushback: "Data is incorrect for Q3 SLA"
PI -> PI : Category selected: DATA_DISPUTE
Marcus -> PI : Clicks "Submit"
PI -> API : POST /cycles/{id}/vendor-prep/pushback { description, category }
API -> Route : AddPushback → trigger response drafting
Route -> Agent : draft_pushback_responses tool (Claude)
activate Agent
Agent -> Agent : Claude API call: 3 stances
Agent --> Route : [FACTUAL, NEUTRAL, ESCALATION] responses
deactivate Agent
Route --> API : PushbackItem with responses[]

PRC -> Marcus : Shows 3 response cards
Marcus -> PRC : Selects "FACTUAL" stance
PRC -> API : PATCH /cycles/{id}/vendor-prep/pushback/{id}/select { stance: FACTUAL }
API -> Route : Mark response selected
Route --> API : { ok: true }
Marcus -> PRC : Selected card highlighted

@enduml
```

---

## 12. Sequence: Module E — Live Meeting Capture & Minutes

```plantuml
@startuml MeetingFlow
skinparam participantBackgroundColor #DAE8F5
skinparam participantBorderColor #0063B1
skinparam participantFontColor #002D5C
skinparam sequenceArrowColor #002D5C
skinparam sequenceLifeLineBackgroundColor #EFF5FB

actor "Sandra (EGB Chair)" as Sandra
actor "Alex (Note-taker)" as Alex
participant "MeetingTab" as MT
participant "MeetingBriefingCard" as MBC
participant "LiveCapturePanel" as LCP
participant "MeetingMinutesViewer" as MMV
participant "API Client" as API
participant "FastAPI\nMeetingRoute" as Route
participant "MeetingAgent\n(Claude)" as Agent

Sandra -> MT : Clicks "Start Meeting"
MT -> MBC : renders pre-meeting briefing
MBC -> API : GET /cycles/{id}/meeting/briefing
API -> Route : analytics_service.get_trend_data()
Route --> API : Trend summary + predicted challenges
MBC -> Sandra : Shows score trends + focus areas

loop During Meeting
  Alex -> LCP : Types note: "Vendor challenged Q3 delivery data"
  Alex -> LCP : Selects type: OBJECTION
  Alex -> LCP : Clicks "Add Note"
  LCP -> API : POST /cycles/{id}/meeting/capture { note_type, content, raised_by_role }
  API -> Route : Save MeetingNote
  Route --> API : MeetingNote { note_id, timestamp }
  LCP -> Alex : Note appears in timestamped feed

  Alex -> LCP : Types note: "Agreed to share raw data by Friday"
  Alex -> LCP : Selects type: DECISION
  Alex -> LCP : Clicks "Add Note"
  LCP -> API : POST /cycles/{id}/meeting/capture
  API -> Route : Save MeetingNote
  Route --> API : MeetingNote
end

Sandra -> MT : Clicks "Generate Minutes"
MT -> MT : AgentStatusBadge → RUNNING
MT -> API : POST /cycles/{id}/meeting/generate-minutes
API -> Route : MeetingAgent.run()
activate Agent
Agent -> Agent : get_all_notes tool
Agent -> Agent : get_attendees tool
Agent -> Agent : Claude API call: generate structured minutes
Agent -> Agent : extract_action_items tool
Agent --> Route : MeetingMinutes JSON
deactivate Agent
Route -> Route : state → POST_MEETING_COMPLETE
Route --> API : AgentResponse { requires_approval: true }

MT -> Sandra : ApprovalPanel shows minutes preview
Sandra -> MT : Reviews and clicks "Approve Minutes"
MT -> API : POST /cycles/{id}/meeting/minutes/approve
API -> Route : minutes_approved = true, merge action items
Route --> API : { ok: true }

MMV -> Sandra : Full minutes rendered with sections
Sandra -> MMV : Clicks "Copy to Clipboard"
MMV -> Sandra : Minutes copied

@enduml
```

---

## 13. Sequence: Module F — Analytics & Leadership Brief

```plantuml
@startuml AnalyticsFlow
skinparam participantBackgroundColor #DAE8F5
skinparam participantBorderColor #0063B1
skinparam participantFontColor #002D5C
skinparam sequenceArrowColor #002D5C
skinparam sequenceLifeLineBackgroundColor #EFF5FB

actor "Sandra (EGB Chair)" as Sandra
participant "Analytics Page" as AP
participant "VendorSelector" as VS
participant "TrendLineChart" as TLC
participant "RadarChart" as RC
participant "RecurringIssueAlerts" as RIA
participant "LeadershipBriefCard" as LBC
participant "API Client" as API
participant "FastAPI\nAnalyticsRoute" as Route
participant "MemoryAgent\n(Claude)" as Agent

Sandra -> AP : Navigates to /analytics
AP -> VS : renders with 3 vendor options
Sandra -> VS : Selects "CoreSystems Ltd"
VS -> AP : selectedVendorId updated

AP -> API : GET /analytics/vendors/{vid}/trends
API -> Route : analytics_service.get_trend_data(vendor_id, cycles=4)
Route -> Route : Query last 4 archived cycles
Route -> Route : Calculate averages per cycle per category
Route --> API : TrendDataPoint[4]
TLC -> Sandra : Renders line chart — declining trend visible

AP -> API : GET /analytics/vendors/{vid}/radar?cycleId=current
API -> Route : Build radar data for current vs previous cycle
Route --> API : { current: {...}, previous: {...} }
RC -> Sandra : Renders radar chart — current below previous

AP -> API : GET /analytics/recurring-issues?vendor_id={vid}
API -> Route : issue_repo.get_recurring(vendor_id, min_occurrences=2)
Route --> API : RecurringIssue[2]
note right of Route : CoreSystems has 2 OPEN\nrecurring issues (occurrences >= 2)

RIA -> Sandra : Shows 2 red alert cards:\n"Delivery Quality — 3 cycles"\n"Delayed invoices — 2 cycles"

Sandra -> LBC : Clicks "Generate Leadership Brief"
LBC -> LBC : AgentStatusBadge → RUNNING
LBC -> API : POST /analytics/cycles/{id}/leadership-brief
API -> Route : MemoryAgent.run()
activate Agent
Agent -> Agent : get_trend_data tool
Agent -> Agent : detect_recurring_issues tool
Agent -> Agent : get_prior_agreements tool
Agent -> Agent : Claude API call: generate narrative brief
Agent --> Route : LeadershipBrief JSON
deactivate Agent
Route --> API : AgentResponse { status: "success" }

LBC -> Sandra : Renders 4-section brief:\n1. Trajectory: DECLINING\n2. Recurring Issues\n3. Prior Commitments\n4. Recommended Focus Areas

@enduml
```

---

## 14. Sequence: TanStack Query Cache Invalidation

```plantuml
@startuml CacheInvalidation
skinparam participantBackgroundColor #F4F6F9
skinparam participantBorderColor #007A87
skinparam participantFontColor #1A1A2E
skinparam sequenceArrowColor #007A87
skinparam sequenceLifeLineBackgroundColor #EAF7F8

participant "Component" as Comp
participant "useMutation\n(TanStack Query)" as Mutation
participant "API Client\n(axios)" as API
participant "QueryClient\n(Cache)" as Cache
participant "useQuery\n(Dependent)" as DQ
participant "Component B\n(Subscriber)" as CompB

Comp -> Mutation : mutate(payload)
activate Mutation
Mutation -> API : HTTP POST /endpoint
activate API
API --> Mutation : Response data
deactivate API

Mutation -> Mutation : onSuccess callback fires

note over Mutation, Cache
  Standard invalidation pattern:
  queryClient.invalidateQueries({ queryKey: [...] })
end note

Mutation -> Cache : invalidateQueries(['scorecard','status',cycleId])
activate Cache
Cache -> Cache : Mark query as stale
Cache -> DQ : trigger background refetch
activate DQ
DQ -> API : GET /cycles/{id}/scorecard/status
API --> DQ : Fresh SubmissionStatus[]
DQ -> Cache : Update cache entry
deactivate DQ
Cache -> CompB : Component re-renders with fresh data
deactivate Cache

Mutation -> Comp : isSuccess = true
Comp -> Comp : Toast notification fires
deactivate Mutation

@enduml
```

---

## 15. Activity: Cycle Workspace Tab Navigation

```plantuml
@startuml TabNavigation
skinparam activityBackgroundColor #DAE8F5
skinparam activityBorderColor #0063B1
skinparam activityFontColor #1A1A2E
skinparam arrowColor #002D5C
skinparam noteBackgroundColor #FFF8E1
skinparam noteBorderColor #C99A06

start

:User navigates to /cycles/:cycleId;
:Load cycle (useQuery);

if (Cycle found?) then (no)
  :Redirect to / with toast error;
  stop
else (yes)
  :Read workflow_state from cycle;
  :Compute allowedTabs from state;
endif

:Render CycleWorkspaceTabs;
:Highlight active tab from URL ?tab= param;

repeat
  :User clicks a tab;
  if (Tab is LOCKED?) then (yes)
    :Show Tooltip: "Complete X to unlock";
    note right
      User stays on current tab.
      No hard redirect.
    end note
  else (no)
    :Update URL: ?tab=<selected>;
    :Render module content for tab;

    if (Module has pending agent action?) then (yes)
      :Show AgentStatusBadge: AWAITING_APPROVAL;
      :ApprovalPanel opens if store has pending;
    else (no)
      :Render module normally;
    endif
  endif
repeat while (User remains on page)

stop

@enduml
```

---

## 16. Activity: Scorecard Validation Flow

```plantuml
@startuml ScorecardValidation
skinparam activityBackgroundColor #F4F6F9
skinparam activityBorderColor #007A87
skinparam activityFontColor #1A1A2E
skinparam arrowColor #007A87
skinparam noteBackgroundColor #FFF8E1
skinparam noteBorderColor #C99A06

|Frontend (React Hook Form + Zod)|
start
:Stakeholder fills in ScorecardInputForm;
:Each field: score slider + comment textarea;
:React Hook Form validates on blur;

if (Zod schema valid?) then (no)
  :Show inline error messages;
  :Block form submission;
  stop
else (yes)
  :Enable Submit button;
  :User clicks Submit;
  :POST /cycles/{id}/scorecard/submit;
endif

|Backend (ValidationService)|
:Receive ScorecardSubmitIn;
:Loop each (category, score, comment);

fork
  :Rule 1: Range Check;
  if (score < 1 or score > 5?) then (yes)
    :Flag: OUT_OF_RANGE;
    :is_valid = false;
  else (no)
    :Pass;
  endif
fork again
  :Rule 2: Extreme Score Comment;
  if (score = 1 or 5 AND no comment?) then (yes)
    :Flag: COMMENT_REQUIRED;
    :is_valid = false;
  else (no)
    :Pass;
  endif
fork again
  :Rule 3: Statistical Outlier;
  :Load group_scores for category;
  if (group_scores < 3?) then (yes)
    :Skip outlier check;
  else (no)
    :Calculate mean and stdev;
    if (|score - mean| > 1.5σ?) then (yes)
      :Flag: OUTLIER;
      note right: WARNING only.\nis_valid stays true.
    else (no)
      :Pass;
    endif
  endif
end fork

:Aggregate flags;
if (any ERROR flags?) then (yes)
  :is_valid = false;
  :Save record (is_valid=0, flags=[...]);
  :Return warnings to frontend;
  |Frontend (React Hook Form + Zod)|
  :Show validation errors inline;
  :CompiledScorecardTable: red cell;
else (no)
  :is_valid = true;
  :Save record (is_valid=1, flags=[...]);
  |Frontend (React Hook Form + Zod)|
  if (OUTLIER flag?) then (yes)
    :CompiledScorecardTable:\nShow OutlierBadge (amber);
  else (no)
    :Normal cell rendering;
  endif
endif

stop

@enduml
```

---

## 17. State: AgentStatusBadge States

```plantuml
@startuml AgentBadgeStates
skinparam stateBackgroundColor #DAE8F5
skinparam stateBorderColor #0063B1
skinparam stateFontColor #002D5C
skinparam arrowColor #002D5C
skinparam noteBackgroundColor #FFF8E1
skinparam noteBorderColor #C99A06

[*] --> IDLE : Module tab renders

IDLE --> RUNNING : Mutation triggered\n(user clicks action)
note right of IDLE : Grey circle icon\nNo animation

RUNNING --> AWAITING_APPROVAL : AgentResponse\n{ requires_approval: true }
note right of RUNNING : Blue spinner icon\nPulse animation

RUNNING --> COMPLETE : AgentResponse\n{ status: "success" }

RUNNING --> FAILED : AgentResponse\n{ status: "failed" }\nOR network error

AWAITING_APPROVAL --> COMPLETE : User approves in\nApprovalPanel
AWAITING_APPROVAL --> IDLE : User cancels in\nApprovalPanel

COMPLETE --> IDLE : User triggers\nnext action
note right of COMPLETE : Green check icon

FAILED --> RUNNING : User clicks\n"Retry" button
note right of FAILED : Red x-circle icon\nError message shown

@enduml
```

---

## 18. State: ApprovalPanel States

```plantuml
@startuml ApprovalPanelStates
skinparam stateBackgroundColor #F4F6F9
skinparam stateBorderColor #007A87
skinparam stateFontColor #1A1A2E
skinparam arrowColor #007A87

[*] --> CLOSED : Initial state\n(isApprovalOpen = false)

CLOSED --> OPEN : useApprovalStore\n.openApproval(item)

OPEN --> LOADING : User clicks\n"Approve & Send"
note right of OPEN : Shows preview,\nrecipients, summary.\nEdit button available.

LOADING --> CLOSED : Mutation succeeds\n(closeApproval called)
note right of LOADING : "Approve & Send"\nbutton shows spinner.\nOther buttons disabled.

LOADING --> ERROR : Mutation fails
ERROR --> OPEN : User dismisses error\n(can retry)

OPEN --> CLOSED : User clicks "Cancel"\nor presses Escape

OPEN --> EDIT_MODE : User clicks "Edit"
EDIT_MODE --> OPEN : User saves edits\nor cancels edit

@enduml
```

---

*VendorPulse Frontend UML v1.0 — Zensar Technologies — 2026-04-01*
