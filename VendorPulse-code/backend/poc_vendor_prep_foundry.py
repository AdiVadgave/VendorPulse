#!/usr/bin/env python
"""
Shape-2 PoC runner #2 — VendorPrepAgent on Microsoft Foundry via the Responses API.

Complements the Scheduling PoC by exercising a DIFFERENT agent shape:
  - one-shot generation (call_simple) instead of the multi-step tool loop,
  - a different data source (the compiled scorecard, not scheduling services),
  - and two governance behaviours: human-approval-required drafts, plus the
    legal-review CONTENT EXCLUSION (flagged items get NO AI-drafted response).

Forces the Foundry provider via env vars before importing the app (no .env edit).
Auth uses your Entra login (a browser window opens if no CLI / managed identity).

Run (from VendorPulse-code/backend, venv active):
    python poc_vendor_prep_foundry.py [CYCLE_ID] [VENDOR_NAME]

Defaults: cycle c_8c25e23b (Novatech), which has a compiled scorecard.
"""
import os
import sys

os.environ.setdefault("ENABLE_LLM", "true")
os.environ.setdefault("AI_PROVIDER", "foundry")
os.environ.setdefault("USE_RESPONSES_API", "true")
os.environ.setdefault(
    "FOUNDRY_PROJECT_ENDPOINT",
    "https://chinmaykotkar-8551-resource.services.ai.azure.com/api/projects/chinmaykotkar-8551",
)
os.environ.setdefault("FOUNDRY_MODEL", "gpt-4o")

sys.path.insert(0, ".")

CYCLE_ID = sys.argv[1] if len(sys.argv) > 1 else "c_8c25e23b"
VENDOR_NAME = sys.argv[2] if len(sys.argv) > 2 else "NovaTech"


def _show(title: str, resp) -> None:
    print("─" * 70)
    print(title)
    print("─" * 70)
    print(f"  status:            {resp.status}")
    print(f"  requires_approval: {resp.requires_approval}")
    print(f"  next_actions:      {resp.next_actions}")
    print(f"  warnings:          {resp.warnings}")
    print(f"  summary:           {resp.summary}")
    print(f"  data:              {resp.data}")
    print()


def main() -> int:
    from app.config import settings
    from app.dependencies import get_vendor_prep_agent, get_llm_service

    print("Shape-2 PoC #2 — VendorPrepAgent on Microsoft Foundry")
    print(f"  Provider: {settings.ai_provider}  | Endpoint: {settings.foundry_project_endpoint}")
    print(f"  Cycle:    {CYCLE_ID}  | Vendor: {VENDOR_NAME}\n")

    llm = get_llm_service()
    if not llm.is_enabled:
        print("[FAIL] LLM service not enabled — check config.")
        return 1
    print(f"  LLM ready: model={llm.model!r}  use_responses={llm.use_responses}")
    print("  (a browser window may open for Entra login)\n")

    agent = get_vendor_prep_agent(cycle_id=CYCLE_ID)

    # 1) Generate the vendor brief from the compiled scorecard (one-shot via Responses API)
    brief = agent.run(context={"action": "generate_vendor_brief", "params": {"vendor_name": VENDOR_NAME}})
    _show("1) VENDOR BRIEF  (expect requires_approval=True)", brief)

    # 2) Governance: an item flagged for legal review must get NO AI-drafted response
    legal = agent.run(context={"action": "handle_pushback", "params": {
        "pushback_id": "pb_legal_01",
        "description": "Vendor disputes the SLA penalty clause.",
        "category": "CONTRACTUAL",
        "needs_legal_review": True,
    }})
    _show("2) PUSHBACK (legal-flagged)  (expect EMPTY responses — content exclusion)", legal)

    # 3) Normal pushback → 3 AI-drafted response options (factual / neutral / escalation)
    pushback = agent.run(context={"action": "handle_pushback", "params": {
        "pushback_id": "pb_perf_02",
        "description": "Vendor claims the delivery-quality score is unfairly low.",
        "category": "PERFORMANCE",
        "needs_legal_review": False,
    }})
    _show("3) PUSHBACK (normal)  (expect 3 response options, requires_approval=True)", pushback)

    ok = (
        brief.status == "success"
        and legal.status == "success"
        and not (legal.data or {}).get("responses")          # legal exclusion held
        and pushback.status == "success"
        and len((pushback.data or {}).get("responses", [])) >= 1
    )
    if ok:
        print("✅ VendorPrepAgent ran one-shot generation over the Foundry Responses API.")
        print("   Brief + pushback options require approval; legal-flagged item got NO AI draft.")
        return 0
    print("[FAIL] One or more checks did not hold — inspect the output above.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
