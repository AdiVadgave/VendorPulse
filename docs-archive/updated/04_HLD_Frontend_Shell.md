# VendorPulse for Shell — Frontend High-Level Design (HLD)

> **Version:** 2.0 (Shell) | **Stack:** React 19 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui
> **Scope:** Frontend architecture for Shell production deployment
> **Supersedes:** `docs/HLD_Frontend.md` (POC v1.0)

---

## 1. Overview

The VendorPulse frontend is a **single-page application** that gives Shell VMO coordinators an interactive workspace for orchestrating quarterly vendor governance cycles across the six modules (A–F). It is the only human surface in the system — all agent activity, all approvals, all analytics flow through this UI.

Three design priorities for Shell production:

1. **Shell SSO native.** No login screens, no passwords — users land on the dashboard already authenticated through Entra ID.
2. **Approval is the workflow.** Every AI-generated artifact (invite, brief, minutes, reminder) is surfaced for human review before any external action. The approval modal is the central UI primitive.
3. **Shell visual identity respected.** The UI uses Shell-tone colour palette (configurable), Shell's standard typography (Shell Heavy / Shell Book where available, system fonts otherwise), and the in-built **accessibility baseline of WCAG 2.1 AA**.

---

## 2. System Context

```
┌─────────────────────────────────────────────────────────────────┐
│              Shell User browser (Edge / Chrome on Win10/11)     │
│                                                                 │
│   Already signed in to Shell SSO via Entra ID                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS, OIDC session cookie
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│              Azure Front Door (TLS, WAF, edge cache)            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│         Azure App Service — Vendorpulse application             │
│                                                                 │
│   ┌───────────────────────────────────────────────────────┐    │
│   │  Static React bundle served from /app/* (nginx layer) │    │
│   │  + FastAPI mounted at /api/*                          │    │
│   └────────────────────┬──────────────────────────────────┘    │
│                        │ HTTP (same-origin)                     │
│                        ▼                                        │
│   ┌───────────────────────────────────────────────────────┐    │
│   │  FastAPI backend (see backend HLD)                    │    │
│   └───────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Same-origin deployment:** SPA and API served from the same App Service. Eliminates CORS complexity and cookie issues. Front Door is the only public endpoint.

---

## 3. Application Architecture

### 3.1 Layer breakdown

| Layer | Technology | Responsibility |
|-------|------------|----------------|
| **Routing** | React Router v7 | SPA navigation, tab-based workspace, deep links |
| **Authentication** | OIDC session cookie (set by backend) | No client-side token handling; backend session is source of truth |
| **Pages** | React components | Dashboard, Cycle Detail, Analytics, Admin, Scorecard form (public link) |
| **Modules** | Feature components | One folder per workflow stage (A–F) |
| **Shared components** | Custom + shadcn/ui | Approval panel, agent status, workflow progress, audit drawer |
| **Server state** | TanStack Query v5 | API caching, background refetch, mutations, optimistic updates |
| **UI state** | Zustand v5 | Active cycle, modal state, approval queue, sidebar |
| **API client** | Axios + typed wrappers | All HTTP via one client with response interceptors |
| **Forms** | react-hook-form + Zod | Scorecard form, action item editor, pushback entry, alignment notes |
| **Charts** | Recharts | Trend lines, radar, bar — Module F + briefing card |
| **Styling** | Tailwind CSS v4 | Utility-first; Shell colour tokens; full a11y theming |
| **Icons** | lucide-react | Stroke-based, Shell-style |
| **Notifications** | sonner | Toast for non-blocking feedback |

### 3.2 Data flow

```
User interaction in a React component
    │
    ├──► Zustand action (local UI state — open/close, selections)
    │
    └──► TanStack Query mutation
              │
              ▼
         Axios client → /api/v1/...
              │ (same-origin, session cookie automatic)
              ▼
         FastAPI backend
              │
              ▼
         AgentResponse[T] → axios response interceptor → TanStack cache update
              │
              ▼
         Component re-render (reactive)
              │
              ▼
         Sonner toast for confirmation (if mutation)
