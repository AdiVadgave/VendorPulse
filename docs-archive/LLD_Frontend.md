# VendorPulse — Frontend Low-Level Design (LLD)

> **Version:** 1.0 | **Stack:** React 18 + Vite + Tailwind CSS + shadcn/ui  
> **Scope:** Complete frontend architecture for VendorPulse MVP

---

## Table of Contents

1. [Technology Stack & Dependencies](#1-technology-stack--dependencies)
2. [Application Architecture](#2-application-architecture)
3. [Folder Structure (Detailed)](#3-folder-structure-detailed)
4. [Routing Design](#4-routing-design)
5. [State Management](#5-state-management)
6. [API Client Layer](#6-api-client-layer)
7. [TypeScript Type System](#7-typescript-type-system)
8. [Shared Component Library](#8-shared-component-library)
9. [Module A — Scheduling Components](#9-module-a--scheduling-components)
10. [Module B — Scorecard Components](#10-module-b--scorecard-components)
11. [Module C — Alignment Components](#11-module-c--alignment-components)
12. [Module D — Vendor Prep Components](#12-module-d--vendor-prep-components)
13. [Module E — Meeting Components](#13-module-e--meeting-components)
14. [Module F — Analytics Components](#14-module-f--analytics-components)
15. [Page Designs](#15-page-designs)
16. [Form Handling Strategy](#16-form-handling-strategy)
17. [Error Handling & Loading States](#17-error-handling--loading-states)
18. [Tailwind Design System](#18-tailwind-design-system)
19. [Environment & Build Configuration](#19-environment--build-configuration)
20. [Component Interaction Diagrams](#20-component-interaction-diagrams)

---

## 1. Technology Stack & Dependencies

### Core

| Package | Version | Purpose |
|---|---|---|
| `react` | 18.x | UI rendering |
| `react-dom` | 18.x | DOM binding |
| `vite` | 5.x | Build tool + dev server |
| `typescript` | 5.x | Type safety |

### Styling & UI

| Package | Version | Purpose |
|---|---|---|
| `tailwindcss` | 3.x | Utility-first CSS |
| `@shadcn/ui` | latest | Accessible component primitives |
| `class-variance-authority` | latest | Component variant management |
| `clsx` | latest | Conditional class merging |
| `tailwind-merge` | latest | Tailwind class conflict resolution |
| `lucide-react` | latest | Icon library |

### State & Data Fetching

| Package | Version | Purpose |
|---|---|---|
| `zustand` | 4.x | Client-side state management |
| `@tanstack/react-query` | 5.x | Server state, caching, background refetch |
| `axios` | 1.x | HTTP client with interceptors |

### Forms & Validation

| Package | Version | Purpose |
|---|---|---|
| `react-hook-form` | 7.x | Form state management, no re-renders |
| `zod` | 3.x | Schema-based runtime validation |
| `@hookform/resolvers` | latest | Zod adapter for react-hook-form |

### Charts & Visualisation

| Package | Version | Purpose |
|---|---|---|
| `recharts` | 2.x | Line, Radar, Bar charts for Module F |

### Routing

| Package | Version | Purpose |
|---|---|---|
| `react-router-dom` | 6.x | SPA routing |

### Utilities

| Package | Version | Purpose |
|---|---|---|
| `date-fns` | 3.x | Date formatting and manipulation |
| `sonner` | latest | Toast notifications |

---

## 2. Application Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        React App                            │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Pages     │  │  Zustand     │  │  TanStack Query  │  │
│  │  (Routes)   │  │  (UI State)  │  │  (Server State)  │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                │                    │             │
│  ┌──────▼────────────────▼────────────────────▼──────────┐ │
│  │                   Components                           │ │
│  │  ┌──────────┐  ┌────────────┐  ┌──────────────────┐  │ │
│  │  │  Shared  │  │  Modules   │  │  shadcn/ui (UI)  │  │ │
│  │  │Components│  │  (A to F)  │  │  Primitives      │  │ │
│  │  └──────────┘  └────────────┘  └──────────────────┘  │ │
│  └───────────────────────────────────────────────────────┘ │
│                             │                               │
│  ┌──────────────────────────▼──────────────────────────┐   │
│  │                  API Client Layer                    │   │
│  │          axios instance + typed wrappers             │   │
│  └──────────────────────────┬──────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────┘
                              │ HTTP/REST
                    ┌─────────▼──────────┐
                    │   FastAPI Backend  │
                    └────────────────────┘
```

### Data Flow

```
User Action
    → Component calls React Hook Form / button handler
    → Zustand action OR TanStack Query mutation
    → API client function (typed)
    → axios → FastAPI
    → Response updates TanStack Query cache
    → Component re-renders reactively
    → Toast notification if needed
```

---

## 3. Folder Structure (Detailed)

```
frontend/
├── public/
│   └── favicon.ico
├── src/
│   ├── main.tsx                    # entry point, QueryClient + Router providers
│   ├── App.tsx                     # root component, layout wrapper
│   │
│   ├── components/
│   │   ├── ui/                     # shadcn/ui generated components (do not edit)
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── table.tsx
│   │   │   ├── input.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── select.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── progress.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── tooltip.tsx
│   │   │   └── skeleton.tsx
│   │   │
│   │   ├── shared/                 # reusable product-level components
│   │   │   ├── ApprovalPanel.tsx
│   │   │   ├── ActionLog.tsx
│   │   │   ├── AgentStatusBadge.tsx
│   │   │   ├── WorkflowProgressBar.tsx
│   │   │   ├── AgentRunLog.tsx
│   │   │   ├── NotificationsPanel.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── LoadingSpinner.tsx
│   │   │   ├── SectionHeader.tsx
│   │   │   └── ConfirmDialog.tsx
│   │   │
│   │   ├── layout/
│   │   │   ├── AppShell.tsx        # sidebar + topbar wrapper
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Topbar.tsx
│   │   │   └── CycleWorkspaceTabs.tsx
│   │   │
│   │   └── modules/
│   │       ├── scheduling/
│   │       │   ├── AttendeeRefreshPanel.tsx
│   │       │   ├── SlotRankingPanel.tsx
│   │       │   ├── SlotCard.tsx
│   │       │   ├── InviteApprovalPanel.tsx
│   │       │   └── ConfirmationTracker.tsx
│   │       │
│   │       ├── scorecard/
│   │       │   ├── ScorecardDispatchPanel.tsx
│   │       │   ├── SubmissionTracker.tsx
│   │       │   ├── ScorecardInputForm.tsx
│   │       │   ├── CompiledScorecardTable.tsx
│   │       │   ├── OutlierBadge.tsx
│   │       │   └── ReminderHistory.tsx
│   │       │
│   │       ├── alignment/
│   │       │   ├── ChangeHighlightsPanel.tsx
│   │       │   ├── AlignmentFlagsPanel.tsx
│   │       │   ├── FaceOffModelEditor.tsx
│   │       │   ├── NotesInputPanel.tsx
│   │       │   └── ExtractedActionsPreview.tsx
│   │       │
│   │       ├── vendor-prep/
│   │       │   ├── VendorBriefPanel.tsx
│   │       │   ├── PushbackInput.tsx
│   │       │   ├── PushbackResponseCards.tsx
│   │       │   ├── UnresolvedItemTracker.tsx
│   │       │   └── PushbackCategoryBadge.tsx
│   │       │
│   │       ├── meeting/
│   │       │   ├── MeetingBriefingCard.tsx
│   │       │   ├── LiveCapturePanel.tsx
│   │       │   ├── CaptureNoteItem.tsx
│   │       │   ├── TranscriptInput.tsx
│   │       │   ├── MeetingMinutesViewer.tsx
│   │       │   └── NoteTypeBadge.tsx
│   │       │
│   │       └── analytics/
│   │           ├── TrendLineChart.tsx
│   │           ├── RadarChart.tsx
│   │           ├── CrossVendorBarChart.tsx
│   │           ├── RecurringIssueAlerts.tsx
│   │           ├── LeadershipBriefCard.tsx
│   │           └── VendorSelector.tsx
│   │
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── CycleDetail.tsx
│   │   ├── Analytics.tsx
│   │   └── NotFound.tsx
│   │
│   ├── api/                        # typed API wrapper functions
│   │   ├── client.ts               # axios instance + interceptors
│   │   ├── cycles.api.ts
│   │   ├── scheduling.api.ts
│   │   ├── scorecard.api.ts
│   │   ├── alignment.api.ts
│   │   ├── vendorPrep.api.ts
│   │   ├── meeting.api.ts
│   │   └── analytics.api.ts
│   │
│   ├── store/                      # Zustand stores
│   │   ├── useCycleStore.ts
│   │   ├── useApprovalStore.ts
│   │   └── useUIStore.ts
│   │
│   ├── hooks/                      # TanStack Query hooks per module
│   │   ├── useCycles.ts
│   │   ├── useScheduling.ts
│   │   ├── useScorecard.ts
│   │   ├── useAlignment.ts
│   │   ├── useVendorPrep.ts
│   │   ├── useMeeting.ts
│   │   └── useAnalytics.ts
│   │
│   ├── types/                      # TypeScript interfaces
│   │   ├── cycle.types.ts
│   │   ├── scheduling.types.ts
│   │   ├── scorecard.types.ts
│   │   ├── alignment.types.ts
│   │   ├── vendorPrep.types.ts
│   │   ├── meeting.types.ts
│   │   ├── analytics.types.ts
│   │   └── agent.types.ts
│   │
│   └── utils/
│       ├── cn.ts                   # clsx + tailwind-merge helper
│       ├── formatDate.ts
│       ├── formatScore.ts
│       └── constants.ts
│
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── .env.example
```

---

## 4. Routing Design

```tsx
// src/main.tsx
<BrowserRouter>
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
</BrowserRouter>

// src/App.tsx
<Routes>
  <Route element={<AppShell />}>
    <Route index path="/"                    element={<Dashboard />} />
    <Route path="/cycles/:cycleId"           element={<CycleDetail />} />
    <Route path="/analytics"                 element={<Analytics />} />
    <Route path="*"                          element={<NotFound />} />
  </Route>
</Routes>
```

### Route Parameters

| Route | Params | Query Params |
|---|---|---|
| `/` | — | `?vendor=` (optional filter) |
| `/cycles/:cycleId` | `cycleId: string` | `?tab=scheduling\|scorecard\|alignment\|vendor-prep\|meeting\|actions` |
| `/analytics` | — | `?vendor=` · `?cycle=` |

### Navigation Guards

- If `cycleId` does not exist in DB → redirect to `/` with a toast error
- Tab access controlled by `workflow_state`: tabs beyond current state show a locked indicator, not a hard redirect

---

## 5. State Management

### Architecture: Two-Store System

| Store | Tool | Manages |
|---|---|---|
| Server state | TanStack Query | All API data — cycles, scorecards, notes, agents |
| UI/interaction state | Zustand | Active selections, modal open/close, approval queue |

---

### 5.1 Zustand Stores

#### `useCycleStore`

```ts
interface CycleStore {
  activeCycleId: string | null;
  activeVendorId: string | null;
  activeTab: TabKey;

  setActiveCycleId: (id: string) => void;
  setActiveVendorId: (id: string) => void;
  setActiveTab: (tab: TabKey) => void;
}

type TabKey =
  | 'overview'
  | 'scheduling'
  | 'scorecard'
  | 'alignment'
  | 'vendor-prep'
  | 'meeting'
  | 'actions';
```

#### `useApprovalStore`

```ts
interface ApprovalStore {
  pendingApproval: ApprovalItem | null;
  isApprovalOpen: boolean;

  openApproval: (item: ApprovalItem) => void;
  closeApproval: () => void;
  confirmApproval: (approvalId: string) => void;
  rejectApproval: (approvalId: string) => void;
}

interface ApprovalItem {
  id: string;
  type: 'INVITE' | 'SCORECARD_REQUEST' | 'VENDOR_BRIEF' | 'MINUTES' | 'REMINDER';
  summary: string;
  previewContent: string;  // rendered HTML or plain text
  recipients: string[];
  agentRunId: string;
}
```

#### `useUIStore`

```ts
interface UIStore {
  sidebarCollapsed: boolean;
  notificationsOpen: boolean;
  agentRunLogOpen: boolean;

  toggleSidebar: () => void;
  toggleNotifications: () => void;
  toggleAgentRunLog: () => void;
}
```

---

### 5.2 TanStack Query Hooks

Each module has a dedicated hooks file. Pattern example:

```ts
// src/hooks/useScheduling.ts

export function useAttendees(cycleId: string) {
  return useQuery({
    queryKey: ['scheduling', 'attendees', cycleId],
    queryFn: () => schedulingApi.getAttendees(cycleId),
    enabled: !!cycleId,
  });
}

export function useRankedSlots(cycleId: string) {
  return useQuery({
    queryKey: ['scheduling', 'slots', cycleId],
    queryFn: () => schedulingApi.getRankedSlots(cycleId),
    enabled: !!cycleId,
  });
}

export function useStartScheduling() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cycleId: string) => schedulingApi.start(cycleId),
    onSuccess: (_, cycleId) => {
      queryClient.invalidateQueries({ queryKey: ['cycle', cycleId] });
      queryClient.invalidateQueries({ queryKey: ['scheduling', cycleId] });
      toast.success('Attendee refresh triggered');
    },
    onError: () => toast.error('Failed to start scheduling'),
  });
}
```

### Query Key Convention

```
['cycle', cycleId]                       → single cycle detail
['cycles']                               → list all cycles
['scheduling', 'attendees', cycleId]     → attendees for a cycle
['scheduling', 'slots', cycleId]         → ranked slots
['scorecard', 'compiled', cycleId]       → compiled scorecard
['scorecard', 'status', cycleId]         → collection status
['alignment', 'changes', cycleId]        → score diffs
['alignment', 'flags', cycleId]          → divergence flags
['vendor-prep', 'brief', cycleId]        → vendor brief
['vendor-prep', 'pushback', cycleId]     → pushback items
['meeting', 'notes', cycleId]            → captured notes
['meeting', 'minutes', cycleId]          → generated minutes
['analytics', 'trends', vendorId]        → trend data
['analytics', 'recurring-issues']        → recurring alerts
['agent-runs', cycleId]                  → execution log
```

---

## 6. API Client Layer

### `src/api/client.ts`

```ts
import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

// Request interceptor — attach any session token if needed
client.interceptors.request.use((config) => {
  return config;
});

// Response interceptor — normalise errors
client.interceptors.response.use(
  (res) => res.data,
  (error) => {
    const message = error.response?.data?.detail ?? 'Unexpected error';
    return Promise.reject(new Error(message));
  }
);

export default client;
```

### Example API Module

```ts
// src/api/scheduling.api.ts
import client from './client';
import type { Attendee, SlotProposal, InviteDraft } from '@/types/scheduling.types';

export const schedulingApi = {
  start:            (cycleId: string)               => client.post(`/cycles/${cycleId}/scheduling/start`),
  simulateResponse: (cycleId: string)               => client.post(`/cycles/${cycleId}/scheduling/simulate-responses`),
  getAttendees:     (cycleId: string)               => client.get<Attendee[]>(`/cycles/${cycleId}/scheduling/attendees`),
  getRankedSlots:   (cycleId: string)               => client.get<SlotProposal[]>(`/cycles/${cycleId}/scheduling/slots`),
  approveSlot:      (cycleId: string, slotId: string) => client.post(`/cycles/${cycleId}/scheduling/approve-slot`, { slot_id: slotId }),
  getInviteDraft:   (cycleId: string)               => client.get<InviteDraft>(`/cycles/${cycleId}/scheduling/invite`),
  sendInvite:       (cycleId: string)               => client.post(`/cycles/${cycleId}/scheduling/send-invite`),
};
```

---

## 7. TypeScript Type System

### 7.1 Agent Types (`agent.types.ts`)

```ts
export type AgentStatus = 'success' | 'failed' | 'partial' | 'pending_approval';

export interface AgentResponse<T = unknown> {
  status: AgentStatus;
  agent: string;
  summary: string;
  data: T;
  warnings: string[];
  next_actions: string[];
  requires_approval: boolean;
  run_id: string;
}

export type WorkflowState =
  | 'CYCLE_CREATED'
  | 'ATTENDEE_REFRESH_SENT'
  | 'AVAILABILITY_COLLECTED'
  | 'MEETING_SCHEDULED'
  | 'SCORECARD_REQUEST_SENT'
  | 'SCORECARD_COLLECTION'
  | 'SCORECARD_COMPILED'
  | 'INTERNAL_ALIGNMENT'
  | 'VENDOR_PREP'
  | 'MEETING_IN_PROGRESS'
  | 'POST_MEETING_COMPLETE'
  | 'ARCHIVED';
```

### 7.2 Cycle Types (`cycle.types.ts`)

```ts
export interface Cycle {
  cycle_id: string;
  vendor_id: string;
  vendor_name: string;
  cycle_name: string;
  quarter: number;
  year: number;
  workflow_state: WorkflowState;
  created_at: string;
  updated_at: string;
}
```

### 7.3 Scheduling Types (`scheduling.types.ts`)

```ts
export type InviteStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';

export interface Attendee {
  id: string;
  stakeholder_id: string;
  name: string;
  email: string;
  role: string;
  is_key: boolean;
  is_confirmed: boolean;
  invite_status: InviteStatus;
  replacement_name?: string;
  replacement_email?: string;
}

export interface SlotProposal {
  slot_id: string;
  proposed_time: string;       // ISO datetime
  timezone: string;
  rank_score: number;
  organiser_available: boolean;
  exec_sponsor_available: boolean;
  attendee_availability: Record<string, boolean>;
  total_available: number;
  total_attendees: number;
  is_approved: boolean;
}

export interface InviteDraft {
  subject: string;
  body: string;
  recipients: string[];
  dial_in_details: string;
  scheduled_time: string;
}
```

### 7.4 Scorecard Types (`scorecard.types.ts`)

```ts
export type ScorecardCategory =
  | 'DELIVERY_QUALITY'
  | 'SLA_COMPLIANCE'
  | 'INNOVATION'
  | 'COMMUNICATION'
  | 'VALUE_FOR_MONEY';

export type ValidationFlag = 'OUT_OF_RANGE' | 'COMMENT_REQUIRED' | 'OUTLIER';

export interface ScorecardEntry {
  scorecard_id: string;
  stakeholder_id: string;
  stakeholder_name: string;
  category: ScorecardCategory;
  score: number;
  comment: string;
  is_valid: boolean;
  validation_flags: ValidationFlag[];
  submitted_at: string;
}

export interface CompiledScorecard {
  cycle_id: string;
  vendor_id: string;
  entries: ScorecardEntry[];
  averages: Record<ScorecardCategory, number>;
  overall_average: number;
  outlier_count: number;
  missing_count: number;
  compiled_at: string;
}

export interface SubmissionStatus {
  stakeholder_id: string;
  stakeholder_name: string;
  email: string;
  submitted: boolean;
  submitted_at?: string;
  reminder_count: number;
  last_reminder_at?: string;
}
```

### 7.5 Alignment Types (`alignment.types.ts`)

```ts
export interface ScoreChange {
  category: ScorecardCategory;
  previous_score: number;
  current_score: number;
  delta: number;
  is_significant: boolean;     // delta >= 1
}

export interface AlignmentFlag {
  category: ScorecardCategory;
  min_score: number;
  max_score: number;
  spread: number;
  prompt_question: string;
  stakeholders_involved: string[];
}

export interface ActionItem {
  action_id: string;
  cycle_id: string;
  source_module: 'ALIGNMENT' | 'VENDOR_PREP' | 'MEETING';
  description: string;
  owner: string;
  due_date?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  created_at: string;
}

export interface FaceOffPosition {
  id: string;
  position_number: number;
  shell_name: string;
  shell_role: string;
  vendor_name: string;
  vendor_role: string;
}
```

### 7.6 Vendor Prep Types (`vendorPrep.types.ts`)

```ts
export type PushbackCategory =
  | 'DATA_DISPUTE'
  | 'PROCESS_CONCERN'
  | 'RESOURCE_CONSTRAINT'
  | 'SCOPE_DISAGREEMENT'
  | 'OTHER';

export interface VendorBrief {
  overall_score: number;
  overall_trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  category_ratings: Array<{
    category: ScorecardCategory;
    score: number;
    rationale: string;
  }>;
  key_concerns: string[];
  positive_areas: string[];
  generated_at: string;
}

export interface PushbackItem {
  id: string;
  description: string;
  category: PushbackCategory;
  requires_legal_review: boolean;
  status: 'OPEN' | 'RESOLVED';
  responses?: PushbackResponse[];
}

export interface PushbackResponse {
  stance: 'FACTUAL' | 'NEUTRAL' | 'ESCALATION';
  content: string;
  is_selected: boolean;
}
```

### 7.7 Meeting Types (`meeting.types.ts`)

```ts
export type NoteType = 'QUESTION' | 'OBJECTION' | 'DECISION' | 'APPRECIATION' | 'ACTION';

export interface MeetingNote {
  note_id: string;
  note_type: NoteType;
  content: string;
  raised_by_role: string;
  timestamp: string;
  is_actioned: boolean;
}

export interface MeetingMinutes {
  meeting_id: string;
  generated_at: string;
  metadata: {
    date: string;
    attendees: string[];
    cycle_reference: string;
  };
  executive_summary: string;
  agenda_summaries: Array<{ topic: string; summary: string }>;
  key_decisions: string[];
  qa_log: MeetingNote[];
  action_items: ActionItem[];
  approved: boolean;
}
```

### 7.8 Analytics Types (`analytics.types.ts`)

```ts
export interface TrendDataPoint {
  cycle_name: string;
  quarter: number;
  year: number;
  scores: Record<ScorecardCategory, number>;
}

export interface RecurringIssue {
  issue_id: string;
  vendor_id: string;
  vendor_name: string;
  description: string;
  first_seen_cycle: string;
  occurrences: number;
  status: 'OPEN' | 'RESOLVED';
  last_owner: string;
}

export interface LeadershipBrief {
  vendor_name: string;
  trajectory: 'IMPROVING' | 'STABLE' | 'DECLINING';
  recurring_issues: RecurringIssue[];
  prior_commitments: string[];
  recommended_focus_areas: string[];
  generated_at: string;
}
```

---

## 8. Shared Component Library

### 8.1 `ApprovalPanel`

Displayed as a modal/drawer before every "send" action. Uses `useApprovalStore`.

**Props:**
```ts
interface ApprovalPanelProps {
  isOpen: boolean;
  type: ApprovalItem['type'];
  summary: string;
  previewContent: string;    // rendered markdown or plain text
  recipients: string[];
  onApprove: () => void;
  onEdit?: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}
```

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  [Icon]  Ready to Send: [type label]                │
│  ─────────────────────────────────────────────────  │
│  Summary: [summary text]                            │
│                                                     │
│  Preview:                                           │
│  ┌───────────────────────────────────────────────┐  │
│  │  [previewContent rendered in scrollable box]  │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  Recipients: [badge list]                           │
│                                                     │
│  [Cancel]          [Edit]          [Approve & Send] │
└─────────────────────────────────────────────────────┘
```

---

### 8.2 `WorkflowProgressBar`

**Props:**
```ts
interface WorkflowProgressBarProps {
  currentState: WorkflowState;
}
```

**Renders:** Horizontal step indicator with completed (✓), active (●), and locked states. Steps locked beyond current state are greyed out with a tooltip explaining what's needed to unlock.

---

### 8.3 `AgentStatusBadge`

```ts
interface AgentStatusBadgeProps {
  status: 'IDLE' | 'RUNNING' | 'AWAITING_APPROVAL' | 'COMPLETE' | 'FAILED';
  agentName?: string;
}
```

| Status | Colour | Icon |
|---|---|---|
| IDLE | grey | circle |
| RUNNING | blue (pulse animation) | spinner |
| AWAITING_APPROVAL | amber | clock |
| COMPLETE | green | check |
| FAILED | red | x-circle |

---

### 8.4 `ActionLog`

Shared table used in Modules C, D, E, and the Actions tab.

```ts
interface ActionLogProps {
  cycleId: string;
  sourceFilter?: 'ALIGNMENT' | 'VENDOR_PREP' | 'MEETING';  // optional — all shown if omitted
  readOnly?: boolean;
}
```

**Columns:** `#` · `Description` · `Owner` · `Due Date` · `Source` · `Status` · `Actions`

**Status badges:**
- `OPEN` → red
- `IN_PROGRESS` → amber
- `CLOSED` → green

---

### 8.5 `EmptyState`

```ts
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}
```

Used when a module has not been triggered yet.

---

### 8.6 `SectionHeader`

```ts
interface SectionHeaderProps {
  title: string;
  description?: string;
  agentStatus?: AgentStatusBadgeProps['status'];
  actions?: React.ReactNode;    // buttons on the right
}
```

---

### 8.7 `AgentRunLog`

Drawer component showing `agent_runs` table data. Used from Topbar.

**Columns:** `Agent` · `Triggered By` · `Status` · `Summary` · `Timestamp` · `View Details`

---

### 8.8 `NotificationsPanel`

Drawer showing all notifications for the active cycle. Grouped by type.

**Notification types rendered with distinct icons:**
- `SCORECARD_REQUEST` → mail icon
- `REMINDER_1/2/ESCALATION` → bell icon (escalating red shade)
- `INVITE` → calendar icon

---

## 9. Module A — Scheduling Components

### `AttendeeRefreshPanel`

**State:** fetches `useAttendees(cycleId)`  
**Actions:** Start Scheduling → `useStartScheduling()` mutation → opens `ApprovalPanel`

**Sub-sections:**
1. Current attendee list table (name, role, org, is_key badge, status)
2. "Simulate Responses" button (demo mode) → populates mock responses
3. Response summary: confirmed / unconfirmed / replaced

---

### `SlotRankingPanel`

**State:** fetches `useRankedSlots(cycleId)`  
**Renders:** 3 `SlotCard` components sorted by `rank_score`

#### `SlotCard`

```ts
interface SlotCardProps {
  slot: SlotProposal;
  rank: 1 | 2 | 3;
  onApprove: (slotId: string) => void;
  isApproving: boolean;
}
```

**Layout per card:**
```
┌────────────────────────────────────────┐
│  Rank #1  ████████████ Score: 94       │
│  Wed 14 May 2026 · 10:00 AM BST        │
│                                        │
│  ✓ Organiser available                 │
│  ✓ Exec Sponsor available              │
│  8 / 10 attendees available            │
│                                        │
│  Conflicts: [John Smith] [Maria K.]    │
│                                        │
│            [Approve This Slot]         │
└────────────────────────────────────────┘
```

---

### `InviteApprovalPanel`

Extends `ApprovalPanel`. Shows formatted invite preview (subject, body, dial-in, attendee list).

---

### `ConfirmationTracker`

Table with columns: `Name` · `Role` · `Email` · `Status` (ACCEPTED/DECLINED/PENDING badge) · `Last Updated`

Auto-refreshes every 10 seconds using TanStack Query `refetchInterval`.

---

## 10. Module B — Scorecard Components

### `ScorecardDispatchPanel`

Shows form recipients, categories, deadline. "Send Request" → `ApprovalPanel` → `useSendScorecardRequest()` mutation.

---

### `SubmissionTracker`

**Columns:** `Stakeholder` · `Role` · `Submitted` · `Valid` · `Reminders Sent` · `Last Reminder`  
**Expandable row:** shows `ReminderHistory` with timeline of all notifications sent.

#### `ReminderHistory`

```ts
interface ReminderHistoryProps {
  notifications: Notification[];
}
```

Renders a vertical timeline: info → deadline → escalation, each with timestamp and tone label.

---

### `ScorecardInputForm`

Used when simulating form submissions (demo mode). Five category rows, each with:
- Score slider (1–5) with `OutlierBadge` if flagged
- Comment textarea (required if score = 1 or 5)
- Validation error messages inline

---

### `CompiledScorecardTable`

**Rows:** one per stakeholder  
**Columns:** `Stakeholder` · `DELIVERY_QUALITY` · `SLA_COMPLIANCE` · `INNOVATION` · `COMMUNICATION` · `VALUE_FOR_MONEY` · `Average`  
**Footer row:** `Averages` in navy background  
**Outlier cells:** amber background + `OutlierBadge`  
**Missing cells:** light red background + "Not submitted" label

#### `OutlierBadge`

```ts
interface OutlierBadgeProps {
  score: number;
  groupAvg: number;
  deviation: number;
}
```

Renders: `⚠ Outlier (+1.8σ)` in amber

---

## 11. Module C — Alignment Components

### `ChangeHighlightsPanel`

Renders change list from `useAlignmentChanges(cycleId)`.

**Per item:**
- Category label
- Delta indicator: `3 → 4 (+1)` in green · `4 → 2 (−2)` in red
- "New issue" badge if not present in prior cycle

---

### `AlignmentFlagsPanel`

**Per flag:**
```
┌────────────────────────────────────────────────────┐
│  ⚑ Delivery Quality                                │
│  Spread: 2.5 pts  (Technical: 2 · Commercial: 4.5)│
│                                                    │
│  Prompt: "Technical and Commercial leads differ by │
│  2.5 points on Delivery Quality — resolve before   │
│  vendor call."                                     │
│                                                    │
│  [Mark Resolved]                                   │
└────────────────────────────────────────────────────┘
```

---

### `FaceOffModelEditor`

**Layout:** Grid of numbered position cards (Shell side | Vendor side)

Each card:
- Position number badge
- Shell name + role (editable on click)
- Vendor name + role (editable on click)
- Save inline on blur

On save → `PATCH /api/cycles/{id}/face-off` mutation

---

### `NotesInputPanel`

**Sections:**
1. Large `<textarea>` with placeholder "Paste internal alignment call notes here…"
2. "Extract Actions" button → `useExtractActions()` mutation → shows `ExtractedActionsPreview`

#### `ExtractedActionsPreview`

Displays Claude-extracted actions before they are saved. User can edit owner/due-date per row before confirming. "Confirm & Save" → `POST /api/cycles/{id}/alignment/extract-actions`

---

## 12. Module D — Vendor Prep Components

### `VendorBriefPanel`

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│  Overall Score: 3.6/5   Trend: ▲ IMPROVING           │
│  ─────────────────────────────────────────────────── │
│  Category Ratings                                    │
│  Delivery Quality:  4/5  "Consistent delivery..."    │
│  SLA Compliance:    3/5  "Met in 4 of 5 months..."   │
│  ...                                                 │
│  ─────────────────────────────────────────────────── │
│  Key Concerns                                        │
│  • Communication lag on escalation tickets           │
│  ─────────────────────────────────────────────────── │
│  Positive Areas                                      │
│  • Innovation score improved significantly           │
│  ─────────────────────────────────────────────────── │
│  [Regenerate]                          [Approve Brief]│
└──────────────────────────────────────────────────────┘
```

---

### `PushbackInput`

**Form fields:**
- `description`: textarea
- `category`: Select dropdown (`DATA_DISPUTE` / `PROCESS_CONCERN` / `RESOURCE_CONSTRAINT` / `SCOPE_DISAGREEMENT` / `OTHER`)

On submit → `useAddPushback()` mutation → triggers response draft generation.

---

### `PushbackResponseCards`

Renders three cards per pushback item: FACTUAL · NEUTRAL · ESCALATION

**Per card:**
```
┌────────────────────────────────────────┐
│  [Factual Stance]                      │
│  "Our data shows SLA was met in 14 of │
│  16 months per contract clause 4.2..." │
│                                        │
│  [Select]  [Edit]                      │
└────────────────────────────────────────┘
```

Items flagged for legal review show a red banner instead of response cards: "Requires Legal Review — not included in AI drafts"

---

### `UnresolvedItemTracker`

**Columns:** `#` · `Description` · `Category` · `Raised By` · `Date` · `Status` · `Action`

`PushbackCategoryBadge` shows colour-coded category label per item.

---

## 13. Module E — Meeting Components

### `MeetingBriefingCard`

Pre-meeting summary card. Auto-generated from Module F analytics engine.

**Sections:**
- Score movement (last 3 cycles, mini line chart per category)
- Most improved area
- Most concerning area
- Predicted challenge areas (based on recurring issues)

---

### `LiveCapturePanel`

**Top bar:** Note type selector (segmented control):
`QUESTION` | `OBJECTION` | `DECISION` | `APPRECIATION` | `ACTION`

**Input:** `<textarea>` + "Raised by" input (role/name) + "Add Note" button

**Feed below:** scrollable list of `CaptureNoteItem` in reverse-chronological order.

#### `CaptureNoteItem`

```ts
interface CaptureNoteItemProps {
  note: MeetingNote;
  onDelete: (noteId: string) => void;
}
```

Renders: `[NoteTypeBadge]` · timestamp · raised_by · content · delete button

#### `NoteTypeBadge`

| Type | Colour |
|---|---|
| QUESTION | blue |
| OBJECTION | red |
| DECISION | green |
| APPRECIATION | teal |
| ACTION | amber |

---

### `TranscriptInput`

Alternate mode. Large `<textarea>` + "Parse Transcript" button → `useParsTranscript()` mutation → populates `LiveCapturePanel` feed with parsed items. User reviews before confirming.

---

### `MeetingMinutesViewer`

Structured read-only view of generated minutes with sections:

1. Metadata box (date, attendees, cycle reference)
2. Executive Summary paragraph
3. Agenda Summaries accordion
4. Key Decisions numbered list
5. Q&A / Objection Log table
6. Action Items (links to `ActionLog`)

**Actions:** `[Copy to Clipboard]` · `[Approve Minutes]` · `[Regenerate]`

---

## 14. Module F — Analytics Components

### `VendorSelector`

Dropdown (or segmented control for ≤ 3 vendors). Controls active vendor for all charts.

---

### `TrendLineChart`

```ts
interface TrendLineChartProps {
  vendorId: string;
  data: TrendDataPoint[];
}
```

Recharts `LineChart` with:
- X axis: cycle labels (`Q1 2025`, `Q2 2025`, …)
- Y axis: score (1–5)
- One coloured line per category (5 lines)
- Tooltip showing all scores on hover
- Legend below chart

---

### `RadarChart`

```ts
interface RadarChartProps {
  currentCycleData: Record<ScorecardCategory, number>;
  previousCycleData: Record<ScorecardCategory, number>;
}
```

Recharts `RadarChart` with two datasets (current = solid fill, previous = dashed outline).

---

### `CrossVendorBarChart`

```ts
interface CrossVendorBarChartProps {
  cycleId: string;
  data: Array<{ vendor: string; scores: Record<ScorecardCategory, number> }>;
}
```

Grouped `BarChart` — one group of bars per category, one bar per vendor.

---

### `RecurringIssueAlerts`

**Per alert card:**
```
┌─────────────────────────────────────────────────────┐
│  🔴 RECURRING ISSUE — CoreSystems Ltd               │
│  Delivery Quality consistently below SLA threshold  │
│                                                     │
│  First flagged: Q2 2025  |  Occurrences: 3          │
│  Last owner: Marcus Chen                            │
│                                                     │
│  [View History]  [Mark Resolved]                    │
└─────────────────────────────────────────────────────┘
```

---

### `LeadershipBriefCard`

**States:**
1. Not generated → shows "Generate Brief" button
2. Loading → skeleton placeholder
3. Generated → 4-section card

**Sections:**
1. **Vendor Trajectory** — badge (IMPROVING / STABLE / DECLINING) + trend summary sentence
2. **Unresolved Recurring Issues** — bullet list
3. **Prior Commitments Requiring Follow-up** — bullet list
4. **Recommended Focus Areas** — numbered list

---

## 15. Page Designs

### `Dashboard.tsx`

```
┌─────────────────────────────────────────────────────────────┐
│  SIDEBAR          │  MAIN CONTENT                           │
│                   │                                         │
│  ▸ Dashboard      │  ┌────────────────────────────────────┐ │
│  ▸ Analytics      │  │  Active Governance Cycles          │ │
│  ─────────────    │  │  [+ Start New Cycle]               │ │
│  Vendors:         │  │                                    │ │
│  • NovaTech       │  │  [CycleCard] [CycleCard] [...]     │ │
│  • CoreSystems    │  └────────────────────────────────────┘ │
│  • Meridian IT    │                                         │
│                   │  ┌────────────────────────────────────┐ │
│                   │  │  Recent Agent Runs                 │ │
│                   │  │  [AgentRunLog table preview]       │ │
│                   │  └────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### `CycleCard`

```ts
interface CycleCardProps {
  cycle: Cycle;
  onClick: () => void;
}
```

Shows: vendor name · cycle name (Q2 2026) · workflow state badge · days since updated.

---

### `CycleDetail.tsx`

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back  |  CoreSystems Ltd — Q2 2026  |  [Agent Runs]     │
│  WorkflowProgressBar (full width)                           │
│  ─────────────────────────────────────────────────────────  │
│  Tabs: Overview | Scheduling | Scorecard | Alignment |      │
│        Vendor Prep | Meeting | Actions                      │
│  ─────────────────────────────────────────────────────────  │
│  [Active tab content]                                       │
└─────────────────────────────────────────────────────────────┘
```

Tab switching updates URL query param: `/cycles/xyz?tab=scorecard`

Locked tabs (beyond current workflow state) render with a lock icon and tooltip.

---

### `Analytics.tsx`

```
┌─────────────────────────────────────────────────────────────┐
│  Analytics Dashboard          [VendorSelector]              │
│  ─────────────────────────────────────────────────────────  │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  TrendLineChart      │  │  RadarChart                  │ │
│  │  (per category)      │  │  (current vs previous)       │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  CrossVendorBarChart (current cycle comparison)      │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  RecurringIssueAlerts│  │  LeadershipBriefCard         │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 16. Form Handling Strategy

All forms use **React Hook Form + Zod**. Pattern:

```ts
// Zod schema
const scorecardSchema = z.object({
  delivery_quality: z.number().min(1).max(5),
  delivery_quality_comment: z.string().optional().superRefine((val, ctx) => {
    const score = ctx.path; // access sibling field via refine
    // comment required if score = 1 or 5
  }),
  // ... other categories
});

// Component
const form = useForm<z.infer<typeof scorecardSchema>>({
  resolver: zodResolver(scorecardSchema),
  defaultValues: { delivery_quality: 3 },
});
```

### Validation Feedback

- Errors shown inline below each field immediately on blur
- Submission blocked until all errors resolved
- Server-side validation errors mapped back to form fields via `form.setError()`

---

## 17. Error Handling & Loading States

### Loading States

Every data-dependent section uses `Skeleton` while `isLoading`:
```tsx
if (isLoading) return <Skeleton className="h-48 w-full" />;
```

### Error States

TanStack Query `isError` shows `EmptyState` with error message and retry button.

### Mutation Errors

Handled in `onError` callbacks — toast notification with the error message from the API interceptor.

### LLM Failures

If an agent call fails (status = `failed`):
- Show `AgentStatusBadge` as FAILED
- Display the `error_message` from `agent_runs` record
- Show "Retry" button which re-triggers the same mutation

### Global Error Boundary

`ErrorBoundary` wraps `App.tsx`. Catches uncaught render errors and shows a fallback screen with a "Reload" button.

---

## 18. Tailwind Design System

### Colour Tokens

```ts
// tailwind.config.ts
extend: {
  colors: {
    brand: {
      navy:       '#002D5C',
      blue:       '#0063B1',
      teal:       '#007A87',
      gold:       '#C99A06',
    },
    status: {
      open:       '#DC2626',   // red-600
      inProgress: '#D97706',   // amber-600
      closed:     '#16A34A',   // green-600
    },
    surface: {
      base:       '#FFFFFF',
      muted:      '#F4F6F9',
      border:     '#E2E8F0',
    },
  }
}
```

### Typography Scale

| Use | Class |
|---|---|
| Page title | `text-2xl font-bold text-brand-navy` |
| Section heading | `text-lg font-semibold text-brand-navy` |
| Sub-heading | `text-base font-medium text-brand-teal` |
| Body | `text-sm text-slate-700` |
| Caption / label | `text-xs text-slate-500` |
| Code | `font-mono text-xs text-brand-blue` |

### Spacing Convention

All spacing uses Tailwind's default scale. No arbitrary values unless unavoidable.

### Component Variants (CVA)

```ts
// Example: badge variants
const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      navy:   'bg-brand-navy text-white',
      blue:   'bg-blue-100 text-blue-800',
      green:  'bg-green-100 text-green-800',
      amber:  'bg-amber-100 text-amber-800',
      red:    'bg-red-100 text-red-800',
      grey:   'bg-slate-100 text-slate-600',
    },
  },
  defaultVariants: { variant: 'grey' },
});
```

---

## 19. Environment & Build Configuration

### `.env.example`

```env
VITE_API_URL=http://localhost:8000/api
```

### `vite.config.ts`

```ts
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
});
```

### `tsconfig.json` — Path Aliases

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

### Build Output

```
dist/
├── index.html
├── assets/
│   ├── index.[hash].js
│   └── index.[hash].css
```

Deploy target: **Vercel** (zero-config for Vite projects)

---

## 20. Component Interaction Diagrams

### Approval Flow

```
User clicks "Send Scorecard Request"
    → ScorecardDispatchPanel
    → useSendScorecardRequest() mutation called (pending approval)
    → useApprovalStore.openApproval({ type: 'SCORECARD_REQUEST', ... })
    → ApprovalPanel modal opens
    → User clicks "Approve & Send"
    → useApprovalStore.confirmApproval()
    → API mutation executes POST /api/cycles/{id}/scorecard/send-request
    → queryClient.invalidateQueries(['scorecard', 'status', cycleId])
    → SubmissionTracker re-renders with new status
    → Toast: "Scorecard request sent to 8 stakeholders"
    → ApprovalPanel closes
```

### Agent Run → UI Update

```
User clicks "Generate Vendor Brief"
    → VendorBriefPanel → useGenerateBrief() mutation
    → AgentStatusBadge → RUNNING
    → POST /api/cycles/{id}/vendor-prep/generate-brief
    → Backend: Claude API tool-calling (5–10 seconds)
    → Response: AgentResponse { status: 'pending_approval', data: VendorBrief }
    → AgentStatusBadge → AWAITING_APPROVAL
    → useApprovalStore.openApproval({ type: 'VENDOR_BRIEF', ... })
    → ApprovalPanel opens with brief preview
    → User approves → brief saved → AgentStatusBadge → COMPLETE
```

### Workflow State Unlock

```
WorkflowProgressBar
    → reads cycle.workflow_state
    → CycleWorkspaceTabs receives allowedTabs computed from state
    → Tabs beyond current state:
        - rendered with opacity-50 + cursor-not-allowed
        - onClick shows Tooltip: "Complete Scorecard Collection to unlock"
    → No hard redirect — user can still view locked tabs in read-only mode
```

---

*VendorPulse Frontend LLD v1.0 — Zensar Technologies — 2026-04-01*
