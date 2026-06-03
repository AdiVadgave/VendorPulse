# Client Architecture Review — VendorPulse

> **Reviewer role:** Client Enterprise Architecture & Security Review Board
> **Documents reviewed:** [Solution Architecture](SOLUTION_ARCHITECTURE.md), [Technical Architecture](TECHNICAL_ARCHITECTURE.md), [Deployment Architecture](DEPLOYMENT_ARCHITECTURE.md)
> **Review date:** 2026-06-03
> **Verdict:** **Accept with required changes.** Strong design and honest treatment of the email/permission situation. Findings below must be addressed before production sign-off. Items marked *(redlined)* have been applied to the documents in this submission.

---

## How to read this

| Severity | Meaning |
|----------|---------|
| 🔴 **Major** | Blocks production sign-off; must be resolved or formally risk-accepted. |
| 🟡 **Minor** | Should be fixed; does not block but reduces confidence/clarity. |
| 🟢 **Info** | Observation / good practice noted. |

---

## Major findings

### 🔴 M1 — "As-built" vs "designed" not distinguished *(redlined)*
The documents describe the agent **tool-calling architecture** as if it were the live runtime. In the code, live AI features use one-shot `LLMService.call_simple()`, and at least one route (**alignment `extract-actions`**) calls the LLM **directly in the route handler**, bypassing its agent. The multi-step `_tool_calling_loop` exists in `BaseAgent` but is not the active path for the modules as wired today.
**Required:** label each AI capability as *implemented* vs *designed/planned*. (Applied: see Technical Architecture §5.1 "Implementation status".)

### 🔴 M2 — No data privacy / LLM data-handling treatment *(redlined)*
Governance notes sent to Azure OpenAI contain **commercially sensitive content** (SLA disputes, service-credit amounts, security-certification status, named individuals). The documents do not state what is sent, where it is processed, retention, or contractual protections.
**Required:** add a Data Privacy & Compliance section covering: data classification, Azure OpenAI **region/residency**, **no-training / data-processing** assurances, PII handling, retention of `agent_runs`/logs, and applicable regulations (e.g., GDPR). (Applied: Technical Architecture §10; Deployment Architecture §7.4.)

### 🔴 M3 — Secrets management & access control *(redlined, elevated)*
The `.env` in the submission contains **live credentials** (Azure OpenAI key, Google client secret, Microsoft Graph bearer token). The application also has **no authentication/authorization** on its API.
**Required:** (a) rotate all exposed credentials immediately and move to a vault; (b) confirm `.env`/token files are git-ignored; (c) commit to **SSO (Entra ID) + RBAC** before production. Owner: **Vendor** (a, b), **Joint** (c).

### 🔴 M4 — No automated test coverage *(redlined as risk)*
There is no automated test suite. For a system that drives governance decisions and sends external communications, this is a material quality risk.
**Required:** a test strategy commitment (unit tests for `WorkflowEngine`, slot ranking, scorecard validation, and LLM-output parsing/fallbacks; integration tests for Graph/Outlook send) with a coverage target. Owner: **Vendor**.

---

## Minor findings

### 🟡 m1 — "Postgres-compatible schema" overstated *(redlined)*
Persistence is JSON files; there is no SQL schema. The **repository seam** is real, but the schema is not yet defined.
**Action:** reworded to "repository seam; relational schema to be designed." (Applied.)

### 🟡 m2 — Document control missing *(redlined)*
No version, date, owner, classification, or approval block on any document.
**Action:** added a Document Control block to all three. (Applied.)

### 🟡 m3 — Non-functional requirements not agreed
Availability, performance/latency, capacity, RPO/RTO are described as recommendations, not **agreed targets**.
**Action:** mark NFRs as **TBD — to be agreed with client** and schedule an NFR workshop. (Applied as placeholder in Deployment Architecture §11.)

### 🟡 m4 — Azure OpenAI on a preview API version
`2024-12-01-preview` is a preview API version; production should pin a **GA** version and a pinned model snapshot for reproducibility.
**Action:** noted in Technical Architecture §10.

### 🟡 m5 — Cost model absent
No estimate of Azure OpenAI token consumption per cycle / per month.
**Action:** vendor to provide a usage & cost estimate. Owner: **Vendor**.

### 🟡 m6 — Forms replacement still open
Scorecard collection on Google Forms is a temporary dependency; the client-side replacement (Microsoft Forms vs native) is not decided.
**Action:** decision required from **client**.

---

## Info / good practice noted

- 🟢 Honest, explicit treatment of the **Outlook-vs-Gmail** situation (Gmail is a clearly-labelled temporary fallback for the missing `Mail.Send` permission). Accepted.
- 🟢 **Deterministic core + human-approval gate** is the right safety posture for governance automation.
- 🟢 **`agent_runs` audit log** and request-ID logging give good traceability.
- 🟢 Correctly identified the **`computer-use-preview` Azure deployment bug**; fix is understood.

---

## Client actions / RACI (decisions we owe the vendor)

| # | Decision / action | Owner | Needed by |
|---|-------------------|-------|-----------|
| 1 | Grant Microsoft Graph **`Mail.Send`** + admin consent on client tenant (enables Outlook) | **Client (M365 admin)** | Before integration testing |
| 2 | Choose **delegated vs app-only** auth + designate **service mailbox** | **Client + Vendor** | Before integration testing |
| 3 | Confirm Azure OpenAI **region/residency** + data-processing terms | **Client (Security/Legal)** | Before any real data is processed |
| 4 | Decide scorecard form platform (MS Forms vs native) | **Client** | Before UAT |
| 5 | Agree **NFR targets** (availability, latency, RPO/RTO) | **Client + Vendor** | NFR workshop |
| 6 | Confirm SSO/identity provider + RBAC roles | **Client + Vendor** | Before production |

---

## Sign-off

Conditional acceptance. Re-review required after Major findings (M1–M4) are closed and the redlined documents are re-submitted with the Data Privacy & Compliance and Implementation-status sections completed.
