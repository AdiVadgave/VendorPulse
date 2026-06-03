# VendorPulse — Deployment Architecture

> **Document type:** Deployment Architecture
> **System:** VendorPulse — Vendor Governance Cycle Automation Platform
> **Audience:** DevOps, platform/infra, IT & security, M365 administrators
> **Companion docs:** [Solution Architecture](SOLUTION_ARCHITECTURE.md) · [Technical Architecture](TECHNICAL_ARCHITECTURE.md) · [Client Review](CLIENT_REVIEW.md)

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

## 1. Overview

VendorPulse consists of two deployable units plus external cloud dependencies:

1. **Backend** — FastAPI (Python 3.11) served by Uvicorn.
2. **Frontend** — React/Vite SPA (static assets after build).
3. **External services** — Azure OpenAI, Microsoft Graph (calendar, Teams, **Outlook mail**), and a scorecard form.

This document covers the current (developer) topology, the recommended production topology, configuration, identity & access (including the **Outlook/Graph mail** permissions), secrets, networking, and operational concerns.

> **📌 Email = Outlook.** VendorPulse is architected to send all email through **Microsoft Outlook via Graph**, on the same Microsoft identity as calendar/Teams. Gmail is present in the current build **only as a temporary fallback** because our development tenant lacks the Graph `Mail.Send` permission. **On the client system that permission is granted**, Outlook becomes the live channel, and the Google dependency is removed.

---

## 2. Current (Developer) Topology

```
Developer workstation (Windows)
├── Backend   :8000   →  python run.py        (Uvicorn, auto-reload)
│                         Swagger UI at /docs
│                         Config from backend/.env
│                         Data in backend/data/*.json
└── Frontend  :5173   →  npm run dev           (Vite dev server)
                          VITE_API_URL=http://localhost:8000 (frontend/.env.local)

External calls (over the developer's network):
   → Azure OpenAI       (Chat Completions)
   → Microsoft Graph    (GRAPH_ACCESS_TOKEN bearer — manually pasted; calendar + Teams)
   → Google Gmail/Forms (TEMPORARY fallback — dev tenant lacks Outlook Mail.Send;
                         OAuth token in backend/data/google_token.json)
```

> In the current dev environment, email goes out via Gmail **only because** the Graph `Mail.Send` permission isn't available here. The architecture's email channel is **Outlook via Graph** — enabled on the client system (§5.2, §12).

**Run commands:**
```bash
# Backend
cd VendorPulse-code/backend
python run.py                # dev (reload) on :8000
python run.py --no-reload    # without reload

# Frontend
cd VendorPulse-code/frontend
npm run dev                  # :5173
npm run build                # production static build (tsc -b && vite build)
npm run preview              # preview the production build
```

**Characteristics of the current setup (not production-ready):**
- Single-process backend; JSON-file persistence (no concurrency safety at scale).
- Microsoft Graph uses a **manually pasted, ~1-hour bearer token** (Graph Explorer) — breaks on expiry.
- Secrets live in plaintext `.env` and `google_token.json`.
- CORS allows `*`.

---

## 3. Recommended Production Topology

