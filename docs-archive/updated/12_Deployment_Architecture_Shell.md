# Deployment Architecture — Shell

> **Version:** 2.0 | **Date:** 2026-06-03
> **Audience:** Shell Cloud team, Shell Networking, Shell SRE, Zensar DevOps Engineer
> **Purpose:** Concrete deployment topology, infrastructure-as-code structure, environment design, CI/CD, networking, scaling, and DR for the Shell production deployment

---

## 1. Environments

We operate **three environments**, each isolated end-to-end (no shared state across environments).

| Environment | Purpose | Hosting | Data | Access |
|-------------|---------|---------|------|--------|
| **dev** | Engineer local + ephemeral Azure | Docker compose on developer laptops + an optional `vp-dev` App Service for branch demos | Synthetic — disposable Postgres | Zensar engineers |
| **non-prod** (UAT / staging) | Integration test, UAT, Shell coordinator preview | Azure West Europe, Shell tenant | Synthetic + Shell test mailboxes | Zensar + Shell pilot users (read/write) |
| **prod** | Live Shell QBR workload | Azure West Europe, Shell tenant | Real Shell vendor data | Shell users via SSO; Zensar break-glass only |

> No cross-environment data movement. Promotion is image-only — config and secrets are environment-owned.

```
        ┌─────────────────────────────────────────────────────────┐
        │                Code in shell-prod branch                │
        │                                                         │
        │   PR merge → Azure DevOps pipeline → build container    │
        │              → push to ACR (immutable tag)              │
        └────────────────────────┬────────────────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
         ┌─────────┐         ┌──────────┐       ┌──────────┐
         │   dev   │         │ non-prod │       │   prod   │
         │ App Svc │ ◄──────►│ App Svc  │       │ App Svc  │
         └─────────┘   auto  └──────────┘ manual└──────────┘
                                              gated promotion
```

---

## 2. Production deployment topology (West Europe)

