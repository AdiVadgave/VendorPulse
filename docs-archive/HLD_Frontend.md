# VendorPulse — Frontend High-Level Design (HLD)

> **Version:** 1.0 | **Stack:** React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui
> **Scope:** High-level architecture overview of the VendorPulse frontend

---

## 1. Overview

VendorPulse is a vendor governance platform that guides procurement teams through a structured quarterly review cycle. The frontend is a single-page application (SPA) that provides an interactive workspace for coordinating scheduling, scorecards, alignment, vendor prep, meetings, and analytics across six AI-assisted modules.

---

## 2. System Context

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (SPA)                           │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │               React Application                     │   │
│   │                                                     │   │
│   │   Pages ──► Modules (A–F) ──► Shared Components    │   │
│   │      │           │                   │             │   │
│   │   Zustand    TanStack Query       shadcn/ui         │   │
│   │   (UI state) (Server cache)       (Primitives)      │   │
│   │                  │                                  │   │
│   │           Axios API Client                          │   │
│   └──────────────────┼──────────────────────────────────┘   │
└──────────────────────┼──────────────────────────────────────┘
                       │ REST / HTTP
          ┌────────────▼────────────┐
          │   FastAPI Backend       │
          │   (localhost:8000)      │
          └─────────────────────────┘
```

---

## 3. Application Architecture

### 3.1 Layer Breakdown

| Layer | Technology | Responsibility |
|---|---|---|
| **Routing** | React Router v6 | SPA navigation, tab-based workspace |
| **Pages** | React components | Dashboard, Cycle Detail, Analytics |
| **Modules** | Feature components | One per governance workflow stage (A–F) |
| **Shared Components** | Custom + shadcn/ui | Agent status, approval panel, notifications |
| **Server State** | TanStack Query v5 | API data caching, background refetch, mutations |
| **UI State** | Zustand v4 | Active cycle, modal open/close, sidebar, approvals |
| **API Client** | Axios v1 | Typed HTTP calls with interceptors |
| **Forms** | react-hook-form + Zod | Validated form inputs across all modules |
| **Charts** | Recharts v2 | Trend lines, radar charts, bar charts (Module F) |
| **Styling** | Tailwind CSS v3 | Utility-first design system |

### 3.2 Data Flow

```
User Interaction
    │
    ▼
Component (React Hook Form / button handler)
    │
    ├──► Zustand Action (local UI state update)
    │
    └──► TanStack Query Mutation
              │
              ▼
         Axios API Call
              │
              ▼
         FastAPI Backend
              │
              ▼
    TanStack Query Cache Update
              │
              ▼
    Component Re-render + Toast Notification
```

---

## 4. Routing Design

```
/                          →  Dashboard (all vendors + active cycles)
/cycles/:cycleId           →  Cycle Detail Workspace
  ?tab=scheduling          →  Module A
  ?tab=scorecard           →  Module B
  ?tab=alignment           →  Module C
  ?tab=vendor-prep         →  Module D
  ?tab=meeting             →  Module E
  ?tab=actions             →  Action Items view
/analytics                 →  Module F (cross-cycle analytics)
  ?vendor=                 →  Filter by vendor
  ?cycle=                  →  Filter by cycle
```

**Navigation Guards:**
- Unknown `cycleId` → redirect to `/` with error toast
- Tabs locked to `workflow_state` — tabs beyond the current state show a locked indicator (not a hard redirect)

---

## 5. State Management Strategy

### Two-Store System

```
┌─────────────────────────────────────────────────────┐
│                   State Layer                       │
│                                                     │
│  ┌──────────────────────┐  ┌─────────────────────┐  │
│  │    TanStack Query    │  │       Zustand        │  │
│  │   (Server State)     │  │    (UI State)        │  │
│  │                      │  │                      │  │
│  │  • Cycles            │  │  • activeCycleId     │  │
│  │  • Scorecards        │  │  • activeTab         │  │
│  │  • Slot proposals    │  │  • pendingApproval   │  │
│  │  • Meeting notes     │  │  • sidebarCollapsed  │  │
│  │  • Agent run logs    │  │  • notificationsOpen │  │
│  │  • Analytics data    │  │  • agentRunLogOpen   │  │
│  └──────────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

