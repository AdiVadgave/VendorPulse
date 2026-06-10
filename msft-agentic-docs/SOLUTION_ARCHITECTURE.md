# VendorPulse on Microsoft Agent Framework — Solution Architecture

> **Companion docs:** [README](README.md) · [MAF Onboarding](MAF_TEAM_ONBOARDING.md) · [Deployment Architecture](DEPLOYMENT_ARCHITECTURE.md) · [Shell Compliance Checklist](SHELL_COMPLIANCE_CHECKLIST.md)
> **Scope:** Logical / component design of the target state. Physical hosting is in the Deployment doc.
> **Client:** Shell — design choices below are mapped to Shell IRM 3.492 controls where relevant (see §8 + the compliance checklist).

---

## 1. System context

```mermaid
flowchart TB
    GOV["Governance Lead<br/>(approver)"]
    STAKE["Internal stakeholders<br/>+ Vendor attendees"]

    subgraph VP["VendorPulse"]
        direction TB
        FE["React SPA"]
        BE["FastAPI backend<br/>(MAF agent layer)"]
    end

    AOAI["Microsoft Foundry / Azure OpenAI<br/>Responses API"]
    GRAPH["Microsoft Graph<br/>Calendar · Teams · Outlook mail"]
    FORMS["Scorecard intake<br/>(MS Forms / native)"]

    GOV -->|reviews & approves AI drafts| FE
    STAKE -->|RSVP · scorecards · meeting| GRAPH
    FE <-->|HTTPS / JSON| BE
    BE -->|prompts + tool calls| AOAI
    BE -->|calendar / email / lookup| GRAPH
    BE -->|distribute / collect| FORMS

    style VP fill:#dbeafe,stroke:#1d4ed8,color:#000
```

VendorPulse orchestrates Quarterly Business Reviews across a forward-only 12-state workflow. AI is confined to **text generation** behind a **human-approval gate**; all business-critical decisions remain deterministic.

---

## 2. Logical component view

```mermaid
flowchart TB
    subgraph FE["Frontend (unchanged)"]
        PAGES["Pages: Dashboard · CycleDetail (A–F) · Analytics"]
        AP["ApprovalPanel · ActionLog · WorkflowProgressBar"]
        STORE["Zustand stores"]
    end

    subgraph BE["FastAPI Backend"]
        subgraph RT["Routes (unchanged) — thin HTTP layer"]
            R["users · scheduling · scorecard · alignment<br/>vendor_prep · meeting · analytics"]
        end

        subgraph CORE["Core (unchanged)"]
            WFE["WorkflowEngine<br/>12-state, forward-only"]
        end

        subgraph MAFL["MAF Agent Layer (NEW)"]
            ORCH["AgentOrchestrator<br/>(builds an Agent per module)"]
            CA["Agents:<br/>Scheduling · Scorecard · Alignment<br/>VendorPrep · Meeting · Memory"]
            TL["@tool functions<br/>(thin wrappers over services)"]
            ADP["AgentResponse adapter<br/>(MAF result → envelope)"]
            DET["Deterministic fallback<br/>(ENABLE_LLM=false)"]
        end

        subgraph SVC["Services (unchanged)"]
            S["slot_ranking · availability · scheduling<br/>graph_service · mail · forms · analytics"]
        end

        subgraph REPO["Repositories (unchanged)"]
            RP["cycles · attendees · meetings · slots<br/>vendors · agent_runs · scorecards"]
        end
    end

    EXT["Azure OpenAI · Microsoft Graph · Forms"]

    PAGES --> R
    AP --> R
    R --> WFE
    R --> ORCH
    ORCH --> CA
    ORCH --> DET
    CA --> TL
    CA --> ADP
    TL --> S
    DET --> S
    S --> RP
    S --> EXT
    CA --> EXT
    ADP --> R

    style MAFL fill:#dbeafe,stroke:#1d4ed8,color:#000
    style FE fill:#bbf7d0,stroke:#15803d,color:#000
```

**Layering rule (unchanged):** dependencies flow strictly downward — Routes → Core/Agents → Services → Repositories. The MAF layer slots in exactly where `BaseAgent` was, behind the same `AgentResponse` adapter.

---

## 3. Module → Agent → Tools map

```mermaid
flowchart LR
    subgraph MODA["A: Scheduling"]
        SA["SchedulingAgent"]
        SAT["get_attendee_list · rank_slots<br/>approve_slot · send_invites*<br/>get_rsvp_status"]
    end
    subgraph MODB["B: Scorecard"]
        SCA["ScorecardAgent"]
        SCAT["collect · validate · compile<br/>(deterministic)"]
    end
    subgraph MODC["C: Alignment"]
        ALA["AlignmentAgent"]
        ALAT["extract_action_items<br/>summarize_score_changes"]
    end
    subgraph MODD["D: Vendor Prep"]
        VPA["VendorPrepAgent"]
        VPAT["generate_brief<br/>draft_response_options"]
    end
    subgraph MODE["E: Meeting"]
        MA["MeetingAgent"]
        MAT["parse_transcript<br/>generate_minutes* · send_minutes*"]
    end
    subgraph MODF["F: Analytics"]
        MEM["MemoryAgent"]
        MEMT["leadership_brief_card"]
    end

    SA --> SAT
    SCA --> SCAT
    ALA --> ALAT
    VPA --> VPAT
    MA --> MAT
    MEM --> MEMT

    note["* = approval_mode=ApprovalMode.REQUIRED<br/>(in-run side-effect tools)"]

    style note fill:#fde68a,stroke:#b45309,color:#000
```

