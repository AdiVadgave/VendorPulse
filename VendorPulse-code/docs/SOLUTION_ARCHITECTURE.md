# VendorPulse — Solution Architecture

> **Document type:** Solution Architecture
> **System:** VendorPulse — Vendor Governance Cycle Automation Platform
> **Audience:** Product owners, business stakeholders, VMO leadership, solution reviewers
> **Companion docs:** [Technical Architecture](TECHNICAL_ARCHITECTURE.md) · [Deployment Architecture](DEPLOYMENT_ARCHITECTURE.md) · [Client Review](CLIENT_REVIEW.md)

### Document Control

| Field | Value |
|-------|-------|
| Version | 0.2 (post client review) |
| Date | 2026-06-03 |
| Author | Vendor (delivery team) |
| Reviewed by | Client Enterprise Architecture & Security Review Board |
| Status | Draft — conditional acceptance; see [Client Review](CLIENT_REVIEW.md) |
| Classification | Confidential |

---

## 1. Executive Summary

**VendorPulse** is a vendor-governance automation platform that orchestrates **Quarterly Business Reviews (QBRs) / Executive Governance Board (EGB) meetings** between a customer's vendor-management office (VMO) and its strategic vendors. It guides a vendor review end-to-end: from cycle creation, through scheduling, scorecard collection, internal alignment, vendor-meeting preparation, the live meeting, and finally post-meeting analytics.

The guiding principle is **"deterministic core, AI at the edges"**:

- **Business-critical logic is deterministic** — workflow transitions, slot ranking, scorecard validation, and outlier detection are plain, testable code with no AI in the decision path.
- **AI is used only to draft human-readable text** — action items, meeting minutes, vendor briefs, pushback responses, leadership summaries.
- **Every AI-generated artifact passes a human-approval gate** before any external action (email, calendar invite) is taken.

The result is a repeatable, auditable governance process that removes manual coordination work while keeping a human firmly in control of every outbound action.

---

## 2. Business Context & Goals

| Concern | Description |
|---------|-------------|
| **Problem** | QBR/EGB governance cycles are manual, slow, and inconsistent — coordinating schedules across many stakeholders, chasing scorecard inputs, reconciling score changes, preparing for the vendor meeting, and writing up minutes and actions. |
| **Solution** | A guided, state-machine-driven workspace that automates the mechanical steps and uses AI to draft the written artifacts, while a human approves every outbound action. |
| **Business goals** | Faster cycle turnaround · consistent governance across vendors · complete audit trail · less coordinator effort · better-prepared vendor meetings · data-driven vendor trajectory insights. |
| **Non-goals** | VendorPulse does **not** auto-decide vendor outcomes, auto-send communications without approval, or replace human judgment on scores. |

---

## 3. Stakeholders & Actors

| Actor | Role in the solution |
|-------|----------------------|
| **VMO Coordinator / Procurement Lead** | Primary driver. Creates the cycle, triggers each module, reviews and approves all AI output, advances the workflow. |
| **Internal stakeholders** | Finance, Legal, Security & Compliance, Engineering, Operations — submit scorecards, attend alignment, attend the vendor meeting. |
| **Executive Sponsor (EGB Chair)** | Mandatory attendee; their availability is a hard scheduling constraint. |
| **Vendor (e.g., Zensar)** | External party — receives meeting invites and minutes; subject of scorecards and prep. |
| **VendorPulse AI agents** | Generate drafts (briefs, minutes, summaries, action items) for human review. |
| **System / integrations** | Microsoft Graph (calendar, Teams, **Outlook mail**), Azure OpenAI (text), and a scorecard-collection form. |

---

## 4. Governance Cycle — The Workflow

The cycle is a **linear, forward-only state machine** — no skipping, no rollback. This is the backbone of the whole solution: it guarantees that every cycle follows the same governed sequence and that out-of-order actions are impossible.

```
CYCLE_CREATED
   → ATTENDEE_REFRESH_SENT
   → AVAILABILITY_COLLECTED
   → MEETING_SCHEDULED
   → SCORECARD_REQUEST_SENT
   → SCORECARD_COLLECTION
   → SCORECARD_COMPILED
   → INTERNAL_ALIGNMENT
   → VENDOR_PREP
   → MEETING_IN_PROGRESS
   → POST_MEETING_COMPLETE
   → ARCHIVED
```

Invalid transitions are rejected (surfaced as HTTP 409); the UI disables actions that are not valid for the current state.

---

## 5. Functional Modules (A–F)

VendorPulse is organized into six functional modules, each mapping to a phase of the cycle.

