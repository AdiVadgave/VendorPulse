# VendorPulse — Shell AI Compliance Checklist

> **Client:** Shell · **Status:** working tracker (not yet submitted for assessment)
> **Source authorities:**
> - **IRM 3.492 — Artificial Intelligence Guidelines** v1.2 (21/11/2024), Owner: Dirk Wisse — built on **NIST AI RMF** + **ISO/IEC 42001**
> - **AI Ethics, Risk & Compliance — Ambassador Pack** (Mar 2024) — **EU AI Act**
> - IRM contact: `SITI-AI-EthicsRiskCompliance@shell.com`
>
> This maps VendorPulse against Shell's mandatory AI controls. ✅ = in place · ⚠️ = partial · ❌ = gap · 📋 = procedural (not code).
> **Nothing technical ships at Shell until the 📋 prerequisites in Section A are complete.**

---

## A. Procedural prerequisites (BLOCKING — must precede any deployment)

| # | Requirement | IRM ref | Status | Action |
|---|-------------|---------|--------|--------|
| A1 | Register the AI **platform & application** in the **ServiceNow** enterprise asset inventory | 3.4.1.b.1 | ❌ 📋 | Register VendorPulse + its Azure/Foundry platform |
| A2 | Register the **use case** in the **AI Registry** | 3.4.1.b.2 | ❌ 📋 | Submit via AI Registry (ServiceNow) |
| A3 | **IRM risk assessment** + **Information Assessment Questionnaire (IAQ)** to set risk rating | 3.4.2 | ❌ 📋 | Engage IRM at the mailbox above |
| A4 | **EU AI Act classification** confirmed by Legal/IRM (see Section C) | Pack p10–11 | ❌ 📋 | Do NOT self-certify — Legal confirms |
| A5 | **Azure OpenAI usage approved** by the **Shell.AI team + Technical Review Board** | 3.3 (AI Builders) | ❌ 📋 | Required before using Azure OpenAI / Foundry models |
| A6 | Confirm deployment on a **Shell IDT-managed AI platform** | 3.5.1.b.2 | ❌ 📋 | Production must run on IDT-managed Azure/Foundry, not ad-hoc infra |

---

## B. Technical controls (mapped to IRM)

### Already aligned ✅
| # | Control | IRM ref | Evidence in VendorPulse |
|---|---------|---------|--------------------------|
| B1 | **Human approval before privileged/output-sending actions** | 3.6.3.b.2 | App-layer approval gate; side-effecting tools (`send_invites`, `approve_slot`) withheld from the model + refused in-run (commit `4c8173e`, issue #13). Direct textbook match to the IRM wording. |
| B2 | **Hallucination mitigation** — no authoritative erroneous output | 3.6.6 | Business-critical logic (scores, slot ranking, workflow transitions, outlier detection) is **deterministic**; LLM only drafts human-readable text. |
| B3 | **Accountability & auditability** — decisions recorded/auditable | 3.5.5, 3.4 | `agent_runs` audit log (input/output payload, status, run_id) per agent run. |
| B4 | **Logging/monitoring** | 3.5.1.b.5 | `agent_runs` + `RequestLoggingMiddleware`. |
| B5 | **Transparency of decision logic** | 3.5.3 | Narrow, documented LLM scope; deterministic core is fully explainable. |

### Gaps to close before production ❌/⚠️
| # | Control | IRM ref | Status | Action |
|---|---------|---------|--------|--------|
| B6 | **IAM: Entra SSO, RBAC, least privilege** | 3.6.2 | ❌ | Replace open API (`CORS *`, no auth) with Entra SSO + role-based access (Lead/Viewer). |
| B7 | **Data classification & protection** | scope, 3.5.6, 3.8 | ⚠️ | Classify scorecard data (likely **Commercially Sensitive**) and attendee PII (**GDPR**). Confirm none is "Most Confidential"/SOX/export-controlled (those are **out of scope** for this platform). Move JSON-file storage → IDT-managed, access-controlled store. |
| B7a | **"Notify users they are interacting with AI"** | 3.5.3.c.5; EU AI Act transparency | ❌ | Add a visible "AI-generated — pending approval" label in the UI (ApprovalPanel) + an opt-for-human path (3.5.3.c.6). |
| B8 | **Prompt-injection safeguards + content filtering** (incl. XPIA) | 3.6.3, 3.6.5 | ⚠️ | Enable Foundry content filters / guardrails; keep least-privilege tool exposure (already gating side-effect tools). |
| B9 | **Data loss / leakage controls** | 3.6.1 | ⚠️ | Per-tenant isolation; no sensitive data in logs/traces; banner notification of acceptable use. |
| B10 | **Observability / tracing** to Azure Monitor | 3.5.1 | ❌ | Wire OpenTelemetry → App Insights (on-by-default in MAF SDK; manual on Responses-direct path). |
| B11 | **Third-party / pre-trained model assessment** (gpt-4o) | 3.7 | ⚠️ | Document model trustworthiness/provenance; covered partly by A5 (Shell.AI + TRB). |
| B12 | **Secrets management** | 3.6.2; deployment | ❌ | Key Vault + Managed Identity; rotate the pasted Graph token; remove secrets from `.env`/images. |

---

## C. EU AI Act risk classification (to be confirmed by Legal/IRM — A4)

**Working assessment (NOT self-certified):** VendorPulse is most likely **Limited / Transparency risk**.
- **Not prohibited** — no subliminal manipulation, social scoring, biometric inference, or criminal-risk profiling of natural persons (Pack p10).
- **Not high-risk** — not a safety component of a regulated product; evaluates **vendors**, not workers (the high-risk "employment/worker management" category targets managing *workers*) (Pack p11).
- **Main obligation if Limited risk:** transparency — notify users that AI is involved (→ control **B7a**).

⚠️ Shell requires Legal/IRM to confirm this (A4). Per the Ambassador Pack timeline, use cases were to be **registered (Oct 30)** and **assessment-validated (Nov 28)**.

---

## D. Code review & security assessment (client's "strict code review" rule)

| # | Requirement | IRM ref | Action |
|---|-------------|---------|--------|
| D1 | **Quality & security assessment of AI-assisted/generated code** | 3.3 (AI Builders) | Route the Foundry PoC branch (`poc/scheduling-foundry-responses`) and any agent code through Shell's code-review + security-assessment process. |
| D2 | **AI application security best practices** | 3.5.1.b.4 | Standard SAST/dependency scanning in CI; pin exact SDK versions. |

> **Compliance implication for the MAF-SDK-vs-Responses-direct decision (issue #13 #2):** controls B1, B8, B10 (HITL, content filtering, OTel) are **built into the Microsoft Agent Framework SDK / Foundry-managed runtime**. Using them shifts those controls onto a Shell-sanctioned, pre-assessed platform and **shrinks the custom-code surface that must pass D1/D2**. This tilts the *production* bet toward MAF SDK / Foundry-managed, even though the Responses-direct PoC proved feasibility fastest.
