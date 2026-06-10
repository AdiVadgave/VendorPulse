#!/usr/bin/env python
"""
Shape-2 PoC runner — SchedulingAgent on Microsoft Foundry via the Responses API.

Proves the go/no-go gate from the architecture docs: tool-calling + the app-layer
approval gate work when the agent layer is driven by Foundry's Responses API
instead of the hand-rolled Chat Completions loop. Nothing else in the stack changes
— same SchedulingService, same tools, same AgentResponse envelope.

This script forces the Foundry provider via env vars BEFORE importing the app, so
you don't have to edit .env. Auth uses your Entra login (a browser window opens if
no Azure CLI / managed identity is present).

Run (from VendorPulse-code/backend, venv active):
    pip install "azure-ai-projects>=2.0.0" azure-identity
    python poc_scheduling_foundry.py [CYCLE_ID] ["natural language instruction"]

Defaults: cycle c_8c25e23b (Novatech); a read-only instruction that lists attendees
and RSVP status (no invites sent).
"""
import os
import sys

# ── Force the Foundry / Responses path before the app config is imported ──────
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
INSTRUCTION = (
    sys.argv[2]
    if len(sys.argv) > 2
    else (
        "List the attendees for this governance cycle and summarise the current RSVP "
        "status. Do not send any invites. Return your usual JSON response."
    )
)


def main() -> int:
    from app.config import settings
    from app.dependencies import get_scheduling_agent, get_llm_service

    print("Shape-2 PoC — SchedulingAgent on Microsoft Foundry")
    print(f"  Provider:   {settings.ai_provider}")
    print(f"  Endpoint:   {settings.foundry_project_endpoint}")
    print(f"  Cycle:      {CYCLE_ID}")
    print(f"  Instruction: {INSTRUCTION!r}\n")

    # Sanity: confirm the LLM service actually came up on the Responses path.
    llm = get_llm_service()
    if not llm.is_enabled:
        print("[FAIL] LLM service is not enabled. Check ENABLE_LLM / provider config.")
        return 1
    print(f"  LLM ready:  model={llm.model!r}  use_responses={llm.use_responses}\n")
    if not llm.use_responses:
        print("[WARN] Foundry client did not select the Responses API path.")

    print("  (a browser window may open for Entra login)\n")

    agent = get_scheduling_agent(cycle_id=CYCLE_ID)
    response = agent.run(user_message=INSTRUCTION)

    print("─" * 70)
    print("AgentResponse")
    print("─" * 70)
    print(f"  status:            {response.status}")
    print(f"  agent:             {response.agent}")
    print(f"  run_id:            {response.run_id}")
    print(f"  requires_approval: {response.requires_approval}")
    print(f"  next_actions:      {response.next_actions}")
    print(f"  warnings:          {response.warnings}")
    print(f"\n  summary:\n    {response.summary}")
    print(f"\n  data:\n    {response.data}")
    print("─" * 70)

    if response.status == "success":
        print("\n✅ SchedulingAgent ran tool-calling end-to-end over the Foundry Responses API.")
        print("   The AgentResponse envelope is unchanged — frontend contract preserved.")
        return 0
    print("\n[FAIL] Agent returned an error status — see summary above.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