```

### 3.3 Authentication flow (frontend perspective)

```
Browser → /app/anything
    │
    │ Backend middleware: no session cookie → 401 with redirect URL
    │
    ▼
Frontend axios interceptor catches 401 → window.location to OIDC sign-in
    │
    ▼
Entra ID — user already authenticated to Shell → instant SSO
    │
    ▼
Backend /api/auth/callback → sets session cookie
    │
    ▼
Browser back to /app/anything → session now valid → app loads
```

**No tokens in localStorage. No tokens in JavaScript memory.** All auth state lives in the HttpOnly session cookie managed by the backend.

---

## 4. Routing Design

```
/app                                  → Dashboard (all vendors + active cycles)
/app/cycles/:cycleId                  → Cycle Detail Workspace (tabbed)
  ?tab=overview                       → Overview tab
  ?tab=scheduling                     → Module A
  ?tab=scorecard                      → Module B
  ?tab=alignment                      → Module C
  ?tab=vendor-prep                    → Module D
  ?tab=meeting                        → Module E
  ?tab=actions                        → Action items view
/app/analytics                        → Module F (cross-cycle)
  ?vendor=                            → Filter by vendor
/app/admin                            → vmo_admin only — vendor master, users, audit
/app/scorecard/:linkToken             → Public stakeholder scorecard form (magic-link entry)
/app/login-error                      → OIDC error page (when SSO fails)
```

### Route guards

| Guard | Behaviour |
|-------|-----------|
| **Auth guard** | Every route except `/app/scorecard/:linkToken` requires a valid session — backend enforces; frontend redirects on 401 |
| **Role guard** | `/app/admin` requires `vmo_admin` role — frontend redirects to `/app` with a toast |
| **Cycle guard** | Unknown `cycleId` → redirect to `/app` with toast |
| **Tab guard** | Tabs beyond current workflow_state show a lock icon — no hard redirect, tooltip explains |

### Scorecard form (public route)

The only route that does **not** require Shell SSO is the scorecard form, accessed via a one-time-use token in the URL. Stakeholders click a Graph-sent email link, the token authenticates them for that specific form, and they fill it in. **Internal stakeholders** still see the same form after also passing SSO; **external stakeholders** (vendors) use the token-only path. The token is single-cycle, single-form, and stored hashed in `scorecard_form_links`.

---

## 5. State Management Strategy

### 5.1 Two-store system

```
┌─────────────────────────────────────────────────────┐
│                  Frontend State                     │
│                                                     │
│  ┌──────────────────────┐  ┌─────────────────────┐  │
│  │   TanStack Query     │  │      Zustand        │  │
│  │   (Server state)     │  │   (UI / interaction)│  │
│  │                      │  │                     │  │
│  │  • Cycles            │  │  • activeCycleId    │  │
│  │  • Scorecards        │  │  • activeTab        │  │
│  │  • Slot proposals    │  │  • pendingApproval  │  │
│  │  • Meeting notes     │  │  • sidebarCollapsed │  │
│  │  • Vendor briefs     │  │  • notifPanelOpen   │  │
│  │  • Action items      │  │  • agentLogOpen     │  │
│  │  • Analytics         │  │  • currentUser      │  │
│  │  • Audit log         │  │  • activeRoles      │  │
│  └──────────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 5.2 Zustand stores

| Store | Manages |
|-------|---------|
| `useCycleStore` | Active cycle / vendor selection, current tab |
| `useApprovalStore` | Pending approval queue for AI-generated actions |
| `useUIStore` | Sidebar, notification panel, agent log visibility |
| `useAuthStore` | Current user identity (from `/api/auth/me`), roles, last-refresh timestamp |

### 5.3 TanStack Query setup