```
                          ┌─────────────────────────┐
                          │        End users         │
                          │      (browser / SSO)     │
                          └────────────┬─────────────┘
                                       │ HTTPS
                          ┌────────────▼─────────────┐
                          │   CDN / Static hosting    │  ← React SPA (built assets)
                          │  (e.g. Azure Static Web   │
                          │   Apps / Blob+CDN)        │
                          └────────────┬─────────────┘
                                       │ HTTPS (API calls)
                          ┌────────────▼─────────────┐
                          │   API Gateway / Reverse   │  ← TLS termination, WAF,
                          │   proxy (App Gateway/NGINX)│    rate limiting, routing
                          └────────────┬─────────────┘
                                       │
                          ┌────────────▼─────────────┐
                          │  Backend (containerized)  │  ← FastAPI + Uvicorn/Gunicorn
                          │  Azure Container Apps /    │    (N replicas, autoscale)
                          │  AKS / App Service         │
                          └───┬──────────┬─────────┬──┘
                              │          │         │
              ┌───────────────▼──┐  ┌────▼─────┐  ┌▼────────────────┐
              │  PostgreSQL       │  │ Key Vault │  │ Managed Identity │
              │ (cycles, runs,    │  │ (secrets) │  │ (Graph / OpenAI) │
              │  scorecards, etc.)│  └───────────┘  └──────────────────┘
              └───────────────────┘
                              │
        ┌─────────────────────┼─────────────────────────────┐
        ▼                     ▼                             ▼
┌───────────────┐   ┌──────────────────────┐     ┌────────────────────┐
│  Azure OpenAI │   │  Microsoft Graph      │     │ (legacy) Google     │
│  deployment   │   │  Calendar + Teams +   │     │  Forms — until      │
│  (gpt-4o)     │   │  Outlook Mail         │     │  replaced           │
└───────────────┘   └──────────────────────┘     └────────────────────┘
```

**Key production changes vs current:**
- Backend **containerized** (Docker), multiple replicas behind a gateway, autoscaled.
- **PostgreSQL** replaces JSON files (via the `BaseRepository` seam — no app-code rewrite).
- **Azure Key Vault** for all secrets; **Managed Identity** for Azure OpenAI and Graph where possible.
- **MSAL client-credentials** flow mints/refreshes Graph tokens automatically (no pasted token).
- Frontend served as **static assets** via CDN.
- CORS restricted to the known frontend origin; HTTPS everywhere.

---

## 4. Configuration & Environment Variables

### 4.1 Backend (`backend/.env`)

| Variable | Purpose | Prod note |
|----------|---------|-----------|
| `ENABLE_LLM` | Toggle AI features | `true` once deployment fixed |
| `AI_PROVIDER` | `azure` or `openai` | `azure` |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI key | From Key Vault (or Managed Identity) |
| `AZURE_OPENAI_ENDPOINT` | Azure resource endpoint | — |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | **Chat** deployment | **Must be `gpt-4o`-class, NOT `computer-use-preview`** |
| `AZURE_OPENAI_API_VERSION` | API version | `2024-12-01-preview` |
| `OPENAI_API_KEY` / `LLM_MODEL` | OpenAI fallback | Optional |
| `GRAPH_ACCESS_TOKEN` | Graph bearer (calendar, Teams, **Outlook mail**) | **Replace with MSAL-issued token** |
| `GRAPH_MEETING_DURATION_MINUTES` | Default meeting length | e.g., 30 |
| `GRAPH_SENDER_MAILBOX` *(to add)* | Service mailbox for Outlook sends | e.g., `vendorpulse@<tenant>` |
| `GOOGLE_CLIENT_ID/SECRET/PROJECT_ID` | Google OAuth (**temporary Gmail/Forms fallback**) | **Removed on client tenant once Outlook is live** |
| `GOOGLE_REDIRECT_URI` | OAuth callback (temporary) | Removed with Google |
| `GOOGLE_FORM_ID` / `GOOGLE_FORM_URL` | Scorecard form (temporary) | Replaced by MS Forms / native |
| `SCORECARD_POLL_INTERVAL_SECONDS` | Form poll cadence | 90 default |
| Scheduling tunables | Business hours, penalties, confidence→score map, token budgets | See [config.py](../backend/app/config.py) |

> ⚠️ **Cleanup:** the current `.env` defines `USE_TEAMS_BACKEND` **twice** (`true` then `false`) — remove the duplicate (later value wins → `false`).

### 4.2 Frontend (`frontend/.env.local`)

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Backend base URL (e.g., `https://api.vendorpulse.<domain>`) |

---

## 5. Identity & Access (Critical)

### 5.1 Azure OpenAI access