```
                                  ┌────────────────────────────────────────────┐
                                  │ Public DNS                                 │
                                  │ vendorpulse.it.shell.com (CNAME → AFD)     │
                                  └─────────────────────────┬──────────────────┘
                                                            │ TLS 1.2+ (managed cert via AFD)
                                                            │
                                  ┌─────────────────────────▼──────────────────┐
                                  │ Azure Front Door (Standard)                │
                                  │  - WAF policy (OWASP top 10 ruleset)       │
                                  │  - Geo restriction (allow EU only — TBD)   │
                                  │  - Bot mitigation                          │
                                  └─────────────────────────┬──────────────────┘
                                                            │ Private Link (origin lock)
                                                            │
        ┌───────────────────────────────────────────────────▼─────────────────────────────────────┐
        │              Shell Azure Subscription — Resource Group: rg-vendorpulse-prod-weu          │
        │                                                                                          │
        │     ┌──────────────────────────────────────────────────────────────────────────┐         │
        │     │                       VNet: vnet-vp-prod-weu (10.40.0.0/22)              │         │
        │     │                                                                          │         │
        │     │  ┌──────────────────────────────┐  ┌──────────────────────────────────┐ │         │
        │     │  │  Subnet: snet-app (delegated │  │  Subnet: snet-pe (10.40.1.0/24)  │ │         │
        │     │  │   to Microsoft.Web/serverFarms│  │  Private endpoints              │ │         │
        │     │  │   10.40.0.0/24)              │  │                                  │ │         │
        │     │  │  ┌────────────────────────┐  │  │  ┌────────────────────────────┐ │ │         │
        │     │  │  │  App Service (Linux)   │──┼──┼─►│ PE: Postgres               │ │ │         │
        │     │  │  │  Plan: P1v3 × 2        │  │  │  ├────────────────────────────┤ │ │         │
        │     │  │  │  - FastAPI backend     │──┼──┼─►│ PE: Key Vault              │ │ │         │
        │     │  │  │  - React SPA (nginx)   │  │  │  ├────────────────────────────┤ │ │         │
        │     │  │  │  - Managed Identity ON │──┼──┼─►│ PE: Container Registry     │ │ │         │
        │     │  │  │  - VNet integrated     │  │  │  ├────────────────────────────┤ │ │         │
        │     │  │  └────────────────────────┘  │  │  │ PE: App Insights ingestion │ │ │         │
        │     │  │                              │  │  └────────────────────────────┘ │ │         │
        │     │  └──────────────────────────────┘  └──────────────────────────────────┘ │         │
        │     │                                                                          │         │
        │     │   NSG on snet-app allows: outbound 443 (Graph/LLM), Private Link only    │         │
        │     │   NSG on snet-pe allows: inbound from snet-app only                       │         │
        │     └──────────────────────────────────────────────────────────────────────────┘         │
        │                                                                                          │
        │     ┌──────────────────┐  ┌────────────────────┐  ┌─────────────────────────────────┐   │
        │     │  Azure Database  │  │  Azure Key Vault   │  │  Azure Container Registry       │   │
        │     │  for Postgres    │  │  (Standard)        │  │  (Standard)                     │   │
        │     │  Flexible Server │  │  - HSM-backed keys │  │  - Private endpoint             │   │
        │     │  - General Purpose│ │  - Soft-delete 90d │  │  - Geo-replication off (single  │   │
        │     │  - Zone redundant│  │  - Purge protect   │  │    region for v1)               │   │
        │     │  - PITR 7 days   │  │  - Managed Identity│  │                                 │   │
        │     │  - Public access │  │    access only     │  │                                 │   │
        │     │    DISABLED      │  │                    │  │                                 │   │
        │     └──────────────────┘  └────────────────────┘  └─────────────────────────────────┘   │
        │                                                                                          │
        │     ┌──────────────────────────────────────────────────────────────────────────┐         │
        │     │  Observability                                                           │         │
        │     │  - Application Insights (Workspace-based)                                │         │
        │     │  - Log Analytics Workspace (linked, immutable retention 3y for audit)   │         │
        │     │  - Azure Monitor alerts → ServiceNow / PagerDuty / Teams channel        │         │
        │     │  - Azure Workbooks: operator, coordinator, cost dashboards              │         │
        │     └──────────────────────────────────────────────────────────────────────────┘         │
        │                                                                                          │
        │     ┌──────────────────────────────────────────────────────────────────────────┐         │
        │     │  Identity                                                                │         │
        │     │  - App Service Managed Identity (system-assigned)                       │         │
        │     │     • Key Vault Secrets User                                             │         │
        │     │     • AcrPull on Container Registry                                      │         │
        │     │     • Storage Blob Data Reader (future: minutes archive)                 │         │
        │     │  - Entra ID App: VendorPulse-Prod (OIDC + app-only Graph)                │         │
        │     │     • Certificate stored in Key Vault                                    │         │
        │     │     • Application Access Policy scoping to service mailbox              │         │
        │     └──────────────────────────────────────────────────────────────────────────┘         │
        └──────────────────────────────────────────────────────────────────────────────────────────┘
                                          │
        ┌─────────────────────────────────┼─────────────────────────────────┐
        ▼                                 ▼                                 ▼
┌──────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────────────┐
│  Microsoft Graph     │  │  LLM Provider           │  │  Shell Egress Proxy (optional)  │
│  (Shell tenant)      │  │  - Anthropic API, or    │  │  - Required if Shell mandates    │
│  - Mail.Send         │  │  - Azure OpenAI         │  │    explicit egress filtering     │
│  - Calendars.RW      │  │                         │  │                                  │
│  - OnlineMeetings.RW │  │  Outbound 443 only      │  │                                  │
└──────────────────────┘  └─────────────────────────┘  └─────────────────────────────────┘
```

### 2.1 Why this shape

| Choice | Rationale |
|--------|-----------|
| **App Service Linux containers** (not AKS, not Container Apps) | Shell-standard for stateful web workloads; managed TLS, managed identity, VNet integration, deployment slots, autoscale — all free with the platform. AKS adds Kubernetes ops overhead with no benefit at this scale. |
| **Front Door Standard** (not App Gateway) | We need global edge + WAF; App Gateway is regional-only. Front Door also gives caching for `/app/*` static assets free. |
| **Postgres Flexible Server** (not Single Server) | Single Server is in deprecation. Flexible Server supports zone redundancy, PITR 7-day, customer-managed keys. |
| **Container Registry** (not Docker Hub or GitHub Packages) | Private; lives in Shell's subscription; managed identity pull; no internet egress to pull images. |
| **Workspace-based App Insights** | Native KQL; share retention with Log Analytics; required for immutable audit retention. |
| **System-assigned managed identity** (not user-assigned) | Simpler; tied to App Service lifecycle; no orphaned principals. |
| **Private endpoints on every PaaS dependency** | Public access disabled on Postgres, Key Vault, ACR. All traffic stays inside the VNet. |
| **No AKS-style ingress controller** | Front Door is the single edge; App Service handles internal routing. |

