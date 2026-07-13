# VendorPulse — Complete Project Guide

> **Read this first.** This single document explains what VendorPulse is, how it is
> built, every feature, and all the changes made to align it with Shell's SPR
> (Supplier Performance Review) requirements. It is written so that a person — or a
> fresh AI assistant session — can understand the whole project from zero.
>
> Paths in this doc are relative to `VendorPulse-code/` unless noted.
> Active development branch: **`shell-feature`**.

---

## 1. What VendorPulse is (business context)

**Client:** Shell — Mobility VMO (Vendor Management Office) & IDT Operations.

**Problem it solves:** Shell runs a recurring **governance cycle** to review its strategic IT
vendors (originally called EGB/QBR; now modelled as **SPR — Supplier Performance Review**).
Each cycle involves multi-stakeholder scheduling, collecting performance scorecards from
internal teams, aligning internally, preparing for the vendor call, running the governance
meeting, and writing up minutes/actions. Today this is manual, slow and inconsistent.

**Solution:** an AI-assisted platform that automates the *coordination and documentation* of
that cycle end-to-end, while keeping a human in control of every decision and outbound
communication.

### Two non-negotiable principles (honoured throughout the code)
1. **Human-in-the-Loop (HITL):** every outbound communication (invites, scorecard emails,
   minutes) and every key decision is reviewed/approved by the coordinator before it goes out.
2. **Deterministic core, AI at the edges:** all scores, averages, rankings, and state
   transitions are computed in plain code. The LLM is used only to *narrate* (briefs, minutes,
   summaries, insights) — it never computes or fabricates a number. The app must fully work
   with the LLM turned off.

---

## 2. Tech stack

| Layer | Tech |
|---|---|
| **Backend** | FastAPI (Python 3.11), Pydantic v2, httpx |
| **Frontend** | React 19 + Vite + TypeScript, React Router 7, Zustand 5, Tailwind CSS 4, Recharts, lucide-react |
| **LLM** | Azure OpenAI / OpenAI / **Microsoft Foundry** (provider switch), **off by default** (`ENABLE_LLM=false`) |
| **Integrations** | Microsoft Graph (calendar, Teams, mail), Gmail API (scorecard/minutes email) |
| **Persistence** | **JSON files** in `backend/data/` (repository pattern; SQL-swap-ready, not yet done) |

---

## 3. How to run

### Backend (FastAPI, `:8000`)
```bash
cd VendorPulse-code/backend
python run.py                 # dev server with reload; Swagger at http://localhost:8000/docs
python run.py --no-reload
```
`.env` (in `backend/`) — all optional for the core flow:
```
ENABLE_LLM=false                 # true to enable AI narration
AI_PROVIDER=azure                # azure | openai | foundry
AZURE_OPENAI_API_KEY=... AZURE_OPENAI_ENDPOINT=... AZURE_OPENAI_DEPLOYMENT_NAME=...
GRAPH_ACCESS_TOKEN=...           # MS Graph bearer token (Calendars.ReadWrite, Mail.Send)
GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...   # for Gmail send (scorecard/minutes emails)
```

### Frontend (Vite, `:5173`)
```bash
cd VendorPulse-code/frontend
npm install
npm run dev
```
`frontend/.env.local` (optional): `VITE_API_URL=http://localhost:8000` (the API client also
falls back to `:8000` then `:8010`).

### ⚠️ Known build caveat (pre-existing, not from recent work)
`frontend/tsconfig.app.json` has `"ignoreDeprecations": "6.0"`, which the pinned TypeScript
`5.9.3` rejects — so `npm run build` (the `tsc -b` step) fails as-is. To typecheck, run:
```bash
node_modules/.bin/tsc --noEmit -p tsconfig.app.json --ignoreDeprecations 5.0
node_modules/.bin/vite build         # bundling works fine (esbuild)
```
There are also ~pre-existing strict `noUnusedLocals` errors in a few legacy/stub files
(`ChangeHighlightsPanel`, `FaceOffModelEditor`, some `CycleDetail` vars). The **Vite build
passes**; these are lint-level and were present before recent work. Fixing `"6.0"→"5.0"` is a
one-line cleanup if desired.

