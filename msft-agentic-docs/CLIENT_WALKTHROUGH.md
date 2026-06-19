# VendorPulse — Client Walkthrough (Shell)

## Speaker notes for the Solution & Deployment Architecture diagrams

> Purpose: a talk track for presenting the two architecture diagrams to Shell. Every term is explained in plain English plus the "why Shell cares" angle. Read sections almost verbatim or paraphrase.

---

## Opening: why there are two diagrams

Say this first — clients always ask.

"We have two views of the same system. The **Solution Architecture** answers *what is the system made of and how do the pieces talk?* — the logical design. The **Deployment Architecture** answers *where does it physically run inside Shell's Azure, and how is it built and operated?* — the hosting and DevOps view. Same system, two lenses. A solution architect reviews them as a pair and checks they agree — which they do."

The unifying theme of both:

**Deterministic core first, AI second. Single-tenant inside Shell. One private path in, everything internal stays private, and the only thing leaving Shell's network is Microsoft 365 — Graph and Entra — through a controlled egress.**

---

## Diagram 1 — Solution Architecture (the logical view)

Headline to open with: *"Single-tenant in Shell Azure. Deterministic core first, AI second. Agent layer: MAF SDK on Microsoft Foundry."*

Read it left to right = increasing trust zones: the user's browser on the left, Shell's most protected services on the right.

### Zone 1 — Client (who uses it and from what)

- **Web client (browser)** — No app to install; everything runs in the browser. *Why Shell cares:* nothing to deploy to endpoints, smaller attack surface.
- **VMO Coordinator / Sponsor / Viewer** — The three roles: the Vendor Management Office coordinator who drives the work, the executive sponsor who approves, and read-only viewers. "Authenticated via Entra SSO" means they log in with their normal Shell corporate identity — no separate password. *Why Shell cares:* access is governed by Shell's existing identity, with role separation built in.
- **React 19 SPA** — The single-page web app. "Design System" is the shared, consistent UI component library. "ApprovalPanel" is the screen where a human reviews every AI draft before anything happens. *Why Shell cares:* the human-approval control is a first-class part of the UI, not an afterthought.

### Zone 2 — Edge (the front door and the bouncer)

- **Azure Front Door + WAF** — Microsoft's global entry point. Front Door is the reverse proxy/CDN all traffic must pass through. WAF (Web Application Firewall) inspects and blocks attacks.
  - **TLS** — all traffic is encrypted (HTTPS, TLS 1.2+).
  - **OWASP** — the WAF blocks the OWASP Top-10 web attacks (SQL injection, cross-site scripting, etc.).
  - **origin-lock** — the backend only accepts traffic that comes from Front Door; you cannot bypass it and hit the app directly.
  - *Why Shell cares:* there is exactly one, hardened, inspected way in.

### Zone 3 — Shell Azure Subscription (everything runs inside Shell's own cloud)

Header: *Shell Azure Subscription (West Europe)* — this whole system lives in one Shell-owned subscription, single-tenant, in West Europe for EU data residency. *Why Shell cares:* data never sits in a shared or multi-tenant environment, and it stays in the EU.

- **Private VNet** — a private virtual network. Nothing inside is reachable from the public internet except through Front Door. *Why Shell cares:* the blast radius is sealed.

Inside the App Service (the application itself):

- **Azure App Service (Backend container) — FastAPI app** — Azure's managed hosting running our application as a Linux container. It is one deployable application, organized into modules inside (not a sprawl of microservices). *Why Shell cares:* simpler to operate, patch, and audit than a microservice fleet.
- **Entra OIDC auth + RBAC** — the login/authorization layer. OIDC is the standard sign-in protocol with Entra; RBAC maps a user's Entra group to what they are allowed to do. *Why Shell cares:* authorization is enforced server-side, tied to Shell identity.
- **WorkflowEngine (12-state)** — the heart of the system. It enforces the 12-step QBR process as a strict, forward-only state machine. This is deterministic — no AI. *Why Shell cares:* the business process cannot be skipped, reordered, or hallucinated; it is hard-coded logic.
- **Approval gate** (drawn in red — the headline control) — every AI-generated item is produced as a draft and held here until a human approves. The real action only fires after approval, from deterministic code. *Why Shell cares:* this is the direct implementation of Shell's "human oversight for privileged actions" control (IRM 3.6.3). The AI never acts on its own.
- **Deterministic services** — all the business-critical calculations: slot ranking, scorecard validation, analytics. No AI here. *Why Shell cares:* anything that affects a decision is reproducible code, not a model guess.
- **GraphService** — the component that talks to Microsoft 365 (mail, calendar, Teams). *Why Shell cares:* a single, controlled integration point for all M365 actions.
- **MAF Agent layer to Foundry** — the Microsoft Agent Framework (MAF) agents. This is the only place AI is used, and it only drafts text (briefs, minutes, summaries). It calls the model and comes back with words a human then reviews. *Why Shell cares:* AI is boxed into text generation, behind the approval gate, using a Microsoft-supported framework.