---

## 3. Non-prod topology

Identical shape to production, with smaller SKUs:

| Resource | Prod | Non-prod |
|----------|------|----------|
| App Service Plan | P1v3 × 2 instances | B2 × 1 instance |
| Postgres tier | General Purpose D2ds_v5, zone-redundant | Burstable B1ms, no HA |
| Front Door | Standard | Standard (shared profile, separate domain) |
| Key Vault | Standard, purge-protect ON | Standard, purge-protect OFF |
| Log Analytics retention | 90 days hot, 3 years cold (immutable) | 30 days |
| Backup retention | 7 days PITR | 1 day PITR |

**Domain:** `vendorpulse-nonprod.it.shell.com`

Non-prod is not zone-redundant and does not have the same RTO targets. It is for testing, not for serving real cycles.

---

## 4. Infrastructure as Code

### 4.1 Choice: Bicep

Shell-standard for new Azure deployments (defaults to Bicep; Terraform supported but not required). The deliverable is a Bicep module set, version-controlled in the same repo as the app.

```
deploy/bicep/
├── main.bicep                       # Subscription-scope orchestrator (or RG-scope)
├── modules/
│   ├── network.bicep                # VNet, subnets, NSGs
│   ├── app_service.bicep            # Plan + App + slots + autoscale
│   ├── postgres.bicep               # Flexible Server + DB + firewall rules + PE
│   ├── keyvault.bicep               # Vault + access policy (managed identity)
│   ├── container_registry.bicep     # ACR + PE + RBAC
│   ├── front_door.bicep             # AFD profile + WAF + endpoint + route
│   ├── observability.bicep          # App Insights + Log Analytics + alerts + workbooks
│   ├── private_endpoints.bicep      # PE composer (called from each service module)
│   └── identity.bicep               # Role assignments for managed identity
├── parameters/
│   ├── nonprod.parameters.json
│   └── prod.parameters.json
└── README.md
```

### 4.2 Parameterisation

Per-environment differences (SKUs, retention, addressing) live in `parameters/*.json`. **No environment-specific literals in Bicep modules.**

```jsonc
// parameters/prod.parameters.json (excerpt)
{
  "$schema": "https://schema.management.azure.com/schemas/...",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "environment":        { "value": "prod" },
    "location":           { "value": "westeurope" },
    "appServiceSku":      { "value": "P1v3" },
    "appServiceCapacity": { "value": 2 },
    "postgresSku":        { "value": "Standard_D2ds_v5" },
    "postgresHaMode":     { "value": "ZoneRedundant" },
    "vnetAddressSpace":   { "value": "10.40.0.0/22" },
    "logRetentionDays":   { "value": 90 },
    "auditRetentionYears": { "value": 3 }
  }
}
```

### 4.3 What lives in IaC vs. outside

**In IaC:**
- All Azure resources
- All RBAC role assignments
- All alert rules and workbooks
- Network rules and NSGs
- Diagnostic settings (App Insights wiring, audit export)

**Outside IaC (manual, one-time, or out-of-band):**
- Entra ID app registration + admin consent (Shell admin portal; not Bicep)
- Shell DNS record (Shell-owned DNS zone)
- TLS certificate provisioning (Shell PKI)
- Application Access Policy on the service mailbox (Exchange PowerShell)
- Initial Key Vault secret values (loaded by an out-of-band process; rotated thereafter)

---

## 5. Container & runtime

### 5.1 Container image

Multi-stage Dockerfile producing a single image that serves both the React SPA (via embedded nginx) and the FastAPI backend (via uvicorn). Same-origin deployment removes CORS complexity.

