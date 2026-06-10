# VendorPulse for Shell — Backend Low-Level Design (LLD)

> **Version:** 2.0 (Shell) | **Stack:** FastAPI + SQLAlchemy 2.0 + PostgreSQL 16 + MSAL + Anthropic / Azure OpenAI
> **Scope:** Implementation-level backend design for Shell production deployment
> **Supersedes:** `docs/LLD_Backend.md` (POC v1.0)

---

## Table of Contents

1. [Technology Stack & Dependencies](#1-technology-stack--dependencies)
2. [Application Architecture](#2-application-architecture)
3. [Folder Structure](#3-folder-structure)
4. [Configuration & Secrets](#4-configuration--secrets)
5. [Database Schema (Postgres)](#5-database-schema-postgres)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [GraphService — Shell-grade](#7-graphservice-shell-grade)
8. [LLM Service & Provider Abstraction](#8-llm-service--provider-abstraction)
9. [ScorecardFormService (replaces Google Forms)](#9-scorecardformservice-replaces-google-forms)
10. [Workflow Engine](#10-workflow-engine)
11. [Base Agent Pattern](#11-base-agent-pattern)
12. [Agent Implementations (A–F) — Shell Notes](#12-agent-implementations-af--shell-notes)
13. [Audit Service](#13-audit-service)
14. [Rate Limits & LLM Budget Enforcement](#14-rate-limits--llm-budget-enforcement)
15. [Observability](#15-observability)
16. [Error Handling](#16-error-handling)
17. [Testing Strategy](#17-testing-strategy)
18. [Deployment](#18-deployment)

---

## 1. Technology Stack & Dependencies

| Package | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `python` | 3.11.x | Runtime | Pinned in container image |
| `fastapi` | 0.115.x | Async HTTP framework | Pin exact |
| `uvicorn[standard]` | 0.32.x | ASGI server | Pin exact |
| `sqlalchemy` | 2.0.x | Async ORM | Pin exact |
| `asyncpg` | 0.29.x | Async Postgres driver | Replaces `aiosqlite` |
| `alembic` | 1.13.x | Schema migrations | New from POC |
| `pydantic` | 2.10.x | Validation | Pin exact |
| `pydantic-settings` | 2.7.x | Env / Key Vault settings | Backed by KV plugin in prod |
| `msal` | 1.30.x | OIDC + Graph app-only auth | Replaces manual JWT pasting |
| `anthropic` | 0.40.x (pinned) | Claude SDK (if provider=anthropic) | Pin exact |
| `openai` | 1.55.x (pinned) | Azure OpenAI SDK (if provider=azure) | Pin exact; only used if provider=azure |
| `httpx` | 0.28.x | Async HTTP client | Pin exact |
| `azure-identity` | 1.19.x | Managed Identity for Azure resources | New from POC |
| `azure-keyvault-secrets` | 4.8.x | Key Vault SDK | New from POC |
| `azure-keyvault-certificates` | 4.8.x | Graph cert retrieval | New from POC |
| `opencensus-ext-azure` / `azure-monitor-opentelemetry` | latest | App Insights export | New from POC |
| `slowapi` | 0.1.x | Rate limiting | New |
| `tenacity` | 9.0.x | Retry with backoff | New |
| `structlog` | 24.x | Structured logging | New |
| `prometheus-client` | 0.21.x | Internal metrics export | Optional |
| `pytest` + `pytest-asyncio` + `httpx[testing]` | latest | Tests | Same as POC |
| `freezegun` | 1.5.x | Deterministic date tests | New |
| `pip-tools` | 7.x | Lock file generator | New — `requirements.in` → `requirements.txt` |

Removed from POC: `aiosqlite`, `google-api-python-client`, `google-auth`, `google-auth-oauthlib`. All Gmail / Forms code paths deleted.

---

## 2. Application Architecture

Unchanged conceptually from POC; the diagrams in `03_HLD_Backend_Shell.md` apply. This document zooms into implementation details.

---

## 3. Folder Structure

```
backend/
├── app/
│   ├── main.py                     # FastAPI app, middleware, router registration, startup events
│   ├── config.py                   # pydantic-settings backed by env + Key Vault
│   │
│   ├── api/
│   │   ├── deps.py                 # get_db, current_user, require_role, current_cycle
│   │   ├── middleware/
│   │   │   ├── oidc.py             # Validates session cookie, attaches user
│   │   │   ├── correlation.py      # Generates / propagates X-Correlation-ID
│   │   │   ├── ratelimit.py        # slowapi wrapper
│   │   │   └── error_handler.py    # Maps exceptions to ErrorResponse
│   │   └── routes/
│   │       ├── auth.py             # OIDC callback, /me, /logout
│   │       ├── cycles.py
│   │       ├── scheduling.py       # Module A
│   │       ├── scorecard.py        # Module B (incl. public form route)
│   │       ├── alignment.py        # Module C
│   │       ├── vendor_prep.py      # Module D
│   │       ├── meeting.py          # Module E
│   │       ├── analytics.py        # Module F
│   │       ├── admin.py            # Admin-only: vendor master, users, audit
│   │       └── health.py           # /healthz, /readyz
│   │
│   ├── core/
│   │   ├── database.py             # async engine, session factory, Base
│   │   ├── workflow_engine.py      # WorkflowEngine + state enum
│   │   ├── security.py             # Session JWT issuer/validator
│   │   └── oidc.py                 # MSAL config, /me parsing
│   │
│   ├── agents/                     # Same 6 agents as POC
│   │   ├── base_agent.py
│   │   ├── scheduling_agent.py
│   │   ├── scorecard_agent.py
│   │   ├── alignment_agent.py
│   │   ├── vendor_prep_agent.py
│   │   ├── meeting_agent.py
│   │   └── memory_agent.py
│   │
│   ├── services/
│   │   ├── llm/
│   │   │   ├── provider.py         # LLMProvider Protocol
│   │   │   ├── anthropic_provider.py
│   │   │   └── azure_openai_provider.py
│   │   ├── graph_service.py        # Microsoft Graph (production hardened)
│   │   ├── scorecard_form_service.py
│   │   ├── validation_service.py
│   │   ├── analytics_service.py
│   │   ├── slot_ranking_service.py
│   │   ├── audit_service.py        # New
│   │   ├── notification_service.py # In-app notifications only
│   │   └── budget_service.py       # LLM budget tracking
│   │
│   ├── models/                     # SQLAlchemy ORM
│   │   ├── vendor.py
│   │   ├── cycle.py
│   │   ├── stakeholder.py
│   │   ├── attendee.py
│   │   ├── scorecard.py
│   │   ├── scorecard_form_link.py  # New
│   │   ├── meeting.py
│   │   ├── meeting_note.py
│   │   ├── action_item.py
│   │   ├── issue.py
│   │   ├── face_off.py
│   │   ├── notification.py
│   │   ├── slot_proposal.py
│   │   ├── agent_run.py
│   │   ├── external_call.py        # New
│   │   ├── cycle_state_transition.py  # New
│   │   └── security_event.py       # New
│   │
│   ├── schemas/                    # Pydantic v2
│   │   ├── common.py               # AgentResponse, ErrorResponse, PaginatedResponse
│   │   ├── auth_schema.py
│   │   ├── cycle_schema.py
│   │   ├── scheduling_schema.py
│   │   ├── scorecard_schema.py
│   │   ├── alignment_schema.py
│   │   ├── vendor_prep_schema.py
│   │   ├── meeting_schema.py
│   │   ├── analytics_schema.py
│   │   └── admin_schema.py
│   │
│   ├── repositories/
│   │   ├── base_repo.py
│   │   ├── cycle_repo.py
│   │   ├── vendor_repo.py
│   │   ├── stakeholder_repo.py
│   │   ├── attendee_repo.py
│   │   ├── scorecard_repo.py
│   │   ├── scorecard_form_link_repo.py
│   │   ├── meeting_repo.py
│   │   ├── action_repo.py
│   │   ├── issue_repo.py
│   │   ├── agent_run_repo.py
│   │   ├── external_call_repo.py
│   │   └── security_event_repo.py
│   │
│   └── utils/
│       ├── prompts.py              # Claude prompt templates
│       ├── slot_ranking.py
│       ├── score_diff.py
│       ├── text_parsing.py
│       └── constants.py
│
├── alembic/
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
│       ├── 0001_initial_schema.py        # All 15 tables
│       └── 0002_seed_lookups.py          # Reference data
│
├── tests/
│   ├── conftest.py                       # test_client, test_db, mock_graph, mock_llm
│   ├── unit/
│   │   ├── test_workflow_engine.py
│   │   ├── test_validation_service.py
│   │   ├── test_slot_ranking.py
│   │   ├── test_score_diff.py
│   │   ├── test_llm_provider.py
│   │   └── test_graph_service.py
│   ├── integration/
│   │   ├── test_scheduling_flow.py
│   │   ├── test_scorecard_flow.py
│   │   ├── test_meeting_flow.py
│   │   ├── test_oidc_flow.py
│   │   └── test_audit_writes.py
│   └── e2e/
│       └── test_full_cycle_smoke.py     # One vendor, one quarter, all 12 states
│
├── deploy/
│   ├── Dockerfile
│   ├── bicep/                            # Infrastructure-as-code
│   │   ├── main.bicep
│   │   ├── appservice.bicep
│   │   ├── postgres.bicep
│   │   ├── keyvault.bicep
│   │   ├── frontdoor.bicep
│   │   └── appinsights.bicep
│   └── azure-pipelines.yml               # CI/CD
│
├── requirements.in                       # Source of truth
├── requirements.txt                      # Locked
├── pyproject.toml
└── README.md
```

---

## 4. Configuration & Secrets

### 4.1 `config.py`

```python
from pydantic_settings import BaseSettings, SettingsConfigDict
from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    # Identity & environment
    environment: str = "production"     # production | staging | dev
    app_url: str
    keyvault_uri: str | None = None

    # Database
    postgres_host: str
    postgres_port: int = 5432
    postgres_db: str = "vendorpulse"
    postgres_user: str
    postgres_password: str | None = None  # None when using Managed Identity

    # OIDC / Entra ID
    entra_tenant_id: str
    entra_client_id: str
    entra_client_cert_thumbprint: str | None = None
    session_signing_key: str | None = None  # loaded from KV

    # Graph
    graph_app_id: str                     # Same as entra_client_id for the prod app
    graph_cert_name: str = "graph-cert"   # in Key Vault
    graph_service_mailbox: str = "vendorpulse-svc@shell.com"

    # LLM provider
    llm_provider: str = "anthropic"       # "anthropic" | "azure_openai"
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-opus-4-7"
    azure_openai_endpoint: str | None = None
    azure_openai_api_key: str | None = None
    azure_openai_deployment: str | None = None
    azure_openai_api_version: str = "2024-12-01-preview"

    # Budgets
    per_cycle_token_budget: int = 100_000
    daily_tenant_token_budget: int = 5_000_000
    user_requests_per_minute: int = 60

    # Audit retention (informational — actual enforcement at DB)
    audit_hot_retention_days: int = 90
    audit_archive_retention_days: int = 1095   # 3 years

    def load_secrets_from_keyvault(self) -> None:
        """Replace placeholder fields with KV-resolved values at startup."""
        if not self.keyvault_uri:
            return
        client = SecretClient(self.keyvault_uri, DefaultAzureCredential())
        if self.postgres_password is None:
            self.postgres_password = client.get_secret("postgres-password").value
        if self.session_signing_key is None:
            self.session_signing_key = client.get_secret("session-signing-key").value
        if self.llm_provider == "anthropic" and not self.anthropic_api_key:
            self.anthropic_api_key = client.get_secret("anthropic-api-key").value
        if self.llm_provider == "azure_openai" and not self.azure_openai_api_key:
            self.azure_openai_api_key = client.get_secret("azure-openai-api-key").value

settings = Settings()
```

**Pattern:** non-secret config from environment variables; secret material from Key Vault via managed identity. **No `.env` file is read in production.** Local dev still uses `.env`.

---

## 5. Database Schema (Postgres)

### 5.1 What changes vs. POC

- All `TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))))` → `UUID PRIMARY KEY DEFAULT gen_random_uuid()` (pgcrypto)
- `INTEGER NOT NULL DEFAULT 0` for booleans → `BOOLEAN NOT NULL DEFAULT FALSE`
- `validation_flags TEXT DEFAULT '[]'` (JSON-as-text) → `JSONB`
- Add `created_at` and `updated_at` to every table; trigger for auto-update
- Add indexes on common query paths (cycle_id, vendor_id, stakeholder_id, status, created_at DESC)
- Three new audit tables (`external_calls`, `cycle_state_transitions`, `security_events`)
- One new table for scorecard form one-time-links

### 5.2 Key new tables

#### `scorecard_form_links`

```sql
CREATE TABLE scorecard_form_links (
    link_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id         UUID NOT NULL REFERENCES governance_cycles(cycle_id),
    stakeholder_id   UUID NOT NULL REFERENCES stakeholders(stakeholder_id),
    token_hash       TEXT NOT NULL,            -- sha256 of one-time token
    issued_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at       TIMESTAMPTZ NOT NULL,
    used_at          TIMESTAMPTZ,
    submission_id    UUID,                     -- references scorecards once submitted
    UNIQUE(cycle_id, stakeholder_id)
);
CREATE INDEX idx_scfl_token_hash ON scorecard_form_links(token_hash);
```

#### `external_calls`

```sql
CREATE TABLE external_calls (
    call_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_run_id     UUID REFERENCES agent_runs(run_id),
    cycle_id         UUID REFERENCES governance_cycles(cycle_id),
    provider         TEXT NOT NULL,                       -- 'graph' | 'anthropic' | 'azure_openai'
    endpoint         TEXT NOT NULL,                       -- e.g., 'POST /me/messages'
    request_summary  JSONB,                               -- PII-stripped summary, not full body
    status_code      INTEGER,
    latency_ms       INTEGER,
    request_id       TEXT,                                -- provider correlation id
    error_code       TEXT,
    error_message    TEXT,
    tokens_used      INTEGER,                             -- LLM only
    cost_usd         NUMERIC(10, 6),                      -- LLM cost estimate
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ec_cycle ON external_calls(cycle_id, created_at DESC);
CREATE INDEX idx_ec_agent ON external_calls(agent_run_id);
CREATE INDEX idx_ec_provider_status ON external_calls(provider, status_code, created_at DESC);
```

#### `cycle_state_transitions`

```sql
CREATE TABLE cycle_state_transitions (
    transition_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id         UUID NOT NULL REFERENCES governance_cycles(cycle_id),
    from_state       TEXT NOT NULL,
    to_state         TEXT NOT NULL,
    triggered_by     TEXT NOT NULL,                       -- user_id or 'system'
    triggered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_cst_cycle ON cycle_state_transitions(cycle_id, triggered_at DESC);
```

#### `security_events`

```sql
CREATE TABLE security_events (
    event_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type       TEXT NOT NULL,                       -- 'login' | 'logout' | 'role_grant' | 'approval' | 'export'
    user_id          TEXT NOT NULL,                       -- Entra ID OID
    cycle_id         UUID,
    detail           JSONB,
    ip_address       TEXT,
    user_agent       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_se_user ON security_events(user_id, created_at DESC);
CREATE INDEX idx_se_type ON security_events(event_type, created_at DESC);
```

### 5.3 Migrations

Alembic. One initial migration for the full schema; subsequent ones additive. `alembic upgrade head` runs as part of App Service deployment (release pipeline gate).

---

## 6. Authentication & Authorization

### 6.1 OIDC flow

```python
# app/core/oidc.py
import msal
from app.config import settings

_msal_app: msal.ConfidentialClientApplication | None = None

def get_msal_app() -> msal.ConfidentialClientApplication:
    global _msal_app
    if _msal_app is None:
        _msal_app = msal.ConfidentialClientApplication(
            client_id=settings.entra_client_id,
            authority=f"https://login.microsoftonline.com/{settings.entra_tenant_id}",
            client_credential={
                "private_key": _load_cert_private_key(),
                "thumbprint": settings.entra_client_cert_thumbprint,
                "public_certificate": _load_cert_public(),
            },
        )
    return _msal_app
```

### 6.2 Session middleware

```python
# app/api/middleware/oidc.py
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from jose import jwt, JWTError

PUBLIC_PATHS = {"/api/v1/auth/callback", "/api/v1/auth/login",
                "/healthz", "/readyz",
                "/app/scorecard/"}  # public stakeholder form (token-validated separately)

class OIDCSessionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if any(path == p or path.startswith(p) for p in PUBLIC_PATHS) or path.startswith("/app/"):
            return await call_next(request)

        token = request.cookies.get("vp_session")
        if not token:
            return _redirect_to_login(request)
        try:
            claims = jwt.decode(token, settings.session_signing_key, algorithms=["HS256"])
            request.state.user_id = claims["sub"]
            request.state.user_email = claims["email"]
            request.state.roles = claims["roles"]
        except JWTError:
            return _redirect_to_login(request)

        return await call_next(request)
```

### 6.3 Role-based authorization

```python
# app/api/deps.py
from fastapi import Depends, HTTPException, Request

def require_role(*allowed: str):
    def _dep(request: Request) -> None:
        roles: set[str] = set(getattr(request.state, "roles", []))
        if not roles.intersection(allowed):
            raise HTTPException(status_code=403, detail="Insufficient role")
    return _dep

# Usage:
@router.get("/admin/users", dependencies=[Depends(require_role("vmo_admin"))])
async def list_users(...): ...
```

### 6.4 Entra ID group → role mapping

Stored in `appsettings.json` or environment, **not in code**:

```yaml
role_mapping:
  vmo_admin: ["shell-vmo-admins"]
  vmo_coordinator: ["shell-vmo-coordinators"]
  executive_sponsor: ["shell-vmo-sponsors"]
  viewer: ["shell-vmo-viewers"]
```

Resolved at login: backend reads `groups` claim (or Graph `/me/memberOf` if claim too large), maps to app roles, embeds in session JWT.

---

## 7. GraphService — Shell-grade

### 7.1 Initialization (app-only, certificate-based)

```python
# app/services/graph_service.py
import msal
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential_jitter, retry_if_exception_type
from app.config import settings

class GraphAuthError(RuntimeError): pass
class GraphTransientError(RuntimeError): pass
class GraphPermanentError(RuntimeError): pass

class GraphService:
    BASE_URL = "https://graph.microsoft.com/v1.0"

    def __init__(self):
        self._msal_app = msal.ConfidentialClientApplication(
            client_id=settings.graph_app_id,
            authority=f"https://login.microsoftonline.com/{settings.entra_tenant_id}",
            client_credential={
                "private_key": _load_graph_cert_key(),
                "thumbprint": settings.entra_client_cert_thumbprint,
                "public_certificate": _load_graph_cert_pub(),
            },
        )
        self._token: str | None = None
        self._token_expiry: float = 0

    def _get_token(self) -> str:
        import time
        if self._token and time.time() < self._token_expiry - 60:
            return self._token
        result = self._msal_app.acquire_token_for_client(
            scopes=["https://graph.microsoft.com/.default"]
        )
        if "access_token" not in result:
            raise GraphAuthError(result.get("error_description", "Token acquisition failed"))
        self._token = result["access_token"]
        self._token_expiry = time.time() + int(result.get("expires_in", 3600))
        return self._token
```

### 7.2 Retry policy

```python
@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential_jitter(initial=1, max=30),
    retry=retry_if_exception_type(GraphTransientError),
    reraise=True,
)
async def _request(self, method: str, path: str, **kwargs) -> dict:
    headers = {
        "Authorization": f"Bearer {self._get_token()}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.request(method, f"{self.BASE_URL}{path}", headers=headers, **kwargs)

    # Audit the call regardless of outcome
    await audit_service.record_external_call(
        provider="graph",
        endpoint=f"{method} {path}",
        status_code=response.status_code,
        latency_ms=int(response.elapsed.total_seconds() * 1000),
        request_id=response.headers.get("request-id"),
    )

    if response.status_code == 429:
        retry_after = int(response.headers.get("Retry-After", "5"))
        await asyncio.sleep(retry_after)
        raise GraphTransientError("Throttled")
    if 500 <= response.status_code < 600:
        raise GraphTransientError(f"Server error {response.status_code}")
    if response.status_code >= 400:
        raise GraphPermanentError(_extract_error(response))
    return response.json() if response.content else {}
```

### 7.3 Operations (production replacements)

| POC method | Shell production method | Endpoint |
|-----------|-------------------------|-----------|
| `find_meeting_times` (delegated `/me`) | `find_meeting_times(organiser_email, ...)` (app-only `/users/{id}/findMeetingTimes`) | `POST /users/{id}/findMeetingTimes` |
| `create_event` (`/me/events`) | `create_event(organiser_email, ...)` (app-only `/users/{id}/events`) | `POST /users/{id}/events` |
| `lookup_user` | same — already app-only-compatible | `GET /users/{email}` |
| `create_draft_message` / `send_draft_message` | Replaced with `send_mail(from_mailbox, to, subject, body)` | `POST /users/{id}/sendMail` (single call, no draft) |
| `query_messages_by_conversation_id` | Used only for RSVP tracking; kept | `GET /users/{id}/messages?$filter=...` |

**Why direct `sendMail` instead of draft+send:** simpler, atomic, fewer round trips, fewer throttle slots consumed. The POC's draft+send was a developer convenience pattern.

### 7.4 Permissions matrix

Configured at Entra app registration time. The runtime code does NOT request scopes dynamically.

| Graph permission | Type | Justified by |
|------------------|------|--------------|
| `Mail.Send` | Application | Send scorecard requests, reminders, minutes — constrained by Application Access Policy to service mailbox |
| `Calendars.ReadWrite` | Application | Create meetings on organiser calendars — constrained similarly |
| `OnlineMeetings.ReadWrite.All` | Application | Provision Teams meeting URLs |
| `User.Read.All` | Application | Resolve email → user object; read display name for personalisation |
| `MailboxSettings.Read` | Application | Read working hours / timezone of organisers for slot ranking |
| `Group.Read.All` | Application | Resolve `groups` claim if too large to embed in token |

**Removed from POC:** all the broad scopes (`Files.ReadWrite.All`, `Sites.ReadWrite.All`, `Directory.ReadWrite.All`, `Tasks.ReadWrite`, `Notes.ReadWrite.All`). They were not used; Shell IT Security will mandate minimisation.

---

## 8. LLM Service & Provider Abstraction

```python
# app/services/llm/provider.py
from typing import Protocol, Literal
from pydantic import BaseModel

class LLMResponse(BaseModel):
    stop_reason: Literal["end_turn", "tool_use", "max_tokens"]
    content: list[dict]              # normalised across providers
    usage_input_tokens: int
    usage_output_tokens: int
    raw_response: dict               # provider-specific for debugging

class LLMProvider(Protocol):
    async def call(
        self,
        system: str,
        messages: list[dict],
        tools: list[dict] | None = None,
        max_tokens: int = 4096,
    ) -> LLMResponse: ...
```

```python
# app/services/llm/anthropic_provider.py
import anthropic
from app.config import settings

class AnthropicProvider:
    def __init__(self):
        self.client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        self.model = settings.anthropic_model

    async def call(self, system, messages, tools=None, max_tokens=4096):
        kwargs = {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": messages,
        }
        if tools:
            kwargs["tools"] = tools
        response = await self.client.messages.create(**kwargs)
        return LLMResponse(
            stop_reason=response.stop_reason,
            content=[b.model_dump() for b in response.content],
            usage_input_tokens=response.usage.input_tokens,
            usage_output_tokens=response.usage.output_tokens,
            raw_response=response.model_dump(),
        )
```

Azure OpenAI provider implements the same `LLMProvider` shape with `tool_calls` normalised to Anthropic-style.

**Factory:**

```python
def get_llm_provider() -> LLMProvider:
    match settings.llm_provider:
        case "anthropic": return AnthropicProvider()
        case "azure_openai": return AzureOpenAIProvider()
        case _: raise ValueError(f"Unknown LLM provider: {settings.llm_provider}")
```

---

## 9. ScorecardFormService (replaces Google Forms)

```python
# app/services/scorecard_form_service.py
import secrets
import hashlib
from datetime import datetime, timedelta, timezone

class ScorecardFormService:
    """
    Generates one-time-use form links, validates submissions, persists scores.
    Replaces Google Forms entirely.
    """

    LINK_TTL_DAYS = 14

    async def issue_link(self, db, cycle_id: str, stakeholder_id: str) -> tuple[str, str]:
        """Return (form_url, raw_token). Token is shown to stakeholder once."""
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        link = ScorecardFormLink(
            cycle_id=cycle_id,
            stakeholder_id=stakeholder_id,
            token_hash=token_hash,
            issued_at=datetime.now(timezone.utc),
            expires_at=datetime.now(timezone.utc) + timedelta(days=self.LINK_TTL_DAYS),
        )
        db.add(link)
        await db.flush()
        form_url = f"{settings.app_url}/app/scorecard/{raw_token}"
        return form_url, raw_token

    async def validate_token(self, db, raw_token: str) -> ScorecardFormLink:
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        link = await scorecard_form_link_repo.get_by_hash(db, token_hash)
        if not link:
            raise ValueError("Invalid form token")
        if link.used_at:
            raise ValueError("This form has already been submitted")
        if link.expires_at < datetime.now(timezone.utc):
            raise ValueError("This form link has expired")
        return link

    async def submit(self, db, raw_token: str, payload: ScorecardSubmissionIn) -> Scorecard:
        link = await self.validate_token(db, raw_token)
        # ... validate payload via ValidationService
        # ... persist Scorecard entries
        link.used_at = datetime.now(timezone.utc)
        await db.flush()
        return ...
```

The frontend `/app/scorecard/:linkToken` route calls `GET /api/v1/scorecard/form/{token}` to fetch the form schema + cycle context, then `POST /api/v1/scorecard/form/{token}/submit` with the answers.

---

## 10. Workflow Engine

Same code as POC's `WorkflowEngine` — no logical change. Two additions:

1. Every `transition()` writes a `cycle_state_transitions` row.
2. `triggered_by` is the current user (or `"system"` for scheduled jobs).

---

## 11. Base Agent Pattern

Same as POC. Two additions:

1. After every tool call, `external_call` rows are written via `AuditService`.
2. `_create_run_record` and `_update_run_record` now also write `usage_input_tokens`, `usage_output_tokens`, and `cost_usd_estimate` columns to `agent_runs`. The `LLMService` returns these; budget service reads them.

```python
# app/services/budget_service.py
class BudgetService:
    async def check_cycle_budget(self, db, cycle_id: str) -> None:
        cycle = await cycle_repo.get(db, cycle_id)
        if cycle.llm_tokens_used >= settings.per_cycle_token_budget:
            raise HTTPException(429, "Cycle LLM budget exhausted; contact vmo_admin")

    async def increment(self, db, cycle_id: str, tokens: int, cost: float) -> None:
        await cycle_repo.add_token_usage(db, cycle_id, tokens, cost)
```

`BaseAgent.run` calls `budget_service.check_cycle_budget` before invoking the LLM.

---

## 12. Agent Implementations (A–F) — Shell Notes

The agent code is largely unchanged from the POC. Per-agent Shell-specific notes:

### 12.1 SchedulingAgent (Module A)

- **Real Graph.** Tools that called the mock calendar now call `GraphService.find_meeting_times`.
- **Organiser-aware:** Graph's `findMeetingTimes` is run **for the organiser's calendar**, so `App-only` requires the organiser's email/id. Resolved upstream from cycle metadata.
- **Time zones:** Organiser's `MailboxSettings.timeZone` is read at scheduling time so suggestions respect the organiser's working hours.
- **Send invites:** `GraphService.create_event` with `isOnlineMeeting=True`. Teams URL captured into `meetings.location_or_dial_in`.

### 12.2 ScorecardAgent (Module B)

- **Email recipients** are Shell stakeholders identified by their Shell mailbox.
- **Form links** issued via `ScorecardFormService.issue_link`; embedded in personalised email body before Graph `sendMail`.
- **Reminder cadence** unchanged: T-5 days (`REMINDER_1`), T-2 days (`REMINDER_2`), escalation to organiser if still missing at T+0.
- **Polling** removed — submissions land directly in `scorecards` via the form route; no external poller needed.

### 12.3 AlignmentAgent (Module C)

- Unchanged from POC. Operates entirely on Postgres data.

### 12.4 VendorPrepAgent (Module D)

- Unchanged from POC. Operates entirely on Postgres data.

### 12.5 MeetingAgent (Module E)

- **Minutes distribution:** After approval, `GraphService.send_mail` distributes minutes from the service mailbox to internal recipients only (no vendor emails — Shell policy decision; see [§09](09_Assumptions_and_Risks.md)).
- **Transcript ingestion** (Phase 2): Optional Graph `communications` API to pull Teams transcript directly — gated on Shell call-recording / consent policy approval. Out of scope for first release.

### 12.6 MemoryAgent (Module F)

- Unchanged from POC. Operates entirely on Postgres data.

---

## 13. Audit Service

```python
# app/services/audit_service.py
class AuditService:
    async def record_external_call(self, *, provider, endpoint, status_code,
                                    latency_ms, request_id=None, agent_run_id=None,
                                    cycle_id=None, request_summary=None,
                                    error_code=None, tokens_used=None, cost_usd=None):
        # Insert into external_calls
        # Best-effort, non-blocking for the caller

    async def record_state_transition(self, *, cycle_id, from_state, to_state, triggered_by):
        # Insert into cycle_state_transitions

    async def record_security_event(self, *, event_type, user_id, cycle_id=None,
                                     detail=None, ip_address=None, user_agent=None):
        # Insert into security_events AND mirror to App Insights / Log Analytics

    async def record_approval(self, *, user_id, cycle_id, action_type, agent_run_id):
        # Specific security event for approvals — used heavily for compliance
        await self.record_security_event(
            event_type="approval",
            user_id=user_id,
            cycle_id=cycle_id,
            detail={"action_type": action_type, "agent_run_id": agent_run_id},
        )
```

All approvals flow through `record_approval` so we have a clean audit trail of "User X approved AI-generated action Y for cycle Z at time T".

---

## 14. Rate Limits & LLM Budget Enforcement

### 14.1 Per-user HTTP rate limit

`slowapi` configured globally:

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=lambda request: request.state.user_id or get_remote_address(request))
app.state.limiter = limiter

@app.middleware("http")
async def rate_limit_mw(request, call_next):
    # ... applies limiter
```

Default: 60 req/min per user. Configurable per route.

### 14.2 Per-cycle LLM budget

Tracked in `governance_cycles.llm_tokens_used` (incremented per agent run). Hard stop at `settings.per_cycle_token_budget`. Admin can extend via admin endpoint.

### 14.3 Daily tenant LLM budget

A Postgres aggregate keyed by date; checked before every LLM call. Operator alert at 80% via App Insights metric. Hard stop at 100% with admin override.

---

## 15. Observability

### 15.1 Structured logging

```python
import structlog

structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.contextvars.merge_contextvars,
        structlog.processors.JSONRenderer(),
    ],
)

logger = structlog.get_logger()
logger.bind(cycle_id=cycle_id, run_id=run_id, user_id=user_id).info("agent.start")
```

JSON logs flow to App Insights via `azure-monitor-opentelemetry`.

### 15.2 OpenTelemetry instrumentation

Auto-instrumented:

- FastAPI HTTP spans
- httpx outbound spans (Graph + LLM)
- SQLAlchemy DB spans

Custom spans for `agent.run`, `agent.tool_call`, `workflow.transition`.

### 15.3 Metrics

```python
from opentelemetry.metrics import get_meter
meter = get_meter("vendorpulse")

agent_runs_counter = meter.create_counter("vp.agent_runs", description="Agent run count")
agent_latency_hist = meter.create_histogram("vp.agent.latency_ms", unit="ms")
graph_call_counter = meter.create_counter("vp.graph.calls")
llm_tokens_counter = meter.create_counter("vp.llm.tokens", description="Tokens consumed")
```

All emitted with dimensions: `agent_name`, `status`, `endpoint`, `provider`, `model`.

### 15.4 Health endpoints

```python
@router.get("/healthz")
async def healthz(): return {"ok": True}        # Liveness — minimal

@router.get("/readyz")
async def readyz(db: AsyncSession = Depends(get_db)):
    # DB ping + Key Vault accessibility + Graph token acquisition
    ...
```

---

## 16. Error Handling

Global exception handler converts internal exceptions to `ErrorResponse`:

```python
@app.exception_handler(WorkflowViolationError)
async def workflow_violation_handler(request, exc):
    return JSONResponse(status_code=409, content={
        "detail": str(exc), "code": "WORKFLOW_VIOLATION"
    })

@app.exception_handler(GraphAuthError)
async def graph_auth_handler(request, exc):
    logger.error("graph_auth_failed", error=str(exc))
    return JSONResponse(status_code=503, content={
        "detail": "Microsoft Graph authentication failed",
        "code": "GRAPH_AUTH_FAILED",
    })

# ... others
```

**Internal stack traces never leak to the client.** All 500 responses return a generic message; the trace is captured in App Insights with the correlation ID for support.

---

## 17. Testing Strategy

| Layer | Approach | Coverage target |
|-------|----------|-----------------|
| **Unit** | Pytest; mock Graph + LLM | ≥ 80% line coverage on services and utils |
| **Integration** | Pytest + test Postgres container; mock Graph + LLM | All routes, all happy paths, error paths for workflow violations |
| **Contract** | Schemathesis against OpenAPI spec | OpenAPI ↔ implementation drift caught in CI |
| **E2E** | Pytest-driven full-cycle smoke (`tests/e2e/test_full_cycle_smoke.py`) | One cycle through all 12 states with mocked Graph + LLM responses |
| **Load** | Locust scripts (Phase 3+) | 50 concurrent users, 95th-percentile < 3s for catalogue endpoints |
| **Security** | Bandit (SAST), pip-audit, Trivy (container) | Zero high-severity findings before release |

CI runs unit + integration on every PR; E2E + contract on main branch; load + security weekly.

---

## 18. Deployment

### 18.1 Container

`Dockerfile` (multi-stage):

```dockerfile
FROM python:3.11-slim AS deps
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.11-slim
WORKDIR /app
COPY --from=deps /usr/local /usr/local
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

### 18.2 Pipeline (Azure DevOps)

Stages: **build → unit-test → integration-test → security-scan → push-image → deploy-staging → smoke-test → deploy-prod (manual approval)**

### 18.3 Migration policy

`alembic upgrade head` is a manual release gate, not automatic. Backwards-compatible migrations only (add nullable column → backfill → make non-null in a later migration).

### 18.4 Rollback

App Service deployment slots: prod slot + previous slot. Rollback = swap. Database rollbacks are **manual** — we never auto-revert migrations.

---

*Backend LLD v2.0 — Zensar VendorPulse for Shell — 2026-06-03.*