- **Stale time:** 30 seconds default; 5 seconds on active workflow tab (so coordinator sees movement)
- **Refetch on window focus:** ON (Shell users typically have many tabs)
- **Background sync:** ON for cycle list, OFF for analytics (refreshed manually)
- **Retry:** 1 retry on 5xx, 0 on 4xx
- **Mutation invalidation:** documented per module in `useXxx` hooks

---

## 6. Module Overview (A–F)

The six-module split is unchanged from the POC. Component-level changes are concentrated in **Module A** (real Graph data instead of mock slot rankings) and **Module B** (in-app scorecard form replaces Google Forms references).

```
Workflow State Machine (frontend reflects each step):

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

| Component | Role | Change from POC |
|-----------|------|------------------|
| `AttendeeRefreshPanel` | Displays attendees synced from Entra ID directory; triggers refresh email | Now sources stakeholder roster from Entra ID groups, not seed data |
| `SlotRankingPanel` | Renders top-3 ranked slots from Graph `findMeetingTimes` + slot ranking | Real Graph data; shows confidence level from Graph; per-attendee availability |
| `SlotCard` | Individual slot with availability breakdown, organiser/sponsor highlight | Unchanged |
| `InviteApprovalPanel` | Approval modal showing Teams invite preview (subject, body, attendees, dial-in) | Now uses Graph `create_event` after approval (POC used mock service) |
| `ConfirmationTracker` | Live RSVP status per stakeholder | New: polls Graph `getEvent.attendees` for response status |

### Module B — Scorecard

| Component | Role | Change from POC |
|-----------|------|------------------|
| `ScorecardDispatchPanel` | Trigger personalised request emails (Graph `sendMail`) | Removes any reference to Google Forms URL |
| `SubmissionTracker` | Live view of who has/hasn't submitted | Now reads from native `scorecards` table — no Google polling |
| `InAppScorecardForm` | **New** — the form stakeholders fill in (rendered at `/app/scorecard/:linkToken`) | Replaces all Google Forms integration |
| `CompiledScorecardTable` | Aggregated results per stakeholder per category | Unchanged |
| `OutlierBadge` | Statistical outlier visual flag | Unchanged |
| `ReminderHistory` | Timeline of reminder emails sent | Unchanged |

### Module C — Alignment

| Component | Role | Change from POC |
|-----------|------|------------------|
| `ChangeHighlightsPanel` | Score deltas vs. previous cycle | Unchanged |
| `AlignmentFlagsPanel` | Categories with high spread across stakeholders | Unchanged |
| `FaceOffModelEditor` | Edit Shell ↔ Vendor attendee pairing | Unchanged |
| `NotesInputPanel` | Paste raw alignment meeting notes | Unchanged |
| `ExtractedActionsPreview` | AI-extracted action items review/edit before save | Unchanged |

### Module D — Vendor Prep

| Component | Role | Change from POC |
|-----------|------|------------------|
| `VendorBriefPanel` | AI-generated brief: scores, trends, concerns | Unchanged |
| `PushbackInput` | Log a vendor pushback item with category | Unchanged |
| `PushbackResponseCards` | Three response stances (FACTUAL / NEUTRAL / ESCALATION) | Unchanged |
| `UnresolvedItemTracker` | Open pushback items | Unchanged |

### Module E — Meeting

| Component | Role | Change from POC |
|-----------|------|------------------|
| `MeetingBriefingCard` | Pre-meeting facilitator briefing | Unchanged |
| `LiveCapturePanel` | Real-time note capture during the meeting | Unchanged |
| `CaptureNoteItem` | Individual classified note | Unchanged |
| `TranscriptInput` | Paste full transcript for AI parsing | Unchanged (Phase 2: optional Graph-sourced transcript) |
| `MeetingMinutesViewer` | Structured minutes display | Adds "Email minutes to attendees" approval flow via Graph `sendMail` |

### Module F — Analytics

| Component | Role | Change from POC |
|-----------|------|------------------|
| `TrendLineChart` | Score trends over time per category | Unchanged |
| `RadarChart` | Current vs previous cycle per category | Unchanged |
| `CrossVendorBarChart` | Multi-vendor comparison | Unchanged |
| `RecurringIssueAlerts` | Issues in 2+ consecutive cycles | Unchanged |
| `LeadershipBriefCard` | AI-generated executive summary | Unchanged |
| `VendorSelector` | Filter analytics by vendor | Unchanged |

### Admin (new)

| Component | Role |
|-----------|------|
| `VendorMasterTable` | List, create, edit, archive vendors |
| `UserRolesPanel` | View users' Shell groups and effective app roles |
| `AuditLogViewer` | Search `agent_runs`, `external_calls`, `security_events`; export to CSV |
| `LLMBudgetPanel` | Current token spend, per-cycle budgets, daily tenant budget |
| `SystemHealthPanel` | Graph health, LLM health, DB health (proxied from backend `/healthz`) |

Visible only to users with `vmo_admin` role.

---

## 7. Shared Component Library

| Component | Purpose | Change from POC |
|-----------|---------|------------------|
| `AgentStatusBadge` | RUNNING / AWAITING_APPROVAL / COMPLETE / FAILED | Unchanged |
| `ApprovalPanel` | Modal/drawer for human-in-the-loop approval | Adds "Edit before send" capability and an approval-history link |
| `WorkflowProgressBar` | Visual progress through 12 states | Unchanged |
| `AgentRunLog` | Drawer with `agent_runs` table data | Now queryable by cycle, agent, status, date range |
| `ExternalCallLog` | **New** — drawer with `external_calls` (Graph, LLM) | For vmo_admin |
| `NotificationsPanel` | In-app notification slide-in | Unchanged |
| `ActionLog` | Action items table across modules | Unchanged |
| `ErrorBoundary` | Catches component-level errors | Unchanged |
| `EmptyState` | Placeholder when no data | Unchanged |
| `ConfirmDialog` | Confirmation modal for destructive actions | Unchanged |
| `RoleGuard` | **New** — wraps children, shows fallback if user lacks required role | |
| `WorkflowStateGuard` | **New** — wraps a tab/section, shows lock if cycle not yet at required state | |
| `SecuredImage` | **New** — renders profile images via Graph with auth | For attendee avatars |

---

## 8. API Client Architecture

```
src/api/
├── client.ts                # Axios instance — same-origin (no baseURL needed), with 401 redirect handler
├── auth.api.ts              # /api/v1/auth/* — me, logout
├── cycles.api.ts            # /api/v1/cycles/*
├── scheduling.api.ts        # Module A
├── scorecard.api.ts         # Module B (includes in-app form submission)
├── alignment.api.ts         # Module C
├── vendorPrep.api.ts        # Module D
├── meeting.api.ts           # Module E
├── analytics.api.ts         # Module F
└── admin.api.ts             # New — admin-only endpoints
```

Removed from POC: `gmailApi`, `googleFormsApi`, `googleAuthApi` — all gone.

All API functions are **typed** against TypeScript interfaces in `src/types/`. Cookie-based auth means no Bearer header management in client code.

---

## 9. Form Handling Strategy

All input forms use **react-hook-form + Zod**.

| Form | Schema | Key constraint |
|------|--------|-----------------|
| In-app scorecard | `scorecardSubmissionSchema` | 1–5 sliders per parameter; comment required if score is 1 or 5 |
| Action item editor | `actionItemSchema` | Description ≥ 5 chars; owner required; due date optional |
| Pushback entry | `pushbackSchema` | Description + category required |
| Alignment notes | `alignmentNotesSchema` | Free-text, min length 50 chars before "Extract" enabled |
| Vendor master (admin) | `vendorSchema` | Unique name; category from enum |
| Meeting capture | `noteCaptureSchema` | Type + content required |

---

## 10. Key design decisions (Shell-flavoured)

| Decision | Rationale |
|----------|-----------|
| Same-origin SPA + API deployment | Eliminates CORS, simplifies cookies, single audit surface |
| Cookie-based session (HttpOnly) | No tokens in JS memory — safer against XSS exfiltration |
| TanStack Query for server state | Eliminates manual loading/error plumbing; battle-tested |
| Zustand for UI state | Lightweight; no Redux boilerplate |
| shadcn/ui primitives | Accessible-by-default base components compatible with Tailwind |
| Approval modal as a singleton | One source of truth for pending approvals across the app |
| Tab-locking, not redirecting | Tabs beyond current state visible-but-locked aids orientation |
| Recharts for analytics | React-native, composable, no heavy deps |
| WCAG 2.1 AA baseline | Shell standard for internal applications |
| English only at launch | Scope discipline; multi-language candidate for Phase 2 |
| No mobile app | Out of scope |

---

## 11. Error Handling and Loading States

| Scenario | Handling |
|----------|----------|
| API 401 | Axios interceptor → redirect to `/api/auth/login` |
| API 403 | Toast: "Access denied"; component shows `EmptyState` with role explanation |
| API 4xx (validation) | Toast with error message; form fields highlighted |
| API 5xx | Toast: "Service unavailable — please retry"; component shows `EmptyState` with retry |
| Agent run failure (`status=failed`) | `AgentStatusBadge` → FAILED; `error_message` shown; "Retry" button re-triggers mutation |
| Graph throttle / outage | Toast: "Microsoft 365 is throttling requests — retry in 30s"; backend handles retry transparently in most cases |
| LLM outage | Toast: "AI service unavailable — try again later"; agents return failed status |
| Component crash | `ErrorBoundary` shows fallback screen with "Reload" button; reports to App Insights |
| Pending API call | Skeleton loaders per section (unchanged from POC) |
| Workflow violation | Toast: "This action requires the cycle to be in state <X>" |

---

## 12. Build, deploy, and environment

| Concern | Approach |
|---------|----------|
| Build tool | Vite 8 — fast HMR in dev, optimised ESM in prod |
| Output | Static bundle served by nginx alongside FastAPI in same container |
| API base URL | Same-origin (`/api/v1/`) — no `VITE_API_URL` needed in prod |
| TypeScript | Strict mode, no `any` |
| Lint | ESLint flat config + typescript-eslint + react-hooks |
| Accessibility | `eslint-plugin-jsx-a11y` enabled; manual a11y audit in QA |
| CSP | `script-src 'self'`; no inline scripts; `connect-src` permits only same-origin + App Insights |
| Bundle analysis | `vite-plugin-visualizer` gated for non-prod builds |
| Tests | Vitest unit + React Testing Library; Playwright for E2E happy path |

---

## 13. Visual identity (Shell-themed)

Tailwind v4 design tokens replace the POC's purple-gradient hero in `gmail_service.py`:

| Token | Value (proposed) | Use |
|-------|------------------|-----|
| `brand-primary` | Shell-tone (Pantone yellow / red — TBD with Shell brand team) | Buttons, links, brand bar |
| `brand-on-primary` | White | Text on primary surfaces |
| `surface-base` | White | Page background |
| `surface-muted` | `#F4F6F9` | Card/section background |
| `status-open` | Red 600 | Open / not started |
| `status-progress` | Amber 600 | In progress |
| `status-closed` | Green 600 | Closed / resolved |
| `text-base` | `#1E293B` | Primary text |
| `text-muted` | `#64748B` | Secondary / caption |

**Final palette to be agreed with Shell brand/communications team at the Day-2 design alignment checkpoint** (see [§11 Productionization Roadmap](11_Productionization_Roadmap_Shell.md)).

---

## 14. What is NOT in the frontend HLD

- Detailed component prop types — see `06_LLD_Frontend_Shell.md`
- Specific TanStack Query keys and invalidation rules — see LLD
- Specific Zustand action signatures — see LLD
- Cypress / Playwright test plan — separate test strategy doc
- Visual design mocks — Shell UX team output, separate

---

*Frontend HLD v2.0 — Zensar VendorPulse for Shell — 2026-06-03.*