```dockerfile
# Stage 1: Frontend build
FROM node:20-alpine AS frontend-build
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build              # outputs /fe/dist

# Stage 2: Backend deps
FROM python:3.11-slim AS deps
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Stage 3: Runtime
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends nginx supervisor && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /usr/local /usr/local
COPY backend/app/        ./app/
COPY backend/alembic/    ./alembic/
COPY backend/alembic.ini .
COPY --from=frontend-build /fe/dist /var/www/app/
COPY deploy/nginx.conf      /etc/nginx/nginx.conf
COPY deploy/supervisord.conf /etc/supervisor/conf.d/vendorpulse.conf

# Non-root runtime
RUN useradd --create-home --shell /bin/bash app && chown -R app:app /app /var/www/app
USER app

EXPOSE 8080
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/vendorpulse.conf"]
```

`supervisord` runs `nginx` (port 8080, serves `/app/*` and reverse-proxies `/api/*`) and `uvicorn` (loopback only, 2 workers).

### 5.2 Image tagging

Tags are **immutable** and **build-pinned**:

```
<short-sha>          # primary tag (e.g. 9a3f2c1)
nonprod-<date>-<sha> # tagged on non-prod deploy
prod-<date>-<sha>    # tagged on prod deploy
```

**No `latest` tag.** Every deployment references an immutable tag — required for reproducible rollback.

### 5.3 Image scanning

- **In CI:** Trivy (SAST + image vuln) on every PR
- **In ACR:** Microsoft Defender for Containers scans every pushed image
- **Gate:** No image with high/critical CVE may deploy to prod; non-prod allows with explicit override

---

## 6. CI/CD pipeline (Azure DevOps)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                            CI (on every PR + main)                              │
│                                                                                  │
│   1. Checkout shell-prod                                                         │
│   2. Backend                                                                     │
│      - pip install -r requirements.txt                                          │
│      - pytest unit + integration (test Postgres in container)                   │
│      - bandit + pip-audit + ruff                                                │
│   3. Frontend                                                                    │
│      - npm ci                                                                   │
│      - npm run lint && typecheck                                                │
│      - vitest unit                                                              │
│      - npm run build                                                            │
│   4. Container                                                                   │
│      - docker buildx build → multi-arch (linux/amd64)                          │
│      - trivy fs + image scan (fail on high/critical)                            │
│   5. Tag + push to ACR (only on main branch merge)                              │
│                                                                                  │
└────────────────────────────────────────────────────┬───────────────────────────┘
                                                     │
                                                     │ artifact: image:<sha>
                                                     ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                         CD — Non-prod (auto on main merge)                      │
│                                                                                  │
│   1. alembic upgrade head against non-prod Postgres                             │
│   2. Deploy image to non-prod App Service slot:staging                          │
│   3. Smoke tests (curl /healthz, /readyz, OIDC redirect, sample agent run)     │
│   4. Swap slot:staging → slot:production (zero-downtime)                       │
│   5. Post-deploy verification (App Insights availability check)                │
│   6. Notify Teams channel                                                       │
│                                                                                  │
└────────────────────────────────────────────────────┬───────────────────────────┘
                                                     │
                                                     │ manual gate (Shell CAB approval)
                                                     ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                         CD — Prod (manual approval)                              │
│                                                                                  │
│   1. CAB approval ticket linked                                                 │
│   2. Pre-flight: confirm migrations are backwards-compatible                   │
│   3. alembic upgrade head against prod (separate change ticket)                │
│   4. Deploy image to prod App Service slot:staging                              │
│   5. Smoke tests against staging slot                                           │
│   6. Slot swap (atomic)                                                         │
│   7. Post-swap verification (5-min watch on error rate, agent failure rate)    │
│   8. If error rate spikes → auto-swap-back                                      │
│   9. Notify Teams channel + send post-deploy summary to Shell IT Ops           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 6.1 Deployment slots

Both non-prod and prod App Services have **two deployment slots**:

| Slot | Use |
|------|-----|
| `production` | Currently serving traffic |
| `staging` | Pre-swap target; warmed up before swap |

Slot swap is atomic at the load-balancer level — zero downtime, instant rollback by swapping again.

### 6.2 Database migration policy

- All migrations **must be backwards-compatible**. We deploy the image **before** the migration runs only if the new code can run against the old schema; otherwise migration runs first.
- **Never destructive migrations in a single step.** Pattern:
  - Step 1: add new column (nullable) → deploy code that can read both old + new
  - Step 2: backfill via job
  - Step 3: deploy code that only reads new
  - Step 4: drop old column

This rules out "deploy and pray" — every change is reviewed for compatibility.

### 6.3 Rollback

