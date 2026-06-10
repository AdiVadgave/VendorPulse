# VendorPulse for Shell — Solution Architecture

> **Version:** 2.0 | **Date:** 2026-06-03
> **Audience:** Shell Enterprise Architect, Shell IT Architecture Review Board, Zensar Solution Architect
> **Status:** For architecture review

---

## 1. Architectural intent

VendorPulse is a **single-tenant, Shell-hosted, AI-assisted workflow application** that orchestrates the end-to-end QBR vendor governance cycle. The architecture is intentionally **deterministic-first, AI-second**: every workflow transition, every score validation, every slot ranking, every audit record is governed by deterministic code. Claude is used **only** to generate human-readable text (drafts, summaries, briefs, minutes) — and every piece of that text is held behind a human approval gate before any external communication occurs.

This is not a generative-AI product where the model is in charge. It is a **workflow product with structured AI assistance** — the difference matters for Shell's risk posture.

---

## 2. Deployment topology

```
                                  ┌───────────────────────────────────┐
                                  │     Shell Public DNS              │
                                  │  vendorpulse.it.shell.com         │
                                  └────────────┬──────────────────────┘
                                               │ HTTPS (TLS 1.2+)
                                               │
        ┌──────────────────────────────────────▼──────────────────────────────────────┐
        │                  Shell Azure Subscription (region: West Europe)              │
        │                                                                              │
        │  ┌──────────────────┐    ┌─────────────────────────────────────────────────┐ │
        │  │  Azure Front Door │───►│   Azure App Service (Linux containers)         │ │
        │  │  (WAF + caching)  │    │   ┌─────────────────────┐                      │ │
        │  └──────────────────┘    │   │ Frontend (React SPA) │ (static, served from │ │
        │                          │   │   served via nginx   │  same app or CDN)    │ │
        │                          │   └──────────┬──────────┘                       │ │
        │                          │              │                                  │ │
        │                          │   ┌──────────▼──────────┐                       │ │
        │                          │   │ FastAPI backend     │                       │ │
        │                          │   │ (Python 3.11 +      │                       │ │
        │                          │   │  uvicorn workers)   │                       │ │
        │                          │   └──────────┬──────────┘                       │ │
        │                          └──────────────┼──────────────────────────────────┘ │
        │                                         │                                    │
        │              ┌──────────────────────────┼──────────────────────────────────┐ │
        │              │                          │ Managed Identity                 │ │
        │              │                          │ (no secrets in code)             │ │
        │              ▼                          ▼                                  │ │
        │     ┌─────────────────┐      ┌──────────────────┐    ┌──────────────────┐ │ │
        │     │ Azure Key Vault │      │ Azure Postgres   │    │ App Insights +   │ │ │
        │     │ - LLM API key   │      │ Flexible Server  │    │ Log Analytics    │ │ │
        │     │ - Graph cert    │      │ (Private Link)   │    │ Workspace        │ │ │
        │     └─────────────────┘      └──────────────────┘    └──────────────────┘ │ │
        │              │                                                              │ │
        └──────────────┼──────────────────────────────────────────────────────────────┘
                       │
                       │ Outbound HTTPS (via Shell egress proxy if mandated)
                       │
    ┌──────────────────┼─────────────────────────────────────┐
    │                  │                                      │
    ▼                  ▼                                      ▼
┌──────────────┐  ┌──────────────────────┐  ┌──────────────────────────────────┐
│ Microsoft    │  │  Microsoft Graph      │  │  Anthropic Claude API            │
│ Entra ID     │  │  (Shell tenant)       │  │  (or Azure OpenAI — see §08)     │
│ (Shell SSO)  │  │  • Mail.Send (app)    │  │  - Bedrock not in scope          │
│              │  │  • Calendars.RW (app) │  │  - Outbound only; no callbacks   │
│              │  │  • OnlineMtgs (app)   │  │                                  │
│              │  │  • User.Read.All      │  │                                  │
└──────────────┘  └──────────────────────┘  └──────────────────────────────────┘
```

### 2.1 Network posture

