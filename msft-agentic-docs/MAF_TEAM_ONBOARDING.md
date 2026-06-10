# VendorPulse on Microsoft Agent Framework — Team Onboarding Guide

> **Who this is for:** the VendorPulse team, learning the **Microsoft Agent Framework (MAF)** for the first time.
> **Goal:** explain MAF from scratch, then show how VendorPulse's new architecture maps onto it.
> **Companion docs:** [README](README.md) · [Solution Architecture](SOLUTION_ARCHITECTURE.md) · [Deployment](DEPLOYMENT_ARCHITECTURE.md) · [Shell Compliance Checklist](SHELL_COMPLIANCE_CHECKLIST.md)
> **As of:** June 2026 — MAF 1.x (1.0 GA'd April 2026). Pin the exact SDK version; the API churned post-GA.

---

## 0. TL;DR (read this first)

- **MAF** is Microsoft's open-source SDK for building AI agents (the merger of Semantic Kernel + AutoGen). It owns the "agent loop": talk to a model, let it call your functions (tools), feed results back, repeat until done.
- An **agent** = a **model** + **instructions** + **tools**. That's it.
- VendorPulse uses MAF for **one job only**: turning structured data into human-readable text (briefs, minutes, summaries). **All real decisions stay deterministic** (scores, slot ranking, workflow). The AI never acts on its own — a human approves first.
- We run the model through **Microsoft Foundry** (Shell's sanctioned Azure AI platform) using the **Responses API**.
- This guide builds up from "what is an agent" to "how VendorPulse is wired."

---

## 1. MAF in five minutes (for first-timers)

### 1.1 The one idea behind every agent framework
A plain LLM call is: *send text → get text back*. An **agent** adds a loop so the model can **use tools** (your functions) to fetch data or take actions before answering:

```mermaid
flowchart LR
    U["User / app<br/>prompt"] --> A["Agent"]
    A -->|"1 - ask the model"| M["LLM<br/>(gpt-4o)"]
    M -->|"2 - 'call rank_slots(...)'"| A
    A -->|"3 - run your function"| T["@tool rank_slots()"]
    T -->|"4 - JSON result"| A
    A -->|"5 - send result back"| M
    M -->|"6 - final answer"| A
    A --> R["Response"]
    style A fill:#dbeafe,stroke:#1d4ed8,color:#000
    style M fill:#ede9fe,stroke:#6d28d9,color:#000
    style T fill:#bbf7d0,stroke:#15803d,color:#000
```

Steps 1–5 repeat until the model stops asking for tools (step 6). **MAF writes this loop for you** — you just declare the tools and the instructions. (Today, VendorPulse hand-wrote this loop in `BaseAgent`; MAF would replace it.)

### 1.2 The core building blocks
```mermaid
flowchart TB
    subgraph MAF["Microsoft Agent Framework — core pieces"]
        AG["Agent<br/>the orchestrator: runs the loop"]
        CLIENT["ChatClient<br/>connects to the model<br/>(OpenAIChatClient → Azure/Foundry)"]
        TOOLS["@tool functions<br/>your Python functions the model may call"]
        INSTR["instructions<br/>the system prompt"]
        APPROVAL["approval_mode<br/>require a human OK before a tool runs"]
        MEM["context / memory providers<br/>conversation + state"]
        OTEL["OpenTelemetry<br/>tracing (on by default ≥1.6.0)"]
    end
    AG --> CLIENT
    AG --> TOOLS
    AG --> INSTR
    TOOLS -.-> APPROVAL
    AG --> MEM
    AG --> OTEL
    style MAF fill:#eff6ff,stroke:#1d4ed8,color:#000
    style AG fill:#dbeafe,stroke:#1d4ed8,color:#000
```

| Term | What it is | VendorPulse equivalent |
|------|-----------|------------------------|
| **Agent** | Runs the tool-calling loop | Today: `BaseAgent` + 6 subclasses |
| **ChatClient** | Connection to the model | Today: `LLMService` (Azure OpenAI / Foundry) |
| **@tool** | A Python function the model may call | `get_attendee_list`, `rank_slots`, … |
| **instructions** | System prompt | `SCHEDULING_SYSTEM_PROMPT` etc. |
| **approval_mode** | In-run human gate on a tool | Our `gated_tools` + approval routes |
| **Message** | One turn in the conversation | the `messages` list in the loop |
| **OpenTelemetry** | Automatic tracing of every step | maps to Shell's logging/observability needs |

### 1.3 What a MAF agent looks like in code (illustrative)
> Exact import paths/signatures must be verified against the **pinned** SDK version — the API changed across 1.0→1.8 (e.g. `ChatAgent`→`Agent`, `approval_mode` is now an `ApprovalMode` enum).

```python
from agent_framework import Agent, tool, ApprovalMode
from agent_framework.openai import OpenAIChatClient
from azure.identity import DefaultAzureCredential

# 1) Declare tools — just decorate your functions
@tool
def rank_slots(date_range_start: str, date_range_end: str) -> str:
    """Return the top-ranked meeting slots (deterministic)."""
    return scheduling_service.rank_slots(...)        # your existing service

@tool(approval_mode=ApprovalMode.REQUIRED)           # <-- in-run human gate
def send_invites(slot_id: str) -> str:
    """Send calendar invites. Requires human approval."""
    return scheduling_service.send_invites(...)

# 2) Point a client at Foundry/Azure (Entra auth, no API key)
client = OpenAIChatClient(
    azure_endpoint="https://<resource>.services.ai.azure.com/api/projects/<project>",
    model="gpt-4o",
    credential=DefaultAzureCredential(),
)

# 3) Build the agent and run it
agent = Agent(client=client, instructions=SCHEDULING_SYSTEM_PROMPT,
              tools=[rank_slots, send_invites])
result = await agent.run("Schedule the Q3 review for NovaTech")

# 4) If a gated tool was requested, MAF pauses and hands you the request
for req in result.user_input_requests:               # human-in-the-loop
    # surface to the approver; resume after they decide
    ...
```

The big difference from today's code: **you stop writing the loop, the message bookkeeping, and the tool dispatch by hand.** You declare tools + instructions; MAF runs it.

---

## 2. Where MAF runs — the three Foundry hosting tiers

MAF is just an SDK; it needs a model endpoint. At Shell that means **Microsoft Foundry** (`ai.azure.com`). There are three ways to host, from least to most managed:

```mermaid
flowchart TB
    subgraph T1["1 - Prompt agents (fully managed)"]
        P1["Config only (portal/SDK).<br/>Foundry owns the runtime + prompt assembly."]
    end
    subgraph T2["2 - MAF SDK in our own process (PoC baseline)"]
        P2["Our FastAPI runs the MAF Agent.<br/>Calls Foundry models via Responses API.<br/>We own every prompt token + the gate."]
    end
    subgraph T3["3 - Foundry Hosted Agents (preview)"]
        P3["Our MAF code, packaged as a container.<br/>Foundry runs it: managed endpoint,<br/>Entra identity, autoscale, tracing."]
    end
    T1 --> note1["❌ ruled out: Foundry owns the prompt<br/>(weak audit story for governance)"]
    T2 --> note2["✅ chosen for the PoC: full control,<br/>GA, no preview dependency"]
    T3 --> note3["⭐ likely production target:<br/>own prompts + offloaded infra"]
    style T1 fill:#fee2e2,stroke:#b91c1c,color:#000
    style T2 fill:#bbf7d0,stroke:#15803d,color:#000
    style T3 fill:#dbeafe,stroke:#1d4ed8,color:#000
```

> All three reach models through the **Responses API** (Foundry's single entry point). The current PoC technically used the **Foundry SDK + Responses API directly** (a variant of tier 2 *without* the MAF SDK) — see §4.

---

## 3. The new VendorPulse architecture on MAF

### 3.1 Big picture
```mermaid
flowchart TB
    subgraph CLIENT["Browser"]
        SPA["React 19 SPA<br/>Dashboard · CycleDetail (A–F) · Analytics<br/>ApprovalPanel"]
    end
    subgraph BE["FastAPI Backend (Python)"]
        ROUTES["API Routes (thin HTTP layer)"]
        WFE["WorkflowEngine<br/>deterministic 12-state machine"]
        subgraph MAFL["MAF Agent Layer"]
            AGENTS["6 Agents<br/>Scheduling · Scorecard · Alignment<br/>VendorPrep · Meeting · Memory"]
            TOOLS["@tool functions<br/>(thin wrappers over services)"]
            GATE["approval gate<br/>(gated side-effect tools)"]
        end
        SERVICES["Services (deterministic):<br/>slot_ranking · graph · mail · forms · analytics"]
        REPOS["Repositories → storage"]
    end
    subgraph AZURE["Shell IDT-managed Azure / Foundry"]
        FOUNDRY["Microsoft Foundry<br/>gpt-4o via Responses API"]
        GRAPH["Microsoft Graph<br/>Calendar · Teams · Mail"]
        OTELZ["Azure Monitor / App Insights"]
    end
    SPA -->|HTTPS| ROUTES
    ROUTES --> WFE
    ROUTES --> AGENTS
    AGENTS --> TOOLS
    AGENTS --> GATE
    TOOLS --> SERVICES
    AGENTS -->|Responses API| FOUNDRY
    SERVICES --> GRAPH
    SERVICES --> REPOS
    AGENTS -.->|traces| OTELZ
    GATE -->|"draft + requires_approval"| SPA
    style MAFL fill:#dbeafe,stroke:#1d4ed8,color:#000
    style AZURE fill:#ede9fe,stroke:#6d28d9,color:#000
```

### 3.2 The golden rule: deterministic vs AI
This is the heart of VendorPulse and the reason it aligns with Shell's IRM guidelines.

```mermaid
flowchart LR
    subgraph DET["Deterministic (NEVER the LLM)"]
        D1["Slot ranking algorithm"]
        D2["Score validation & outliers"]
        D3["Workflow state transitions"]
        D4["Sending invites / emails"]
    end
    subgraph AI["AI (LLM via MAF) — text only"]
        A1["Draft invite wording"]
        A2["Summarise score changes"]
        A3["Generate meeting minutes"]
        A4["Draft vendor brief"]
    end
    AI -->|"produces drafts"| HUMAN["👤 Human approves"]
    HUMAN -->|"then triggers"| DET
    style DET fill:#bbf7d0,stroke:#15803d,color:#000
    style AI fill:#dbeafe,stroke:#1d4ed8,color:#000
    style HUMAN fill:#fde68a,stroke:#b45309,color:#000
```

> Because every business-critical decision is deterministic and the AI's text output is human-approved, **hallucinations can't drive real actions** — directly satisfying Shell IRM 3.6.6 (hallucination) and 3.6.3 (human approval).

### 3.3 How one agent run works (sequence)
```mermaid
sequenceDiagram
    actor User as Governance Lead
    participant FE as React SPA
    participant RT as FastAPI Route
    participant AG as MAF Agent
    participant FN as Foundry (gpt-4o)
    participant SVC as Service (deterministic)

    User->>FE: "Prepare the QBR invite"
    FE->>RT: POST /scheduling/.../draft
    RT->>AG: run(prompt, context)
    AG->>FN: Responses API (tools offered)
    FN-->>AG: call rank_slots(...)
    AG->>SVC: rank_slots()  (deterministic)
    SVC-->>AG: ranked slots
    AG->>FN: here are the results
    FN-->>AG: final draft (JSON)
    AG-->>RT: AgentResponse(draft, requires_approval=true)
    RT-->>FE: show draft in ApprovalPanel
    Note over User,FE: ⏸ Human reviews (seconds…or days)
    User->>FE: Approve
    FE->>RT: POST /scheduling/.../send-invites
    RT->>SVC: send_invites()  (deterministic, NOT via the agent)
    SVC-->>RT: invite sent ✅
```

### 3.4 The approval gate (the most important safety pattern)
Two layers protect against the AI taking an action on its own:

```mermaid
flowchart TB
    Q{"Did the model ask to call<br/>a side-effecting tool?<br/>(send_invites / approve_slot)"}
    Q -->|"It can't — those tools are<br/>withheld from the model"| L1["Layer 1:<br/>tool not even offered"]
    Q -->|"If it somehow tries"| L2["Layer 2:<br/>dispatcher refuses → 'approval_required'"]
    L1 --> OUT["Agent only DRAFTS.<br/>requires_approval = true"]
    L2 --> OUT
    OUT --> HUMAN["👤 Human approves in the UI"]
    HUMAN --> ROUTE["Deterministic route fires<br/>the real action"]
    style L1 fill:#bbf7d0,stroke:#15803d,color:#000
    style L2 fill:#fde68a,stroke:#b45309,color:#000
    style ROUTE fill:#dbeafe,stroke:#1d4ed8,color:#000
```

In MAF, Layer 2 can also be the native `@tool(approval_mode=ApprovalMode.REQUIRED)` — the run pauses and returns a `user_input_requests` object for the human to approve/reject.

### 3.5 The workflow engine is OUTSIDE the AI
The 12-state machine is deterministic and the single source of truth. Agents work *within* a state — they never decide the next state.

```mermaid
stateDiagram-v2
    [*] --> CYCLE_CREATED
    CYCLE_CREATED --> ATTENDEE_REFRESH_SENT
    ATTENDEE_REFRESH_SENT --> AVAILABILITY_COLLECTED
    AVAILABILITY_COLLECTED --> MEETING_SCHEDULED
    MEETING_SCHEDULED --> SCORECARD_REQUEST_SENT
    SCORECARD_REQUEST_SENT --> SCORECARD_COLLECTION
    SCORECARD_COLLECTION --> SCORECARD_COMPILED
    SCORECARD_COMPILED --> INTERNAL_ALIGNMENT
    INTERNAL_ALIGNMENT --> VENDOR_PREP
    VENDOR_PREP --> MEETING_IN_PROGRESS
    MEETING_IN_PROGRESS --> POST_MEETING_COMPLETE
    POST_MEETING_COMPLETE --> ARCHIVED
    ARCHIVED --> [*]
```

---

## 4. What's built today vs the MAF target

```mermaid
flowchart LR
    subgraph NOW["✅ Built now (PoC)"]
        N1["Hand-rolled loop in BaseAgent"]
        N2["Foundry Responses API direct<br/>(via azure-ai-projects SDK)"]
        N3["Approval gate (gated_tools)"]
        N4["1 agent ported: Scheduling"]
    end
    subgraph TARGET["🎯 MAF target"]
        T1["MAF Agent owns the loop"]
        T2["MAF OpenAIChatClient → Foundry"]
        T3["Native approval_mode + app gate"]
        T4["All 6 agents + OTel + Harness"]
    end
    NOW -->|"same AgentResponse contract"| TARGET
    style NOW fill:#bbf7d0,stroke:#15803d,color:#000
    style TARGET fill:#dbeafe,stroke:#1d4ed8,color:#000
```

**Important nuance:** the PoC proved *Foundry + Responses API + tool-calling + the gate* using the **Foundry SDK directly** (`azure-ai-projects` → `responses.create`). It did **not** yet adopt the **MAF SDK** (`agent_framework.Agent`). Both are valid; MAF gives more built-in controls (native HITL, on-by-default tracing, the Agent Harness) — which matters for Shell because those controls then come from a pre-assessed platform instead of code we must defend in security review.

---

## 5. Glossary (MAF terms you'll hear)

| Term | Plain meaning |
|------|---------------|
| **Agent** | The thing that runs the model + tools loop |
| **Tool** | A function the model can call (`@tool`) |
| **ChatClient** | The model connection (`OpenAIChatClient` → Azure/Foundry) |
| **Responses API** | Foundry's modern endpoint for model calls (replaces Chat Completions as the default) |
| **approval_mode** | Flag making a tool require human approval before it runs |
| **user_input_requests** | What a run returns when it's paused waiting for approval |
| **Agent Harness** | BUILD-2026 add-on: auto context compaction + built-in memory/file/task helpers |
| **CodeAct** | Optimization where the model writes code to call several tools in one turn |
| **Hosted Agent** | Your MAF code, packaged and run *by* Foundry (preview) |
| **OpenTelemetry (OTel)** | Standard tracing; on by default in MAF ≥1.6.0 → Azure Monitor |
| **HITL** | Human-in-the-loop (approval before action) |

---

## 6. Compliance guardrails (Shell) — keep these in view

VendorPulse serves **Shell**; every change must respect Shell **IRM 3.492** + the **EU AI Act**. The non-negotiables (full list in [SHELL_COMPLIANCE_CHECKLIST.md](SHELL_COMPLIANCE_CHECKLIST.md)):

- 🔒 **Human approval before any send/act** (IRM 3.6.3) — our gate.
- 🧮 **Deterministic core; AI = text only** (IRM 3.6.6) — our golden rule.
- 🏛️ **Run on Shell IDT-managed Azure/Foundry; Azure OpenAI needs Shell.AI + TRB approval** (IRM 3.3 / 3.5.1).
- 📋 **Register in AI Registry + ServiceNow; complete IRM risk assessment / IAQ** before deploying (IRM 3.4).
- 🔑 **Entra SSO + RBAC, Key Vault secrets, content filters, OTel logging** (IRM 3.6.2 / 3.6.3 / 3.5.1).
- 👁️ **Tell users when they're interacting with AI** (IRM 3.5.3 / EU AI Act transparency).
- 🔍 **AI-assisted code passes security/quality review** (IRM 3.3).

> Never commit Shell INTERNAL/CONFIDENTIAL documents to the repo (they're git-ignored).

---

## 7. Getting started locally (PoC)

```powershell
# 1) One-time: verify the Foundry endpoint + your Entra login + model
cd VendorPulse-code/backend
python test_foundry_endpoint.py        # browser login opens; expect a one-word reply

# 2) Run the Scheduling agent over Foundry (read-only demo)
python poc_scheduling_foundry.py

# 3) See the approval gate refuse a side effect
python poc_scheduling_foundry.py --gate
```

When you move to the **MAF SDK** path: `pip install agent-framework` (pin the exact version), build a `agent_framework.Agent` with your `@tool`-wrapped services, and keep the deterministic routes + approval gate exactly as they are. The `AgentResponse` envelope stays the contract between the agent layer and the frontend, so the UI never changes.

---

### Where to go next
- Conceptual design → [SOLUTION_ARCHITECTURE.md](SOLUTION_ARCHITECTURE.md)
- Azure hosting / identity / security → [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md)
- Compliance obligations → [SHELL_COMPLIANCE_CHECKLIST.md](SHELL_COMPLIANCE_CHECKLIST.md)
- Migration decisions & open items → [README.md](README.md) and GitHub issue #13
