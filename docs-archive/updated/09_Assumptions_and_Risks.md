# Assumptions & Risks Register

> **Version:** 2.0 | **Date:** 2026-06-03
> **Audience:** Shell PMO, Shell Risk, Zensar Delivery Manager, Zensar VP
> **Purpose:** Make explicit what we are assuming, what we are depending on, and what could go wrong

---

## How to read this document

Three sections:

1. **Assumptions** — things we believe to be true that, if wrong, change the plan
2. **Dependencies** — things we need from Shell or third parties that are NOT yet confirmed
3. **Risks** — what could go wrong, with likelihood, impact, owner, and mitigation

Every item has an **owner** (the person or team responsible for confirming or mitigating) and a **resolve-by date** (when it must be settled). Items unresolved past their date escalate to the steering committee.

---

## 1. Assumptions

| # | Assumption | If wrong, what changes | Owner | Resolve by |
|---|-----------|------------------------|-------|------------|
| AS-01 | Shell wants a single-tenant deployment dedicated to Shell — no multi-tenant SaaS | Architecture is materially simpler. If multi-tenant ever needed, design changes (row-level filtering, per-tenant config, per-tenant LLM keys) | Shell IT Architecture | Phase 0 week 1 |
| AS-02 | Shell will use Microsoft 365 (Entra ID, Outlook, Teams) — no Google Workspace components | All Google code removed; no Google integration needed | Shell IT | Phase 0 week 1 |
| AS-03 | Shell's Outlook estate supports modern Graph endpoints (`/findMeetingTimes`, `/events`, `/sendMail`, OnlineMeetings) | Standard for any reasonably current Microsoft 365 tenant; very unlikely to be wrong | Shell Messaging | Phase 0 week 2 |
| AS-04 | The VMO coordinator role exists and Shell can name 3–5 named coordinators for the pilot | Pilot launch and UAT require named users; without them, no UAT | Shell VMO | Phase 0 week 2 |
| AS-05 | The 4-category × 16-parameter scorecard taxonomy embedded in the POC is materially correct for Shell | Data model adjusts; small UI changes; ~1 week impact if entirely different | Shell VMO | Phase 0 week 2 |
| AS-06 | Vendor list for the pilot is provided as CSV/Excel — no SAP/Ariba integration required for first release | If integration required, +4–8 weeks for SAP connectivity | Shell VMO | Phase 0 week 2 |
| AS-07 | Shell users have Edge or Chrome browsers (no IE 11 support) | Frontend uses modern React + Tailwind 4; IE 11 would be a major rework | Shell IT Workplace | Phase 0 week 2 |
| AS-08 | A meeting transcript ingestion feature is **not required** in the first release | If required, Teams call-recording consent flow needed (~2 weeks additional) | Shell VMO + IT Security | Phase 0 week 2 |
| AS-09 | The service mailbox `vendorpulse-svc@shell.com` is acceptable as the "from" identity for vendor-facing emails | If vendors should see a specific person's mailbox, organiser delegation pattern needed (~1 week change) | Shell Brand + VMO | Phase 0 week 1 |
| AS-10 | Shell accepts certificate-based app credential (vs client secret) | This is the typical Shell standard; very unlikely to be wrong | Shell IT Security | Phase 0 week 1 |
| AS-11 | Shell will accept the Anthropic data-protection commitments in their enterprise DPA | If Anthropic terms unacceptable, fallback is Azure OpenAI (no change to delivery timeline but adds week of provider switch) | Shell Legal + Procurement | Phase 0 week 3 |
| AS-12 | Pilot can run with one vendor and the full feature set, not phased capability rollout | Phased rollout adds 4–6 weeks of integration testing | Shell VMO | Phase 0 week 2 |
| AS-13 | English UI only at launch; multi-language is Phase 2 | Multi-language would require i18n framework adoption (~2 weeks) | Shell VMO | Phase 0 week 1 |
| AS-14 | Mobile experience is "responsive web" not native app | Native app is significant additional scope (out of contract) | Shell VMO | Phase 0 week 1 |
| AS-15 | Shell IT Operations will accept 99.5% SLA during business hours (not 99.9% Tier 1) | Tier 1 SLA would require multi-region active-active deployment (~+$15k/month, +6 weeks) | Shell IT Ops | Phase 1 week 1 |
| AS-16 | The 7-year retention for cycle data is appropriate (Shell records policy) | Different retention triggers different Postgres sizing and archive design | Shell Records / Privacy | Phase 1 week 1 |
| AS-17 | LLM payload retention (3 years in Log Analytics) is appropriate from a Privacy perspective | Shorter retention may be required → adjust Log Analytics policy | Shell Privacy | Phase 1 week 1 |
| AS-18 | Shell engineers will shadow from Phase 3 and take over BAU from Phase 5 | If Zensar continues operating beyond Phase 5, separate operate-and-maintain contract | Shell IT Ops + Procurement | Phase 1 week 1 |
| AS-19 | Vendor master is owned by Shell VMO, not by Procurement | Affects who can create/edit vendor records in-app | Shell VMO | Phase 0 week 2 |
| AS-20 | Shell users are not regulated to a degree requiring on-prem hosting | All Azure-PaaS based; on-prem would be a different architecture | Shell IT | Phase 0 week 1 |

