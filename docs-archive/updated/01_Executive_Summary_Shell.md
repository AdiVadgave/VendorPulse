# VendorPulse for Shell — Executive Summary

> **Version:** 2.0 | **Date:** 2026-06-03
> **Audience:** Shell VP Sponsor, Shell IT VMO leadership, Zensar VP / Delivery Director
> **Read-time:** 8 minutes

---

## 1. The opportunity in one paragraph

Shell currently runs vendor governance cycles (QBRs / EGBs) as a largely manual exercise — coordinators chase availability over email, scorecards arrive piecemeal across inboxes, alignment meetings recap the same recurring issues, and post-meeting minutes are inconsistent quarter on quarter. **VendorPulse is an agentic AI platform that automates the orchestration end-to-end** while keeping every outbound action (emails, invites, briefs, minutes) under human approval. The proof-of-concept already demonstrates the six-stage workflow against a Gmail/Google-Forms-based mock environment. **This document set scopes the work to lift that POC into a Shell-grade production deployment** hosted in Shell's Azure tenant, integrated with Outlook + Teams, and removed entirely from Google's stack.

---

## 2. What we are proposing

A **single-tenant production deployment** of VendorPulse inside Shell's Microsoft 365 / Azure estate:

```
┌─────────────────────────────────────────────────────────────────┐
│                      Shell Azure Subscription                    │
│                                                                  │
│   Shell User → Entra ID SSO → App Service (FastAPI + React)     │
│                                  │                               │
│                                  ├──► Azure Key Vault (secrets)  │
│                                  ├──► Azure PostgreSQL (data)    │
│                                  ├──► App Insights (telemetry)   │
│                                  └──► Log Analytics (audit)      │
│                                  │                               │
│   ┌──────────────────────────────┼───────────────────────────┐  │
│   │      Microsoft Graph (Shell tenant, app-only)             │  │
│   │   • Calendar (findMeetingTimes, events)                   │  │
│   │   • Mail (sendMail from service mailbox)                  │  │
│   │   • Teams meetings (onlineMeeting provider)               │  │
│   │   • Users (directory lookup)                              │  │
│   └────────────────────────────────────────────────────────────┘ │
│                                  │                               │
└──────────────────────────────────┼───────────────────────────────┘
                                   │
                    ┌──────────────▼────────────────┐
                    │   LLM provider                 │
                    │   (Claude API via Anthropic    │
                    │    OR Azure OpenAI — TBD §08)  │
                    └────────────────────────────────┘
```

**No data leaves Shell's tenant except** the prompts and responses sent to the LLM provider. Shell's choice of provider (Anthropic API vs. Azure OpenAI) controls where that data lands — both options keep data out of training and both are negotiable on data residency.

---

## 3. What changes vs. the POC

We are not extending the POC. We are **rebuilding for production**. Three deliberate consolidations:

1. **Email delivery moves off Gmail.** All outbound email — scorecard requests, reminders, meeting invites, minutes distribution — uses Microsoft Graph `sendMail` from a dedicated Shell service mailbox. **Single identity, single audit trail, no Google compliance overhead.**
2. **Scorecard collection moves off Google Forms.** Two options on the table (see §07): Microsoft Forms via Graph, or a native in-app scorecard. Our recommendation is **native in-app** — eliminates external dependency, simplifies attribution, and gives Shell control over the schema.
3. **Authentication moves to Shell SSO.** Today the POC has no auth. Production uses Entra ID OIDC with role-based access control mapped to Shell groups (VMO coordinators, executive sponsors, finance, etc.).

These are the only architectural changes. The six-agent state machine, the human-in-the-loop approval gate, the deterministic-vs-AI separation, the audit table — all unchanged.

---

## 4. What Shell gets

| Capability | Coordinator time saved per cycle (estimate) | Quality improvement |
|------------|---------------------------------------------|---------------------|
| Attendee refresh + RSVP tracking | ~3 hours | Fewer no-shows; replacement tracking; cycle-over-cycle continuity |
| Slot ranking + Teams invite | ~2 hours | Deterministic, organiser-weighted ranking — no more "Doodle then panic" |
| Scorecard dispatch + reminder escalation | ~4 hours | Personalised emails, escalating reminders, automatic outlier flagging |
| Score compilation + outlier detection | ~3 hours | Statistical outlier flagging, missing-submission tracking |
| Alignment doc + face-off model | ~2 hours | Cycle-over-cycle deltas surfaced automatically |
| Vendor brief + pushback handling | ~4 hours | Three response stances per pushback item, legal-flag detection |
| Meeting minutes + action extraction | ~3 hours | Consistent format, every action item captured and tracked |
| Leadership brief / analytics | ~2 hours | Cross-cycle trends, recurring issues, executive-ready summary |
| **Per cycle, per vendor** | **~23 hours** | **Reduction in variance across coordinators is the bigger win** |

