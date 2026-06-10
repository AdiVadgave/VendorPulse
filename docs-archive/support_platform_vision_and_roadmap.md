# ResolvAI — A Next-Generation Customer & Employee Support Platform

> **Working name:** ResolvAI (placeholder — alternatives: *Resolv*, *Atlas Support*, *Nexus CX*, *Pulse*)
> **Document type:** Product Vision, Architecture Blueprint & 24-Month Roadmap
> **Status:** Draft v1.0 — Internal Planning Document
> **Last updated:** April 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Market Opportunity](#2-the-market-opportunity)
3. [Vision, Mission & Guiding Principles](#3-vision-mission--guiding-principles)
4. [Competitive Positioning](#4-competitive-positioning)
5. [Platform Architecture — The Four Pillars](#5-platform-architecture--the-four-pillars)
6. [Product Modules in Detail](#6-product-modules-in-detail)
7. [Key Differentiators](#7-key-differentiators)
8. [Technology Stack](#8-technology-stack)
9. [24-Month Product Roadmap](#9-24-month-product-roadmap)
10. [Risks & Mitigations](#10-risks--mitigations)
11. [Appendix — Feature Matrix vs Competitors](#11-appendix--feature-matrix-vs-competitors)

---

## 1. Executive Summary

The global customer support software market is now a $40B+ industry, but it is crowded with platforms that each have meaningful gaps. Yellow.ai is strong in voice and emerging markets but complex to deploy. Ada is powerful but only sits on top of another helpdesk. Kore.ai is the deepest enterprise play but requires months of implementation. Intercom is the easiest to set up but is customer-service-centric and priced-per-resolution at scale. Zendesk is the market leader but its AI is bolted onto a 19-year-old ticketing core.

**ResolvAI is a unified, AI-native support platform that combines a full helpdesk, an autonomous AI agent, an agent copilot, a knowledge graph, and a multi-agent orchestration engine — sold as one product, with transparent pricing, and deployable in hours rather than months.**

We win by doing three things that none of the incumbents do together:

1. **AI-native from day one** (not bolted on) — every module is built around a shared reasoning engine and shared memory.
2. **One unified platform for customer support, employee (IT/HR) support, and business process automation** — competitors force customers to buy three separate products.
3. **Transparent, outcome-based pricing + a genuine 14-day self-serve free trial** — no "book a demo" wall, no mandatory professional services.

The first 24 months focus on shipping a credible MVP(solution) in six months, reaching product-market fit by month 12, and establishing enterprise-readiness (SOC 2, HIPAA, on-prem option) by month 24.

---

## 2. The Market Opportunity

### Market size and tailwinds

- The customer experience (CX) software market is expected to exceed $45B by 2028, growing ~15% CAGR.
- Over 70% of enterprises are actively replacing legacy IVR and rule-based bot systems with LLM-powered agents.
- Employee service (internal IT + HR automation) is a fast-growing adjacency that most support vendors address only as an afterthought.
- Mid-market companies (200–2,000 employees) are under-served — incumbents either target the Fortune 500 (Kore.ai, Ada) or the long tail of SMBs (Intercom's lower tiers), leaving a real gap in the middle.

### Customer pain points we solve

| Pain | What customers tell us | How ResolvAI addresses it |
|---|---|---|
| Too many tools | "We pay for Zendesk, Ada, Gong, and a separate HR bot" | One unified platform, one subscription |
| Long implementation | "Our Ada rollout took 14 weeks" | Self-serve setup in under 2 hours for core features |
| Opaque pricing | "We can't budget without a sales call" | Published pricing on the website |
| Poor internal IT/HR automation | "Our ITSM bot is awful, agents hate it" | First-class Employee Support module |
| Shallow integrations | "The Shopify connector just reads order status" | Deep, action-capable integrations with stored procedure and API-level reach |
| No control over AI behavior | "We're scared it will hallucinate a refund policy" | Policy guardrails, simulations, and approval gates built in |

---

## 3. Vision, Mission & Guiding Principles

### Vision

> **A world where every support interaction — for customers and employees alike — is resolved on the first touch, by an AI that is trusted, governed, and accountable.**

### Mission

To build the most complete, transparent, and trustworthy AI-native support platform — one that any company, from a 50-person startup to a Fortune 500, can deploy confidently and grow into.

### Guiding product principles

1. **AI-first, not AI-added.** Every core workflow is designed assuming an LLM is in the loop.
2. **Unified by default.** One inbox, one knowledge graph, one analytics layer — not a set of disconnected modules.
3. **Transparent pricing.** Published on the website, predictable, aligned to customer value.
4. **Self-serve first.** A customer should reach live resolution in under 2 hours without talking to sales.
5. **Governable AI.** Every AI decision is explainable, auditable, and controllable via policies and simulations.
6. **Open ecosystem.** We will never lock customers in — exports, open APIs, and MCP-native from day one.
7. **Enterprise-grade, mid-market-friendly.** SOC 2, HIPAA, on-prem — but without the enterprise-only pricing.

---



## 4. Competitive Positioning

### How we position against each competitor

| Competitor | Their strength | Their weakness | How ResolvAI wins |
|---|---|---|---|
| **Yellow.ai** | Voice, emerging markets, scale | Opaque pricing, complex rollout | Faster setup, published pricing, better analytics |
| **Ada** | Reasoning engine, resolution rate | Needs another helpdesk underneath, $70K+ starting | All-in-one (no separate helpdesk needed), mid-market pricing |
| **Kore.ai** | Enterprise depth, on-prem, multi-agent | Steep learning curve, implementation heavy | Self-serve solution, on-prem as an option (not the only path) |
| **Intercom (Fin)** | Fast setup, developer-friendly | Per-resolution cost adds up, customer-support only | Employee support + customer support in one; more predictable pricing tiers |
| **Zendesk** | Ecosystem, scale, incumbency | AI layered onto legacy core, expensive add-ons | AI-native core, one plan includes AI features, no add-on sprawl |

### Our one-line positioning statement

> **"ResolvAI is the AI-native support platform that replaces your helpdesk, chatbot, and internal IT bot with one unified product — live in two hours, at a price published on our website."**

---

## 5. Platform Architecture — The Four Pillars

ResolvAI is organized around four product pillars that share one reasoning engine, one knowledge graph, and one analytics layer.

### Pillar 1 — AI for Customers (External CX)

Everything a company needs to resolve customer issues across every channel: autonomous AI agent, agent copilot, inbox/helpdesk, knowledge base, and proactive engagement.

### Pillar 2 — AI for Employees (Internal Service)

IT helpdesk, HR service delivery, and internal knowledge answers — delivered through Slack, Teams, and a web portal.

### Pillar 3 — AI for Process (Workflow Automation)

A visual orchestration studio for multi-step, multi-system workflows (refunds, onboarding, offboarding, invoice processing). Non-conversational work triggered by conversations, schedules, or events.

### Pillar 4 — AI Platform (The Shared Core)

The underlying technology every pillar depends on:

- **Reasoning Engine** — LLM-agnostic orchestration, with routing across models
- **Knowledge Graph** — semantic layer unifying docs, tickets, and integrations
- **Memory Service** — short-term and long-term conversation/customer memory
- **Policy Engine** — guardrails, approval gates, HITL thresholds
- **Simulation Studio** — test agent behavior before deploying
- **Analytics & Observability** — every decision and outcome tracked
- **Integration Fabric** — pre-built connectors + MCP-native extensibility

---

## 6. Product Modules in Detail

### 6.1 Unified Inbox (Helpdesk Core)

A modern, AI-first ticketing workspace.

- Omnichannel inbox: email, chat, WhatsApp, Instagram DM, Facebook Messenger, SMS, voice, Slack, Teams, in-app messaging, Discord, API.
- Threaded conversations with full context across channels (one customer, one view).
- SLA management with business-hour awareness and escalation rules.
- Macros, templates, canned responses — all searchable by the copilot.
- Merge, split, link, and snooze conversations.
- Internal notes with @mentions.
- Side-panel customer profile: history, open tickets, lifetime value, linked orders.

### 6.2 AI Agent (Autonomous Resolver)

Our equivalent of Ada's Reasoning Engine and Intercom's Fin — but bundled with the helpdesk.

- Understands intent across multi-turn conversations.
- Pulls from the Knowledge Graph before answering (RAG with citations).
- Executes multi-step workflows via the Orchestration module.
- Handles ambiguity by asking clarifying questions.
- Seamless handoff to humans with full context transfer.
- Supports text, voice, email, and image input (vision).
- Safety layers: policy guardrails, hallucination detection, confidence thresholds.
- **Coaching mode** — give feedback like "when a customer mentions Alaska, always mention shipping delays" and the AI learns without a full retrain.

### 6.3 Agent Copilot

A persistent side-panel for human agents.

- Suggests replies drafted from the Knowledge Graph.
- Summarizes long threads in one click.
- Auto-fills ticket metadata (category, priority, tags).
- Surfaces similar solved tickets.
- One-click actions: execute a workflow, look up an order, issue a refund.
- Real-time translation so an English-only agent can serve Spanish customers.
- Tone-polish mode: rewrites drafts in a chosen voice (empathetic, concise, formal).

### 6.4 Knowledge Graph & Knowledge Builder

Unified knowledge layer across sources.

- Connectors for Confluence, Notion, SharePoint, Google Drive, Guru, public help centers.
- **Auto-builder:** analyzes solved tickets and drafts new help articles for human review.
- **Gap detection:** flags topics the AI is failing on so teams know what to write next.
- Citations on every AI answer — customers and agents see the source.
- Version control and scheduled publishing.
- Multilingual: author once, auto-translate and keep in sync.
- Customer-facing **Help Center** with generative search built in (not a paid add-on).

### 6.5 Voice AI

Phone support that actually sounds human.

- Natural voice with low latency (under 700ms response start).
- Interruption handling — knows when to stop talking.
- Sentiment detection from audio — flags frustration in real time.
- Works with existing contact centers (Genesys, NICE, AWS Connect, Twilio).
- Warm handoff to human with summary of the call so far.
- Real-time transcript with call summary auto-logged to the ticket.

### 6.6 Workflow Orchestration Studio (AI for Process)

Visual builder for multi-step processes — the equivalent of Zendesk's Action Builder and Ada's Playbooks, but more powerful.

- Drag-and-drop canvas with AI-generated first drafts ("describe the refund flow in English, we build the graph").
- Steps: API calls, database queries, LLM decisions, human approval, branching logic.
- Approval gates and human-in-the-loop checkpoints.
- Retry policies, fallbacks, and error handling.
- Version control and one-click rollback.
- Runs observable in real time — every step logged for audit.

### 6.7 Employee Support Suite (AI for Employees)

First-class internal service desk, not an afterthought.

- Pre-built templates for common IT requests: password reset, VPN, software install, access requests.
- HR templates: PTO balance, payslip access, policy lookup, onboarding/offboarding.
- Works inside Slack, Teams, and a branded employee web portal.
- Integrations with Okta, Jamf, Microsoft Intune, Workday, BambooHR.
- Service catalog with approvals and cost-center routing.
- Connects to the same Knowledge Graph — no duplicate content.

### 6.8 Multi-Agent Orchestration

For complex requests, multiple specialized AI agents collaborate — each with its own scope of authority.

- **Triage agent** routes the request.
- **Knowledge agent** retrieves relevant content.
- **Action agent** executes API calls.
- **Policy agent** validates compliance.
- **Communication agent** composes the reply.
- A supervising orchestrator decides which agents participate and in what order.
- Each agent has a strict "scope of authority" — for example, the Action agent can issue refunds up to $100 but escalates beyond that.

### 6.9 Simulation & Testing Studio

Before any change ships, teams can simulate it.

- Replay historical conversations against the new agent config.
- Generate synthetic conversations for edge-case coverage.
- A/B test two configurations in production with automatic rollback.
- Regression tests run on every deploy.

### 6.10 Analytics & Insights

- Live dashboards: resolution rate, CSAT, AHT, first-response time, automation rate, deflection.
- **Topic discovery:** AI clusters conversations into auto-labeled topics and surfaces week-over-week trends.
- **Drop-off analysis:** where customers abandon or escalate.
- **Agent scorecards:** quality, efficiency, coaching opportunities.
- **Natural-language analytics:** "show me CSAT for refund conversations in Q2" — returns a chart.
- Exportable to Snowflake, BigQuery, Redshift.

### 6.11 Proactive Engagement

- In-app product tours and checklists.
- Outbound campaigns (upgrade prompts, churn prevention, onboarding nudges).
- Triggered by behavior ("user hasn't logged in for 14 days") or by AI ("customer seems confused about billing").
- Pulls from the same AI agent and knowledge graph for consistency.

### 6.12 Admin & Governance

- Role-based access control (RBAC) with custom roles.
- Audit log of every AI decision, action, and human override.
- Policy management: where the AI can act autonomously, where it must escalate.
- Data residency controls (US, EU, India, APAC).
- BYOK encryption (bring your own key) for enterprise tier.

---

## 7. Key Differentiators

1. **One unified platform** — helpdesk + AI agent + copilot + employee service + process automation in one product, not three.
2. **2-hour self-serve onboarding** — install a snippet, connect a knowledge source, go live.
3. **Transparent pricing** — every tier published on the website.
4. **AI-native core** — not a legacy ticketing system with AI bolted on.
5. **Multi-agent orchestration** out of the box (Kore.ai's flagship feature, democratized).
6. **First-class employee support** — most competitors treat it as an add-on.
7. **Deep, action-capable integrations** — not just data reads; full workflow execution.
8. **Simulation-first development** — test before ship, always.
9. **MCP-native** — compatible with the emerging agent interoperability standard from day one.
10. **Open export** — customers can leave with all their data. No lock-in.

---

## 8. Technology Stack

### Proposed stack (subject to iteration)

| Layer | Choice | Rationale |
|---|---|---|
| Backend API | Python (FastAPI) + Go for latency-sensitive services | FastAPI for AI workloads, Go for the real-time messaging gateway |
| Frontend (agent app) | React + TypeScript + Tailwind | Modern, fast, hirable |
| Mobile agent app | React Native | Code-sharing with web |
| Data stores | PostgreSQL (primary), Redis (cache), ClickHouse (analytics), S3 (objects), pgvector/Pinecone (embeddings) | Battle-tested, scales horizontally |
| Streaming | Kafka | Event bus for workflows, audit, analytics |
| LLM routing | LiteLLM or custom router | Avoid vendor lock-in; route by cost/quality/latency |
| LLM providers | Anthropic Claude (primary), OpenAI GPT, Google Gemini, open-source (Llama, Mistral) for on-prem | Multi-model by design |
| Voice | ElevenLabs / Cartesia / in-house, Deepgram / Whisper for STT | Best-in-class voice quality |
| Search | Elasticsearch + hybrid (BM25 + vector) | Proven for RAG |
| Observability | OpenTelemetry, Datadog, Sentry | Industry standard |
| Infra | Kubernetes on AWS (multi-region), Terraform | Portable to on-prem via same manifests |

### Architectural principles

- **Event-sourced core** — every ticket, action, and AI decision is an immutable event.
- **Multi-tenant by default, single-tenant on request** — same codebase, different deployment.
- **Stateless services + shared state stores** — easy to scale.
- **API-first** — every UI action is a public API call.
- **Feature-flagged** — every new capability is rolled out behind a flag.

---

## 9. 24-Month Product Roadmap

A roadmap built in four 6-month phases. Each phase has a clear theme, exit criteria, and shippable milestones.

### Phase 1 — Foundation (Months 1–6)

**Theme:** Build a credible, usable Solution that a design partner can put into production.

**Exit criteria:**
- 10 paying design partners live.
- 10,000 real tickets processed.
- 50%+ AI resolution rate on routine queries.
- SOC 2 Type I audit kicked off.

**Deliverables:**

| Month | Milestones |
|---|---|
| 1 |  Architecture finalized. Core infrastructure provisioned (K8s, PostgreSQL, Kafka). Repo scaffolded. |
| 2 | Unified Inbox v1: email + website chat. Ticket CRUD, assignments, basic SLA. Auth + RBAC. |
| 3 | AI Agent v1: RAG over one knowledge source. Basic guardrails. Citations. Handoff to human. |
| 4 | Agent Copilot v1: suggested replies, summarization. First 10 integrations (Salesforce, HubSpot, Shopify, Stripe, Slack, Jira, Intercom migration, Zendesk migration, Gmail, Outlook). |
| 5 | Knowledge Builder v1 (auto-draft articles from solved tickets). Analytics v1 (resolution rate, CSAT, AHT). Help Center with generative search. |


### Phase 2 — Product-Market Fit (Months 7–12)

**Theme:** Expand channels, add Voice AI, reach PMF, and turn on product-led growth.

**Exit criteria:**
- 100 paying customers.
- $150K MRR.
- Net Revenue Retention > 110%.
- SOC 2 Type II certified.
- 90%+ self-serve onboarding success rate.

**Deliverables:**

| Month | Milestones |
|---|---|
| 7 | WhatsApp, Instagram, Facebook Messenger, SMS channels. Mobile agent app (iOS + Android) v1. |
| 8 | Voice AI v1: natural conversation, sentiment detection, Twilio integration. |
| 9 | Simulation Studio v1 (replay historical conversations). Workflow Studio v2 (API calls, approvals, human-in-loop). |
| 10 | Coaching mode for the AI Agent. Topic discovery analytics. Natural-language analytics queries. |
| 11 | Proactive engagement: tours, checklists, outbound campaigns. 50 integrations total. Public launch (pricing page live, free trial live). |
| 12 | SOC 2 Type II certified. HIPAA-ready. Multi-region deployment (US + EU). First enterprise pilot. |

### Phase 3 — Enterprise Readiness (Months 13–18)

**Theme:** Add employee support, multi-agent orchestration, enterprise governance, and land the first big logos.

**Exit criteria:**
- 300 paying customers.
- $500K MRR.
- First 5 enterprise deals closed ($100K+ ACV).
- 3 Fortune 1000 logos live.

**Deliverables:**

| Month | Milestones |
|---|---|
| 13 | Employee Support Suite v1: IT helpdesk templates, Slack/Teams bot, Okta + Jamf integrations. |
| 14 | Employee Support Suite v2: HR templates, Workday + BambooHR integrations. Service catalog. |
| 15 | Multi-agent orchestration v1: triage, knowledge, action, and policy agents. Scope-of-authority controls. |
| 16 | Advanced governance: policy engine, audit explorer, explainability view. ISO 27001 audit kicks off. |
| 17 | 100 integrations. Marketplace for partner-built integrations. BYOK encryption option. |
| 18 | First on-prem deployment . Data residency in India and APAC. First BPO/outsourcer deal. |

### Phase 4 — Scale & Expansion (Months 19–24)

**Theme:** Scale go-to-market, deepen differentiation (multi-agent, voice, employee), and set up for Series B.

**Exit criteria:**
- 800 paying customers.
- $1.5M MRR.
- ISO 27001 certified.
- 200 integrations.
- Established partner channel.

**Deliverables:**

| Month | Milestones |
|---|---|
| 19 | Self-improving AI: automatic gap detection, procedure generation, A/B testing in production. |
| 20 | Vertical templates: e-commerce, SaaS, fintech, healthcare, BPO starter packs. |
| 21 | Voice AI v2: multilingual, emotion-aware, agent-assist for live calls. |
| 22 | Advanced workflow features: long-running workflows, event triggers, cross-system transactions. |
| 23 | Partner program launched: SI partnerships, reseller program, integration certification. |
| 24 | ISO 27001 certified. FedRAMP Moderate in progress. On-prem generally available. Series B fundraise. |

---

## 10. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| LLM costs spiral as usage grows | High | High | Multi-model router, caching, small-model routing for simple queries, negotiate volume commits early |
| Incumbents match our features quickly | High | Medium | Speed of execution, deeper focus on mid-market, superior onboarding |
| Security incident or data leak | Low | Catastrophic | SOC 2 early, external penetration tests, bug bounty program, strict least-privilege |
| AI hallucinates and damages a customer | Medium | High | Guardrails, policy engine, simulations, confidence thresholds, HITL gates |
| Slow enterprise sales cycle | High | Medium | Lead with mid-market PLG; enterprise is a Year-2 bet |
| Talent competition with OpenAI/Anthropic | High | Medium | Competitive comp, meaningful equity, mission-driven story |
| Platform shift (e.g., a new MCP standard) | Medium | Medium | MCP-native from day one, open APIs, avoid proprietary lock-in |
| Vendor concentration on a single LLM | Medium | High | Multi-provider routing, open-source fallback for on-prem |
| Regulatory change (AI Act, state privacy laws) | Medium | Medium | Dedicated compliance hire by month 6, monitor EU AI Act, CPRA, etc. |

---

## 11. Appendix — Feature Matrix vs Competitors

| Capability | Yellow.ai | Ada | Kore.ai | Intercom | Zendesk | **ResolvAI** |
|---|---|---|---|---|---|---|
| AI agent (resolver) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Built-in helpdesk/inbox | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Agent copilot | ✅ | Partial | ✅ | ✅ | ✅ | ✅ |
| Voice AI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Omnichannel (40+) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (target) |
| Employee support (IT/HR) | Partial | ❌ | ✅ | ❌ | ✅ | ✅ |
| Multi-agent orchestration | Partial | ❌ | ✅ | ❌ | ❌ | ✅ |
| Workflow/process automation | ✅ | ✅ (Playbooks) | ✅ | Partial (Procedures) | ✅ (Action Builder) | ✅ |
| Simulation studio | ❌ | ❌ | ✅ | ✅ | Partial | ✅ |
| Knowledge auto-generation | Partial | ❌ | Partial | ✅ | ✅ | ✅ |
| Transparent pricing | ❌ | ❌ | Partial | ✅ | ✅ | ✅ |
| Self-serve < 2 hour setup | ❌ | ❌ | ❌ | ✅ | Partial | ✅ |
| On-prem deployment | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ (enterprise) |
| BYOK encryption | ❌ | ❌ | ✅ | ❌ | Partial | ✅ (enterprise) |
| SOC 2, HIPAA, ISO 27001 | Partial | ✅ | ✅ | ✅ | ✅ | ✅ (by month 24) |
| MCP-native | ❌ | ❌ | Partial | ✅ | ✅ | ✅ |
| Open data export | Partial | Partial | Partial | ✅ | ✅ | ✅ |
| 14-day free trial | ❌ | ❌ | Limited | ✅ | ✅ | ✅ |
| Published pricing | ❌ | ❌ | Partial | ✅ | ✅ | ✅ |

---

## Closing

ResolvAI is not an incremental product. It is a deliberate bet that the support software market is ready for an AI-native, unified platform that serves both customers and employees, with transparent pricing and fast setup.

The roadmap above is ambitious but achievable with a focused team of ~45 in Year 1 and ~110 in Year 2. The most important things we must get right in the first 6 months are:

1. **Onboarding speed.** If a design partner isn't live in 48 hours, we've lost.
2. **Resolution quality.** If our AI hallucinates or fails to resolve, no feature list saves us.
3. **Unit economics.** LLM costs must not eat our margins — multi-model routing is day-one work, not a Phase 2 optimization.

If we execute on those three, the rest of the roadmap unlocks.

---

*End of document.*