---

## 2. Dependencies (external, not yet confirmed)

These are commitments we **need from Shell or third parties** that must be received in order to proceed:

| # | Dependency | Provider | When needed | Status | Consequence if delayed |
|---|-----------|----------|-------------|--------|-------------------------|
| D-01 | Entra ID app registration with admin consent on Graph scopes (see [§08 I1–I3](08_Dependencies_and_Access_Requirements.md)) | Shell Entra ID admin | End of Phase 0 | Not yet started | Blocks Module A (scheduling) and Module B (scorecard) end-to-end |
| D-02 | Service mailbox `vendorpulse-svc@shell.com` provisioned + Application Access Policy | Shell Messaging admin | End of Phase 0 | Not yet started | Blocks all outbound email from production |
| D-03 | Azure subscription + resource groups + Cloud Custodian sign-off on resource shapes | Shell Cloud team | End of Phase 0 | Not yet started | Blocks all production deployment |
| D-04 | LLM provider chosen and contracted | Shell Procurement + Legal | End of Phase 0 | Not yet started | Blocks all AI agent functionality in production |
| D-05 | Postgres Flexible Server provisioned with managed identity binding | Shell DBA | End of Phase 0 | Not yet started | Blocks Phase 1 data migration |
| D-06 | Key Vault provisioned with managed identity policy | Shell Cloud | End of Phase 0 | Not yet started | Blocks production secret storage |
| D-07 | Shell SSO redirect URLs registered for non-prod and prod | Shell Entra ID admin | End of Phase 0 | Not yet started | Blocks user login |
| D-08 | Three named VMO coordinators identified for pilot | Shell VMO | End of Phase 2 | Not yet started | Blocks UAT in Phase 3 |
| D-09 | One pilot vendor cycle scheduled (real Q3 2026 cycle) | Shell VMO | End of Phase 4 | Not yet started | Blocks Phase 5 pilot go-live |
| D-10 | Final scorecard taxonomy confirmed | Shell VMO | End of Phase 0 | Tentatively per POC | Blocks Module B implementation if changes are significant |
| D-11 | Final email "from" identity and Shell branding (colour, logo) confirmed | Shell Brand + VMO | End of Phase 1 | Not yet started | Blocks email template QA |
| D-12 | Azure Policy compliance review for the resource set | Shell Cloud Governance | End of Phase 1 | Not yet started | Blocks production deployment |
| D-13 | DNS hostname + TLS cert | Shell PKI + DNS | End of Phase 2 | Not yet started | Blocks public-facing access |
| D-14 | Conditional Access policy decision for the service principal | Shell Identity | End of Phase 1 | Not yet started | Could block Graph token acquisition in prod |
| D-15 | External attendee invite policy decision | Shell IT Security | End of Phase 1 | Not yet started | If external invites blocked, vendor-side participation requires alternative channel |
| D-16 | Records retention policy confirmation | Shell Records / Privacy | End of Phase 1 | Not yet started | Drives audit table archival design |
| D-17 | Production CAB approval (change advisory board) | Shell CAB | Start of Phase 5 | Not yet started | Blocks production cutover |
| D-18 | Shell IT Ops handover acceptance | Shell IT Ops | End of Phase 5 | Not yet started | Closes engagement |

---

## 3. Risk Register

### Likelihood × Impact heat-map convention