For Shell's vendor portfolio (we assume ~15–25 vendors on EGB QBRs quarterly — to confirm), this is **on the order of 400–600 coordinator hours saved per quarter** with materially better consistency in governance output.

---

## 5. Effort and timeline (summary — full detail in §11)

| Week | Duration | Outcome |
|------|----------|---------|
| **Week 1 — Foundations, Migration & Design Alignment** | 5 days | Day-2 design checkpoint with Shell; production substrate up (Postgres, Entra ID auth, App Service); Gmail/Forms removed; Module A working end-to-end against real Graph |
| **Week 2 — Functional completion** | 5 days | All six agents (A–F) working; scorecard collection per Shell's chosen mode (in-app form / Excel attachment / other); Shell-themed UI and Outlook-friendly emails; admin module complete; code freeze Friday |
| **Week 3 — Hardening, UAT, Pilot Go-Live** | 5 days | UAT with 3 named coordinators; defect fixes; security sign-off; production cutover; one real pilot vendor cycle running; coordinator training; handover to Shell IT Ops |
| **Total** | **~3 weeks** (15 working days) | Production-grade, Shell-owned, BAU-handed-over with a 4-week defect-warranty period |

This is a **compressed sprint-paced delivery**, not a phased programme. It assumes a team of **1 Solution Architect, 1 Tech Lead, 2 Backend engineers, 2 Frontend engineers, 1 QA, 1 DevOps Engineer, 1 Delivery Manager (all 100% allocated for the 3 weeks)**, with Shell providing **1 VMO product owner, 1 IT architecture liaison, 1 IT security liaison, 1 Entra ID admin, 1 Azure subscription owner** — all available daily for the duration.

The compressed shape is only possible because Shell-side access provisioning (Entra ID app registrations, Azure subscription, service mailbox, LLM contract, etc.) is **pre-positioned during contract negotiation** and is confirmed in place on Day 1. See [§11 Productionization Roadmap](11_Productionization_Roadmap_Shell.md) for the day-by-day plan and [§08 Dependencies & Access](08_Dependencies_and_Access_Requirements.md) for the full pre-mobilisation checklist.

---

## 6. The five questions a sponsor will ask

### Q1. "Does any Shell data leave Shell's tenant?"

**Only the data sent to the LLM provider.** Everything else — emails, scorecards, minutes, vendor profiles, audit records, source code — stays inside Shell's Azure subscription. The LLM data path is unavoidable for an AI product and is governed by Shell's choice of provider:

- **Anthropic API direct** — data goes to Anthropic; standard zero-data-retention enterprise terms available; **no training on customer data**.
- **Azure OpenAI** — data stays inside Azure; Microsoft contractual no-training; supports EU/UK regional residency.

Shell's IT Security and Privacy teams own this choice. See [§08](08_Dependencies_and_Access_Requirements.md).

### Q2. "What happens if Microsoft 365 has an outage?"