| Item | Recommendation |
|------|----------------|
| Auth | API key (Key Vault) or **Managed Identity** (preferred) |
| Resource | Azure OpenAI resource with a **Chat-Completions deployment** (`gpt-4o` / `gpt-4o-mini` / `gpt-4.1`) |
| ⚠️ Blocker | Current deployment `computer-use-preview` is **not** Chat-Completions-capable → 400 errors. Re-deploy a chat model. |

### 5.2 Microsoft Graph — scheduling + Outlook mail

This is the central access workstream and the reason Gmail is currently a stopgap.

**Why Gmail is used today:** our development tenant has the Graph token for **calendar/Teams** but does **not** grant **`Mail.Send`**, so Outlook mail can't be sent from here. Gmail is wired in as a **temporary fallback** to demonstrate the email flow. **The architecture's email channel is Outlook via Graph.**

**On the client system:** the client grants the Graph mail permission, so Outlook becomes the live email channel and Gmail is removed.

**Current token:** a delegated **Graph Explorer** token pasted into `GRAPH_ACCESS_TOKEN` (expires ~1 hour) — demo-only, unsuitable for production.

**Production model:** register an **Azure AD (Entra ID) application** and use **MSAL** to obtain tokens programmatically for calendar, Teams, **and Outlook mail**.

#### Permissions required

| Capability | Delegated scope | Application (app-only) permission |
|-----------|-----------------|-----------------------------------|
| Send mail via Outlook | `Mail.Send` | `Mail.Send` (scope to one mailbox via **Application Access Policy**) |
| Track replies | `Mail.Read` / `Mail.ReadWrite` | `Mail.Read` |
| Find times / create Teams meeting | `Calendars.ReadWrite` | `Calendars.ReadWrite` (+ `OnlineMeetings.ReadWrite` if app-only) |
| Resolve users | `User.Read` / `User.Read.All` | `User.Read.All` |

#### Decisions to confirm with IT / M365 admins

1. **Delegated vs Application (app-only) auth**
   - *Delegated*: acts as a signed-in user; needs interactive sign-in / refresh; mail sent from that user's mailbox.
   - *Application (recommended for automation)*: the service runs unattended with its own identity (**client credentials**); sends from a **designated service mailbox**; requires admin consent + Application Access Policy.
2. **Service mailbox identity** — e.g., `vendorpulse@<tenant>`; grant the app send rights to **only** that mailbox.
3. **Admin consent** — `Mail.Send`, `Calendars.ReadWrite`, `User.Read.All` (application) all require **tenant admin consent**. This is typically the **long-pole** item — plan early.
4. **Token lifecycle** — implement **MSAL client-credentials** with automatic refresh; remove the pasted token. (Add the `msal` package to the backend.)
5. **Conditional Access / IP allow-listing** — the service principal may need CA exclusions or a named location depending on tenant policy.

### 5.3 Google (temporary fallback — removed on client tenant)

Used **only** because Outlook `Mail.Send` is unavailable in the dev tenant. OAuth2 user consent with scopes `gmail.send`, `forms.responses.readonly`, `forms.body.readonly`; token persisted in `data/google_token.json`. Once Outlook mail is enabled on the client system (and the scorecard form moved to Microsoft Forms / native), the **entire Google dependency** — packages (`google-auth*`, `google-api-python-client`), scopes, and `google_token.json` — is removed, consolidating on a single Microsoft identity.

### 5.4 Application users (currently missing)

No app-level authentication/authorization is present (the API is open). Production must add **Entra ID SSO** and **role-based access** (e.g., VMO Coordinator vs read-only stakeholder).

---

## 6. Secrets Management

| Secret | Today | Production |
|--------|-------|-----------|
| Azure OpenAI key | `.env` plaintext | Key Vault / Managed Identity |
| Graph token (calendar, Teams, **Outlook mail**) | `.env` (pasted JWT) | MSAL-issued at runtime; client secret/cert in Key Vault |
| Google client secret / token (temporary fallback) | `.env` + `google_token.json` | Removed once Outlook mail is live on client tenant |
| DB credentials (future) | n/a | Key Vault / Managed Identity |