- **Inbound:** Azure Front Door provides WAF + TLS termination. Origin lock so App Service is only reachable from Front Door (Service Tag restriction).
- **Postgres:** Reached over Private Endpoint inside the App Service VNet integration. Public network access disabled.
- **Key Vault:** Reached over Private Endpoint. Managed identity from App Service is the only principal granted `get` on secrets.
- **Outbound to Graph and Anthropic:** Routed through Shell's standard egress proxy if Shell IT mandates explicit egress control. Otherwise direct over the App Service outbound IPs (which can be added to allowlists).
- **No public ingress** to any component other than Front Door.

### 2.2 Why App Service (not AKS, not Container Apps)

- **App Service Linux containers** is the simplest managed platform that satisfies Shell's standard hosting choices and gives us: HTTPS termination, managed identity, VNet integration, Key Vault + Postgres private connectivity, deployment slots for zero-downtime release, autoscale, and built-in App Insights agent.
- **AKS** is over-engineered for a single workload of this size. Adds Kubernetes operational overhead that does not pay off.
- **Container Apps** is a viable alternative if Shell prefers KEDA-style scale-to-zero economics. Equivalent design effort, slightly less mature than App Service for SSO + Private Link patterns.

Open for Shell to override if their hosting standards mandate a different runtime.

---

## 3. Identity and access

### 3.1 End-user authentication

```
User browser → Front Door → App Service
                                │
                                │ 1. App Service detects no session
                                │
                                ▼
                    Redirect to Entra ID (OIDC)
                                │
                                │ 2. User authenticates with Shell SSO
                                │    (already logged in to corporate session)
                                │
                                ▼
                    OIDC callback to /auth/callback
                                │
                                │ 3. ID token validated; user groups read from
                                │    `groups` claim or queried via Graph
                                │
                                ▼
                    Issue app-level session JWT (HttpOnly, Secure, SameSite=Lax)
                                │
                                ▼
                    All subsequent API calls bear the session cookie
```

**Library:** `msal` (Microsoft Authentication Library) for the OIDC flow. Session JWT signed by a key stored in Key Vault.

### 3.2 Role mapping

Shell has Entra ID groups. We map them to application roles:

| App role | Entra ID group (example) | What the role can do |
|----------|--------------------------|----------------------|
| `vmo_coordinator` | `shell-vmo-coordinators` | Full workflow access on any cycle they own |
| `vmo_admin` | `shell-vmo-admins` | All coordinator capabilities + manage vendor master, manage users |
| `executive_sponsor` | `shell-vmo-sponsors` | Read-only access to dashboards, action items, leadership briefs |
| `viewer` | `shell-vmo-viewers` | Read-only access to closed cycles only |

Group → role mapping is configurable in `appsettings.json` (not hard-coded). New groups can be onboarded without code change.

### 3.3 Application identity to Microsoft Graph

**Application registration in Shell's tenant** — name: `VendorPulse-Prod` (and `VendorPulse-NonProd`).

**Authentication type:** Client-credentials flow (app-only) using a **certificate** stored in Key Vault, **not** a client secret. Certificate auth is Shell-preferred for compliance.

**API permissions (application — admin consent required):**

| Permission | Scope | Why we need it | Constrained by |
|------------|-------|-----------------|----------------|
| `Mail.Send` | Application | Send scorecard requests, reminders, minutes distribution from service mailbox | Limit to `vendorpulse-svc@shell.com` via Application Access Policy (see below) |
| `Calendars.ReadWrite` | Application | Create QBR meetings, set up invites, query availability for findMeetingTimes | Limit to the service mailbox via Application Access Policy |
| `OnlineMeetings.ReadWrite.All` | Application | Provision Teams meeting URLs as part of event creation | Required for `isOnlineMeeting=true` in event creation |
| `User.Read.All` | Application | Resolve attendee emails to user objects (existence check, display name) | Directory-wide read, no write |
| `MailboxSettings.Read` | Application | Read working hours and timezone of organiser for slot ranking | Limit to mailboxes that opt in |