The private connection to AI:

- **Private Endpoint to Azure AI Foundry (Inside Shell tenant)** — the AI model service runs inside Shell's own tenant and is reached over a Private Endpoint (a private network address), with public access disabled. GPT-4o is the model. *Why Shell cares:* this is the critical one — vendor and meeting data sent to the model never leaves Shell's private network. It is not a public API call.

### Zone 4 — Data Tier (where data lives, all private)

Label: *Managed Identity, Private Link (no public access)* — the app authenticates to data services using a Managed Identity (an Azure-issued identity, so there are no stored passwords), and everything is reached over Private Link (private network only).

- **Azure PostgreSQL (Flexible Server)** — the production database (cycles, scorecards, meetings).
- **Azure Key Vault** — the secrets safe: the LLM key, the Graph certificate, and the JWT signing key. *Why Shell cares:* no secrets in code or config files.
- **Blob Storage** — stores meeting minutes and transcripts.
- **App Insights + Log Analytics (private via AMPLS)** — telemetry and the immutable audit log of every AI run. OTel = OpenTelemetry, the open tracing standard. AMPLS keeps even the monitoring data on the private network. *Why Shell cares:* every AI action is traceable and the audit trail cannot be quietly altered.

### Egress (the one controlled way out)

- **Shell egress proxy** — the single, governed exit point. Only the genuinely-external Microsoft 365 services are reachable through it. *Why Shell cares:* even if something inside were compromised, it cannot phone home to an arbitrary address — egress is allow-listed and logged.

### Zone 5 — External (the only things outside Shell's network)

- **Microsoft Graph (Shell tenant)** — the Microsoft 365 API. Mail.Send / Calendars / OnlineMtgs are the specific permissions used to send invites, book meetings, and create Teams calls.
- **Azure AD / Entra ID** — Shell's identity provider: SSO, group-to-role mapping, and the app's own identity. *Why Shell cares:* these are standard Microsoft 365 services Shell already trusts and governs; nothing novel leaves the boundary.

Close Diagram 1 with: *"AI is confined to drafting text, behind a human approval gate, on a model that runs privately inside Shell's tenant. Every business decision is deterministic code. That's the whole governance argument in one picture."*

---

## Diagram 2 — Deployment Architecture (the hosting and operations view)

Headline: *"Single-tenant. West Europe. Azure App Service. Private VNet. App-only certificate auth."*

This view adds three things the logical view does not: how users physically reach it, how it is built and released, and how it is operated and monitored.

### "Access path" (left column) — the journey of a request