> ⚠️ The current `.env` contains **live** credentials (Azure key, Google client secret, Microsoft Graph bearer token). If this file has ever been committed or shared, **rotate all of them** and ensure `.env` and `data/*token*.json` are gitignored.

---

## 7. Data & Storage Deployment

| Aspect | Current | Production |
|--------|---------|-----------|
| Store | JSON files in `backend/data/` | **PostgreSQL** (managed, e.g., Azure Database for PostgreSQL) |
| Migration path | — | Implement a SQL-backed `BaseRepository`; schema is already Postgres-compatible |
| Backups | Manual file copy | Automated DB backups + PITR |
| Audit data | `agent_runs.json` (grows large) | `agent_runs` table with retention policy |
| Sensitive content | Notes/commercial data in files & logs | Encryption at rest; access controls; log retention policy |

> *(Client m1)* "Postgres-compatible" refers to the **repository seam**; the relational **schema is not yet designed**. A schema-design task precedes the DB migration.

### 7.4 LLM data handling & residency *(added per client review M2)*

VendorPulse sends **commercially sensitive** governance content (alignment notes, transcripts, scorecards) to **Azure OpenAI**. Before any real data is processed, confirm with client Security/Legal:

| Item | Decision / control |
|------|--------------------|
| **Region / data residency** | Pin the Azure OpenAI resource to an approved region. |
| **No-training assurance** | Confirm prompts/outputs are not used for training (Azure OpenAI default) and capture it in the DPA. |
| **Data classification** | Notes, transcripts, scorecards, `agent_runs`, logs = **Confidential**. |
| **PII / GDPR** | Notes name individuals — define lawful basis, minimisation, and erasure. |
| **Retention** | Define retention + purge for `agent_runs` and request-log bodies (currently unbounded). |
| **Encryption** | Encrypt at rest (DB + any file store) and in transit (TLS). |

Detail mirrored in [Technical Architecture §10](TECHNICAL_ARCHITECTURE.md). Owner of decisions: **client** (see [Client Review](CLIENT_REVIEW.md) RACI).

---

## 8. Networking & Security

| Control | Recommendation |
|---------|----------------|
| **TLS** | HTTPS end-to-end; TLS termination at gateway |
| **CORS** | Restrict from `*` to the exact frontend origin(s) |
| **WAF / rate limiting** | At the API gateway |
| **Egress** | Allow-list outbound to `*.openai.azure.com`, `graph.microsoft.com`, (legacy) Google endpoints |
| **Corporate TLS** | `truststore` already injects the OS trust store — useful behind corporate proxies/MITM SSL |
| **Timeouts** | Graph calls use 30s timeouts; add retries/backoff for resilience |
| **Secrets in transit** | Never log Authorization headers (already excluded in Graph diagnostics) |

---

## 9. Build & Release

| Unit | Build | Artifact | Runtime |
|------|-------|----------|---------|
| Backend | `pip install -r requirements.txt` → containerize | Docker image | Uvicorn/Gunicorn workers in Container Apps/AKS/App Service |
| Frontend | `npm ci && npm run build` | Static bundle (`dist/`) | CDN / static hosting |

**Recommended pipeline (CI/CD):** lint (`npm run lint`) → typecheck (`tsc -b`) → build → containerize backend → push to registry → deploy to environment → smoke test (`GET /api/health`).

**Health check:** `GET /api/health` returns status, version, `llm_enabled`, and an endpoint map — use it for readiness/liveness probes.

---

## 10. Environments

| Environment | Backend | Persistence | Identity | Notes |
|-------------|---------|-------------|----------|-------|
| **Local/Dev** | `python run.py` reload | JSON files | Pasted Graph token, Google OAuth | Current state |
| **Test/Staging** | Container, 1 replica | PostgreSQL (test) | App registration (test tenant or app) | Validate Outlook/MSAL + admin consent |
| **Production** | Container, N replicas, autoscale | PostgreSQL (HA) | App registration + admin consent + Managed Identity | Key Vault, WAF, SSO, restricted CORS |