### Module A — Scheduling
**States:** `CYCLE_CREATED` → `MEETING_SCHEDULED`
- Confirm the attendee list for the cycle.
- Collect availability and discover candidate meeting slots (via calendar integration).
- **Rank slots deterministically** (attendance, conflicts, confidence, exec-sponsor presence, timezone fit).
- Present top-ranked slots; on approval, create a **Microsoft Teams** meeting and send invites.
- **AI (optional):** polish invite text, write a one-line rationale per slot, draft a polite conflict-nudge to attendees with clashes.

### Module B — Scorecard
**States:** `SCORECARD_REQUEST_SENT` → `SCORECARD_COMPILED`
- Dispatch a scorecard request to each reviewer (email + form link).
- Poll and collect responses; deduplicate; map to a structured model.
- **Validate and compile** scores; **detect outliers** — all deterministic.
- **AI role:** none (intentionally fully deterministic for trust).

**Scorecard model** — reviewers rate the vendor **1–5** across four categories:
- **Risk & Compliance** — Release/Patch Mgmt, Security Risk Mgmt, Audit & Compliance
- **Performance** — Delivery Timeliness, Quality, SLA Adherence, Resource Capability, Operational Efficiency
- **Commercial** — Pricing Competitiveness, Contract Compliance, Cost Control, Billing Accuracy
- **Relationship** — Communication, Stakeholder Engagement, Responsiveness, Collaboration & Alignment

### Module C — Internal Alignment
**States:** `SCORECARD_COMPILED` → `INTERNAL_ALIGNMENT`
- Compare current scores against the prior cycle; **flag notable changes**.
- Capture internal meeting notes and **extract action items** from them.
- **AI role:** extract action items from notes; summarize "what changed" since last cycle.

### Module D — Vendor Prep
**States:** `INTERNAL_ALIGNMENT` → `VENDOR_PREP`
- Generate a **vendor brief** for the upcoming meeting.
- For each anticipated vendor pushback, draft **three response options**.
- Track unresolved items carried into the meeting.
- **AI role:** generate the brief; draft pushback responses (human-approved before use).

### Module E — Meeting
**States:** `VENDOR_PREP` → `POST_MEETING_COMPLETE`
- Capture live notes during the meeting.
- **Parse the transcript** into structured notes (Question / Objection / Decision / Appreciation / Action).
- **Generate formal minutes** and **extract action items**; email minutes to attendees.
- **AI role:** transcript parsing, minutes generation, action extraction.

### Module F — Analytics
**Scope:** any completed cycle
- Multi-cycle score trends, **recurring-issue detection**, cross-vendor comparison, vendor trajectory, stakeholder-vs-vendor gap.
- **AI role:** generate a concise **leadership brief card** summarizing the vendor's standing.

| Module | States | AI does |
|--------|--------|---------|
| A — Scheduling | CYCLE_CREATED → MEETING_SCHEDULED | Polish invite text; slot rationale; conflict nudge |
| B — Scorecard | SCORECARD_REQUEST_SENT → SCORECARD_COMPILED | Nothing (deterministic) |
| C — Alignment | SCORECARD_COMPILED → INTERNAL_ALIGNMENT | Extract actions; summarize changes |
| D — Vendor Prep | INTERNAL_ALIGNMENT → VENDOR_PREP | Generate brief; draft pushback responses |
| E — Meeting | VENDOR_PREP → POST_MEETING_COMPLETE | Parse transcript; minutes; extract actions |
| F — Analytics | Any completed cycle | Leadership brief card |

---

## 6. Key Solution Principles

1. **Deterministic core, AI at the edges.** Anything that affects a governance decision (ranking, validation, transitions, outliers) is code. AI only writes prose.
2. **Human-in-the-loop approval.** All AI output (invites, briefs, minutes, responses) is shown in an approval panel; nothing leaves the system without a human "approve."
3. **Forward-only governance.** The state machine guarantees a consistent, non-skippable process for every vendor and every cycle.
4. **Full auditability.** Every agent run and every action is logged with inputs/outputs, giving a complete trail of who/what did what.
5. **Graceful degradation.** If AI is turned off, every module still works via a deterministic fallback — the platform never hard-depends on the LLM to function.
6. **Single source of truth for people & calendar.** Consolidating on Microsoft (Graph) for identity, calendar, Teams, and (after migration) Outlook mail.

---

## 7. End-to-End User Journey (Happy Path)

