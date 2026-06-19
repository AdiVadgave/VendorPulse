# VendorPulse — Meeting Cheat-Sheet

*One page. Glance at this during the room. Full detail in the Prep Pack.*

---

## The 7 lines to remember

- **What it is:** automates the **QBR** (Quarterly Business Review) for vendor governance — a fixed **12-step workflow**; AI only **drafts text**.
- **Deterministic-first, AI-second:** every decision is plain code. AI never decides or acts — it writes drafts a human approves.
- **Human-approval gate (HITL):** nothing sends — no email, no invite — until a person clicks Approve.
- **Where AI runs:** **Azure AI Foundry, inside Shell's tenant** (GPT-4o), over a **private** link. No public internet, no model training on Shell data.
- **Hosting:** **100% cloud, in Shell's own Azure. Not on-prem. Not serverless.** One **Azure VM (D4as v6 / D8as v6)** in a private network.
- **What changed:** started with FastAPI calling the model directly → on your steer, moved to **Azure AI Foundry + Microsoft Agent Framework (MAF)**. **PoC is done.**
- **No GPU anywhere** — all inference is remote in Foundry.

---

## Crisp one-line answers

> **"Is it serverless / on-prem / cloud?"** — "Runs entirely in Shell's own Azure cloud, single-tenant, your region, your network. **Not** on-prem, **not** serverless today: a right-sized **Azure VM** we control, simplest for security review. Can move to managed/serverless later — same code."

> **"What size server / spec?"** — "General-purpose **D4as v6 (4 vCPU / 16 GB)**, up to **D8as v6 (8 vCPU / 32 GB)** in prod. **No GPU** — inference is in Foundry; DB is a separate managed service. Resizable in minutes."

> **"Azure OpenAI or Azure AI Foundry?"** — "Same Microsoft stack, different layers: agents written with **MAF** → call the **Foundry Responses API** → served by **Azure OpenAI GPT-4o**, all inside Shell's Foundry tenant."

> **"How do you stop AI hallucinations / rogue actions?"** — "Model never touches facts, numbers, IDs, or decisions — those are deterministic code. It only drafts prose, always human-approved. A hallucination is a wording a reviewer rejects, never a wrong action."

> **"Are we locked into Microsoft?"** — "No. An **LLMProvider abstraction** keeps Anthropic/Claude selectable as a config switch."

> **"Biggest blocker to production?"** — "Not tech — **Shell's compliance gates**: AI Registry + ServiceNow, IRM IAQ, EU AI Act classification, Shell.AI + TRB approval, on IDT-managed Azure. External lead time — start in parallel now."

---

## What to demo (in order) — MAF has **no UI**; it's code

- **1. The app (React) — the ApprovalPanel:** AI drafts → human approves → logged. The money-shot.
- **2. Azure AI Foundry portal:** project → **Deployments → gpt-4o** → Playground → Monitoring. "Model runs on Foundry, in your tenant."
- **3. (AI architect)** run `poc_scheduling_foundry.py --gate` (gated send is **refused**) + show the agent code. "We own every prompt."
- **Don't** open Foundry's "Agents" tab and call it ours — our agents are **in-process code**, not hosted. If 2 min: ApprovalPanel + gpt-4o deployment.

## Flow in one line

> Browser **shows**; **FastAPI** decides, orchestrates & enforces the rules (holds secrets, runs the 12-state engine, gates approval); **Foundry** only **drafts** wording; **Graph** only **sends after a human approves**. Drafting (AI) and sending (deterministic) are **two requests with a human in between** — the AI has no send tool.

## Agent hosting — "are these hosted Foundry agents?"

> "No — today they're **MAF SDK in-process** (our code in the backend; Foundry only serves the model). **Yes, we can host them** as **Foundry Hosted Agents** — same code, managed endpoint — but it's **public preview**, so it's our **roadmap once GA**, not a preview dependency for your security review."

## Cost (say "order of magnitude, not a quote")

- Production Azure stack: **~$450–650 / month** · non-prod **+~$80–120 / month**
- Foundry model usage: **~$1,000 / month** · lower with reserved instances

---

## Don't get caught out

- Diagram shows an **App Service** icon but the doc says **VM** → "draft artifact; target is a VM; both valid, same code."
- **Pre-production:** PoC proves the pattern; full build (infra, identity, DB migration, all agents, tests) is ahead.
- **No automated tests yet** → CI regression stage is the plan before any agent change ships.
- **Foundry Hosted Agents = preview** → mention only as a *future* hosting option.