| Store | Purpose |
|---|---|
| `useCycleStore` | Active cycle/vendor selection, current tab |
| `useApprovalStore` | Pending approval queue for AI-generated actions |
| `useUIStore` | Sidebar, notification panel, agent run log visibility |

---

## 6. Module Overview (A–F)

Each module maps to one stage of the vendor governance workflow. The frontend provides components for viewing AI agent output and triggering agent actions.

```
Workflow State Machine (Frontend reflects each step):

CYCLE_CREATED
    │
    ▼
[Module A] ATTENDEE_REFRESH_SENT → AVAILABILITY_COLLECTED → MEETING_SCHEDULED
    │
    ▼
[Module B] SCORECARD_REQUEST_SENT → SCORECARD_COLLECTION → SCORECARD_COMPILED
    │
    ▼
[Module C] INTERNAL_ALIGNMENT
    │
    ▼
[Module D] VENDOR_PREP
    │
    ▼
[Module E] MEETING_IN_PROGRESS → POST_MEETING_COMPLETE
    │
    ▼
[Module F] ARCHIVED → Analytics (cross-cycle)
```

### Module A — Scheduling

**Purpose:** Coordinate attendee availability and select a meeting slot.

| Component | Role |
|---|---|
| `AttendeeRefreshPanel` | Displays attendee list; triggers AI attendee refresh email |
| `SlotRankingPanel` | Shows ranked time slots computed by the Scheduling Agent |
| `SlotCard` | Individual slot with availability breakdown |
| `InviteApprovalPanel` | Human-in-the-loop: approve calendar invite before sending |
| `ConfirmationTracker` | Tracks RSVP status per stakeholder |

**AI Integration:** Scheduling Agent proposes top 3 slots; coordinator approves one before invite is sent.

---

### Module B — Scorecard

**Purpose:** Dispatch scorecard forms, collect scores, compile results.

| Component | Role |
|---|---|
| `ScorecardDispatchPanel` | Triggers AI-generated scorecard request emails |
| `SubmissionTracker` | Live view of who has/hasn't submitted |
| `ScorecardInputForm` | Manual score entry (5 categories, 1–5 scale) |
| `CompiledScorecardTable` | Aggregated results with per-category averages |
| `OutlierBadge` | Flags statistically anomalous scores |
| `ReminderHistory` | Log of escalating reminder emails sent |

**AI Integration:** Scorecard Agent generates personalised request emails, sends reminders, and flags outliers.

---

### Module C — Alignment

**Purpose:** Internal alignment before the EGB QBR — highlight score changes, resolve disagreements.

| Component | Role |
|---|---|
| `ChangeHighlightsPanel` | Score deltas vs. previous cycle (significant changes highlighted) |
| `AlignmentFlagsPanel` | Categories with high spread across stakeholders |
| `FaceOffModelEditor` | Edit the Shell ↔ Vendor attendee match-up table |
| `NotesInputPanel` | Paste raw alignment meeting notes |
| `ExtractedActionsPreview` | AI-extracted action items from pasted notes |

**AI Integration:** Alignment Agent generates alignment document; Meeting Agent parses notes into structured action items.

---

### Module D — Vendor Prep

**Purpose:** Prepare vendor for the QBR — share scores, handle pushback.

| Component | Role |
|---|---|
| `VendorBriefPanel` | AI-generated vendor brief (scores, trends, key concerns) |
| `PushbackInput` | Log a vendor pushback item with category |
| `PushbackResponseCards` | AI-generated response options (FACTUAL / NEUTRAL / ESCALATION) |
| `UnresolvedItemTracker` | Open items still requiring resolution |
| `PushbackCategoryBadge` | Visual label for pushback type |

**AI Integration:** Vendor Prep Agent generates the brief and crafts tailored pushback responses.

---

### Module E — Meeting

**Purpose:** Run the EGB QBR — capture live notes, generate meeting minutes.

| Component | Role |
|---|---|
| `MeetingBriefingCard` | Pre-meeting summary for the facilitator |
| `LiveCapturePanel` | Real-time note capture during the meeting |
| `CaptureNoteItem` | Individual note with type (QUESTION / OBJECTION / DECISION / ACTION) |
| `TranscriptInput` | Paste full transcript for AI parsing |
| `MeetingMinutesViewer` | Structured minutes with executive summary and action items |
| `NoteTypeBadge` | Visual label for note classification |

