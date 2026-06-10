# VendorPulse for Shell — Updated Documentation Pack

> **Version:** 2.0 (Shell-specific) | **Date:** 2026-06-03
> **Audience:** Shell IT VMO, Shell IT Architecture, Shell IT Security, Zensar Delivery, Zensar Solution Architecture
> **Status:** SOW Annex — for client review

---

## Why this pack exists

The original VendorPulse documentation (`docs/HLD_*.md`, `docs/LLD_*.md`) describes the **proof-of-concept** product as built. That POC is deliberately a single-developer, single-tenant, Gmail/Forms-based demonstrator.

This **updated pack** rewrites the same architecture for the actual Shell engagement:

- **Single-tenant deployment inside Shell's Microsoft 365 / Azure estate.**
- **Gmail and Google Forms removed.** Outlook + Teams + Microsoft Forms (or in-app form) only.
- **Production hardening** — Shell SSO, Azure AD app registration, Key Vault, App Insights, PostgreSQL, change management.
- **Compliance, audit, and operational concerns** Shell's IT will ask about during architecture review.

Every document has been written by the joint team (Delivery Manager, Solution Architect, VP-level review) and intentionally calls out what we **don't** yet know, where we have made assumptions, and where Shell's input is needed.

---

## How to read this pack

| # | Document | Owner | Read first if you are… |
|---|----------|-------|------------------------|
| 01 | [Executive Summary](01_Executive_Summary_Shell.md) | VP / Delivery | A Shell exec sponsor or VMO lead |
| 02 | [Solution Architecture (Shell)](02_Solution_Architecture_Shell.md) | Solution Architect | Shell IT architecture / enterprise architect |
| 03 | [HLD — Backend (Shell)](03_HLD_Backend_Shell.md) | Tech Lead — Backend | Shell platform engineering |
| 04 | [HLD — Frontend (Shell)](04_HLD_Frontend_Shell.md) | Tech Lead — Frontend | Shell digital workplace / UX |
| 05 | [LLD — Backend (Shell)](05_LLD_Backend_Shell.md) | Senior Engineer — Backend | Backend developers building this |
| 06 | [LLD — Frontend (Shell)](06_LLD_Frontend_Shell.md) | Senior Engineer — Frontend | Frontend developers building this |
| 07 | [Gmail → Outlook Migration Plan](07_Gmail_to_Outlook_Migration_Plan.md) | Solution Architect | Anyone who needs to know what's changing from POC |
| 08 | [Dependencies & Access Requirements](08_Dependencies_and_Access_Requirements.md) | Delivery Manager | Shell IT (the access-granting team) |
| 09 | [Assumptions & Risks Register](09_Assumptions_and_Risks.md) | Delivery Manager | PMO, Shell Risk |
| 10 | [Expected Errors & Operational Considerations](10_Expected_Errors_and_Considerations.md) | SRE / Ops | Shell IT Operations, on-call rota owner |
| 11 | [Productionization Roadmap](11_Productionization_Roadmap_Shell.md) | Delivery Manager / VP | Shell PMO, finance, contracts |
| 12 | [Deployment Architecture](12_Deployment_Architecture_Shell.md) | DevOps / Cloud Engineer | Shell Cloud team, Networking, SRE |

---

## What has changed from the POC

A one-page summary for the impatient reader:

| Area | POC (today) | Shell production (target) |
|---|---|---|
| **Email delivery** | Gmail API (delegated OAuth, personal Google account) | Microsoft Graph `sendMail` from a Shell service mailbox via app-only auth |
| **Calendar / invites** | Microsoft Graph (delegated; manually-pasted token) | Microsoft Graph (app-only client credentials in Shell's tenant) |
| **Meeting platform** | Teams for Business (already) | Teams for Business — unchanged |
| **Scorecard collection** | Google Forms (single shared form ID) | Microsoft Forms **OR** native in-app scorecard form (recommended — see §07) |
| **LLM** | Anthropic Claude direct (or Azure OpenAI in some branches) | Anthropic Claude via Anthropic API with Shell-procured account, **or** Azure OpenAI in Shell's Azure subscription — Shell's choice (see §08) |
| **Identity** | None (open APIs) | Shell SSO via Entra ID (OIDC) with role-based access control |
| **Database** | SQLite file on local disk | Azure Database for PostgreSQL (Flexible Server) in Shell's subscription |
| **Secrets** | `.env` file on developer machine | Azure Key Vault with managed identity binding |
| **Hosting** | `uvicorn` on developer laptop | Azure App Service (Linux containers) in Shell's subscription |
| **Observability** | Python `logging` to stdout | Azure Application Insights + structured logs + per-cycle correlation IDs |
| **Audit** | `agent_runs` SQLite table | Same table in Postgres + immutable append-only audit stream to Azure Log Analytics |
| **Multi-tenancy** | Single tenant by accident | Single tenant by design (Shell only) — simpler than the SaaS scenario |

---

## Document version control

These docs live in version control alongside the codebase. Treat them as **living artifacts** through delivery — they will be re-baselined at the end of each phase (see §11).

| Version | Date | Author | Notes |
|---------|------|--------|-------|
| 1.0 | 2026-04-01 | Zensar | Original POC documentation set (`docs/HLD_*.md`, `docs/LLD_*.md`) |
| 2.0 | 2026-06-03 | Zensar (DM + SA + VP review) | Shell-specific rewrite — this pack |

---

## Glossary

| Term | Meaning |
|------|---------|
| **VMO** | Vendor Management Office — the Shell function that owns vendor governance |
| **QBR / EGB QBR** | Quarterly Business Review / Executive Governance Board QBR |
| **Cycle** | One end-to-end vendor review for one vendor, one quarter |
| **Workflow state** | The current step in the 12-state state machine (see §03) |
| **Agent** | An AI worker (one per module A–F) that uses Claude tool-calling |
| **Approval gate** | Coordinator must approve before any email/invite is sent |
| **Graph** | Microsoft Graph API |
| **Entra ID** | Microsoft Entra ID — the rename of Azure Active Directory |
| **App-only auth** | Client-credentials OAuth flow where the application acts as itself, not on behalf of a user |
| **Delegated auth** | OAuth flow where the application acts on behalf of a signed-in user |

---

*Issued by Zensar Technologies — VendorPulse for Shell delivery, June 2026.*
