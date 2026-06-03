# VendorPulse — Technical Architecture

> **Document type:** Technical Architecture
> **System:** VendorPulse — Vendor Governance Cycle Automation Platform
> **Audience:** Engineers, technical leads, integration & security reviewers
> **Companion docs:** [Solution Architecture](SOLUTION_ARCHITECTURE.md) · [Deployment Architecture](DEPLOYMENT_ARCHITECTURE.md) · [Client Review](CLIENT_REVIEW.md)

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

VendorPulse is a two-tier application: a **React + TypeScript SPA** frontend and a **FastAPI (Python 3.11)** backend, integrating with **Azure OpenAI** and **Microsoft Graph** (calendar, Teams, and **Outlook mail** — the intended email channel). The backend is a strictly layered design where business-critical logic is deterministic and the LLM is confined to text generation behind a human-approval gate.

> **Email channel = Outlook (Graph).** Gmail/Google Forms appear in the current build **only as a temporary fallback**, because the development tenant does not yet grant the Graph `Mail.Send` permission. On the client system that permission is granted and Outlook is the live channel — see §8.

This document covers the technology stack, component design, the agent/LLM model, data architecture, integrations (including enabling **Outlook/Graph mail** on the client system), and known technical issues.

---

## 2. High-Level Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (Browser)                              │
│  React 19 + TypeScript SPA (Vite 8)                                        │
│  Pages: Dashboard · CycleDetail (tabbed A–F workspace) · Analytics         │
│  State: Zustand (useCycleStore, useUIStore)                                │
│  Charts: Recharts   ·   Styling: Tailwind CSS v4   ·   Icons: lucide       │
│  API wrappers: lib/api.ts + per-module typed clients                       │
└───────────────────────────────┬────────────────────────────────────────────┘
                                 │  HTTPS / JSON  (VITE_API_URL → :8000)
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        BACKEND — FastAPI (Python 3.11)                      │
│  Middleware:  CORS  →  RequestLoggingMiddleware (request IDs, timing)      │
│                                                                            │
│  ┌── API Routes (app/api/routes/*) ──────────────────────────────────┐   │
│  │ users · meetings · scheduling · graph_scheduling · google_auth ·   │   │
│  │ scorecard · scorecard_agent · vendors · alignment · vendor_prep ·  │   │
│  │ meeting_agent · analytics                                          │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                       │                                                    │
│  ┌── Core ───────────▼───────────────────────────────────────────────┐   │
│  │ WorkflowEngine (forward-only state machine) · logging_config       │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                       │                                                    │
│  ┌── Agents (app/agents/*) ──────────────────────────────────────────┐   │
│  │ BaseAgent → Scheduling · Scorecard · Alignment · VendorPrep ·      │   │
│  │ Meeting · Memory   (LLM tool-calling loop  OR  deterministic)      │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                       │                                                    │
│  ┌── Services (app/services/*) ──────────────────────────────────────┐   │
│  │ LLMService · slot_ranking · availability · scheduling · meeting · │   │
│  │ graph_service · gmail_service · google_forms_service ·            │   │
│  │ email_service · google_auth_service · mock/*                      │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                       │                                                    │
│  ┌── Repositories (app/repositories/*) ─ JSON files today ───────────┐   │
│  │ BaseRepository → cycles · attendees · meetings · slots · users ·  │   │
│  │ vendors · agent_runs                                              │   │
│  └────────────────────────────────────────────────────────────────────┘   │
└───────────────┬───────────────────────────┬───────────────┬──────────────┘
                ▼                           ▼               ▼
   ┌────────────────────┐    ┌──────────────────────┐  ┌──────────────────┐
   │  Azure OpenAI      │    │  Microsoft Graph API  │  │ Google APIs      │
   │  (Chat Completions)│    │  (calendar/Teams/mail)│  │ (Gmail + Forms)  │
   └────────────────────┘    └──────────────────────┘  └──────────────────┘
                                       ▲                          ▲
                                       │  ← Outlook mail target   │ ← to retire
```

---

## 3. Technology Stack

### 3.1 Backend (`requirements.txt`)

| Concern | Technology | Version |
|---------|-----------|---------|
| Language / runtime | **Python** | 3.11+ |
| Web framework | **FastAPI** | 0.115.6 |
| ASGI server | **Uvicorn** (`[standard]`) | 0.32.1 |
| Data validation / models | **Pydantic** | 2.10.4 |
| Settings management | **pydantic-settings** | 2.7.0 |
| Async HTTP client | **httpx** (Graph API calls) | 0.28.1 |
| Env config | **python-dotenv** | 1.0.1 |
| LLM SDK | **openai** (Azure + OpenAI) | ≥ 1.50.0 |
| Google auth | **google-auth** | ≥ 2.29.0 |
| Google OAuth flow | **google-auth-oauthlib** | ≥ 1.2.0 |
| Google API client | **google-api-python-client** (Gmail, Forms) | ≥ 2.127.0 |
| Corporate TLS | **truststore** (injects OS trust store) | ≥ 0.10.0 |
| SMTP (alt email path) | **smtplib** (stdlib) | — |
| Persistence | **JSON files** (`/data`); repository layer is SQLite/Postgres-ready | — |

### 3.2 Frontend (`package.json`)

| Concern | Technology | Version |
|---------|-----------|---------|
| Language | **TypeScript** | ~5.9.3 |
| UI library | **React** | 19.2.4 |
| Build tool / dev server | **Vite** | 8.0.1 |
| Routing | **react-router-dom** | 7.13.2 |
| State management | **Zustand** | 5.0.12 |
| Charts | **Recharts** | 3.8.1 |
| Styling | **Tailwind CSS** (`@tailwindcss/vite`) | 4.2.2 |
| Class helpers | **clsx**, **tailwind-merge** | 2.x / 3.x |
| Date utilities | **date-fns** | 4.1.0 |
| Icons | **lucide-react** | 1.7.0 |
| Linting | **ESLint** + typescript-eslint | 9.x / 8.x |

### 3.3 External services

| Service | Purpose | Status |
|---------|---------|--------|
| **Azure OpenAI** | LLM text generation | Active (deployment fix needed — §6.3) |
| **Microsoft Graph** | findMeetingTimes, create Teams event, user lookup, **Outlook mail** send + conversation tracking | Active (calendar/Teams); **mail is the target email channel — §8**) |
| **Google Gmail** | Outbound emails — **temporary dev fallback only** | Used because Outlook `Mail.Send` is not granted in the current dev tenant; **replaced by Outlook on the client system (§8.4)** |
| **Google Forms** | Scorecard collection | Temporary; replaced by Microsoft Forms / native on client tenant |

---

## 4. Backend Layered Design

Dependencies flow strictly downward; each layer has one responsibility.

1. **Routes** (`app/api/routes`) — HTTP endpoints, request/response models, status mapping (e.g., `WorkflowViolationError` → 409). Thin; delegate to agents/services. Registered in [app/main.py](../backend/app/main.py).
2. **Core** (`app/core`) — `WorkflowEngine` (the state machine, single source of truth for allowed transitions) and logging config.
3. **Agents** (`app/agents`) — orchestrate a module's unit of work; uniform contract via `BaseAgent`.
4. **Services** (`app/services`) — integration adapters (LLM, Graph, Gmail, Forms, SMTP) + deterministic algorithms (slot ranking, availability, analytics). Mock implementations exist for calendar/email/forms/notifications.
5. **Repositories** (`app/repositories`) — data access via generic `BaseRepository`. The single seam for swapping JSON → SQLite/Postgres.
6. **Models** (`app/models`) — Pydantic v2 schemas; shared `AgentResponse` envelope.

### 4.1 Workflow Engine

[app/core/workflow_engine.py](../backend/app/core/workflow_engine.py) defines the 12 states and a `TRANSITIONS` map allowing only the next immediate state (forward-only). Key methods: `can_transition`, `next_state`, `assert_state`, `assert_at_least`, `validate_transition`, `advance`, `transition_to`. It is stateless and used as a module-level singleton. Violations raise `WorkflowViolationError` (→ HTTP 409); premature actions raise `WorkflowStateError`.

---

## 5. The Agent Pattern

Defined in [app/agents/base_agent.py](../backend/app/agents/base_agent.py). All six agents inherit `BaseAgent` and implement: `get_system_prompt()`, `get_tools()`, `execute_tool()`, `_deterministic_run()`.

**Dual execution path**, selected by the `ENABLE_LLM` flag:

- **LLM enabled** → `_tool_calling_loop()`:
  - Builds `messages` (system + user), calls `LLMService.call(messages, tools)` with `tool_choice="auto"`.
  - Loops up to **10 iterations**; on `finish_reason == "tool_calls"`, dispatches each call to `execute_tool()` and appends results; on `stop`/`end_turn`, parses the final message as JSON.
- **LLM disabled** → `_deterministic_run()` calls services directly and returns the same shape.

**Uniform output — `AgentResponse`:**
```python
AgentResponse(status, agent, summary, data, warnings, next_actions, requires_approval, run_id)
```

**Auditability:** every run is logged to `agent_runs` — `_log_run_start` (PENDING) and `_log_run_complete` (SUCCESS/FAILED, with serialized input/output payloads).

**MeetingAgent exception:** [app/agents/meeting_agent.py](../backend/app/agents/meeting_agent.py) overrides `run()` to always use one-shot `LLMService.call_simple()` (data-in → JSON-out) for minutes / transcript parsing / action extraction, since these are single-prompt tasks rather than multi-step tool loops. It includes robust output handling: `_strip_markdown_json` (extracts JSON from fenced/prose responses), `_coerce_note_type` (maps arbitrary LLM note types to the fixed enum `QUESTION/OBJECTION/DECISION/APPRECIATION/ACTION`), and deterministic fallbacks when parsing fails.

The six agents: **SchedulingAgent, ScorecardAgent, AlignmentAgent, VendorPrepAgent, MeetingAgent, MemoryAgent**.

### 5.1 Implementation status — as-built vs designed *(per client review M1)*

To set expectations accurately, the AI execution model is part **implemented** and part **designed**:

| Capability | Status | Notes |
|-----------|--------|-------|
| `BaseAgent` envelope + `agent_runs` audit logging | **Implemented** | Used by all agents |
| Deterministic fallback path (`_deterministic_run`) | **Implemented** | Every agent works with `ENABLE_LLM=false` |
| One-shot LLM generation (`call_simple`) | **Implemented** | The active path for live AI features (minutes, action extraction, summaries) |
| Multi-step **tool-calling loop** (`_tool_calling_loop`) | **Designed, not the active path** | Present in `BaseAgent`; the wired modules currently use `call_simple` / deterministic paths instead |
| Route → agent routing | **Partially implemented** | Some endpoints call the LLM **directly in the route** rather than via their agent — e.g., alignment `extract-actions` ([alignment.py](../backend/app/api/routes/alignment.py)) uses `llm.call_simple` inline and does not invoke `AlignmentAgent` |

**Consequence / remediation:** the architecture supports the full agent/tool-calling model, but the current build does not exercise it uniformly. Recommended cleanup: route all LLM use through the agents (no direct LLM calls in route handlers) so the `agent_runs` audit trail and the `AgentResponse` contract apply consistently. This is a **correctness/consistency** item, not a blocker for the deterministic flows.

---

## 6. LLM / AI Model

### 6.1 LLM Service

[app/services/llm_service.py](../backend/app/services/llm_service.py) wraps **Azure OpenAI** and **standard OpenAI** behind one interface:

- `call(messages, tools, max_tokens=4096)` — Chat Completions **with tool-calling** (agent loop).
- `call_simple(prompt, system, max_tokens=1024)` — plain text-in/text-out.

Provider selection via `AI_PROVIDER`:
- `azure` → `AzureOpenAI(api_key, azure_endpoint, api_version)`, model = **deployment name**.
- `openai` → `OpenAI(api_key)`, model = `llm_model` (default `gpt-4o`).

`is_enabled` requires both `ENABLE_LLM=true` and a constructed client.

### 6.2 Model details

| Aspect | Detail |
|--------|--------|
| **Primary provider** | Azure OpenAI |
| **Fallback provider** | Standard OpenAI (`AI_PROVIDER=openai`) |
| **Default model (OpenAI)** | `gpt-4o` |
| **Azure model** | Whatever the **deployment** resolves to — must be **Chat-Completions-capable** (e.g., `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`) |
| **Azure API version** | `2024-12-01-preview` |
| **API surface** | `chat.completions.create` (tool-calling + plain) |
| **Token budgets** | minutes/parse 2048 · action extraction 1024 · slot rationale 60 · conflict nudge 120 · invite draft 300 (config in [app/config.py](../backend/app/config.py)) |
| **Prompts** | Centralized in [app/utils/prompts.py](../backend/app/utils/prompts.py) (per-agent system prompts) |
| **Output discipline** | JSON parsing, markdown-fence stripping, enum coercion, deterministic fallback on failure |
| **Safety** | LLM emits text only; all decisions deterministic; output human-gated |

### 6.3 ⚠️ Active model bug

`.env` sets `AZURE_OPENAI_DEPLOYMENT_NAME=computer-use-preview`. That model does **not** support Chat Completions, producing:
```
openai.BadRequestError: 400 — {'error': {'message': 'The requested operation is unsupported.'}}
```
**Fix:** point the deployment at a chat model (e.g., `gpt-4o`). No code change required.

---

## 7. Data Architecture

### 7.1 Persistence (current)

JSON files under `backend/data/`, via generic `BaseRepository` ([app/repositories/base_repository.py](../backend/app/repositories/base_repository.py)) providing `find_all`, `find_by_id`, `find_by_field`, `find_by_predicate`, `insert`, `update_by_id`, `replace_by_id`, `delete_by_id`, `count`.

| File | Entity | Notes |
|------|--------|-------|
| `cycles.json` | Governance cycles | Holds `workflow_state` |
| `attendees.json` | Attendees/stakeholders | Roles incl. exec sponsor `EGB_CHAIR` |
| `meetings.json` | Meetings & RSVP | |
| `slot_proposals.json` | Ranked candidate slots | From slot-ranking algorithm |
| `users.json` | Users | |
| `vendors.json` | Vendors | NovaTech/CoreSystems/Meridian/Zensar |
| `agent_runs.json` | **Audit log** of every agent run | Full input/output payloads |
| `scorecard_responses.json` | Parsed form responses | Deduped by `responseId` |
| `google_token.json` | Google OAuth token | **Secret** |

### 7.2 Migration seam

`BaseRepository` is the only layer that touches storage. Swapping to **SQLite (dev) / PostgreSQL (prod)** requires changes only here; routes/agents/services are untouched. *(Per client review m1: the relational schema is **not yet designed** — the JSON records are the current contract. "Postgres-ready" refers to the repository seam, not an existing SQL schema. A schema-design task is required before the DB migration.)*

### 7.3 Sensitive data

`.env` (Azure key, Graph bearer token, Google client secret) and `google_token.json` are **secrets** — must be gitignored and vaulted in production. `agent_runs.json` and request logs may contain meeting notes / commercial data → treat as **confidential** with retention controls.

---

## 8. Integrations

### 8.1 Microsoft Graph ([graph_service.py](../backend/app/services/graph_service.py))

Async `httpx` client against `https://graph.microsoft.com/v1.0`. Capabilities:

| Method | Graph endpoint | Use |
|--------|----------------|-----|
| `find_meeting_times` | `POST /me/findMeetingTimes` | Common availability across attendees (duration, timezone, confidence, attendee %) |
| `create_event` | `POST /me/events` | Create **Teams** online meeting + invites (`isOnlineMeeting`, `teamsForBusiness`) |
| `get_me_profile` | `GET /me` | Debug/identity |
| `lookup_user` | `GET /users/{email}` | Resolve user |
| `create_draft_message` | `POST /me/messages` | Draft email (mail capability already present) |
| `send_draft_message` | `POST /me/messages/{id}/send` | Send draft |
| `query_messages_by_conversation_id` | `GET /me/messages?$filter=conversationId eq...` | Reply tracking |

Token: `GRAPH_ACCESS_TOKEN` (accepts raw JWT or `Bearer …`). Handles Windows/IANA timezone mapping and graceful error normalization. **The same Graph identity is the intended transport for Outlook mail** (`create_draft_message` / `send_draft_message`, plus a `send_mail` helper to add — see §8.4).

### 8.2 Email — Outlook is the architecture (Graph mail)

VendorPulse sends all governance email (scorecard requests, meeting minutes) through **Microsoft Outlook via Graph**, reusing the identity already used for calendar/Teams — keeping the platform on a **single Microsoft identity**.

- **Outlook send path (target / production):** `GraphService.create_draft_message` → `send_draft_message`, or a single-call `send_mail` (`POST /me/sendMail`) to add (§8.4). Reuses the provider-agnostic body builders below.
- **Body builders** (provider-agnostic, already reusable for Outlook): `build_scorecard_email` / `build_minutes_email` return `{subject, html_body, text_body}` — these stay unchanged regardless of transport. *(They currently live in [gmail_service.py](../backend/app/services/gmail_service.py); they will be moved to a transport-neutral module.)*

> **⚠️ Why Gmail is present in the current build (temporary fallback):** the current development tenant does **not** grant Graph `Mail.Send`, so a Gmail transport (`send_html_email` → Gmail API `users().messages().send`, auth via [google_auth_service.py](../backend/app/services/google_auth_service.py)) is wired in **only to demonstrate the email flow**. **On the client system the Outlook/Graph permissions will be granted**, Outlook becomes the live transport, and the Gmail path + Google OAuth dependency are removed.

- Alternate path: `EmailService` (stdlib SMTP/TLS) in [email_service.py](../backend/app/services/email_service.py) — available as a generic fallback if ever needed.

### 8.3 Google Forms ([google_forms_service.py](../backend/app/services/google_forms_service.py))

Fetches form schema + responses, maps question titles → parameter keys (`QUESTION_MAP`), dedupes by `responseId`, stores in `scorecard_responses.json`.

### 8.4 Enabling Outlook mail on the client system (technical plan)

Outlook is the intended email channel; the only reason it isn't live in the current build is the **missing Graph `Mail.Send` permission in our dev tenant**. On the client system that permission is granted, so enabling Outlook is straightforward and **low-risk** — the body builders are already provider-agnostic and `GraphService` already authenticates to Graph and already has mail methods. Only the **transport** is switched on.

**Steps:**
1. Add `send_mail(subject, html_body, to_recipients)` to `GraphService` posting to **`POST /me/sendMail`** (single call; no draft step). Reuse `build_scorecard_email` / `build_minutes_email` for content.
2. Introduce a thin **`MailSender`** interface; route scorecard/minutes endpoints through it; default implementation = **Graph/Outlook**. (Gmail/SMTP remain only as emergency fallbacks behind a flag and are removed once Outlook is confirmed.)
3. Replace token handling: move from a pasted `GRAPH_ACCESS_TOKEN` to **MSAL** (add `msal`) using a **client-credentials** flow with auto-refresh.
4. Remove the Gmail path and Google OAuth scopes.

**The access requirement (resolved on the client system):** the current Graph token is a short-lived **delegated Graph Explorer token** and the dev tenant lacks mail permission. The client deployment provides an **Azure AD app registration** with mail permissions and **admin consent**:

| Capability | Delegated scope | Application (app-only) permission |
|-----------|-----------------|-----------------------------------|
| Send mail | `Mail.Send` | `Mail.Send` (+ Application Access Policy to scope to one mailbox) |
| Read/track replies | `Mail.Read` / `Mail.ReadWrite` | `Mail.Read` |
| Scheduling | `Calendars.ReadWrite` | `Calendars.ReadWrite` |
| User lookup | `User.Read` / `User.Read.All` | `User.Read.All` |

Decisions to confirm with the client's IT/Security: **delegated vs app-only**, the **service mailbox** identity, **admin consent**, **token lifecycle (MSAL)**, and any **Conditional Access** exclusions. Full identity/rollout detail is in the **[Deployment Architecture](DEPLOYMENT_ARCHITECTURE.md)**.

### 8.5 Scorecard form on the client tenant

The scorecard form (currently Google Forms, another temporary dependency) is replaced with **Microsoft Forms + Graph** or a **native in-app scorecard form** on the client tenant — fully eliminating the Google dependency and consolidating on the Microsoft identity used for calendar, Teams, and Outlook mail.

---

## 9. Cross-Cutting Concerns

### 9.1 Observability
`RequestLoggingMiddleware` ([app/middleware/request_logging.py](../backend/app/middleware/request_logging.py)) assigns a short request ID and logs method/path/status/duration + truncated body. Combined with `agent_runs`, this gives end-to-end tracing of HTTP and AI activity.

### 9.2 Error handling
Workflow violations → 409; Graph errors normalized via `_build_graph_error`; LLM JSON parse failures fall back to deterministic builders; agents always return a structured `AgentResponse` (even on failure, with `next_actions: ["RETRY"]`).

### 9.3 Configuration
All config via [app/config.py](../backend/app/config.py) (`pydantic-settings`), loaded from `backend/.env`. Includes server, scheduling tunables, confidence→score mapping, LLM token budgets, provider credentials, Graph token, Google OAuth, and form prefill entries.

---

## 10. Data Privacy & Compliance *(added per client review M2)*

VendorPulse processes **commercially sensitive** vendor-governance data — SLA disputes, service-credit/penalty amounts, security-certification status (e.g., SOC 2 expiry), contract-compliance issues, and **named individuals**. This data flows to the LLM and is persisted in logs, so it must be handled accordingly.

### 10.1 What is sent to the LLM
The following are sent to **Azure OpenAI** as prompt content: internal alignment notes, meeting transcripts/notes, compiled scorecard data, and vendor-prep inputs. Scheduling and scorecard *validation* do **not** require the LLM.

### 10.2 Required controls (to confirm with client Security/Legal)
| Control | Requirement |
|---------|-------------|
| **Processing location / residency** | Pin the Azure OpenAI resource to an approved **region**; confirm data residency meets client policy. |
| **No-training assurance** | Confirm Azure OpenAI **does not use prompts/outputs for model training** (Azure OpenAI default) and obtain it in writing / the MSA/DPA. |
| **Data classification** | Treat notes, transcripts, scorecards, `agent_runs`, and request logs as **Confidential**. |
| **PII handling** | Notes contain personal names/roles → covered by GDPR / applicable privacy law; define lawful basis and minimisation. |
| **Retention** | Define retention for `agent_runs` and request-log bodies (currently unbounded JSON growth); add purge/rotation. |
| **Log hygiene** | Request-logging truncates bodies but still records note content — ensure logs inherit the same Confidential controls; never log secrets/tokens (Authorization already excluded). |
| **Right to erasure** | Provide a way to delete a cycle's data (incl. audit entries) on request, subject to governance retention rules. |

### 10.3 Open items
Region/residency, DPA terms, and retention periods are **client decisions** (see [Client Review](CLIENT_REVIEW.md) RACI). No real customer/vendor data should be processed until these are confirmed.

---

## 11. Known Issues / Tech Debt

| # | Issue | Impact | Fix |
|---|-------|--------|-----|
| 1 | `AZURE_OPENAI_DEPLOYMENT_NAME=computer-use-preview` | All LLM calls 400 | Point to a chat deployment (`gpt-4o`) |
| 2 | Duplicate `USE_TEAMS_BACKEND` in `.env` (true then false) | Ambiguous config | Remove duplicate |
| 3 | CORS `allow_origins=["*", …]` with credentials | Insecure for prod | Restrict to known origins |
| 4 | Live secrets in `.env` (Azure key, Graph token, Google secret) *(client M3)* | Credential exposure | **Rotate** + move to Key Vault |
| 5 | Pasted, ~1h Graph bearer token | Breaks unattended operation | MSAL client-credentials with refresh |
| 6 | JSON-file persistence, single process | Concurrency/scale limits; no SQL schema yet | Design schema + migrate via repo layer |
| 7 | No app-level authN/authZ *(client M3)* | Open API | Entra ID SSO + RBAC |
| 8 | Azure OpenAI on **preview** API version *(client m4)* | Reproducibility/stability | Pin GA version + dated model snapshot |
| 9 | **No automated test suite** *(client M4)* | Quality/regression risk | Unit + integration test strategy |
| 10 | LLM called directly in some routes, bypassing the agent/audit path *(client M1)* | Inconsistent audit trail | Route all LLM use through agents (§5.1) |

---

## 12. Summary

The backend is a clean, layered FastAPI app with a deterministic core and an AI layer that is isolated, optional, and human-gated. The agent pattern gives uniform structure and full auditability, with a deterministic fallback for every module. The main technical workstreams are: **(1)** fix the Azure deployment, **(2)** enable **Outlook/Graph mail** as the live email channel (Gmail is only a temporary dev fallback for the missing `Mail.Send` permission) with proper MSAL-based app identity, and **(3)** move persistence to a real database — all enabled by existing seams (`MailSender`-ready Graph service, `BaseRepository`). See **[Deployment Architecture](DEPLOYMENT_ARCHITECTURE.md)** for environments and identity.