The app continues running. Scheduled actions queue. Manual workflows fall back to the in-app forms (which do not depend on Graph). Once Graph recovers, the queue drains automatically. See [§10](10_Expected_Errors_and_Considerations.md#5-graph-throttling--service-availability).

### Q3. "What happens if the LLM provider has an outage?"

Six agents, six failure modes. All six fail **soft** — every agent returns `status = failed` with an error message; the workflow does not advance; the coordinator sees a "retry" button; no external communications go out. The state machine is **deterministic and operates without LLM** — only the human-readable text (briefs, minutes, summaries) is AI-generated and can be retried. See [§10](10_Expected_Errors_and_Considerations.md#1-llm-provider-failure).

### Q4. "How do we know the AI didn't say something stupid to a vendor?"

**Every outbound communication requires human approval.** The agent generates content; the coordinator reviews and approves in the UI; only then is anything sent. The agent never has direct send authority. The `agent_runs` audit table captures every prompt, every tool call, every output — even rejected ones — for full traceability.

### Q5. "Can Shell take this over when Zensar's engagement ends?"

Yes. The codebase, infrastructure-as-code (Bicep), CI/CD pipelines, runbooks, and on-call documentation are all Shell-owned and Shell-hosted from Day 1. Handover happens at the end of Week 3 with a 4-week defect-warranty period during which Zensar fixes P1/P2 issues; Shell IT Ops handles BAU from go-live and Zensar is on escalation only.

---

## 7. The five risks we have flagged for Shell

Detail in [§09](09_Assumptions_and_Risks.md). Headlines:

1. **Entra ID app registration with `Mail.Send` + `Calendars.ReadWrite` (app-only)** requires Shell admin consent and is high-privilege. Shell IT Security will want to review scopes, conditional-access posture, and the service account's mailbox access policy. **Long-lead-time approval (3–6 weeks). Must be complete during pre-mobilisation — admin consent in place on Day 1 is a non-negotiable day-zero prerequisite for the 3-week plan.**
2. **LLM provider commercial relationship.** Whether Shell procures Anthropic API directly or Azure OpenAI, there is a contract to put in place. Shell Procurement involvement from week 1.
3. **Vendor performance terminology and scorecard categories** in the POC reflect a generic vendor model. Shell's actual scorecard taxonomy (Risk & Compliance, Performance, Commercial, Relationship + sub-parameters) needs to be confirmed and locked early. **This shapes the data model.**
4. **External attendees on Teams meetings.** Shell's external collaboration policy may restrict guest-invite behaviour from a service mailbox. Needs Shell IT to confirm or carve out a policy.
5. **PII / sensitive data in `agent_runs` audit log.** The audit captures full LLM prompts, which include vendor names and individual scorecard comments. **Retention policy and access controls on this table need Shell Privacy sign-off.**

---

## 8. Decision points for Shell

Before Day 1 of delivery, Shell needs to confirm the following. Most of these have a recommended answer from us; Shell can override. Any unresolved item at Day 1 forces a re-baseline conversation.

| # | Decision | Our recommendation | Reason |
|---|----------|--------------------|--------|
| D1 | LLM provider | **Anthropic Claude via Anthropic API**, with negotiated enterprise terms (no training, zero retention) | Best-in-class tool-calling reliability for the agentic pattern; the POC has been built and tuned against Claude |
| D2 | Scorecard collection | **Native in-app form** | Removes external dependency; gives Shell control over the schema; better UX |
| D3 | Hosting region | **Azure West Europe** (UK South as alternative) | Default Shell EMEA workload region; data residency in EU |
| D4 | Service account model | **Dedicated `vendorpulse-svc@shell.com` mailbox** with app-only access | Audit-clean; survives staff turnover; isolated blast radius |
| D5 | Database | **Azure Database for PostgreSQL — Flexible Server** | Managed; Shell-standard for stateful workloads; pgvector available for future embedding-based search |
| D6 | Authentication | **Entra ID OIDC** with group-mapped roles | Shell-standard SSO; zero password management |
| D7 | CI/CD | **Azure DevOps** (or Shell's GitHub Enterprise if preferred) | Shell-standard for application delivery |

We will request a decision workshop during pre-mobilisation (before Day 1) to lock these. The remaining items are confirmed at the **Day-2 design alignment checkpoint** (see [§11 Productionization Roadmap](11_Productionization_Roadmap_Shell.md)).

---

## 9. What we are NOT doing in this phase

To keep scope honest:

- **Not building a Shell-wide vendor master integration.** VendorPulse maintains its own vendor list, seeded from Shell-provided CSV/Excel for the pilot. A SAP Ariba / Coupa integration is a follow-on phase.
- **Not building a contract-management feature.** VendorPulse references contract terms in the alignment/brief stage but does not store contracts.
- **Not building a finance / spend integration.** Spend data is referenced manually in scorecards; an SAP integration is out of scope for the first release.
- **Not building a mobile app.** Web-only, optimised for Shell's standard desktop browser stack.
- **Not multi-language at launch.** English UI only; Phase 2 candidate.

---

## 10. Recommendation

Proceed with the engagement on the proposed phased plan. The architectural shift from POC to Shell production is **moderate, not radical** — the workflow engine, agent pattern, and deterministic/AI separation are all production-suitable as designed. The work is concentrated in three areas: (a) **removing Gmail + Forms**, (b) **adding Entra ID + Key Vault + Postgres + App Service** as the production substrate, and (c) **hardening for Shell-scale operations** (observability, audit, on-call). All three are well-understood activities with no novel risk.

The two items that need the most attention from Shell's side are **Entra ID app registration approval** and **LLM provider procurement**, both of which are long-lead-time items that must start at week 1.

---

*Reviewed by Delivery Manager, Solution Architect, and VP — Zensar VendorPulse practice — 2026-06-03.*