| Scenario | Action | Time-to-recover |
|----------|--------|------------------|
| Bad code in prod | Slot swap back to previous version | < 30 seconds |
| Bad migration in prod | **Manual.** Hot-fix migration or restore from PITR if data corruption | 30 min – 2 hours |
| Image corrupted in ACR | Re-deploy previous tag (immutable, still in registry) | < 5 minutes |
| Config error in App Service | Revert appsettings via Azure CLI | < 5 minutes |

**No automated database rollback.** We never auto-revert migrations because backwards-compatibility makes it unnecessary, and partial backout is worse than forward fix.

---

## 7. Networking

### 7.1 Address plan

| CIDR | Use |
|------|-----|
| 10.40.0.0/22 | VNet (1024 addresses) |
| 10.40.0.0/24 | `snet-app` — App Service VNet delegation |
| 10.40.1.0/24 | `snet-pe` — private endpoints (Postgres, KV, ACR, App Insights) |
| 10.40.2.0/24 | `snet-reserved-future` — future workloads (functions, jobs) |
| 10.40.3.0/24 | Reserved |

> CIDRs are placeholders; final allocation comes from Shell Networking's IP plan.

### 7.2 Network security groups (NSG)

**`snet-app` outbound:**
- Allow 443 to `AzureCloud.WestEurope` (managed services)
- Allow 443 to `Storage`, `KeyVault`, `Sql` service tags via private IPs (effectively via PE)
- Allow 443 to `Internet` for Graph + LLM (or to Shell egress proxy IP if mandated)
- Deny all else

**`snet-app` inbound:**
- Allow 8080 from Front Door service tag (Private Link Service)
- Deny all else

**`snet-pe` inbound:**
- Allow from `snet-app` only
- Deny all else

### 7.3 DNS

| Hostname | Resolves to | Owned by |
|----------|------------|----------|
| `vendorpulse.it.shell.com` | Front Door endpoint | Shell DNS |
| `vendorpulse-nonprod.it.shell.com` | Non-prod Front Door endpoint | Shell DNS |
| `vp-prod-postgres.postgres.database.azure.com` | Private IP via PE | Azure private DNS zone |
| `vp-prod-kv.vault.azure.net` | Private IP via PE | Azure private DNS zone |
| `vpprod.azurecr.io` | Private IP via PE | Azure private DNS zone |

The Azure private DNS zones are linked to the VNet so PE resolution works inside the App Service.

### 7.4 Egress filtering

**If Shell mandates explicit egress control** (likely for prod):

- App Service outbound IPs registered with Shell egress proxy
- Egress proxy whitelisted for:
  - `*.graph.microsoft.com` (Graph)
  - `*.login.microsoftonline.com` (token endpoint)
  - `api.anthropic.com` OR `*.openai.azure.com` (LLM provider)
  - `*.applicationinsights.azure.com` (telemetry)

No other internet egress permitted.

---

## 8. Identity & secrets

### 8.1 Identity hierarchy

```
Shell Entra ID Tenant
   │
   ├── App Registration: VendorPulse-Prod
   │     ├── Application permissions (admin consent required):
   │     │    • Mail.Send (scoped via Application Access Policy)
   │     │    • Calendars.ReadWrite (scoped)
   │     │    • OnlineMeetings.ReadWrite.All
   │     │    • User.Read.All
   │     │    • MailboxSettings.Read
   │     │    • Group.Read.All
   │     ├── Delegated permissions (user consent):
   │     │    • openid, profile, email, User.Read
   │     ├── Authentication:
   │     │    • Certificate credential (thumbprint registered)
   │     │    • Redirect URIs: https://vendorpulse.it.shell.com/api/v1/auth/callback
   │     └── Token configuration:
   │          • Optional 'groups' claim (security groups, sAMAccountName)
   │
   ├── App Registration: VendorPulse-NonProd (mirror)
   │
   ├── Security Groups:
   │     • shell-vmo-admins
   │     • shell-vmo-coordinators
   │     • shell-vmo-sponsors
   │     • shell-vmo-viewers
   │
   └── Service Accounts:
         • vendorpulse-svc@shell.com   (mailbox; not a sign-in account)
```

### 8.2 Managed identity (Azure side)

System-assigned managed identity on each App Service instance is granted:

