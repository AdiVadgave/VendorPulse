"""
Check the APIM AI gateway end-to-end, without starting the app.

Prints the gateway URL and model from .env (never the key), then makes the
two kinds of call the agents rely on: a plain completion (VendorPrep / Meeting /
summaries) and a tool call (the tool-calling agent loop). Nothing is written to
the database and no email is sent.

Usage (from backend/):

    python scripts/check_llm.py

Exit code 0 = both calls worked.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import truststore  # noqa: E402

truststore.inject_into_ssl()  # corporate TLS inspection, same as run.py

from app.config import settings  # noqa: E402
from app.services.llm_service import LLMService  # noqa: E402

TOOL = {
    "type": "function",
    "function": {
        "name": "get_cycle_status",
        "description": "Return the status of a governance cycle.",
        "parameters": {
            "type": "object",
            "properties": {"cycle_id": {"type": "string"}},
            "required": ["cycle_id"],
        },
    },
}


def _hint(exc: Exception) -> None:
    status = getattr(exc, "status_code", None)
    name = type(exc).__name__
    if status == 401:
        print("  -> 401: key rejected. Check APIM_SUBSCRIPTION_KEY, or try")
        print("     APIM_SUBSCRIPTION_KEY_HEADER=api-key if the gateway expects that header.")
    elif status == 403:
        print("  -> 403: key valid but not allowed on this API/product. Ask the Foundry team.")
    elif status == 404:
        print("  -> 404: wrong model or URL. Check APIM_MODEL (gpt-4o? gpt-5?) and that")
        print("     APIM_BASE_URL ends in /openai/v1 (no /chat/completions on the end).")
    elif status == 400:
        print("  -> 400: the gateway/model rejected a parameter. If it names reasoning_effort, the")
        print("     model is not a reasoning model (e.g. gpt-4o): set APIM_REASONING_EFFORT= (empty).")
    elif status == 429:
        print("  -> 429: rate limited / quota. Wait a minute and retry.")
    elif "Connection" in name or "Timeout" in name:
        print("  -> could not reach the gateway: network, proxy or VPN. Try on Shell network.")


def main() -> int:
    print(f"ENABLE_LLM   = {settings.enable_llm}")
    print(f"APIM_BASE_URL= {settings.apim_base_url or '(not set)'}")
    print(f"key header   = {settings.apim_subscription_key_header}")
    print(f"key set      = {bool(settings.apim_subscription_key.strip())}")
    print(f"reasoning    = {settings.apim_reasoning_effort or '(not sent)'}")
    if not settings.enable_llm:
        print("FAIL: ENABLE_LLM is false - set ENABLE_LLM=true in .env")
        return 1

    try:
        llm = LLMService()
    except RuntimeError as exc:
        print(f"FAIL: configuration - {exc}")
        return 1
    print(f"model        = {llm.model}")
    print()

    ok = True
    try:
        text = llm.call_simple("Reply with exactly the word: OK", max_tokens=300).strip()
        if text:
            print(f"PASS plain completion -> {text[:60]!r}")
        else:
            ok = False
            print("WARN plain completion returned EMPTY text: a reasoning model (gpt-5 family)")
            print("     used the whole token limit thinking. Set APIM_REASONING_EFFORT=minimal.")
    except Exception as exc:  # noqa: BLE001 - report every failure shape
        ok = False
        print(f"FAIL plain completion -> {type(exc).__name__}: {exc}")
        _hint(exc)

    try:
        resp = llm.call(
            messages=[
                {"role": "system", "content": "Use the tool to answer."},
                {"role": "user", "content": "What is the status of cycle c_123?"},
            ],
            tools=[TOOL],
            max_tokens=300,
        )
        calls = resp.choices[0].message.tool_calls or []
        if calls:
            print(f"PASS tool call        -> {calls[0].function.name}({calls[0].function.arguments})")
        else:
            ok = False
            print("WARN tool call: model replied without calling the tool - the gateway may")
            print("     be dropping 'tools'. Agents need tool calling; raise with Foundry team.")
    except Exception as exc:  # noqa: BLE001
        ok = False
        print(f"FAIL tool call        -> {type(exc).__name__}: {exc}")
        _hint(exc)

    print()
    print("RESULT: " + ("ALL GOOD - the agents can use the APIM gateway" if ok else "NOT READY - see above"))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