1. **Create cycle** for a vendor + quarter → `CYCLE_CREATED`.
2. **Confirm attendees** and request availability → `ATTENDEE_REFRESH_SENT` → `AVAILABILITY_COLLECTED`.
3. **Review ranked slots**, approve one → Teams meeting created + invite sent → `MEETING_SCHEDULED`.
4. **Send scorecard requests**; reviewers submit; responses polled → `SCORECARD_REQUEST_SENT` → `SCORECARD_COLLECTION` → `SCORECARD_COMPILED`.
5. **Internal alignment** — review score changes, capture notes, AI extracts actions → `INTERNAL_ALIGNMENT`.
6. **Vendor prep** — AI drafts brief + pushback responses, coordinator approves → `VENDOR_PREP`.
7. **Run the meeting** — capture notes / parse transcript → `MEETING_IN_PROGRESS`.
8. **Post-meeting** — AI drafts minutes, coordinator approves, minutes emailed → `POST_MEETING_COMPLETE`.
9. **Archive**; data feeds **Analytics** for trend and trajectory insight → `ARCHIVED`.

---

## 8. External Capabilities the Solution Depends On

| Capability | Provider | Purpose | Notes |
|-----------|----------|---------|-------|
| Meeting scheduling & Teams meetings | **Microsoft Graph** | Find common availability, create online meeting, send invite | Active |
| Email (scorecard request, minutes) | **Microsoft Outlook (via Graph)** | Outbound governance emails | **Target & intended channel.** See note below. |
| Scorecard collection | **Form-based collection** | Capture 1–5 ratings + comments | Microsoft Forms / native preferred on client tenant |
| Text generation | **Azure OpenAI** | Minutes, briefs, summaries, action extraction | Text only; human-gated |

> **📌 Email channel — Outlook is the architecture.** VendorPulse is designed to send all governance email through **Microsoft Outlook** using the same Microsoft Graph identity already used for calendar and Teams. This keeps the platform on a **single Microsoft identity** for people, calendar, meetings, and mail.
>
> **Why Gmail appears in the current build:** our present development tenant does **not** yet grant the Microsoft Graph mail permissions (`Mail.Send`), so Gmail is wired in as a **temporary fallback** purely to demonstrate the email flow. **When VendorPulse is deployed on the client system, the required Outlook/Graph permissions will be granted** and Outlook becomes the live email channel. Gmail and the associated Google dependency are then removed.

---

## 9. Constraints, Risks & Assumptions

| Type | Item |
|------|------|
| **Constraint** | All external communication requires explicit human approval. |
| **Constraint** | Workflow is forward-only; correcting a mistake means a new cycle, not a rollback. |
| **Risk** | Outlook mail requires Microsoft Graph `Mail.Send` permission + tenant admin consent — **not available in our current dev tenant** (hence the Gmail fallback). Resolved once deployed on the client system. |
| **Risk** | AI output quality — mitigated by human approval and deterministic fallbacks. |
| **Assumption** | Reviewers and attendees are within (or invitable from) the customer's Microsoft 365 tenant. |
| **Assumption** | The client tenant will grant Outlook/Graph mail permissions and designate a service mailbox for automated sends. |

---

## 10. Demo / Reference Data

Three vendors with deliberate trajectories are seeded for analytics: **NovaTech** (improving), **CoreSystems** (declining), **Meridian IT** (stable), plus pre-seeded historical cycles. Sample governance notes reference **Zensar** as the vendor and **Shell** as the customer.

---

## 11. Open Questions / Client Decisions *(added per client review)*

These are decisions the client owns before the solution can go to production; tracked in the [Client Review](CLIENT_REVIEW.md) RACI.

| # | Decision | Owner | Needed by |
|---|----------|-------|-----------|
| 1 | Grant Microsoft Graph **`Mail.Send`** + admin consent (enables Outlook email) | Client (M365 admin) | Integration testing |
| 2 | **Delegated vs app-only** auth + designate **service mailbox** | Client + Vendor | Integration testing |
| 3 | Azure OpenAI **region/residency** + data-processing (no-training) terms for **commercially sensitive** notes | Client (Security/Legal) | Before any real data is processed |
| 4 | **Scorecard form** platform — Microsoft Forms vs native | Client | UAT |
| 5 | **NFR targets** — availability, latency, RPO/RTO | Client + Vendor | NFR workshop |
| 6 | Identity provider (SSO) + **RBAC** roles (VMO vs stakeholder) | Client + Vendor | Before production |

> **Compliance note:** governance notes contain commercially sensitive and personal data. Until decision #3 is confirmed, **no real customer/vendor data should be processed** through the LLM.

---

## 12. Summary

VendorPulse turns a manual, inconsistent vendor-governance process into a guided, auditable, AI-assisted workflow — without ceding control of decisions or communications to the AI. The deterministic state machine guarantees consistency; the human-approval gate guarantees safety; the integrations (Microsoft-first, consolidating on Outlook) deliver the scheduling and communication automation that removes the coordinator's manual burden.

For implementation detail see the **[Technical Architecture](TECHNICAL_ARCHITECTURE.md)**; for environments, identity, and rollout see the **[Deployment Architecture](DEPLOYMENT_ARCHITECTURE.md)**.