| Resource | Role |
|----------|------|
| Key Vault | `Key Vault Secrets User` (read secrets), `Key Vault Certificate User` (read cert) |
| Container Registry | `AcrPull` |
| Application Insights | `Monitoring Metrics Publisher` |
| Postgres (if using AAD auth) | Specific DB role mapped via PostgreSQL |

**No connection strings with passwords** for Azure resources where managed identity is supported.

### 8.3 Secret inventory (Key Vault)

| Secret | Provenance | Rotation |
|--------|-----------|----------|
| `anthropic-api-key` (or `azure-openai-api-key`) | LLM provider portal | 90 days (manual) |
| `session-signing-key` | Generated at infra bootstrap | 12 months (two-key rolling) |
| `postgres-password` | Generated at Postgres provisioning (used only if AAD auth unavailable) | 90 days (rotation pipeline) |
| `graph-app-cert` | Certificate object (not secret), generated at Entra app reg time | 12 months (auto-renewal via Azure Automation) |
| `appinsights-connection-string` | App Insights provisioning | Never (regenerated only if compromised) |

**Rotation pipeline:** for keys we own (signing key, Postgres password), a scheduled Azure DevOps pipeline rotates and updates KV. App Service picks up via KV reference at next config refresh (within minutes).

---

## 9. Observability

### 9.1 What gets emitted

| Source | Destination | Retention |
|--------|------------|-----------|
| HTTP request logs | App Insights | 30 days hot, 90 days cold |
| App logs (`structlog` JSON) | App Insights via OTel | 30 days hot, 90 days cold |
| `agent_runs` rows | Postgres (90 days) + mirrored to Log Analytics (immutable, 3 years) | per row |
| `external_calls` rows | Postgres (90 days) + mirrored to Log Analytics (immutable, 3 years) | per row |
| `security_events` rows | Postgres + mirrored to Log Analytics (immutable, 7 years) | per row |
| Custom metrics | App Insights metrics store | 90 days |
| Azure platform logs | Diagnostic settings → Log Analytics | per workspace |

### 9.2 Alerts

| Alert | Trigger | Severity | Routing |
|-------|---------|----------|---------|
| App down | Availability test fails 2 consecutive checks (1-min) | P1 | Teams channel + on-call |
| Agent failure rate > 20% | over 15-min window | P1 | Teams channel + on-call |
| Graph 5xx rate > 10% | over 5-min window | P2 | Teams channel |
| LLM 5xx rate > 10% | over 5-min window | P2 | Teams channel |
| Daily LLM budget at 80% | gauge crosses threshold | P3 | Teams channel + email Shell VMO |
| Daily LLM budget at 100% | gauge crosses threshold | P2 | Teams channel + on-call |
| Cert expiry < 30 days | daily check | P3 | Teams channel + email Zensar DevOps |
| Postgres CPU > 80% | sustained 10 min | P3 | Teams channel |
| Free Postgres storage < 20% | daily check | P3 | Teams channel |

### 9.3 Dashboards (Azure Workbooks)

Three workbooks are delivered:

1. **Operator dashboard** — agent runs, Graph throttles, error rates, latency P50/P95/P99. For Shell IT Ops.
2. **Coordinator dashboard** — embedded inside the app for VMO coordinators (read from `/api/v1/admin/health`).
3. **Cost dashboard** — LLM token spend, Azure resource cost trend. For Shell VMO + finance.

---

## 10. Scaling

### 10.1 Capacity model

Workload profile (per quarter, full Shell vendor portfolio):

- ~20–25 active cycles in flight at peak (mid-quarter)
- ~5–10 concurrent coordinator users at peak
- ~10–15k LLM tokens per cycle average; bursty during minutes generation
- ~50 Graph calls per cycle (bulk dispatch days are higher)

### 10.2 App Service autoscale rules

| Metric | Action |
|--------|--------|
| CPU > 70% sustained 10 min | Scale-out: +1 instance |
| CPU < 30% sustained 30 min | Scale-in: −1 instance |
| Queue length > 100 (HTTP queue) | Scale-out: +1 instance |
| Max instances | 6 |
| Min instances | 2 (HA) |

### 10.3 Postgres scaling

Vertical only at first release. The Flexible Server tier (D2ds_v5) handles the expected load with significant headroom. **Read replicas not configured** — workload is write-heavy at predictable times, not read-bound.

### 10.4 LLM scaling