---

## 4. The workflow state machine (the backbone)

A cycle marches through **12 states, forward-only** (no skipping/rollback). Enforced backend
in `backend/app/core/workflow_engine.py` and mirrored frontend in
`frontend/src/store/useCycleStore.ts` (`pickMostAdvanced` — local state never regresses).
Illegal transitions → HTTP 409.

```
CYCLE_CREATED → ATTENDEE_REFRESH_SENT → AVAILABILITY_COLLECTED → MEETING_SCHEDULED
→ SCORECARD_REQUEST_SENT → SCORECARD_COLLECTION → SCORECARD_COMPILED
→ INTERNAL_ALIGNMENT → VENDOR_PREP → MEETING_IN_PROGRESS → POST_MEETING_COMPLETE → ARCHIVED
```

**Tab gating** (`frontend/src/utils/constants.ts` → `TAB_MIN_STATE_INDEX`): each workspace tab
unlocks only once the cycle reaches a minimum state. Notably **Alignment unlocks at
`SCORECARD_COMPILED` (index 6)**. Scorecard dispatch advances to `SCORECARD_REQUEST_SENT`;
a submission advances to `SCORECARD_COLLECTION`; **compiling** (all key teams submitted, or the
coordinator clicks "Proceed to Internal Alignment") advances to `SCORECARD_COMPILED`.

---

## 5. Modules A–F (map)

| Module | States | Purpose | AI role |
|---|---|---|---|
| **A — Scheduling** | CYCLE_CREATED → MEETING_SCHEDULED | Confirm attendees, find a slot via Graph, create the Teams meeting | Optional invite polish / conflict nudge |
| **B — Scorecard** | SCORECARD_REQUEST_SENT → SCORECARD_COMPILED | Collect weighted scorecards from internal teams via an in-app form; consolidate | None (fully deterministic) |
| **C — Internal Alignment** | SCORECARD_COMPILED → INTERNAL_ALIGNMENT | Internal teams align on one position; schedule an internal meeting; extract actions | Insights narration; action extraction |
| **D — Vendor Prep** | INTERNAL_ALIGNMENT → VENDOR_PREP | Vendor brief + pushback responses (the "Supplier Prep Call") | Brief + pushback drafting |
| **E — Meeting** | VENDOR_PREP → POST_MEETING_COMPLETE | Live capture / transcript → minutes + actions | Transcript parsing, minutes |
| **F — Analytics** | any completed cycle | Cross-cycle trends, leadership brief | Leadership brief card |

> **Current implementation status:** Modules A, B, C, D are fully wired to the backend with
> the new SPR/weighted-scorecard design (all changes below). Module E is wired (transcript →
> minutes). **Module F (Analytics) is still frontend-mock** and has NOT been migrated to the
> new weighted scorecard (a known Phase-2 item).

---

## 6. SPR & cycle setup (BRD changes)

### Cycle type = SPR
- The cycle "type" is **SPR (Supplier Performance Review)** — the only option (replaces
  "EGB/QBR"). Quarter (Q1–Q4) + year retained.
- Backend `Cycle`/`CycleCreate` carry `cycle_type: Literal["SPR"]`. Frontend `GovernanceCycle`
  has `cycle_type`; New Cycle modal (`pages/Dashboard.tsx`) shows a Cycle Type dropdown with
  only `SPR — Supplier Performance Review`.

### Meeting plan (which meetings are in this cycle)
- Each cycle has a **`meeting_plan`** — the meetings it contains, chosen/toggled by the VMO on
  the **Overview tab** (editable anytime).
- Types: `INTERNAL_ALIGNMENT`, `SUPPLIER_PREP`, `LEADERSHIP_ALIGNMENT`, `MAIN_GOVERNANCE`.
- **Default enabled:** Internal Alignment + Supplier Prep + Main Governance (Leadership
  Alignment available but off). Internal Alignment calls can be added multiple times & renamed.
