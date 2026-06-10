# VendorPulse on Microsoft Agent Framework — Deployment Architecture

> **Companion docs:** [README](README.md) · [Solution Architecture](SOLUTION_ARCHITECTURE.md)
> **Scope:** Physical hosting, identity, data, network, CI/CD, and environments for the MAF target state on Azure.

---

## 1. Azure deployment topology

```mermaid
flowchart TB
    USER["Users (browser)"]

    subgraph EDGE["Edge"]
        FD["Azure Front Door / CDN<br/>WAF + TLS"]
    end

    subgraph RG["Azure Resource Group (per environment)"]
        subgraph NET["VNet (private)"]
            subgraph FEAPP["Frontend"]
                SWA["Azure Static Web App<br/>(React SPA build)"]
            end
            subgraph BEAPP["Backend"]
                ACA["Azure Container Apps<br/>FastAPI + MAF SDK<br/>(autoscale)"]
            end
            PG["Azure Database<br/>for PostgreSQL<br/>(Flexible Server)"]
        end

        KV["Azure Key Vault<br/>(secrets, refs)"]
        AOAI["Microsoft Foundry / Azure OpenAI<br/>(Responses API; GA model deployment)"]
        AI["Application Insights<br/>+ Azure Monitor (OTel)"]
        ACR["Azure Container Registry"]
    end

    ENTRA["Microsoft Entra ID<br/>(SSO + App Registration)"]
    GRAPH["Microsoft Graph<br/>Calendar · Teams · Outlook mail"]

    USER --> FD
    FD --> SWA
    SWA -->|/api| FD
    FD --> ACA
    ACA -->|Managed Identity| KV
    ACA -->|Private Endpoint| AOAI
    ACA -->|Private Endpoint| PG
    ACA -->|OTel| AI
    ACA -->|MSAL client credentials| GRAPH
    ACA -.->|pull image| ACR
    USER -->|OIDC login| ENTRA
    ACA -->|validate JWT| ENTRA

    style BEAPP fill:#dbeafe,stroke:#1d4ed8,color:#000
    style ENTRA fill:#ede9fe,stroke:#6d28d9,color:#000
```