LLM throughput is bounded by the provider quota, not by our infrastructure. We negotiate quota during procurement (typically 4M tokens/min on Anthropic enterprise tier — more than enough). Per-cycle budget enforces cost discipline.

---

## 11. High availability & disaster recovery

### 11.1 HA within region (West Europe)

| Component | HA mode |
|-----------|---------|
| App Service | Multi-instance (2+ instances across availability zones via App Service Plan zone-redundancy) |
| Postgres | Zone-redundant Flexible Server (sync standby in another AZ; automatic failover ~60s) |
| Key Vault | Zone-redundant by default |
| Front Door | Globally redundant |
| Container Registry | Standard tier zone redundancy |

**Single region availability target: 99.95%** (better than our 99.5% business-hours SLA — headroom for planned maintenance).

### 11.2 DR — cross-region

| Scenario | Recovery |
|----------|---------|
| App Service plan failure | Auto failover within AZ → no action |
| Postgres primary failure | Auto failover to zone-redundant standby → ~60s |
| **Full region outage (West Europe)** | **Manual DR runbook execution** — re-deploy to North Europe via Bicep (~45 min), restore Postgres from geo-redundant backup (~30 min). **RTO: 2 hours, RPO: 15 minutes.** |

**No active-active multi-region** for v1. If Shell wants <30 minute RTO, that's a Phase 2 architectural change (~6 weeks, doubles infrastructure cost).

### 11.3 Backup policy

| Resource | Backup | Retention |
|----------|--------|-----------|
| Postgres | Automated daily full + WAL continuous | 7 days PITR + 35 days vault retention |
| Key Vault | Soft-delete | 90 days |
| App Service | Stateless — redeploy from image | n/a |
| Container Registry | Geo-replication off; rebuild from CI if lost | n/a |
| Configuration | All in Bicep + Key Vault → recoverable from source | n/a |

### 11.4 DR drill

Quarterly. Documented in the runbook:
1. Take a Postgres geo-restore snapshot to the DR region
2. Deploy Bicep parameters/`dr.parameters.json` to the DR resource group
3. Sanity-check connectivity
4. Tear down

---

## 12. Resource naming