**AI Integration:** Meeting Agent parses transcripts, classifies notes, generates minutes, and extracts action items.

---

### Module F — Analytics

**Purpose:** Cross-cycle trend analysis and leadership briefing generation.

| Component | Role |
|---|---|
| `TrendLineChart` | Score trends over time per category |
| `RadarChart` | Vendor performance across all 5 categories |
| `CrossVendorBarChart` | Compare multiple vendors side-by-side |
| `RecurringIssueAlerts` | Issues appearing in 2+ consecutive cycles |
| `LeadershipBriefCard` | AI-generated executive summary |
| `VendorSelector` | Filter analytics by vendor |

**AI Integration:** Memory Agent (Module F) identifies recurring issues and generates leadership briefings.

---

## 7. Shared Component Library

Components reused across all modules:

| Component | Purpose |
|---|---|
| `AgentStatusBadge` | Shows agent run status (PENDING / SUCCESS / FAILED / PARTIAL) |
| `ApprovalPanel` | Human-in-the-loop approval modal before sending AI actions |
| `WorkflowProgressBar` | Visual progress through the 12-state workflow |
| `AgentRunLog` | Collapsible log of all agent executions with input/output |
| `NotificationsPanel` | Slide-in panel for recent system notifications |
| `ActionLog` | Audit trail of all actions taken in a cycle |
| `ErrorBoundary` | Catches and displays component-level errors gracefully |
| `LoadingSpinner` | Consistent loading indicator |
| `EmptyState` | Placeholder when no data is available |
| `ConfirmDialog` | Confirmation modal for destructive actions |

---

## 8. API Client Architecture

```
src/api/
├── client.ts              # Axios instance with base URL + error interceptors
├── cycles.api.ts          # Cycle CRUD operations
├── scheduling.api.ts      # Module A endpoints
├── scorecard.api.ts       # Module B endpoints
├── alignment.api.ts       # Module C endpoints
├── vendorPrep.api.ts      # Module D endpoints
├── meeting.api.ts         # Module E endpoints
└── analytics.api.ts       # Module F endpoints
```

All API functions are **typed** against TypeScript interfaces in `src/types/`. All mutations flow through TanStack Query, enabling automatic cache invalidation and optimistic updates.

---

## 9. Form Handling Strategy

All user input forms use:
- **react-hook-form** — no-rerender form state
- **Zod schemas** — runtime validation with descriptive error messages
- **@hookform/resolvers** — connects Zod to react-hook-form

Key forms: Score input (Module B), pushback entry (Module D), live note capture (Module E), alignment notes paste (Module C).

---

## 10. Key Design Decisions

| Decision | Rationale |
|---|---|
| TanStack Query for server state | Eliminates manual loading/error state management; handles background sync |
| Zustand for UI state | Lightweight; avoids Redux boilerplate for simple modal/panel state |
| shadcn/ui primitives | Accessible, unstyled base components that compose well with Tailwind |
| Human-in-the-loop approval modal | All AI-generated communications require coordinator sign-off before sending |
| Tab-locked workflow | Tabs beyond current `workflow_state` are visible but locked, aiding orientation |
| Recharts for analytics | React-native, composable chart components without heavy dependencies |

---

## 11. Error Handling & Loading States

| Scenario | Handling |
|---|---|
| API error (4xx/5xx) | Axios interceptor catches → toast error notification via `sonner` |
| Agent run failure | `AgentStatusBadge` shows FAILED state; error message shown in `AgentRunLog` |
| Component crash | `ErrorBoundary` wraps all module panels |
| Pending API call | Skeleton loaders or `LoadingSpinner` per section |
| Workflow violation | Toast error: "This action requires the cycle to be in state X" |

---

## 12. Build & Environment

| Concern | Approach |
|---|---|
| Build tool | Vite 5 — fast HMR in dev, optimised ESM bundles in prod |
| API base URL | `VITE_API_BASE_URL` env variable (defaults to `http://localhost:8000`) |
| TypeScript | Strict mode enabled |
| Styling | Tailwind v3 with custom design tokens in `tailwind.config.ts` |
| Linting | ESLint + Prettier for consistent code style |
