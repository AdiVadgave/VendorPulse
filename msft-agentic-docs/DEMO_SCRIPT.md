# VendorPulse — Foundry Demo Script (one page)

> **Use this while presenting.** Goal: show that VendorPulse runs on Shell-sanctioned **Microsoft Foundry** (`ai.azure.com`), generates useful text with **gpt-4o**, and keeps a **human-approval gate** so the AI never acts on its own.
> **Time:** ~5–8 min. **Portal:** [ai.azure.com](https://ai.azure.com) → project **`chinmaykotkar-8551`**.

---

## ⚠️ Read first (avoids confusion live)
The agent runs in **our own code** (the terminal PoC), **not** as an "agent" object inside the portal. So don't look for a VendorPulse agent in the portal. The portal shows the **platform** our code uses: the project, the model, the guardrails. The narrative is *"our app calls this project + this model."*

---

## The flow (4 portal screens → 1 live run)

| # | Screen | Where in the portal | What it proves |
|---|--------|---------------------|----------------|
| 1 | **Project overview + endpoint** | Open project → Overview | Our sanctioned AI workspace; our backend points to this exact endpoint |
| 2 | **`gpt-4o` deployment** | *Build* → "Models + endpoints" / "Deployments" | The model our agents use — a **GA** model (Shell-approvable), swappable without code changes |
| 3 | **Playground (live draft)** | *Playgrounds* → Chat (select `gpt-4o`) | Live proof the model generates the kind of text our agents produce |
| 4 | **Guardrails + tracing** | "Guardrails + controls" / "Observability" | Built-in content filtering + auditability → Shell IRM alignment |
| 5 | **Live PoC (optional, technical)** | Terminal: `python poc_scheduling_foundry.py` | Our *app* drives the same project/model, with our tools + the approval gate |

> Foundry's left-nav labels shift occasionally — if a name doesn't match, pick the nearest equivalent. The *functions* are what matter.

### Playground prompt to paste (screen 3)
> *"Draft a short, professional calendar invite for a Q3 vendor governance review with NovaTech, 30 minutes, asking attendees to confirm availability."*

---

## Narration — pick your audience

### 🟢 Non-technical (manager / business)
1. **Overview:** "This is our AI workspace inside Microsoft's Shell-approved platform. Everything runs here, not on some external tool."
2. **Model:** "This is the AI engine — GPT-4o. We can upgrade it later without rebuilding anything."
3. **Playground:** *(paste prompt)* "This is the kind of text VendorPulse drafts — meeting invites, summaries, briefs. **But nothing is ever sent automatically. A person reviews and approves first.** The AI assists; humans decide."
4. **Guardrails:** "Safety filters and full audit logging are built in — which is exactly what Shell's AI rules require."
5. **Close:** "So: faster drafting, zero loss of control, on an approved platform."

### 🔵 Technical (engineers / architects)
1. **Overview/endpoint:** "Our FastAPI backend authenticates with Entra and calls this Foundry project endpoint via the Responses API — same URL that's in the PoC."
2. **Model:** "gpt-4o GA deployment; model choice is config, not code — the `AgentResponse` contract is stable."
3. **Playground:** *(paste prompt)* "Our agents call this through tool-calling. Business logic — slot ranking, scoring, workflow — stays deterministic; the LLM only produces text."
4. **Guardrails/tracing:** "Content filters + XPIA protection + OpenTelemetry tracing are platform-provided — fewer hand-rolled controls to put through Shell's security review."
5. **Live run:** `python poc_scheduling_foundry.py` — "multi-tool calling over the Responses API; and `--gate` shows side-effecting tools (`send_invites`) are withheld from the model and refused — the approval gate holds."

---

## If asked the hard questions
- **"Does the AI send emails / book meetings on its own?"** → No. Side-effecting tools are withheld from the model and refused inside the run; the real action fires from a deterministic route only after a human approves (Shell IRM 3.6.3).
- **"Can it hallucinate a wrong score?"** → No. Scores, ranking, and state transitions are deterministic code; the LLM only writes prose (IRM 3.6.6).
- **"Is this approved for Shell?"** → The platform (Azure/Foundry) is the sanctioned path; the **use case still needs AI Registry registration + IRM risk assessment + Shell.AI/TRB sign-off** before production. See [SHELL_COMPLIANCE_CHECKLIST.md](SHELL_COMPLIANCE_CHECKLIST.md).
- **"Is this the final architecture?"** → The PoC proved feasibility; the production build (MAF SDK vs Responses-direct) is the open decision in [README.md](README.md) §3 / issue #13.

---

### Don't show / don't do
- ❌ Don't open or screen-share the **Shell IRM PDFs** (INTERNAL/CONFIDENTIAL).
- ❌ Don't run the agent with a real "send invites" instruction against live mailboxes during the demo — use the default read-only run or `--gate`.