All resources follow Shell IT Service Catalogue naming standards (or Zensar's proposed if Shell standard not provided):

```
<resource-type-abbrev>-<workload>-<env>-<region>[-<instance>]

rg-vendorpulse-prod-weu
vnet-vendorpulse-prod-weu
snet-vendorpulse-app-prod-weu
asp-vendorpulse-prod-weu               (App Service Plan)
app-vendorpulse-prod-weu               (App Service)
pgsql-vendorpulse-prod-weu             (Postgres)
kv-vendorpulse-prod-weu                (Key Vault — note 24-char limit)
acr-vendorpulseprod                    (ACR — no hyphens allowed)
afd-vendorpulse-prod
appi-vendorpulse-prod-weu              (App Insights)
log-vendorpulse-prod-weu               (Log Analytics)
mi-vendorpulse-prod-weu                (Managed Identity if user-assigned)
```

---

## 13. Tagging

Every resource carries:

| Tag | Value (example) | Purpose |
|-----|-----------------|---------|
| `workload` | `vendorpulse` | Cost grouping |
| `environment` | `prod` / `nonprod` / `dev` | Cost / policy |
| `owner` | `vmo@shell.com` | Ownership escalation |
| `cost-centre` | (Shell-provided) | Charge-back |
| `data-classification` | `confidential` | Policy enforcement |
| `criticality` | `tier-2` | Backup / DR posture |
| `deployed-by` | `azure-devops-pipeline-123` | Provenance |

Tags enforced by Azure Policy (deny resource creation without required tags).

---

## 14. Compliance posture

| Item | Status |
|------|--------|
| **Data residency** | All Azure resources in West Europe (or UK South per Shell direction) |
| **Encryption at rest** | All PaaS defaults (AES-256, service-managed keys). Customer-managed keys (CMK) optional — recommend enabling from day one |
| **Encryption in transit** | TLS 1.2+ enforced on Front Door, App Service, Postgres (`sslmode=require`) |
| **Network isolation** | Public access disabled on Postgres, Key Vault, ACR; PE-only inside VNet |
| **Identity** | All workloads use managed identity; no embedded passwords in environment variables |
| **Audit** | Postgres + Log Analytics immutable workspace; 3y / 7y retention |
| **WAF** | Front Door WAF with OWASP top-10 ruleset |
| **DDoS** | Front Door has DDoS Standard upstream |
| **Vulnerability scanning** | Defender for Containers on ACR + App Service; weekly scan reports |
| **Policy compliance** | Subject to Shell's Azure Policies (tagging, locations, encryption) |

---

## 15. Deployment runbook (summary)

A concrete sequence for the very first prod deployment:

```
T-7 days
  [ ] Bicep `what-if` against empty prod RG — review output with Shell Cloud
  [ ] Confirm secrets pre-seeded in Key Vault (manual one-time)
  [ ] Confirm DNS CNAME provisioning ticket scheduled

T-3 days
  [ ] Deploy Bicep to prod RG (resources but App Service slot:production empty)
  [ ] Run alembic upgrade head against fresh prod Postgres
  [ ] Manual sanity check on Postgres / KV / ACR connectivity from a one-off VM in snet-app

T-1 day
  [ ] CI builds the release image; pushed to ACR; tagged prod-<date>-<sha>
  [ ] Deploy image to slot:staging
  [ ] Run smoke tests against slot:staging (curl /healthz, /readyz, sample OIDC login)
  [ ] CAB ticket approved

T-0 (go-live)
  [ ] DNS cutover — Shell DNS → AFD endpoint
  [ ] Slot swap (production ← staging)
  [ ] Watch error rate + agent failure rate for 60 min
  [ ] Open the pilot cycle (start of Phase 4)

T+1 day
  [ ] Review dashboards
  [ ] Post-deploy summary to Shell IT Ops
```

---

## 16. Cost model (production, monthly)

| Component | SKU | Cost (USD/month, est.) |
|-----------|-----|------------------------:|
| App Service Plan P1v3 × 2 | Compute | ~$220 |
| Postgres Flexible Server (GP D2ds_v5, ZR) | DB | ~$220 |
| Postgres backup storage (PITR + vault) | Storage | ~$30 |
| Key Vault (Standard) | Ops | ~$5 |
| Front Door (Standard) + routing rules + WAF | Edge | ~$45 |
| Container Registry (Standard) | Registry | ~$20 |
| Application Insights ingestion (~5 GB/month) | Telemetry | ~$15 |
| Log Analytics (audit, ~10 GB/month + 3y retention) | Telemetry | ~$120 |
| Private endpoints × 4 | Network | ~$30 |
| Azure DNS (private zones) | Network | ~$5 |
| Egress bandwidth (~100 GB/month) | Network | ~$8 |
| **Azure infrastructure subtotal** | | **~$720/month** |
| LLM (Anthropic API or Azure OpenAI, ~10M tokens/month) | LLM | ~$800–$1,200 |
| **Production run cost** | | **~$1,500–$2,000/month** |

Non-prod adds approximately $150/month.

Final figures depend on actual workload — could be lower if cycles are smaller than estimated, higher if Shell scales to a larger vendor portfolio.

---

## 17. Decision log — deployment

| ID | Decision | Status | One-line rationale |
|----|----------|--------|---------------------|
| D-DEP-01 | Azure West Europe primary, North Europe DR target | Proposed | Default Shell EMEA region |
| D-DEP-02 | App Service Linux containers; not AKS, not Container Apps | Proposed | Shell-standard managed PaaS |
| D-DEP-03 | Front Door Standard with origin lock | Proposed | Global edge + WAF; simpler than App Gateway |
| D-DEP-04 | Postgres Flexible Server, not Single Server | Proposed | Single Server is in deprecation |
| D-DEP-05 | Bicep over Terraform | Proposed | Shell default for new deployments |
| D-DEP-06 | Container image hosts both SPA + API | Proposed | Same-origin simplifies auth and CORS |
| D-DEP-07 | System-assigned managed identity (not user-assigned) | Proposed | Simpler lifecycle |
| D-DEP-08 | No active-active multi-region for v1 | Accepted | 99.5% business-hours SLA does not require it |
| D-DEP-09 | Zero-downtime deploys via slot swap (App Service) | Proposed | Native to App Service |
| D-DEP-10 | Immutable image tags; no `latest` | Accepted | Reproducible deploys + rollback |

All decisions to be ratified at the Phase 0 architecture review.

---

*Deployment Architecture — Zensar VendorPulse for Shell — 2026-06-03.*