- The **Main Governance meeting** is the one scheduled in the **Scheduling tab** via Graph.
  Internal Alignment is scheduled in the **Alignment tab**; the Supplier Prep Call happens in
  the **Vendor Prep tab**.
- Backend: `CycleMeeting` model + `default_meeting_plan()` (`models/scheduling.py`); endpoint
  `PUT /api/cycles/{id}/meeting-plan`. Frontend: `components/modules/scheduling/MeetingPlanPanel.tsx`.

### Invitee classification (on each attendee)
- **Required / Optional** (`attendance_requirement`)
- **LT / Non-LT** (`lt_status`)
- **Shell department** (`shell_department`): IDTM / IDE / SOM / Business / CP / IRM / Other —
  **Internal Stakeholder only** (null for Vendor).
- Editable as **dropdowns** in the attendee table (`components/modules/scheduling/AttendeeRefreshPanel.tsx`).
  **Type** (Internal/Vendor) and **Key** are also dropdowns. **Key is Internal-only** — vendors
  can't be Key (switching to Vendor clears Key + department).

---

## 7. Module A — Scheduling (main governance meeting)

Flow (sub-phases in `pages/CycleDetail.tsx` → `SchedulingTab`):
`attendance_confirmation → attendee_refresh → slot_ranking → invite_approval → confirmation_tracking`.

- **Attendees** — confirm/seed from previous cycle, add/remove, classify (above).
- **Find slots** — real MS Graph `findMeetingTimes` → ranked `SlotProposal`s
  (`api/routes/graph_scheduling.py` → `/scheduling/graph/find-times`). Advances to `AVAILABILITY_COLLECTED`.
- **Invite approval** — full Teams invite preview with an **editable Subject + Body** (the
  edited text is sent as the calendar event body). Approve → `/scheduling/graph/send-invite`
  creates the Teams meeting; advances to `MEETING_SCHEDULED`.
- **Manual override** — instead of a ranked slot, the coordinator can **pick their own time**
  (`ManualScheduleControl.tsx` → `/scheduling/manual-slot` creates an approved slot, then the
  normal Invite Approval → send flow runs, so the editable invite still applies).
- **Reschedule** — after scheduling, `RescheduleControl.tsx` lets the coordinator **find new
  slots or pick a manual time**; it re-books via `/scheduling/graph/schedule-manual` with
  `reschedule=true`, which **updates the existing Teams event in place** (`GraphService.update_event`,
  a PATCH — the join link is preserved).

Key backend files: `services/graph_service.py` (`find_meeting_times`, `create_event` [+`body`],
`update_event`), `api/routes/graph_scheduling.py`, `api/routes/scheduling.py`.

---

## 8. Module B — Scorecard (fully redesigned — the biggest change)

### The new weighted scorecard format
Defined in `backend/app/utils/scorecard_structure.py` and mirrored in
`frontend/src/types/scorecard.types.ts` (`WEIGHTED_SCORECARD_STRUCTURE`):

| Theme (weight) | Measures |
|---|---|
| **Risk & Compliance** (20%) | Patch Management |
| **Performance** (30%) | Resources & Capability · Release & Delivery · Operations |
| **Commercial** (20%) | Pricing · Commercial Excellence · Cost Control |
| **Relationship** (30%) | Flexibility · Stakeholder Engagement · Alignment |

Each measure has a description; each is scored **1–5** with a comment.
**Overall = weighted average of theme averages** (theme avg = mean of its measure averages).

### Who fills it (critical model detail)
- Scorecards are collected **from internal-stakeholder TEAMS only** — **never from the vendor**
  (there is no vendor self-report anywhere).
- **Each "reviewer" is a key internal-stakeholder attendee** = one team = one scorecard.
- The consolidated scorecard's **columns are the teams that submitted**; a blank cell means that
  team marked the measure **Not Applicable** (measures and whole themes can be skipped).
- **Identity is the attendee's stable `attendee_id`, not their email** — this was a deliberate
  fix (email matching broke on typos/edited emails and produced phantom tracker rows).