Tools marked `*` perform external side effects and are gated; read/generate tools execute freely. `approval_mode` takes the `ApprovalMode` enum (the old `"always_require"` string form was replaced before/at GA and is enforced as of 1.3.0). Note that the **primary** approval gate is still the app-layer `requires_approval` flow (see §5).

---

## 4. Workflow state machine (unchanged, deterministic)

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

    note right of MEETING_SCHEDULED
        Module A (Scheduling)
        owns CYCLE_CREATED → MEETING_SCHEDULED
    end note
    note right of SCORECARD_COMPILED
        Module B owns the
        scorecard states
    end note
```

The `WorkflowEngine` is the **single source of truth** for allowed transitions. MAF agents orchestrate work *within* a state — they never advance the machine. Invalid transitions raise `WorkflowViolationError` (→ HTTP 409).

---

## 5. The human-approval gate (sequence) — the critical pattern

> **Shell IRM 3.6.3.b.2** (near-verbatim): *"Implement human oversight and consent for privileged actions — for instance, sharing of output through email, embed a step where a human approves before sending the information."* This gate is the direct implementation. **Status:** the side-effecting tools (`send_invites`, `approve_slot`) are now withheld from the model and refused inside an agent run (PoC, GitHub issue #13); the real action fires only from the deterministic route after approval.

VendorPulse's gate is **asynchronous and out-of-band**: the agent run completes producing a *draft*, a human approves later, and the external action fires from a separate deterministic route. This is preserved unchanged; MAF's in-run `approval_mode` is a secondary safeguard.

```mermaid
sequenceDiagram
    actor User as Governance Lead
    participant FE as React SPA
    participant RT as FastAPI Route
    participant AG as MAF Agent
    participant AOAI as Foundry / Azure OpenAI
    participant SVC as Service (Graph)
    participant DB as agent_runs

    User->>FE: Trigger "Prepare invite"
    FE->>RT: POST /scheduling/.../draft
    RT->>AG: run(prompt, context)
    AG->>AOAI: Responses API (tools)
    AOAI-->>AG: tool calls (read/rank/generate)
    AG->>SVC: rank_slots / draft invite text
    SVC-->>AG: ranked slots + draft text
    AG-->>RT: AgentResponse(requires_approval=true, draft)
    RT->>DB: log run (SUCCESS)
    RT-->>FE: draft + requires_approval
    FE-->>User: ApprovalPanel shows draft

    Note over User,FE: ⏸ Human reviews (seconds … or days)

    User->>FE: Approve
    FE->>RT: POST /scheduling/.../send-invites
    RT->>RT: WorkflowEngine.assert_state()
    RT->>SVC: send_invites() (deterministic)
    SVC-->>RT: invite sent
    RT->>DB: log action
    RT-->>FE: MEETING_SCHEDULED
```

**Why this matters:** the external side effect (`send_invites`) is *not* executed inside the agent run. The agent only drafts. This decouples approval latency from the LLM call and keeps the action deterministic and auditable — strictly safer than running a side-effect tool inside the agent loop.

### 5.1 Optional in-run gate (MAF native)

For any tool that genuinely must act *during* a run, MAF supports native gating:

```mermaid
sequenceDiagram
    participant AG as Agent
    participant T as @tool(approval_mode=ApprovalMode.REQUIRED)
    participant FE as Frontend

    AG->>AG: run() decides to call gated tool
    AG-->>FE: result.user_input_requests<br/>(function_call.name + arguments)
    FE-->>AG: to_function_approval_response(true/false)
    alt approved
        AG->>T: execute tool
        T-->>AG: result
    else rejected
        AG-->>FE: tool skipped, agent continues
    end
```

This is **belt-and-suspenders**, used sparingly; the app-layer gate in §5 remains the primary control.

---

## 6. Dual execution path (preserved)

```mermaid
flowchart TD
    START["Route calls Orchestrator.run()"]
    Q{"ENABLE_LLM<br/>and client ready?"}
    MAF["MAF Agent.run()<br/>tool-calling via Foundry Responses API"]
    DET["_deterministic_run()<br/>direct service calls"]
    ADP["AgentResponse adapter"]
    LOG["agent_runs audit log + OTel trace"]
    OUT["AgentResponse envelope → Route"]

    START --> Q
    Q -->|Yes| MAF
    Q -->|No| DET
    MAF --> ADP
    DET --> ADP
    ADP --> LOG
    LOG --> OUT

    style MAF fill:#dbeafe,stroke:#1d4ed8,color:#000
    style DET fill:#bbf7d0,stroke:#15803d,color:#000