- **Shell user (on corporate network)** — the person, on Shell's network.
- **Microsoft Entra ID (Shell SSO)** — they authenticate with Shell single sign-on.
- **Single Sign-On (OIDC / MSAL)** — the sign-in mechanics. OIDC is the protocol; MSAL is Microsoft's standard sign-in library. *Why Shell cares:* it is the supported, standard Microsoft auth stack — nothing hand-rolled.
- **vendorpulse.it.shell.com (DNS to Front Door)** — the app's Shell-branded web address, which points at Front Door. *Why Shell cares:* it lives under Shell's own domain and naming.
- **Shell egress proxy (outbound control)** — the controlled exit for outbound traffic (same concept as Diagram 1's egress). *Why Shell cares:* outbound is governed by Shell's standard egress control.

### Shell Azure Subscription (West Europe) — the hosting boundary

- **Azure Front Door + WAF** — TLS 1.2+, OWASP, origin-locked to App Service — same hardened entry point as Diagram 1.
- **Private VNet (VNet integration, Private Endpoints)** — the private network. VNet integration means the App Service is plugged into this private network; Private Endpoints mean its dependencies are reached privately. *Why Shell cares:* no public network paths internally.

Azure App Service (Backend container) — the compute, and how we release safely:

- **Production slot (TLS 1.2+)** — the live environment serving real users. Inside it:
  - **SPA (React / nginx)** — the web app, served by nginx.
  - **FastAPI + MAF agents** — the backend API and the AI agent layer, running in the same container (the agents are in-process, not a separate service).
- **Staging slot (blue-green / zero-downtime swap)** — a parallel copy where the next version is deployed and warmed up, then swapped into production instantly. Blue-green means two environments side by side; zero-downtime swap means users never see an outage during release. *Why Shell cares:* releases are safe and reversible — if a swap goes wrong, you swap back.

Data Resource Group — data, in its own grouping, all private:

- **Postgres (Flexible)** — production database, reached over Private Link.
- **Key Vault (cert, keys — PE)** — secrets safe; PE = Private Endpoint (private access only).
- **Blob Storage (minutes — PE)** — meeting minutes/transcripts, private endpoint.
- *Why Shell cares:* data is segregated into its own resource group (cleaner permissions and lifecycle) and is entirely private.

Private Endpoint to Azure AI Foundry — AI runs in-tenant, privately: same as Diagram 1 — the model service is in Shell's tenant, reached over a Private Endpoint, public access disabled. *Why Shell cares:* the data-residency answer for AI.

### "Observability" lane — how we operate and prove it

- **Container Registry (ACR)** — the private store for the application's container images. *Why Shell cares:* the deployed image comes from a controlled, Shell-owned registry.
- **Azure Monitor** — the umbrella monitoring platform (metrics, alerts).
- **Application Insights (private via AMPLS)** — application performance and request tracing, kept private via AMPLS.
- **Log Analytics / immutable audit** — the queryable log store and the tamper-evident audit trail of every AI run.
- *Why Shell cares:* full operational visibility and an audit record that satisfies the compliance ask — and it is all on the private network.

### "External (outbound HTTPS)" — the only things outside

- **Microsoft Graph (Shell)** — Mail / Calendar / Teams, reached with an app-only certificate (a certificate-based identity, not a password).
- **Entra ID / Azure AD (app reg) — VendorPulse-Prod, cert in KV** — the application's own registered identity in Entra, whose certificate is stored in Key Vault. *Why Shell cares:* the app authenticates to Microsoft 365 with a certificate (stronger than a secret), and that certificate is vaulted.

### The footnote (read it aloud — the whole flow in one line)

*"Shell user to DNS (vendorpulse.it.shell.com) to Front Door (WAF) to App Service (private) to PostgreSQL via Private Link. Foundry via Private Endpoint (in-tenant, public access disabled). Graph + Entra login via outbound HTTPS through the egress proxy. Managed Identity to Key Vault / DB; app-only certificate to Graph."*

Translate it: *"One private path in, the database and AI are reached privately, the only outbound traffic is to Microsoft 365 through a controlled proxy, and the app proves who it is with managed identities and a certificate — no passwords anywhere."*

---

## The questions a Shell SA will ask — and your answers (rehearse these)

| Likely question | Your answer |
|---|---|
| Does our vendor/meeting data leave Shell to reach the AI model? | No. Azure AI Foundry runs in our tenant, public access disabled, reached over a Private Endpoint. Data stays on our private network. |
| Can the AI take actions on its own? | No. The AI only drafts text. Every action is held at the approval gate and only fires after a human approves, from deterministic code. |
| What is deterministic vs. AI? | All decisions — workflow transitions, slot ranking, scorecard validation, analytics — are deterministic code. AI is used only to write human-readable text. |
| How is it reachable — any public exposure? | One way in: Front Door + WAF, origin-locked to the App Service. Internally everything is Private Link / Private Endpoints. The only egress is Microsoft 365 via the Shell egress proxy. |
| How do you authenticate to Microsoft 365? | App-only certificate, stored in Key Vault, mailbox-scoped. No passwords or shared secrets. |
| Where are secrets? | Key Vault with Managed Identity — there are no secrets in code or config. |
| How do you release without downtime? | Blue-green deployment with a staging slot and zero-downtime swap; we can roll back by swapping back. |
| Can you prove what the AI did? | Every run is logged to an immutable audit trail in Log Analytics with correlation IDs, kept private via AMPLS. |
| Data residency? | Single-tenant, West Europe — EU residency. |

---

## One-line summary to leave them with

*"VendorPulse is a single-tenant Shell-Azure application where the business logic is deterministic, AI is limited to drafting text behind a human approval gate, the AI model runs privately inside Shell's own tenant, and the only thing that ever leaves the network is Microsoft 365 — through one controlled, logged egress."*