### Google Forms removed → in-app React form
- New standalone page **`pages/ScorecardForm.tsx`** at route **`/scorecard?cycle=<id>&attendee=<attendee_id>`**
  (registered in `App.tsx` **outside** the app layout, so it has no sidebar and — at prod — no
  access to the main app).
- It's **dark-themed** with a **Zen-VendorPulse** navbar, **two-pane**: the scrollable form on
  the **left**, the **Consolidated Scorecard pinned on the right**.
- The reviewer identity (name/team/email) is **read-only** (loaded from the link's attendee).
- **One submission per reviewer** — a second submit is rejected (HTTP 409) and the page shows
  "Already submitted". On success it shows "Thank you" and **auto-closes the tab**.
- Gmail still **sends the link** (dispatch); only Google *Forms* was removed.

### The two sub-tabs (in `CycleDetail` → `ScorecardTab`)
1. **Scorecard Collection**
   - **Dispatch** (`ScorecardDispatchPanel.tsx`): recipients = **key internal stakeholders**
     (read-only email — no editing); **"Add from attendees"** promotes an internal attendee to
     Key; **"Copy link"** per recipient (for testing without email); **Send** dispatches the
     in-app form link via Gmail (`/api/scorecard/dispatch-inapp`).
   - **Submission Tracker** (`SubmissionTracker.tsx`): polls `/api/scorecard/team-submissions/{id}`
     every 15s, matched by `attendee_id`; shows submitted/pending per team.
2. **Comparison & Finalize**
   - **Individual Team Scorecards** (`TeamScorecardsSection.tsx`): per-team view in the classic
     Theme / Measure / Description / Score / Avg / Weight / Comments layout (team selector).
   - **Consolidated Scorecard** (`WeightedScorecardTable.tsx`): read-only cross-team matrix
     (team columns + AVG + weighted overall).
   - **Final (Adjusted) Scorecard** (`FinalizeScorecardTable.tsx`): a single **admin-editable
     copy** with a note, **Save**, and **Reset to consolidated** (for adjustments after
     alignment/vendor-prep). Persisted separately.
- A **"Proceed to Internal Alignment"** button (shown once dispatched) compiles the scorecard
  (advances `SCORECARD_COMPILED`) and opens the Alignment tab. It **also auto-advances** when the
  tracker shows all key teams submitted.

### Backend (all under prefix `/api/scorecard`, in `api/routes/scorecard_v2.py`)
| Method + path | Purpose |
|---|---|
| `GET /structure` | The weighted structure |
| `GET /form-meta/{cycle_id}?attendee=` | Vendor/quarter + structure + the reviewer's read-only identity |
| `POST /submit` | Store one team's submission (keyed by `attendee_id`; identity snapshotted server-side; one per reviewer) |
| `GET /submitted-check/{cycle_id}?attendee=` | Has this reviewer already submitted? |
| `GET /team-submissions/{cycle_id}` | Tracker: key internal teams + submitted/pending (by `attendee_id`) |
| `GET /weighted/{cycle_id}` | Compiled weighted scorecard (team columns, category avgs, weighted overall) |
| `POST /dispatch-inapp` | Email the in-app form link to recipients via Gmail |
| `GET/POST/DELETE /final/{cycle_id}` | The admin-adjusted final scorecard |
| `weighted_as_compiled(cycle_id)` (fn) | Adapts the weighted scorecard to the legacy "compiled" shape for downstream agents (vendor prep) |

Storage: `backend/data/scorecard_submissions.json`, `backend/data/scorecard_final.json`.
The **old** `api/routes/scorecard.py` (Google Forms era) still exists and is registered but is
**out of the active flow**.

---

## 9. Module C — Internal Alignment

Purpose: the internal teams reconcile into **one agreed position** before facing the vendor.
Because there is **no vendor self-report**, "alignment" is about the **consolidated internal
scores** and where **internal teams disagree**.

- **Alignment Flags** (`AlignmentFlagsPanel.tsx`): **cross-team score divergence** — measures
  where teams differ by ≥ 1 pt (shows the highest/lowest team + spread). Deterministic, computed
  at runtime from submitted scores (`buildFlagsFromWeighted` in `mock/alignment.mock.ts`).
- **AI-Generated Insights** (`ChangeHighlightsPanel.tsx`): runtime insights — low consolidated
  scores (< 3) + notable divergence — from **`POST /api/cycles/{id}/alignment/insights`**. That
  endpoint computes them deterministically from the consolidated scorecard and, **when
  `ENABLE_LLM=true`, narrates them via the improved `ALIGNMENT_SYSTEM_PROMPT`** (figures never
  change — only wording). Frontend falls back to the deterministic client builder.
- **Schedule Internal Alignment Meeting** (`ScheduleAlignmentMeeting.tsx`): internal-only Teams
  meeting. Find slots via Graph **or pick your own time**, plus **Reschedule** (updates the
  existing event in place). Backend: `api/routes/alignment.py` (`/find-times`, `/schedule-meeting`
  with reschedule-in-place via `update_event`, `/meeting`, `/attendees[/add|/remove]`).
- **Notes → actions**: `NotesInputPanel.tsx` → `/alignment/extract-actions` (LLM or keyword
  fallback) produces owner/due-date action items.

> Note: the legacy alignment *agent* endpoints (`/score-diff`, `/flags`, `/what-changed`) still
> reference the old internal-vs-vendor compiled scorecard and are **not used by the UI** — the UI
> uses the weighted builders + `/insights`. Leftover Phase-2 cleanup.

---

## 10. Module D — Vendor Prep

- **Vendor Brief** (`VendorBriefPanel.tsx` → `/api/cycles/{id}/vendor-prep/brief`): generated
  from the **consolidated INTERNAL scorecard** (no vendor self-report). The backend agent
  (`agents/vendor_prep_agent.py`) is wired to the weighted data via
  `dependencies._fetch_weighted_compiled` → `scorecard_v2.weighted_as_compiled`. Prompt/fallback
  reworded to "consolidated internal score". HITL-approved before use.
- **Pushback responses** (`PushbackResponseCards.tsx` → `/vendor-prep/pushback`): 3 stances
  (factual / neutral / escalation). Items flagged **needs-legal-review skip AI entirely**.

---

## 11. Modules E & F

- **E — Meeting** (`components/modules/meeting/*`, `api/routes/meeting_agent.py`): live note
  capture / transcript paste → parse into 5 note types → generate minutes → approve → email via
  Gmail. Works; not affected by the scorecard redesign.
- **F — Analytics** (`pages/Analytics.tsx`): **still 100% frontend-mock** (trends, radar,
  leadership brief). A real `MemoryAgent` + `/api/analytics/*` exist but the UI isn't wired to
  them, and neither is migrated to the new weighted scorecard. **Phase-2 work.**

---

## 12. Data model / storage (JSON in `backend/data/`)

Repository pattern via `repositories/base_repository.py` (whole-file JSON read/write; swap this
one file for SQL later). Key records:

**Cycle** (`cycles.json`): `cycle_id, vendor_id, vendor_name, cycle_type("SPR"), quarter, year,
workflow_state, meeting_plan[], scorecard_dispatched_at, scorecard_dispatched_to,
teams_meeting_url/web_link/event_id/scheduled_at, created_at, updated_at`.

**Attendee** (`attendees.json`): `attendee_id, cycle_id, name, email, gmail, role, organisation,
type(Internal Stakeholder|Vendor), is_key, attendance_requirement, lt_status, shell_department,
invite_status, ...`.

**Scorecard submission** (`scorecard_submissions.json`): `submission_id, cycle_id, attendee_id,
respondent_email/name/team (snapshotted server-side), scores{measure_key:1-5},
comments{measure_key:text}, skipped_measures[], skipped_themes[], submitted_at`.
**One per (cycle_id, attendee_id).**

**Final scorecard** (`scorecard_final.json`): `cycle_id, categories[], overall_score, note, updated_at`.

Others: `meetings.json`, `slot_proposals.json`, `users.json`, `vendors.json`, `agent_runs.json`
(audit log), `google_token.json` (runtime OAuth token, gitignored).

---

## 13. Integrations & how they're toggled

- **Microsoft Graph** (calendar/Teams/mail): gated on `GRAPH_ACCESS_TOKEN` (read fresh per
  request). Dev guard: organiser email must equal the token owner. `find_meeting_times`,
  `create_event` (with `body`), `update_event` (reschedule PATCH), attendance-outreach mail.
- **Gmail API**: sends the scorecard form link (dispatch) and meeting minutes. Needs Google
  OAuth (`/auth/google`). Only Google **Forms** was removed; Gmail send remains.
- **LLM** (`services/llm_service.py`): `ENABLE_LLM` on/off; `AI_PROVIDER=azure|openai|foundry`.
  When off, every AI path uses a deterministic fallback. Only used to *narrate* text.

---

## 14. Repository structure (essentials)

```
VendorPulse-code/
├── backend/app/
│   ├── main.py                         # FastAPI app; registers routers (incl. scorecard_v2)
│   ├── core/workflow_engine.py         # 12-state FSM
│   ├── config.py / dependencies.py     # settings + DI (agent/scorecard fetchers)
│   ├── api/routes/
│   │   ├── scheduling.py               # cycles, attendees, meeting-plan, legacy slots
│   │   ├── graph_scheduling.py         # Graph find-times/send-invite/manual-slot/schedule-manual
│   │   ├── scorecard.py                # LEGACY (Google Forms) — out of flow
│   │   ├── scorecard_v2.py             # NEW weighted scorecard (see §8)
│   │   ├── alignment.py                # extract-actions, find/schedule meeting, /insights
│   │   ├── vendor_prep.py, meeting_agent.py, analytics.py, ...
│   ├── agents/                         # BaseAgent + 6 agents (vendor_prep uses weighted data)
│   ├── services/                       # graph_service, gmail_service, llm_service, ...
│   ├── models/scheduling.py            # Cycle, CycleAttendee, CycleMeeting, requests
│   └── utils/
│       ├── scorecard_structure.py      # WEIGHTED_SCORECARD_STRUCTURE (backend)
│       └── prompts.py                  # all system prompts (ALIGNMENT/VENDOR_PREP/... )
│   └── data/*.json                     # JSON datastore
└── frontend/src/
    ├── App.tsx                         # routes; /scorecard is standalone (no layout)
    ├── pages/
    │   ├── Dashboard.tsx               # cycle list + New Cycle modal (SPR)
    │   ├── CycleDetail.tsx             # tabbed workspace: Overview/Scheduling/Scorecard/Alignment/Vendor-Prep/Meeting/Actions
    │   ├── ScorecardForm.tsx           # standalone in-app scorecard form (dark, 2-pane)
    │   └── Analytics.tsx               # mock (Phase 2)
    ├── components/modules/
    │   ├── scheduling/                 # AttendeeRefreshPanel, SlotRankingPanel, InviteApprovalPanel,
    │   │                               #   ManualScheduleControl, RescheduleControl, MeetingPlanPanel, ConfirmationTracker
    │   ├── scorecard/                  # ScorecardDispatchPanel, SubmissionTracker,
    │   │                               #   WeightedScorecardTable, FinalizeScorecardTable, TeamScorecardsSection
    │   ├── alignment/                  # ChangeHighlightsPanel, AlignmentFlagsPanel, ScheduleAlignmentMeeting, NotesInputPanel
    │   ├── vendor-prep/ · meeting/ · analytics/
    ├── lib/                            # api.ts + typed wrappers: schedulingApi, scorecardApi, alignmentApi, vendorPrepApi, meetingApi
    ├── store/                          # useCycleStore (workflow, forward-only), useUIStore
    ├── types/                          # cycle, scheduling, scorecard (incl. WEIGHTED_*), alignment, ...
    └── utils/constants.ts              # WORKFLOW_STATES, TAB_MIN_STATE_INDEX, POLLING_INTERVALS
```

---

## 15. Change log — what was built for the SPR/BRD alignment (this workstream)

**Cycle & attendees**
- Cycle type → **SPR** (only option), quarter/year kept; New Cycle modal + card label updated.
- **Meeting plan** per cycle (toggle/rename/add on Overview) + `PUT /meeting-plan`.
- Invitee classification: **Required/Optional, LT/Non-LT, Shell department**; Type & Key as
  **dropdowns**; **Key is internal-only**.

**Scheduling (Module A)**
- **Manual override** (pick own time) that still routes through the editable Invite Approval.
- **Reschedule** (find new slot / manual) — updates the existing Teams event in place.
- **Editable invite Subject + Body** in Invite Approval; body is set on the Graph event.

**Scorecard (Module B) — full redesign**
- New **weighted 10-measure structure** (4 themes, weights 20/30/20/30).
- **Removed Google Forms** → in-app React form (`/scorecard`), dark-themed, Zen-VendorPulse
  navbar, two-pane (form + pinned consolidated), read-only reviewer identity.
- **Collected from internal-stakeholder teams only** (no vendor); submissions keyed by
  **`attendee_id`**; **one submission per reviewer**; **skip measure/whole theme**; **auto-close**
  on submit.
- **Two sub-tabs** (Collection / Comparison & Finalize); dispatch with editable-recipients =
  key internal, add-from-attendees, **copy-link**; submission tracker fixed to match by
  `attendee_id` (no more phantom rows), 15s poll.
- **Consolidated** (read-only) + **Individual Team Scorecards** + **Final editable** table.
- **Proceed to Internal Alignment** (fixes the bug where Alignment never unlocked because the old
  code required a *vendor* respondent to reach `SCORECARD_COMPILED`).

**Alignment (Module C)**
- Reworked to the consolidated internal scorecard: **cross-team divergence flags** + **runtime
  insights** (LLM-narrated via `/alignment/insights` + improved `ALIGNMENT_SYSTEM_PROMPT`).
- Removed the misleading "internal vs vendor" comparison + the Consolidated Scorecard block.
- Alignment meeting scheduling gained **manual time + reschedule**; agenda text updated.

**Vendor Prep (Module D)**
- Vendor brief now built from the **consolidated internal** scorecard (adapter
  `weighted_as_compiled`); prompt/fallback reworded (no vendor self-report).

---

## 16. Known gaps / TODO (for the next session)

1. **Module F (Analytics)** — still mock; not wired to the backend or the weighted scorecard.
2. **Legacy alignment-agent endpoints** (`/score-diff`, `/flags`, `/what-changed`) still use the
   old internal-vs-vendor compiled shape; UI doesn't use them — clean up or migrate.
3. **`tsconfig.app.json`** `ignoreDeprecations: "6.0"` blocks `npm run build`'s `tsc` step
   (one-line fix to `"5.0"`); plus a handful of pre-existing `noUnusedLocals` errors in
   stub/legacy files.
4. **JSON persistence, no auth, no tests** — the platform is demo/pilot-grade. Production plan
   (from the BRD) calls for Postgres, Microsoft Graph `Mail.Send` shared mailbox (replacing
   Gmail), OTP/JWT access control, and RBAC — **not yet implemented** (deliberately deferred:
   "execute the flow first").
5. **Old `scorecard.py` (Google Forms)** router is still registered though unused — can be retired.

---

## 17. Gotchas a new session must know

- **Never reintroduce vendor scorecards.** Scorecards are internal-team-only. Anything comparing
  "internal vs vendor" is legacy.
- **Scorecard identity = `attendee_id`**, not email (emails are typo-prone and editable).
- **Consolidated columns = key internal attendees who submitted.** If a cycle shows nothing in
  Scorecard/Alignment, check that internal stakeholders are marked **Key** and have submitted.
- **LLM is off by default** — insights/briefs/minutes fall back to deterministic text; that's
  expected, not a bug.
- **Graph/Gmail need real tokens** — manual-schedule, reschedule, dispatch and minutes-send call
  live Microsoft Graph / Gmail. Use **Copy link** on the dispatch panel to test the scorecard
  flow without sending email.
- **Forward-only workflow** — you can't move a cycle backwards; correcting means a new cycle.
- Work is on branch **`shell-feature`** (currently uncommitted in the working tree during active
  development).