```

Every module still works with **zero LLM** (`ENABLE_LLM=false`). MAF replaces only the left branch. The adapter guarantees both branches emit the identical `AgentResponse` envelope the frontend depends on.

---

## 7. MAF SDK hosting options

As of BUILD 2026, Microsoft Foundry Agent Service is a **three-tier spectrum**, not a single managed product. The 2025-era objection ("managed = hidden prompts, no grounding control") applies only to the **Prompt agents** tier — the other two run *our own MAF code*.

| Design property (VendorPulse) | Prompt agents (Foundry-managed) | **MAF SDK in-process — chosen baseline** | Foundry Hosted Agents (preview) |
|---|---|---|---|
| Full prompt ownership (audit) | ❌ Foundry assembles instructions | ✅ you own every token | ✅ your own agent code |
| Deterministic `ENABLE_LLM=false` core | ❌ assumes LLM drives | ✅ unchanged | ✅ unchanged (your code) |
| App-layer approval gate | ⚠️ fights the "act" default | ✅ fully preserved | ✅ preserved (your code) |
| Foundry / Azure OpenAI models (Responses API) | ✅ | ✅ | ✅ |
| `AgentResponse` contract | ⚠️ adapter needed | ⚠️ adapter needed (minor) | ⚠️ adapter needed (minor) |
| Data residency / regions | ⚠️ Foundry-region bound | ✅ runs where your backend runs | ⚠️ Foundry-region bound; BYO-VNet available |
| Infra burden | none | you own the container | Foundry-managed endpoint + identity + scaling |
| Maturity | GA | GA | **public preview** |

**Decision:** **MAF SDK in-process** as the shippable baseline — it preserves audit-transparency, the deterministic fallback, and the approval gate (the core value of a governance product) with no preview dependency. **Foundry Hosted Agents** is a credible future hosting upgrade for the *same* code once it exits preview, since it offers identical prompt ownership while offloading infra. **Prompt agents** are ruled out for the governance use case. All three call models through the **Responses API**.

---

## 8. Cross-cutting concerns

| Concern | Approach |
|---------|----------|
| **Observability** | MAF native OpenTelemetry (**enabled by default since 1.6.0** — wire the exporter, don't opt in) → Azure Monitor / App Insights; plus existing `agent_runs` audit log and `RequestLoggingMiddleware` |
| **Error handling** | Workflow violations → 409; agents always return structured `AgentResponse` (even on failure, `next_actions:["RETRY"]`); LLM JSON-parse fallback to deterministic builders |
| **Config** | `pydantic-settings` from `.env` → moves to Key Vault refs + Managed Identity in prod (see Deployment doc) |
| **Security** | LLM emits text only; decisions deterministic; output human-gated; secrets vaulted |
| **Auditability** | Every run logged with input/output payloads + trace IDs correlating HTTP ↔ agent ↔ model call |
| **Compliance (Shell)** | Maps to **IRM 3.492** + EU AI Act: human approval (3.6.3), deterministic core vs hallucination (3.6.6), auditability (3.5.5), IDT-managed Azure/Foundry + Shell.AI/TRB approval (3.3 / 3.5.1), AI-use transparency notice (3.5.3), Entra SSO/RBAC (3.6.2). Full mapping + blocking prerequisites in [SHELL_COMPLIANCE_CHECKLIST.md](SHELL_COMPLIANCE_CHECKLIST.md) |

---

## 9. Open items before build

0. **Shell compliance prerequisites (blocking):** AI Registry + ServiceNow registration, IRM risk assessment / IAQ, EU AI Act classification, Shell.AI + TRB approval, IDT-managed hosting. Start in parallel — these have lead time. See [SHELL_COMPLIANCE_CHECKLIST.md §A](SHELL_COMPLIANCE_CHECKLIST.md).
1. ✅ **PoC complete (June 2026):** tool-calling + the approval gate proven over the Foundry **Responses API** across 2 agents / both shapes (GitHub issue #13); `previous_response_id` chaining worked, so #4376 didn't reproduce. ✅ **Decision made (June 2026): production builds on the MAF SDK** (`agent_framework.Agent` + `@tool(approval_mode=...)`), with the Responses-direct path retained as fallback. Rationale: platform-provided HITL / content filters / on-by-default OTel mean fewer hand-rolled controls through Shell's code security review (IRM 3.3). **Next:** ~1.5-wk MAF spike porting one agent + re-verifying bugs #4411/#4376 on the AAD client.
2. Pin **exact** MAF SDK version. The API has genuinely churned post-GA (`ChatAgent`→`Agent`, `ChatMessage`→`Message`, `approval_mode` string→`ApprovalMode` enum, tool `**kwargs`→`FunctionInvocationContext`, `pydantic-settings` removed → call `load_dotenv()` + `load_settings()` explicitly). Budget an upgrade pass per minor release.
3. Decide whether `MemoryAgent`/`MeetingAgent` one-shot paths become MAF agents or stay a simple single-call path (they are single-prompt, not multi-step — may not need the agent loop).
4. Evaluate the **Agent Harness** (context compaction + memory/file/task providers) — it may replace plumbing in Phase 1, and **CodeAct** for multi-tool turns if latency/token cost matters.
5. Add regression test harness (no automated suite exists today).