| Likelihood | Impact | Severity | Action |
|-----------|--------|----------|--------|
| High | High | **Critical** | Active mitigation, weekly steering visibility |
| High | Medium | **Major** | Active mitigation, fortnightly steering |
| Medium | High | **Major** | Active mitigation, fortnightly steering |
| Medium | Medium | **Moderate** | Tracked, monthly steering |
| Low | High | **Moderate** | Watch; mitigation plan documented |
| Low | Medium | **Minor** | Watch |
| Low | Low | **Minor** | Accept |

### 3.1 Critical risks

| ID | Risk | Likelihood | Impact | Severity | Owner | Mitigation |
|----|------|------------|--------|----------|-------|------------|
| R-01 | **Entra ID admin consent for `Mail.Send` denied** by Shell IT Security despite Application Access Policy | Medium | High | Major | Solution Architect + Shell IT Sec | Provide written justification document; offer additional controls (conditional access, audit mirroring); Shell IT Security review session in Phase 0 week 2 |
| R-02 | **LLM provider procurement does not complete in 8 weeks** — slips Phase 1+ | Medium | High | Major | Delivery Manager + Shell Procurement | Initiate week 1; have both options (Anthropic and Azure OpenAI) in-flight in parallel; commit to one when first finalises |
| R-03 | **POC-to-production cost surprises** — LLM token spend significantly higher than budgeted | Medium | High | Major | Solution Architect | Per-cycle token budget enforced in code; weekly cost-monitoring dashboard from Phase 1; alert at 80% of monthly budget |
| R-04 | **In-app scorecard form rejected during UAT** for UX reasons | Medium | Medium | Moderate | Tech Lead + Product Owner | Heavy UX investment in Phase 2; mobile-tested early; fallback to Microsoft Forms via Graph is a 1-week pivot |
| R-05 | **Graph throttling at scale** — production cycle hits per-app per-mailbox limits | Low | High | Moderate | Backend Tech Lead | Token bucket in `GraphService`; staggered sending of bulk emails; documented in [§10.5](10_Expected_Errors_and_Considerations.md#5-graph-throttling--service-availability) |

### 3.2 Major risks

| ID | Risk | Likelihood | Impact | Severity | Owner | Mitigation |
|----|------|------------|--------|----------|-------|------------|
| R-06 | **Shell-internal Conditional Access policy** blocks app-only auth or restricts the service principal in ways we don't anticipate | Medium | High | Major | Solution Architect | Engage Shell Identity team in Phase 0 week 1; test in non-prod first; service principal exemption is a known and supported pattern |
| R-07 | **AI hallucination in vendor-facing content** sent inadvertently | Low | High | Major | Tech Lead + VMO | Approval gate is mandatory; UI shows full preview; coordinator must explicitly approve; audit captured; training material for coordinators |
| R-08 | **PII / confidential data in `agent_runs` audit table** exceeds Shell's retention or privacy tolerance | Medium | Medium | Moderate | Solution Architect | 90-day hot retention; 3-year cold (configurable); access role-gated to `vmo_admin`; PII-stripping option for archive in Phase 2 if needed |
| R-09 | **Shell brand & email template inconsistency** — sender vs. content mismatch concerns | Low | Medium | Moderate | UX + VMO | Phase 1 brand sign-off; Litmus testing; final QA pass before Phase 3 |
| R-10 | **POC code has secrets in git history** (per [Feasibility Analysis](../Feasibility_and_Maintainability_Analysis.md)) | High | High | Major | Tech Lead | Shell production runs on a **fresh branch** from POC main with `git filter-repo` history scrub before push to Shell's repo; all POC secrets rotated before Phase 1 |
| R-11 | **Vendor scorecard taxonomy** turns out to be substantially different from POC | Low | Medium | Moderate | Solution Architect + VMO | Schema is JSON-configurable per cycle; taxonomy locked in Phase 0 week 2 |
| R-12 | **External attendees (vendor staff) cannot be invited** via service mailbox due to Shell external-collaboration policy | Medium | Medium | Moderate | Shell IT Security | Phase 0 confirmation; fallback is to use a real VMO coordinator's calendar as organiser via delegation |
| R-13 | **Shell IT Ops not ready to take BAU** at end of Phase 5 | Medium | Medium | Moderate | Delivery Manager | Shadow operation in Phase 3+; runbooks in Phase 4; Zensar warranty support for 4 weeks post-Phase-5 |

### 3.3 Moderate risks

| ID | Risk | Likelihood | Impact | Severity | Owner | Mitigation |
|----|------|------------|--------|----------|-------|------------|
| R-14 | **Postgres tier under-provisioned** — performance issues at scale | Medium | Medium | Moderate | DevOps + DBA | Load test in Phase 3; auto-scaling alerts; easy to vertical-scale Flexible Server |
| R-15 | **Telemetry costs exceed budget** — App Insights ingestion volume larger than estimated | Medium | Medium | Moderate | Solution Architect | Sampling configured at 10% for `info` logs in prod; per-day caps; cost alert |
| R-16 | **Browser compatibility issues** in older Edge installs at Shell | Low | Medium | Moderate | Frontend Lead | Test in Phase 2 against Shell's standard browser fleet; minimum browser version documented |
| R-17 | **Engineer attrition during delivery** | Low | Medium | Moderate | Zensar Delivery Manager | Code review and pair programming culture; documented knowledge base; cross-training |
| R-18 | **Anthropic model deprecation** mid-delivery (model retirement) | Low | Medium | Moderate | Tech Lead | `LLMProvider` abstraction means model swap is config change; Anthropic SDK pinned exactly; tracked separately in Tech Lead's calendar |
| R-19 | **Email rendering breaks in older Outlook desktop versions** | Medium | Medium | Moderate | Frontend Lead | Litmus testing in Phase 2; tables-only HTML; well-known Outlook restrictions documented |
| R-20 | **Time zone bugs** — Shell operates globally; QBR participants may span 5+ timezones | Medium | Medium | Moderate | Backend Lead | All datetimes stored UTC; organiser's `MailboxSettings.timeZone` respected; explicit timezone displayed to user; date-fns-tz for display |
| R-21 | **Graph API breaking change** during delivery | Low | Medium | Moderate | Tech Lead | Pin Graph API version (`v1.0`); subscribe to Microsoft Graph changelog; integration tests catch breakage |

### 3.4 Minor risks (watched)

| ID | Risk | Likelihood | Impact | Severity | Notes |
|----|------|------------|--------|----------|-------|
| R-22 | Recharts a11y limitations affect leadership brief charts | Low | Low | Minor | Charts include `aria-describedby` data tables |
| R-23 | Tailwind v4 disruptive change mid-project | Low | Low | Minor | Locked version; only patch updates accepted during delivery |
| R-24 | Vite 8 disruptive change | Low | Low | Minor | Same — locked |
| R-25 | A team member needs vacation during a critical week | High | Low | Minor | Resource plan accounts for ~10% PTO |

---

## 4. Top 10 risks — escalation summary

The 10 risks the steering committee should track weekly:

1. **R-01** Entra ID admin consent
2. **R-02** LLM provider procurement
3. **R-03** LLM cost overrun
4. **R-06** Conditional Access blocks app-only auth
5. **R-07** AI hallucination reaches vendor
6. **R-10** POC git history secrets
7. **R-12** External attendee policy
8. **R-13** Shell IT Ops handover readiness
9. **R-19** Email rendering issues
10. **R-20** Time zone correctness

---

## 5. Risk-management cadence

| Activity | Frequency | Audience |
|----------|-----------|----------|
| Risk register update by Delivery Manager | Weekly | Internal Zensar |
| Top-10 review with Shell PM | Weekly | Shell PMO + Zensar DM |
| Full register walkthrough | Monthly | Steering committee |
| Risk-triggered escalations | Ad-hoc | Steering committee |
| End-of-phase risk re-baselining | Every phase | Steering committee |

---

## 6. Out-of-scope (explicitly accepted, NOT risks)

The following are deliberately excluded and are not risks because Shell and Zensar have agreed they are out of scope:

- Mobile native app — accepted as Phase 2 candidate
- Multi-language UI — Phase 2 candidate
- SAP / Ariba / Coupa integration for vendor master — Phase 2 candidate
- Contract management — Phase 2 candidate
- Spend / finance integration — Phase 2 candidate
- Multi-tenant SaaS architecture — explicitly out
- Tier 1 (99.9%) SLA — accepted as 99.5% business hours
- Self-service form designer for VMO admins — Phase 2 candidate
- AI-assisted contract drafting — explicitly out
- Automated meeting transcript ingestion — Phase 2 candidate

---

*Assumptions & Risks — Zensar VendorPulse for Shell — 2026-06-03.*