**Constrained delegation via [Exchange Application Access Policy](https://learn.microsoft.com/graph/auth-limit-mailbox-access)**: even though `Mail.Send` is tenant-wide by default, we limit it to the service mailbox only — Shell IT Security will require this.

```powershell
# Sample — Shell Exchange admin runs this once during onboarding
New-ApplicationAccessPolicy `
    -AppId <VendorPulse app ID> `
    -PolicyScopeGroupId vendorpulse-svc@shell.com `
    -AccessRight RestrictAccess `
    -Description "VendorPulse may only access the service mailbox"
```

### 3.4 Why NOT delegated auth

The POC uses delegated tokens pasted into `.env`. That works for one developer with one laptop. For Shell production:

- **No user is "always logged in"** as the service. Scheduled actions (reminder escalation, polling) cannot wait for a user.
- **Delegated tokens have user-mailbox scope** — sending from the service mailbox requires that user to own it.
- **Token refresh is fragile** — refresh tokens expire after periods of inactivity; we cannot have the system fail because the developer didn't log in last week.

App-only with constrained mailbox access is **the** correct production pattern.

---

## 4. Data architecture

### 4.1 Storage

| Data | Store | Why |
|------|-------|-----|
| Operational data (cycles, attendees, scorecards, meetings, minutes, action items) | Azure Database for PostgreSQL — Flexible Server | Relational, ACID, mature, supports JSON columns for flexible AI payloads |
| Secrets (LLM API keys, Graph cert, DB password if not using managed identity) | Azure Key Vault | Shell standard for secret material |
| Audit log (`agent_runs`) | Postgres **+** mirrored append-only to Azure Log Analytics | Postgres for app access; Log Analytics for tamper-resistant retention |
| Telemetry (request logs, metrics, traces) | App Insights | Standard observability |
| File attachments (none today; future minutes PDFs) | Azure Blob Storage with private endpoint | Future-proofing |
| Embeddings / vector search (Phase 2+) | pgvector inside the same Postgres | Avoid second store; Shell DBA team already supports Postgres |

### 4.2 Data classification

| Field | Classification | Handling |
|-------|----------------|----------|
| Vendor name, contract IDs, scorecard scores | **Internal** | Standard encryption-at-rest, role-gated access |
| Individual stakeholder comments on scorecards | **Confidential** | RBAC-restricted, not visible to vendor under any circumstance |
| Meeting transcripts (if uploaded) | **Confidential** | Same RBAC; retention configurable per Shell policy |
| `agent_runs.input_payload` and `output_payload` (full LLM prompts/responses) | **Confidential** | RBAC-restricted; **separate retention period** (see §6.3) |
| Email content sent via Graph | **Internal** | Audit-only — content captured at `agent_runs` level, not duplicated to a separate "sent emails" store |
| LLM provider data | **Confidential (data in transit to a third party)** | Subject to provider DPA; see §5 |

### 4.3 Encryption

- **At rest:** Azure PaaS defaults (AES-256 service-managed keys). Customer-managed keys (CMK) available via Key Vault if Shell mandates. Easy to enable; we recommend enabling from day one to avoid migration later.
- **In transit:** TLS 1.2+ everywhere. Postgres `sslmode=require`. Outbound HTTPS to Graph and LLM.
- **Application-level:** No field-level encryption at MVP. If Shell Privacy requires it for stakeholder comments, we can add column-level encryption with a Key Vault-backed key — adds ~1 week of work.

### 4.4 Backup and disaster recovery

| Component | Backup | RPO | RTO |
|-----------|--------|-----|-----|
| Postgres | Azure-managed automatic backups + point-in-time restore | 5 minutes | 1 hour |
| Key Vault | Soft-delete (90 days), purge protection ON | N/A | Immediate (recover deleted secret) |
| App Service | Code re-deployable from CI/CD pipeline | N/A | 30 minutes |
| App Insights / Log Analytics | Native immutable | N/A | N/A |

Geo-redundant Postgres backups configured. Cross-region failover is **out of scope** for first release — Shell to confirm whether this is acceptable for a non-Tier-1 workload.

---

## 5. External integration architecture

### 5.1 Microsoft Graph

All Graph calls are wrapped in a single `GraphService` class (already exists in POC; needs production hardening — see [§05](05_LLD_Backend_Shell.md#7-graphservice-shell-grade)). Key changes from POC:

- **Authentication:** App-only via `msal` `ConfidentialClientApplication` with certificate; tokens cached in-memory with proper expiry handling.
- **Retry:** Tenacity-based retry with exponential backoff on 429 / 5xx, honouring `Retry-After` header.
- **Throttling awareness:** Per-app per-mailbox limits are documented and respected (see [§10.5](10_Expected_Errors_and_Considerations.md#5-graph-throttling--service-availability)).
- **Correlation IDs:** Graph `request-id` captured into App Insights for every call.
- **Audit:** Every Graph call writes to `external_calls` table — endpoint, params (PII-stripped), status, latency.

### 5.2 LLM provider abstraction

The POC has the LLM provider mostly abstracted in `llm_service.py`. For Shell, we formalise:

```python
class LLMProvider(Protocol):
    async def call(self, system: str, messages: list[dict],
                   tools: list[dict] | None = None,
                   max_tokens: int = 4096) -> LLMResponse: ...

class AnthropicProvider(LLMProvider): ...   # Anthropic Claude API
class AzureOpenAIProvider(LLMProvider): ... # Azure OpenAI service
```

**Switching providers is a configuration change**, not a code change. Shell can start on one and migrate without re-architecting. The tool-calling response shape is normalised by the provider class.

### 5.3 Scorecard collection — three options

#### Option A: Microsoft Forms via Graph

- Shell creates one form per cycle via Graph Forms API (or per-vendor template).
- Responses pulled via Graph polling or webhook.
- **Status:** Microsoft Forms via Graph is in `beta` API at time of writing — production-readiness needs Shell IT confirmation.

#### Option B: Native in-app scorecard form (**recommended**)

- Built-in React form rendered to stakeholders via a unique link emailed by Graph.
- Authentication: stakeholder follows magic-link → Entra ID SSO if internal; one-time-link with token if external.
- All data lands directly in Postgres; no external dependency.
- **Pros:** simpler, full control over schema, no API rate limits, accessible from Day 1.
- **Cons:** stakeholders learn a new form (vs. familiar MS Forms UX). Mitigation: keep it ruthlessly simple — five sliders and four comment boxes.

#### Option C: Outlook actionable cards / adaptive cards in email

- Inline form rendered inside Outlook email. Stakeholder fills in the email itself.
- **Pros:** zero-click experience.
- **Cons:** rendering inconsistency across Outlook versions, mobile, and external clients. **Not recommended** unless Shell mandates email-only UX.

**Our recommendation: Option B.** See [§07](07_Gmail_to_Outlook_Migration_Plan.md) for the full migration plan.

---

## 6. Operational architecture

### 6.1 Observability

- **App Insights:** Auto-instrumented for all HTTP requests, dependency calls (Graph, LLM), and exceptions.
- **Custom dimensions:** Every log line carries `cycle_id`, `agent_run_id`, `user_id`, `tenant=shell` for correlation. Implemented via `contextvars` in FastAPI middleware.
- **Custom metrics:**
  - `agent_runs.total`, `agent_runs.failed`, `agent_runs.latency_p95` per agent
  - `graph_calls.total` per endpoint, with throttle counter
  - `llm_calls.tokens_in`, `llm_calls.tokens_out`, `llm_calls.cost_usd_estimate`
  - `cycles.active_by_state` (gauge)
  - `approval_pending.count` (gauge — flags stuck cycles)

### 6.2 Dashboards

Three pre-built Azure Workbook dashboards delivered:

1. **Operator dashboard** — agent run success rates, Graph throttle events, error rate, latency. For Shell IT Ops / on-call.
2. **Coordinator dashboard** — active cycles by state, pending approvals, overdue scorecards, recent agent activity. For VMO coordinators (in-app version).
3. **Cost dashboard** — LLM token spend per agent per day, App Service cost trend, Postgres cost trend. For finance / sponsor.

### 6.3 Audit and retention

| Data | Retention | Where |
|------|-----------|-------|
| Operational data (cycles, scorecards, etc.) | 7 years (or per Shell records-retention policy) | Postgres |
| `agent_runs` table (LLM prompts/responses) | 90 days hot in Postgres; mirrored to Log Analytics for **3 years** | Postgres + Log Analytics |
| Application logs (info/warn) | 30 days hot, 90 days cold | App Insights |
| Application logs (errors) | 90 days hot, 1 year cold | App Insights |
| Audit log (security events — login, role changes, approvals) | 7 years | Log Analytics (immutable workspace) |

The LLM payload retention is set conservatively at 90 days/3 years because that data contains stakeholder commentary on vendor performance — a Privacy-sensitive corpus. **Shell to confirm.**

### 6.4 SLA targets (proposed)

| Metric | Target |
|--------|--------|
| App availability (P1 — coordinator workspace) | 99.5% during business hours (CET 07:00–19:00 weekdays) |
| Agent run success rate | ≥ 95% (excluding LLM provider outages) |
| Email/invite delivery from approval to inbox | ≤ 60 seconds (median) / 300 seconds (P95) |
| Page load (P95) | ≤ 3 seconds |
| Login (P95) | ≤ 5 seconds |

For Shell to confirm — these are non-Tier-1 targets appropriate for an internal productivity tool.

---

## 7. Security architecture

### 7.1 Threat model summary

| Threat | Mitigation |
|--------|-----------|
| Compromised end-user session | Session JWT bound to HttpOnly cookie; short-lived (8 hours); Entra ID Conditional Access enforces MFA + device compliance |
| Compromised service account | Certificate-based app-only auth; rotation every 12 months; mailbox-scoped Application Access Policy limits blast radius |
| Insider abuse (VMO coordinator sends malicious emails via the platform) | Approval gate on every outbound action; `agent_runs` immutable audit; coordinators do not have direct send privileges — only "approve" |
| Data exfiltration via LLM prompt injection | LLM prompts sanitised; tool-calling design means the LLM cannot read arbitrary mailboxes or files (no `Files.Read` permission) |
| Data exfiltration via export feature | All exports are role-gated; exports of full LLM payloads restricted to `vmo_admin` |
| Vendor sees another vendor's data | Strict per-vendor row-level filtering at the repository layer; integration test suite covers this scenario |
| LLM hallucinates a fact in a vendor brief | Approval gate; coordinator reviews; minutes/briefs are advisory drafts, not statements of fact authorised by Shell |
| Stale Graph token in cache used after revocation | Token cache TTL ≤ 5 min before configured token expiry; refresh fails fast with clear error if Entra ID has revoked the app |
| SQL injection | SQLAlchemy parameterised queries throughout; no raw SQL from user input |
| XSS in scorecard comments rendered in UI | React's default escaping; CSP `script-src 'self'` only; no `dangerouslySetInnerHTML` on user content |

### 7.2 Secrets management

| Secret | Storage | Rotation | Notes |
|--------|---------|----------|-------|
| LLM provider API key | Key Vault | 90 days | Pulled via managed identity at runtime; cached in memory for ≤ 5 min |
| Graph application certificate | Key Vault (cert object, not secret) | 12 months | Auto-renewal pipeline via Azure Automation |
| Session JWT signing key | Key Vault | 12 months | Two-key rolling for graceful rotation |
| Database password | None — managed identity from App Service to Postgres | N/A | Where supported; falls back to KV-stored password if Shell standards require it |

**No `.env` file exists in any production environment.** The pattern in the POC is replaced entirely.

### 7.3 Compliance posture

| Framework | Position |
|-----------|----------|
| **GDPR** | Single-tenant in EU region; Shell is the data controller for stakeholder data; DPAs in place with LLM provider; right-to-erasure supported via cycle archival + cascading delete |
| **Shell IT Security Standard (assumed)** | Subject to Shell internal controls; we conform to whatever standard Shell IT Security applies to internal Azure-hosted web apps |
| **ISO 27001 / SOC 2** | Azure underlying platform is certified; application-layer controls follow Shell's standard |

---

## 8. Architectural decisions log (ADRs)

A summary — full ADR documents to be ratified at the Day-1 architecture review and updated at the Day-2 design alignment checkpoint (see [§11 Productionization Roadmap](11_Productionization_Roadmap_Shell.md)).

| # | Decision | Status | Rationale (one line) |
|---|----------|--------|----------------------|
| ADR-001 | Single-tenant for Shell only | Accepted | Simpler than POC's accidental "multi-tenant" — no row-level tenancy needed |
| ADR-002 | App Service (Linux containers) for hosting | Proposed | Shell-standard; sufficient for the workload; AKS overkill |
| ADR-003 | App-only auth to Microsoft Graph with certificate | Accepted | Production-safe; no user-token fragility |
| ADR-004 | PostgreSQL Flexible Server, not SQL Server | Proposed | The POC is on SQLite; Postgres is closest migration path; Shell DBA team supports Postgres |
| ADR-005 | Native in-app scorecard form, not Microsoft Forms | Proposed | See §5.3 Option B |
| ADR-006 | LLM provider abstracted behind `LLMProvider` interface | Accepted | Reversible decision; Anthropic or Azure OpenAI selectable via config |
| ADR-007 | Approval gate on every outbound action — no exception | Accepted | Foundational risk control; non-negotiable |
| ADR-008 | Audit table (`agent_runs`) mirrored to Log Analytics | Proposed | Tamper-resistant retention for sensitive payloads |
| ADR-009 | Entra ID OIDC for SSO, Shell groups for RBAC | Accepted | Shell standard; zero password material in app |
| ADR-010 | No mobile app at launch | Accepted | Scope discipline; web-first |

---

## 9. Architecture risk register (top 5)

Full register in [§09](09_Assumptions_and_Risks.md). Top architectural risks here:

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| A1 | Entra ID app registration with `Mail.Send` app-only not approved by Shell IT Security | Medium | High (blocks delivery) | Start consent process during pre-mobilisation (4–6 weeks ahead of Day 1); offer mailbox-scoped Application Access Policy from the outset |
| A2 | LLM token spend exceeds forecast due to scoping creep on prompts | Medium | Medium | Per-cycle token budget guard; spend dashboard; alerts at 80% of monthly budget |
| A3 | Microsoft Forms via Graph is beta and unsuitable | High (if chosen) | Medium | Default to in-app form (Option B); MS Forms is fallback only |
| A4 | Conditional Access policies block service account sign-in | Medium | High | App-only auth (no interactive sign-in) sidesteps most CA policies; coordinate with Entra ID admin to exempt service principal where needed |
| A5 | LLM provider regional residency does not match Shell's EU data-residency requirement | Medium | High | Resolve during pre-mobilisation by procurement choice (Anthropic EU vs Azure OpenAI EU); LLM contract is a day-zero prerequisite |

---

## 10. Architectural review checkpoints

| Checkpoint | When | Audience | Output |
|------------|------|----------|--------|
| Initial architecture review | Pre-mobilisation (before Day 1) | Shell Architecture Review Board | Approved architecture document, ADRs locked |
| Security architecture review | Pre-mobilisation (before Day 1) | Shell IT Security | Approved security posture, Entra ID app registration consented |
| Design alignment checkpoint | Day 2 (Week 1, Tuesday afternoon) | Shell VMO + IT Architecture + IT Security | Signed-off Design Decision Log; scope adjustments captured |
| Week 1 demo + gate review | Day 5 (Week 1, Friday) | Shell sponsor + PMO + Zensar DM/SA | Module A end-to-end demonstration; design frozen |
| Week 2 demo + gate review | Day 10 (Week 2, Friday) | Shell sponsor + PMO + Zensar DM/SA | Full cycle demonstration; code freeze declared |
| Pre-prod security sign-off | Day 13 (Week 3, Wednesday) | Shell IT Security | Permissions, audit posture, go/no-go for prod cutover |
| CAB approval for production cutover | Day 14 (Week 3, Thursday) | Shell CAB | Change-management approval |
| End-of-engagement retrospective | Day 15 (Week 3, Friday) | Joint | Lessons; baseline architecture document v2.x; defect-warranty period starts Week 4 |

---

*Solution Architecture — Zensar VendorPulse for Shell — 2026-06-03.*