---

## 11. Operational Concerns

| Concern | Current | Production target |
|---------|---------|-------------------|
| **Observability** | Request logging + `agent_runs` | Structured logs shipped to a log store; APM/metrics; dashboards |
| **Scaling** | Single process | Horizontal scale (stateless backend + shared DB) |
| **Resilience** | Timeouts only | Retries/backoff, circuit breakers on Graph/OpenAI |
| **Token expiry** | Manual token refresh | MSAL auto-refresh |
| **Forms polling** | In-process poll (90s) | Background worker / scheduled job |
| **Disaster recovery** | None | DB backups + PITR; IaC for environment rebuild |

> **⚠️ NFR targets are TBD *(client m3)*.** The "production target" column lists recommendations, **not agreed targets**. Availability, latency/throughput, capacity, and **RPO/RTO** must be agreed with the client at an NFR workshop and then committed here.

---

## 12. Rollout: Enabling Outlook mail on the client system

Outlook is the architecture's email channel; these are the steps to switch it on once the client grants Graph mail permission (replacing the temporary Gmail fallback).

1. **Register** an Entra ID app on the client tenant; decide **app-only vs delegated** (recommend app-only).
2. **Request permissions** (`Mail.Send`, `Calendars.ReadWrite`, `User.Read.All`) and obtain **admin consent**.
3. **Designate the service mailbox** and apply an **Application Access Policy** scoping `Mail.Send` to it.
4. **Implement MSAL** client-credentials in the backend; store client secret/cert in **Key Vault**.
5. **Add `send_mail` to `GraphService`** (`POST /me/sendMail`) and route scorecard/minutes emails through a `MailSender` abstraction (**Outlook/Graph as default**).
6. **Validate in staging** (admin consent, sending, reply tracking, Teams invite creation).
7. **Cut over to Outlook**; remove the Gmail path and **Google OAuth** scopes/token.
8. Replace the **scorecard form** (Google Forms) with **Microsoft Forms + Graph** or a native form to fully eliminate the Google dependency.

---

## 13. Pre-Production Checklist

- [ ] Azure deployment points to a **chat model** (`gpt-4o`), not `computer-use-preview`.
- [ ] Remove duplicate `USE_TEAMS_BACKEND` from `.env`.
- [ ] All secrets moved to **Key Vault**; live credentials **rotated**.
- [ ] **MSAL** client-credentials flow replaces pasted Graph token.
- [ ] Entra ID app registered; **admin consent** granted for Graph permissions.
- [ ] Service mailbox + **Application Access Policy** configured for `Mail.Send`.
- [ ] **Outlook/Graph** confirmed as the live email channel (scorecard + minutes sending verified).
- [ ] **PostgreSQL** backing store live via SQL `BaseRepository`.
- [ ] **CORS** restricted; HTTPS enforced; WAF/rate limiting at gateway.
- [ ] App-level **SSO + RBAC** added.
- [ ] Health checks wired to readiness/liveness probes.
- [ ] Logging/metrics shipped to a central store with retention.
- [ ] **Gmail/Google Forms fallback paths and `google-*` dependencies removed.**

---

## 14. Summary

The current deployment is a single-process developer setup with file storage and manually managed tokens, with Gmail standing in for email **only because the dev tenant lacks Outlook `Mail.Send`**. Production readiness centers on five moves: **(1)** fix the Azure OpenAI deployment, **(2)** containerize + scale the backend behind a gateway with PostgreSQL, **(3)** replace pasted Graph tokens with an **MSAL-based Entra ID app identity**, **(4)** enable **Outlook/Graph mail** as the live email channel once the client grants `Mail.Send` (removing the Gmail fallback), and **(5)** lock down secrets, CORS, and add SSO/RBAC. Each is enabled by existing seams in the codebase, keeping the work low-risk.
