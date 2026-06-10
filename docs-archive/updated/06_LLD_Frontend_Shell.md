# VendorPulse for Shell — Frontend Low-Level Design (LLD)

> **Version:** 2.0 (Shell) | **Stack:** React 19 + Vite 8 + TypeScript 5 + Tailwind v4 + shadcn/ui
> **Scope:** Implementation-level frontend design for Shell production deployment
> **Supersedes:** `docs/LLD_Frontend.md` (POC v1.0)

---

## Table of Contents

1. [Dependencies (Locked Versions)](#1-dependencies-locked-versions)
2. [Folder Structure](#2-folder-structure)
3. [Application Bootstrap & Providers](#3-application-bootstrap--providers)
4. [Routing](#4-routing)
5. [API Client](#5-api-client)
6. [Authentication Handling](#6-authentication-handling)
7. [TypeScript Types](#7-typescript-types)
8. [State Stores](#8-state-stores)
9. [TanStack Query Hooks](#9-tanstack-query-hooks)
10. [Shared Components](#10-shared-components)
11. [Module Components (A–F)](#11-module-components-af)
12. [In-App Scorecard Form](#12-in-app-scorecard-form)
13. [Admin Page](#13-admin-page)
14. [Form Handling Patterns](#14-form-handling-patterns)
15. [Accessibility](#15-accessibility)
16. [Tailwind v4 Design Tokens (Shell)](#16-tailwind-v4-design-tokens-shell)
17. [Testing Strategy](#17-testing-strategy)
18. [Build & Deployment](#18-build--deployment)

---

## 1. Dependencies (Locked Versions)

### Runtime

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | 19.2.x | UI rendering |
| `react-dom` | 19.2.x | DOM binding |
| `react-router-dom` | 7.x | Routing |
| `@tanstack/react-query` | 5.x | Server state |
| `zustand` | 5.x | UI state |
| `axios` | 1.x | HTTP client |
| `react-hook-form` | 7.x | Form state |
| `zod` | 3.x | Validation |
| `@hookform/resolvers` | latest | Zod adapter |
| `recharts` | 3.x | Charts |
| `lucide-react` | 1.x | Icons |
| `date-fns` | 4.x | Dates |
| `clsx` | 2.x | Class merging |
| `tailwind-merge` | 3.x | Tailwind conflict resolution |
| `tailwindcss` | 4.x | Styling |
| `@tailwindcss/vite` | 4.x | Build integration |
| `sonner` | latest | Toast |
| `@microsoft/applicationinsights-react-js` | latest | App Insights frontend telemetry |
| `dompurify` | latest | Sanitise any HTML rendered from server (minutes preview) |

### Dev

| Package | Version | Purpose |
|---------|---------|---------|
| `vite` | 8.x | Build / dev |
| `@vitejs/plugin-react` | 6.x | React plugin |
| `typescript` | 5.x | Types |
| `eslint` | 9.x | Lint |
| `eslint-plugin-jsx-a11y` | latest | Accessibility |
| `typescript-eslint` | latest | TS rules |
| `vitest` | latest | Unit tests |
| `@testing-library/react` | latest | RTL |
| `@testing-library/user-event` | latest | User interactions |
| `playwright` | latest | E2E |
| `msw` | latest | Mock service worker for component tests |

**Removed from POC:** any Google-related packages (`gapi-script`, `google-auth-library`, etc.). None should appear in `package.json` for Shell production.

---

## 2. Folder Structure

```
frontend/
├── src/
│   ├── main.tsx                      # entry: providers + router
│   ├── App.tsx                       # root layout + error boundary
│   │
│   ├── api/
│   │   ├── client.ts                 # axios instance, interceptors
│   │   ├── auth.api.ts
│   │   ├── cycles.api.ts
│   │   ├── scheduling.api.ts
│   │   ├── scorecard.api.ts
│   │   ├── alignment.api.ts
│   │   ├── vendorPrep.api.ts
│   │   ├── meeting.api.ts
│   │   ├── analytics.api.ts
│   │   └── admin.api.ts
│   │
│   ├── components/
│   │   ├── ui/                       # shadcn/ui primitives
│   │   ├── shared/                   # Cross-module components
│   │   │   ├── ApprovalPanel.tsx
│   │   │   ├── ActionLog.tsx
│   │   │   ├── AgentStatusBadge.tsx
│   │   │   ├── WorkflowProgressBar.tsx
│   │   │   ├── AgentRunLog.tsx
│   │   │   ├── ExternalCallLog.tsx
│   │   │   ├── NotificationsPanel.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── LoadingSpinner.tsx
│   │   │   ├── SectionHeader.tsx
│   │   │   ├── ConfirmDialog.tsx
│   │   │   ├── RoleGuard.tsx
│   │   │   ├── WorkflowStateGuard.tsx
│   │   │   └── SecuredImage.tsx
│   │   ├── layout/
│   │   │   ├── AppShell.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Topbar.tsx
│   │   │   └── CycleWorkspaceTabs.tsx
│   │   └── modules/
│   │       ├── scheduling/...
│   │       ├── scorecard/
│   │       │   ├── ScorecardDispatchPanel.tsx
│   │       │   ├── SubmissionTracker.tsx
│   │       │   ├── CompiledScorecardTable.tsx
│   │       │   ├── OutlierBadge.tsx
│   │       │   └── ReminderHistory.tsx
│   │       ├── alignment/...
│   │       ├── vendor-prep/...
│   │       ├── meeting/...
│   │       └── analytics/...
│   │
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── CycleDetail.tsx
│   │   ├── Analytics.tsx
│   │   ├── Admin.tsx                 # New
│   │   ├── ScorecardForm.tsx         # New — public stakeholder form route
│   │   ├── LoginError.tsx
│   │   └── NotFound.tsx
│   │
│   ├── hooks/                        # TanStack Query hooks
│   │   ├── useAuth.ts
│   │   ├── useCycles.ts
│   │   ├── useScheduling.ts
│   │   ├── useScorecard.ts
│   │   ├── useAlignment.ts
│   │   ├── useVendorPrep.ts
│   │   ├── useMeeting.ts
│   │   ├── useAnalytics.ts
│   │   └── useAdmin.ts
│   │
│   ├── store/
│   │   ├── useCycleStore.ts
│   │   ├── useApprovalStore.ts
│   │   ├── useAuthStore.ts
│   │   └── useUIStore.ts
│   │
│   ├── types/
│   │   ├── auth.types.ts
│   │   ├── cycle.types.ts
│   │   ├── scheduling.types.ts
│   │   ├── scorecard.types.ts
│   │   ├── alignment.types.ts
│   │   ├── vendorPrep.types.ts
│   │   ├── meeting.types.ts
│   │   ├── analytics.types.ts
│   │   ├── agent.types.ts
│   │   └── admin.types.ts
│   │
│   ├── utils/
│   │   ├── cn.ts
│   │   ├── formatDate.ts
│   │   ├── formatScore.ts
│   │   └── constants.ts
│   │
│   ├── styles/
│   │   └── globals.css               # Tailwind + Shell tokens
│   │
│   └── telemetry/
│       └── appInsights.ts            # AI initialization
│
├── tests/
│   ├── unit/                         # Vitest component tests
│   └── e2e/                          # Playwright
│
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── package-lock.json
```

---

## 3. Application Bootstrap & Providers

```tsx
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { App } from "./App";
import { initAppInsights } from "./telemetry/appInsights";
import "./styles/globals.css";

initAppInsights();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error: unknown) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status && status < 500) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: true,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename="/app">
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster richColors closeButton position="top-right" />
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
```

---

## 4. Routing

```tsx
// src/App.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";

export function App() {
  return (
    <Routes>
      {/* Public stakeholder scorecard form — NO AppShell, NO auth required */}
      <Route path="/scorecard/:linkToken" element={<ScorecardForm />} />
      <Route path="/login-error" element={<LoginError />} />

      {/* Authenticated app */}
      <Route element={<AuthGuard><AppShell /></AuthGuard>}>
        <Route index element={<Dashboard />} />
        <Route path="cycles/:cycleId" element={<CycleDetail />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="admin" element={<RoleGuard role="vmo_admin"><Admin /></RoleGuard>} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
```

```tsx
// src/components/shared/AuthGuard.tsx
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError } = useCurrentUser();
  if (isLoading) return <LoadingSpinner />;
  if (isError) {
    window.location.href = "/api/v1/auth/login";
    return null;
  }
  return <>{children}</>;
}
```

---

## 5. API Client

```ts
// src/api/client.ts
import axios from "axios";

const client = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,                // send session cookie
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

client.interceptors.response.use(
  (res) => res.data,
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = "/api/v1/auth/login";
      return Promise.reject(error);
    }
    const detail = error.response?.data?.detail ?? "Unexpected error";
    const code = error.response?.data?.code ?? "UNKNOWN";
    return Promise.reject(Object.assign(new Error(detail), { code, status: error.response?.status }));
  }
);

export default client;
```

### Example API module

```ts
// src/api/scheduling.api.ts
import client from "./client";
import type { Attendee, SlotProposal, InviteDraft } from "@/types/scheduling.types";

export const schedulingApi = {
  start: (cycleId: string) =>
    client.post(`/cycles/${cycleId}/scheduling/start`),

  getAttendees: (cycleId: string) =>
    client.get<Attendee[]>(`/cycles/${cycleId}/scheduling/attendees`),

  refreshFromDirectory: (cycleId: string) =>
    client.post(`/cycles/${cycleId}/scheduling/refresh-from-directory`),

  getRankedSlots: (cycleId: string) =>
    client.get<SlotProposal[]>(`/cycles/${cycleId}/scheduling/slots`),

  approveSlot: (cycleId: string, slotId: string) =>
    client.post(`/cycles/${cycleId}/scheduling/approve-slot`, { slot_id: slotId }),

  getInviteDraft: (cycleId: string) =>
    client.get<InviteDraft>(`/cycles/${cycleId}/scheduling/invite`),

  approveAndSendInvite: (cycleId: string, edited?: Partial<InviteDraft>) =>
    client.post(`/cycles/${cycleId}/scheduling/send-invite`, edited ?? {}),
};
```

---

## 6. Authentication Handling

### 6.1 `useCurrentUser` hook

```ts
// src/hooks/useAuth.ts
import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/api/auth.api";

export function useCurrentUser() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: authApi.me,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
```

### 6.2 `RoleGuard`

```tsx
// src/components/shared/RoleGuard.tsx
import { useCurrentUser } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";

export function RoleGuard({ role, children }: { role: string; children: React.ReactNode }) {
  const { data: user } = useCurrentUser();
  if (!user) return null;
  if (!user.roles.includes(role)) {
    toast.error("Access denied");
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
```

---

## 7. TypeScript Types

### 7.1 Auth types

```ts
// src/types/auth.types.ts
export interface CurrentUser {
  user_id: string;             // Entra ID OID
  email: string;
  display_name: string;
  roles: AppRole[];
  groups?: string[];
}

export type AppRole = "vmo_admin" | "vmo_coordinator" | "executive_sponsor" | "viewer";
```

### 7.2 Cycle types (Shell)

```ts
// src/types/cycle.types.ts
export interface Cycle {
  cycle_id: string;
  vendor_id: string;
  vendor_name: string;
  cycle_name: string;            // e.g. "Q2 2026"
  quarter: 1 | 2 | 3 | 4;
  year: number;
  workflow_state: WorkflowState;
  organiser_email: string;       // NEW — Shell organiser owning the cycle
  exec_sponsor_email: string;    // NEW
  llm_tokens_used: number;       // NEW — for budget UI
  created_at: string;
  updated_at: string;
}

export type WorkflowState =
  | "CYCLE_CREATED"
  | "ATTENDEE_REFRESH_SENT"
  | "AVAILABILITY_COLLECTED"
  | "MEETING_SCHEDULED"
  | "SCORECARD_REQUEST_SENT"
  | "SCORECARD_COLLECTION"
  | "SCORECARD_COMPILED"
  | "INTERNAL_ALIGNMENT"
  | "VENDOR_PREP"
  | "MEETING_IN_PROGRESS"
  | "POST_MEETING_COMPLETE"
  | "ARCHIVED";
```

### 7.3 Scorecard types (Shell taxonomy)

```ts
// src/types/scorecard.types.ts

// Shell-specific hierarchical scorecard taxonomy
export type ScorecardCategory = "RISK_COMPLIANCE" | "PERFORMANCE" | "COMMERCIAL" | "RELATIONSHIP";

export type ScorecardParameter =
  // Risk & Compliance
  | "RELEASE_PATCH_MGMT" | "SECURITY_RISK_MGMT" | "AUDIT_COMPLIANCE"
  // Performance
  | "DELIVERY_TIMELINESS" | "QUALITY_OF_DELIVERY" | "SLA_ADHERENCE"
  | "RESOURCE_CAPABILITY" | "OPERATIONAL_EFFICIENCY"
  // Commercial
  | "PRICING_COMPETITIVENESS" | "CONTRACT_COMPLIANCE" | "COST_CONTROL" | "BILLING_ACCURACY"
  // Relationship
  | "COMMUNICATION_EFFECTIVENESS" | "STAKEHOLDER_ENGAGEMENT" | "RESPONSIVENESS" | "COLLABORATION_ALIGNMENT";

export type ValidationFlag = "OUT_OF_RANGE" | "COMMENT_REQUIRED" | "OUTLIER";

export interface ScorecardEntry {
  scorecard_id: string;
  stakeholder_id: string;
  stakeholder_name: string;
  parameter: ScorecardParameter;
  category: ScorecardCategory;
  score: number;                       // 1–5
  comment: string | null;
  is_valid: boolean;
  validation_flags: ValidationFlag[];
  submitted_at: string;
}

export interface CompiledScorecard {
  cycle_id: string;
  vendor_id: string;
  entries: ScorecardEntry[];
  parameter_averages: Record<ScorecardParameter, number>;
  category_averages: Record<ScorecardCategory, number>;
  overall_average: number;
  outlier_count: number;
  missing_count: number;
  compiled_at: string;
}

export interface ScorecardSubmissionInput {
  scores: Record<ScorecardParameter, number>;
  comments: Partial<Record<ScorecardCategory, string>>;
  key_recommendations?: string;
}
```

(Other type files largely unchanged from POC but with `Record<ScorecardCategory>` replaced by Shell taxonomy where relevant.)

---

## 8. State Stores

### 8.1 `useAuthStore` (new)

```ts
// src/store/useAuthStore.ts
import { create } from "zustand";
import type { CurrentUser } from "@/types/auth.types";

interface AuthStore {
  user: CurrentUser | null;
  setUser: (user: CurrentUser | null) => void;
  hasRole: (role: string) => boolean;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  setUser: (user) => set({ user }),
  hasRole: (role) => get().user?.roles.includes(role as never) ?? false,
}));
```

### 8.2 `useCycleStore`, `useApprovalStore`, `useUIStore`

Largely unchanged from POC. See `docs/LLD_Frontend.md` §5.1 for shape; types updated to match Shell types module above.

---

## 9. TanStack Query Hooks

### 9.1 Pattern

```ts
// src/hooks/useScheduling.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { schedulingApi } from "@/api/scheduling.api";
import { toast } from "sonner";

export function useAttendees(cycleId: string) {
  return useQuery({
    queryKey: ["scheduling", "attendees", cycleId],
    queryFn: () => schedulingApi.getAttendees(cycleId),
    enabled: !!cycleId,
  });
}

export function useApproveAndSendInvite(cycleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (edits?: Partial<InviteDraft>) => schedulingApi.approveAndSendInvite(cycleId, edits),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cycle", cycleId] });
      qc.invalidateQueries({ queryKey: ["scheduling", cycleId] });
      toast.success("Meeting invite sent");
    },
    onError: (err: Error & { code?: string }) => {
      if (err.code === "WORKFLOW_VIOLATION") {
        toast.error("Workflow not ready for this action");
      } else if (err.code === "GRAPH_AUTH_FAILED") {
        toast.error("Microsoft Graph authentication issue — please contact IT");
      } else {
        toast.error(err.message ?? "Failed to send invite");
      }
    },
  });
}
```

### 9.2 Query key convention

```
['auth', 'me']
['cycle', cycleId]
['cycles']
['scheduling', 'attendees', cycleId]
['scheduling', 'slots', cycleId]
['scheduling', 'invite-draft', cycleId]
['scorecard', 'submission-status', cycleId]
['scorecard', 'compiled', cycleId]
['scorecard', 'form', token]               // public form context
['alignment', 'changes', cycleId]
['alignment', 'flags', cycleId]
['vendor-prep', 'brief', cycleId]
['vendor-prep', 'pushback', cycleId]
['meeting', 'notes', cycleId]
['meeting', 'minutes', cycleId]
['analytics', 'trends', vendorId]
['analytics', 'recurring-issues']
['analytics', 'leadership-brief', vendorId]
['agent-runs', cycleId]
['external-calls', cycleId]
['admin', 'vendors']
['admin', 'users']
['admin', 'audit', filters]
['admin', 'budgets']
```

---

## 10. Shared Components

### 10.1 `ApprovalPanel` (the most important component)

```ts
interface ApprovalPanelProps {
  isOpen: boolean;
  type: "INVITE" | "SCORECARD_REQUEST" | "REMINDER" | "VENDOR_BRIEF" | "MINUTES" | "EXTRACTED_ACTIONS";
  summary: string;
  previewContent: string;          // markdown or HTML (sanitised)
  recipients: { email: string; name: string }[];
  agentRunId: string;
  editableFields?: {               // when set, panel renders inline editors
    subject?: { value: string; onChange: (v: string) => void };
    body?: { value: string; onChange: (v: string) => void };
    selectedSlot?: { options: SlotProposal[]; value: string; onChange: (v: string) => void };
  };
  onApprove: () => void;
  onCancel: () => void;
  isLoading: boolean;
}
```

**Layout:** Modal, full-width on mobile, side-drawer on desktop. Preview rendered with `dompurify` for HTML content. Recipient list shown as chips with hover tooltip showing display name.

**Behaviour:**

- Approve button disabled until content visible (prevents accidental approval of stale content)
- Recipient list expandable if > 10 entries
- "Show diff" toggle when content was edited
- Approval action records `security_events` entry server-side

### 10.2 Other shared components

Largely unchanged from POC; full prop signatures in companion file `06a_Shared_Component_Specs.md` (not delivered separately in this pack — they are derivable from the POC LLD with minor renames). New components:

- **`ExternalCallLog`** — admin drawer; columns: Provider, Endpoint, Status, Latency, Request-ID, Time. Filterable by provider and status code.
- **`RoleGuard`** — see §6.2 above.
- **`WorkflowStateGuard`** — wraps a section; renders lock + tooltip if `cycle.workflow_state` is below required.

---

## 11. Module Components (A–F)

Component inventory unchanged from POC. Key per-module changes for Shell:

### Module A — Scheduling

- `AttendeeRefreshPanel` adds a "Sync from Entra ID directory" button → backend resolves attendees from Entra ID group + previous-cycle stakeholders.
- `SlotRankingPanel` now shows Graph `confidenceLevel` per slot ("Graph confidence: high/medium/low") alongside our deterministic rank score.
- `InviteApprovalPanel` shows Teams meeting URL placeholder ("Teams URL generated on send") rather than mock dial-in.

### Module B — Scorecard

- `ScorecardDispatchPanel` uses Graph send preview, not Gmail. No "Google Form link" UI anywhere.
- New: `SubmissionStatusCardForStakeholder` — drilldown per stakeholder showing the in-app form link, reminder history, submitted/missing status.
- `CompiledScorecardTable` uses 4 categories × 16 parameters (Shell taxonomy) — renders as a two-level grouped table.

### Modules C / D / E / F

No frontend component changes vs. POC.

---

## 12. In-App Scorecard Form (`/scorecard/:linkToken`)

The biggest new frontend surface in Shell production. Replaces Google Forms entirely.

### 12.1 Page layout

```
┌────────────────────────────────────────────────────────────┐
│  Shell-branded header                                       │
│  ──────────────────────────────────────────────────────     │
│  Vendor: <CoreSystems Ltd>                                 │
│  Cycle: Q2 2026 EGB QBR                                    │
│  Reviewer: <Marcus Chen (Technical Lead)>                  │
│  Deadline: 14 May 2026                                     │
│  ──────────────────────────────────────────────────────     │
│                                                            │
│  [Section accordion — one per ScorecardCategory]           │
│                                                            │
│  ▸ Risk & Compliance        (0/3 answered)                 │
│  ▸ Performance              (0/5 answered)                 │
│  ▸ Commercial               (0/4 answered)                 │
│  ▸ Relationship             (0/4 answered)                 │
│                                                            │
│  Key Recommendations (optional)                            │
│  [textarea]                                                │
│                                                            │
│  [Save Draft]                       [Submit Scorecard]     │
└────────────────────────────────────────────────────────────┘
```

### 12.2 Per-parameter input

```
Delivery Timeliness
┌───────────────────────────────────────────────────┐
│  Rate this parameter (1 = Poor, 5 = Excellent)    │
│                                                   │
│  ○ 1   ○ 2   ● 3   ○ 4   ○ 5                       │
│                                                   │
│  Comment (required for 1 or 5)                    │
│  [textarea]                                       │
└───────────────────────────────────────────────────┘
```

Validation:

- Score 1 or 5 → comment required (Zod `superRefine`)
- All parameters must have a score before Submit is enabled

### 12.3 State persistence

- **Draft autosave:** `POST /api/v1/scorecard/form/{token}/draft` on each blur. Backend stores partial submissions in `scorecard_form_links.draft_payload` (JSONB). Token still single-use only for **final** submission.
- **Re-entry:** stakeholder can close the browser and return via the same email link — draft state restored.
- **Submit:** final POST; token marked `used_at`; further attempts return "already submitted" page.

### 12.4 Security considerations

- Form token validated server-side on every render and submit.
- CSRF: same-origin POST with `SameSite=Lax` cookie + per-form CSRF token.
- The form page is **public** but heavily rate-limited per token (10 saves/min).

---

## 13. Admin Page (`/admin`)

Visible only to `vmo_admin`. Five panels in a tabbed layout.

### 13.1 Vendor Master

```tsx
<DataTable<Vendor>
  columns={[
    { key: "name", label: "Name", editable: true },
    { key: "category", label: "Category", editable: "select" },
    { key: "status", label: "Status", editable: "select", options: ["ACTIVE", "INACTIVE"] },
    { key: "active_cycle", label: "Active cycle", render: (v) => v.active_cycle_id ? <Link.../> : <Badge.../> },
  ]}
  rows={vendors}
  onCreate={createVendor}
  onEdit={updateVendor}
  onArchive={archiveVendor}
/>
```

### 13.2 Users & Roles

Read-only view (Shell groups are the source of truth — admins can't grant roles in-app, they must go to Entra ID). Refresh button to re-sync from Entra ID.

### 13.3 Audit Log

Filterable view of `agent_runs`, `external_calls`, `security_events`. CSV export gated behind a confirmation modal that records the export to `security_events`.

### 13.4 LLM Budget

| Metric | Value |
|--------|-------|
| Current month token spend | 1,240,000 / 5,000,000 (25%) |
| Highest spend cycle (this month) | CoreSystems Q2 — 120,000 tokens |
| Estimated monthly cost | $312.00 |
| Active per-cycle budgets | … |

Daily / per-cycle budget editable here (audited).

### 13.5 System Health

Proxies backend `/healthz` and `/readyz`. Shows status of: DB, Key Vault, Graph token acquisition, LLM provider reachability.

---

## 14. Form Handling Patterns

All forms use **react-hook-form + Zod**:

```ts
// In-app scorecard form schema (Shell taxonomy)
const scorecardSchema = z.object({
  scores: z.object({
    DELIVERY_TIMELINESS: z.number().min(1).max(5),
    QUALITY_OF_DELIVERY: z.number().min(1).max(5),
    // … all 16 parameters
  }),
  comments: z.object({
    RISK_COMPLIANCE: z.string().optional(),
    PERFORMANCE: z.string().optional(),
    COMMERCIAL: z.string().optional(),
    RELATIONSHIP: z.string().optional(),
  }),
  key_recommendations: z.string().optional(),
}).superRefine((data, ctx) => {
  for (const [parameter, score] of Object.entries(data.scores)) {
    if ((score === 1 || score === 5)) {
      const categoryComment = data.comments[categoryOf(parameter)];
      if (!categoryComment || categoryComment.trim().length < 5) {
        ctx.addIssue({
          code: "custom",
          path: ["comments", categoryOf(parameter)],
          message: `A comment is required for ${parameter} when score is ${score}`,
        });
      }
    }
  }
});
```

---

## 15. Accessibility

Shell standard: **WCAG 2.1 AA**. Specific commitments:

- All interactive components keyboard-navigable (Tab / Shift+Tab / Enter / Space / Esc)
- Focus visible at all times (Tailwind `focus-visible:` utilities)
- Colour contrast ≥ 4.5:1 for normal text, ≥ 3:1 for large text and meaningful UI states
- All form inputs have associated `<label>` (not placeholder-only)
- Icon-only buttons have `aria-label`
- Live regions for toast notifications (`role="status"` for non-critical, `role="alert"` for errors)
- Tables use `<th scope=...>`; data tables ≥ 5 rows include `<caption>`
- `<dialog>` (or shadcn `Dialog`) for modals — focus trap + restore on close
- All charts include data tables as text-equivalent (`aria-describedby`)
- Reduced motion respected via `prefers-reduced-motion`
- Tested with NVDA + Edge as part of QA

---

## 16. Tailwind v4 Design Tokens (Shell)

```css
/* src/styles/globals.css */
@import "tailwindcss";

@theme {
  --color-brand-primary: #DD1D21;       /* Shell red — TBD with Shell brand */
  --color-brand-secondary: #FBCE07;     /* Shell yellow — TBD with Shell brand */
  --color-brand-navy: #002D5C;
  --color-brand-on-primary: #FFFFFF;

  --color-surface-base: #FFFFFF;
  --color-surface-muted: #F4F6F9;
  --color-surface-border: #E2E8F0;

  --color-status-open: #DC2626;
  --color-status-progress: #D97706;
  --color-status-closed: #16A34A;

  --color-text-base: #1E293B;
  --color-text-muted: #64748B;

  --font-sans: "ShellHeavy", "Segoe UI", "Roboto", system-ui, sans-serif;
  --font-mono: "Cascadia Code", "Consolas", monospace;
}
```

**Final palette to be confirmed with Shell brand/communications team in Phase 0.** Shell's actual web brand assets supersede these placeholders.

---

## 17. Testing Strategy

| Layer | Tool | Coverage target |
|-------|------|------------------|
| Unit (utils, formatters, store actions) | Vitest | ≥ 80% line |
| Component (modules, shared) | Vitest + RTL + MSW | All happy paths + error states |
| E2E happy paths (Phase 3+) | Playwright | Full cycle smoke; scorecard form; admin |
| Accessibility | axe-core + Playwright a11y plugin | Zero violations on key pages |
| Visual regression | Playwright snapshots (key pages only) | Catch theme/layout regressions |

CI: lint + typecheck + unit on every PR; E2E on main and pre-release.

---

## 18. Build & Deployment

### 18.1 Vite config

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  base: "/app/",
  plugins: [react(), tailwind()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8000" },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
```

### 18.2 Same-container deployment

The frontend's `dist/` is copied into the backend container (or served by an `nginx` sidecar in the same App Service) at `/app/`. The FastAPI app mounts at `/api/`. No CDN required for first release; Front Door caches static `/app/*` for 1 hour.

### 18.3 Content Security Policy

Set by the App Service / FastAPI middleware:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';     # Tailwind dev needs this; pruned in prod with hashes
img-src 'self' data: https://graph.microsoft.com;
connect-src 'self' https://<appinsights-region>.in.applicationinsights.azure.com;
frame-ancestors 'none';
```

### 18.4 Environment

No `.env` in the deployed build. Configuration arrives via the same-origin API (`GET /api/v1/config`), which returns App Insights connection string and feature flags.

---

*Frontend LLD v2.0 — Zensar VendorPulse for Shell — 2026-06-03.*