| Component | Azure service | Rationale |
|-----------|--------------|-----------|
| Frontend | **Static Web Apps** | Built SPA, global CDN, cheap |
| Backend | **Container Apps** | Containerized FastAPI + MAF SDK; scale-to-zero, KEDA autoscale, simpler than AKS |
| Database | **PostgreSQL Flexible Server** | Replaces JSON-file persistence via the `BaseRepository` seam |
| Secrets | **Key Vault** | Azure key, Graph app secret, DB creds — referenced, never in env files |
| LLM | **Microsoft Foundry / Azure OpenAI** | Existing deployment, reached via the **Responses API** (Foundry's single entry point); pin a **GA** chat model (fixes current `computer-use-preview` bug) |
| Telemetry | **App Insights / Monitor** | MAF OpenTelemetry sink |
| Registry | **ACR** | Backend container images |
| Identity | **Entra ID** | User SSO + app-only Graph access |

> **Hosting alternative (BUILD 2026):** the FastAPI+MAF backend can run on **Azure Container Apps** (shown above — full control, GA, the chosen baseline) *or* the MAF agent layer can be packaged as a **Microsoft Foundry Hosted Agent** (public preview) — same prompt-owning code, but Foundry provides the managed endpoint, per-agent Entra identity, scale-to-zero, session state, and built-in tracing. Hosted Agents support BYO-VNet with VM-isolated sessions. Revisit once Hosted Agents exits preview; until then, Container Apps is the production target.

---

## 2. Identity & access flows

```mermaid
flowchart TB
    subgraph U["User auth (delegated)"]
        U1["User → Entra ID OIDC login"]
        U2["SPA receives ID/access token"]
        U3["Backend validates JWT<br/>(RBAC: Lead / Viewer)"]
        U1 --> U2 --> U3
    end

    subgraph S["Service auth (app-only)"]
        S1["Container App<br/>System-Assigned Managed Identity"]
        S2["Key Vault → Graph app secret /<br/>certificate"]
        S3["MSAL client-credentials flow<br/>(auto-refresh)"]
        S4["Graph: Mail.Send · Calendars.ReadWrite<br/>User.Read.All (admin-consented)"]
        S1 --> S2 --> S3 --> S4
    end

    subgraph R["Resource auth"]
        R1["Managed Identity → Key Vault (RBAC)"]
        R2["Managed Identity → Azure OpenAI"]
        R3["Managed Identity → PostgreSQL (AAD auth)"]
    end

    style S fill:#ede9fe,stroke:#6d28d9,color:#000
```

**Key change from current build:** the pasted ~1-hour `GRAPH_ACCESS_TOKEN` is replaced by **MSAL client-credentials** backed by an **Entra app registration** with admin-consented application permissions, enabling unattended operation. Resource access (Key Vault, OpenAI, Postgres) uses **Managed Identity** — no secrets in app config.

| Capability | Delegated scope | Application permission |
|-----------|-----------------|------------------------|
| Send mail | `Mail.Send` | `Mail.Send` (+ Application Access Policy → one mailbox) |
| Track replies | `Mail.Read` | `Mail.Read` |
| Scheduling | `Calendars.ReadWrite` | `Calendars.ReadWrite` |
| User lookup | `User.Read` | `User.Read.All` |

---

## 3. Request → response runtime flow

```mermaid
sequenceDiagram
    participant U as User
    participant FD as Front Door (WAF)
    participant SWA as Static Web App
    participant ACA as Container App (FastAPI+MAF)
    participant KV as Key Vault
    participant AOAI as Foundry / Azure OpenAI
    participant PG as PostgreSQL

    U->>FD: HTTPS
    FD->>SWA: serve SPA
    U->>FD: /api/... (Bearer JWT)
    FD->>ACA: forward
    ACA->>ACA: validate Entra JWT + RBAC
    ACA->>KV: fetch secret refs (Managed Identity, cached)
    ACA->>AOAI: MAF agent → Responses API (Private Endpoint)
    AOAI-->>ACA: tool calls / text
    ACA->>PG: read/write via repository
    ACA-->>FD: AgentResponse JSON
    FD-->>U: response
```

---

## 4. CI/CD pipeline

```mermaid
flowchart LR
    DEV["Developer<br/>git push"]
    PR["PR + review"]
    subgraph GHA["GitHub Actions / Azure DevOps"]
        LINT["Lint + type check<br/>(ruff, eslint, tsc)"]
        TEST["Regression suite<br/>(deterministic + agent contract)"]
        BUILD["Build SPA + backend image"]
        SCAN["Image + dependency scan"]
        PUSH["Push image → ACR"]
    end
    subgraph DEPLOY["Deploy (per env)"]
        DEVENV["Dev (auto)"]
        STG["Staging (auto + smoke)"]
        PRD["Prod (manual approval)"]
    end

    DEV --> PR --> LINT --> TEST --> BUILD --> SCAN --> PUSH
    PUSH --> DEVENV --> STG --> PRD

    style PRD fill:#fde68a,stroke:#b45309,color:#000
```

**Gate:** production deploy requires manual approval. The regression stage is the safety net for the missing automated-test debt — it must cover the approval gate, deterministic path, and `AgentResponse` shape before any agent change ships.

---

## 5. Environments

| Env | Frontend | Backend | DB | Azure OpenAI | Identity |
|-----|----------|---------|----|--------------|----------|
| **Dev** | SWA (preview) | Container App (1 replica, scale-to-zero) | Postgres (Burstable) | Shared dev deployment | Dev app registration |
| **Staging** | SWA (staging slot) | Container App (autoscale 1–3) | Postgres (GP, small) | Staging deployment | Staging app registration |
| **Prod** | SWA (prod) | Container App (autoscale 2–N, zone-redundant) | Postgres (GP, HA) | Prod deployment, **pinned GA model** | Prod app registration + admin consent |

Config differences live in environment-scoped Key Vaults + Container App env vars; no code differences between environments.

---

## 6. Data architecture & migration

```mermaid
flowchart LR
    subgraph NOW["Current"]
        JSON["JSON files /data<br/>via BaseRepository"]
    end
    subgraph SEAM["Migration seam"]
        BR["BaseRepository<br/>(only layer touching storage)"]
    end
    subgraph TARGET["Target"]
        PG["PostgreSQL<br/>cycles · attendees · meetings · slots<br/>vendors · agent_runs · scorecards"]
    end

    JSON -.->|swap implementation| BR
    BR --> PG

    style SEAM fill:#bbf7d0,stroke:#15803d,color:#000
```

- Persistence moves JSON → **PostgreSQL** by reimplementing only `BaseRepository`; routes/agents/services untouched.
- A **relational schema** must be designed first (JSON records are the current contract — no SQL schema exists yet).
- `agent_runs` and request-log bodies hold **confidential** data → define **retention/purge** and a per-cycle **erasure** path.

---

## 7. Network & security controls

```mermaid
flowchart TB
    INET["Internet"]
    WAF["Front Door + WAF<br/>(OWASP rules, rate limiting)"]
    subgraph PRIV["Private VNet"]
        ACA["Container App<br/>(ingress restricted to Front Door)"]
        PE1["Private Endpoint → Azure OpenAI"]
        PE2["Private Endpoint → Key Vault"]
        PE3["Private Endpoint → PostgreSQL"]
    end

    INET --> WAF --> ACA
    ACA --> PE1
    ACA --> PE2
    ACA --> PE3

    style PRIV fill:#fee2e2,stroke:#b91c1c,color:#000
```

| Control | Implementation |
|---------|---------------|
| Edge protection | Front Door + WAF (OWASP), TLS termination, rate limiting |
| Network isolation | Backend in VNet; PaaS reached via **Private Endpoints**; ingress locked to Front Door |
| Secrets | Key Vault + Managed Identity; **rotate** all current `.env` secrets; nothing in images |
| AuthN/AuthZ | Entra ID SSO + RBAC at the API (replaces today's open API) |
| CORS | Restrict to known origins (current `["*"]` is dev-only) |
| Data residency | Pin Azure OpenAI + Postgres to an **approved region**; confirm no-training assurance in DPA |
| Audit | `agent_runs` + OTel traces with correlation IDs; never log secrets/tokens |

---

## 8. Resolved tech-debt (mapped from current build)

| Current issue | Resolution in target deployment |
|---------------|--------------------------------|
| `AZURE_OPENAI_DEPLOYMENT_NAME=computer-use-preview` (400s) | Pin a **GA chat model** (e.g. `gpt-4o`) per environment |
| Pasted ~1h Graph bearer token | **MSAL client-credentials** + Managed Identity, auto-refresh |
| Live secrets in `.env` | **Key Vault** + rotation |
| JSON-file persistence | **PostgreSQL** via repository seam |
| No app-level authN/authZ | **Entra ID SSO + RBAC** |
| Preview Azure OpenAI API version | Pin **GA API version** + dated model snapshot |
| No automated tests | CI regression stage gating deploys |
| CORS `["*"]` with credentials | Restrict to known origins |

---

## 9. Deployment sequencing

```mermaid
flowchart LR
    P0["PoC: Scheduling agent<br/>on MAF + Azure OpenAI<br/>(local/dev)"]
    P1["Stand up dev infra<br/>(IaC: Bicep/Terraform)"]
    P2["Migrate persistence<br/>JSON → Postgres"]
    P3["Identity: Entra app reg<br/>+ MSAL + Managed Identity"]
    P4["Port remaining agents<br/>+ OTel wiring"]
    P5["Staging + regression"]
    P6["Prod (manual approval)"]

    P0 --> P1 --> P2 --> P3 --> P4 --> P5 --> P6

    style P0 fill:#fde68a,stroke:#b45309,color:#000
    style P6 fill:#bbf7d0,stroke:#15803d,color:#000
```

Infra defined as code (Bicep or Terraform) so dev/staging/prod are reproducible. The PoC (P0) is the go/no-go gate before any Azure infra spend.
