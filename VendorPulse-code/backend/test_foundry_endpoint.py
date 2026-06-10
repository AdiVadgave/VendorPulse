#!/usr/bin/env python
"""
Smoke test for the Microsoft Foundry (ai.azure.com) project endpoint.

Proves, end to end, that:
  1. the project endpoint is reachable,
  2. DefaultAzureCredential can get a token (`az login` first), and
  3. the deployed model answers via the Responses API.

This is the Shape-2 PoC pre-flight check. It does NOT touch any VendorPulse
state, services, or workflow — it only calls Foundry.

Run:
    az login
    pip install "azure-ai-projects>=2.0.0" azure-identity python-dotenv
    python test_foundry_endpoint.py

Config (env vars, or a .env in this folder):
    FOUNDRY_PROJECT_ENDPOINT   e.g. https://<resource>.services.ai.azure.com/api/projects/<project>
    FOUNDRY_MODEL              the *deployed* model/deployment name (e.g. gpt-4.1-mini)
"""
import os
import sys

# Load .env if python-dotenv is installed (Foundry SDK does NOT auto-load it).
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

# The endpoint you verified. Override via env var if it ever changes.
DEFAULT_ENDPOINT = (
    "https://chinmaykotkar-8551-resource.services.ai.azure.com/api/projects/chinmaykotkar-8551"
)

ENDPOINT = os.getenv("FOUNDRY_PROJECT_ENDPOINT") or os.getenv("PROJECT_ENDPOINT") or DEFAULT_ENDPOINT
# Fall back to the existing Azure OpenAI deployment name if a Foundry-specific one isn't set.
MODEL = os.getenv("FOUNDRY_MODEL") or os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME") or "gpt-4.1-mini"


def main() -> int:
    print("Foundry endpoint smoke test")
    print(f"  Endpoint: {ENDPOINT}")
    print(f"  Model:    {MODEL}\n")

    try:
        from azure.identity import (
            DefaultAzureCredential,
            InteractiveBrowserCredential,
            ChainedTokenCredential,
        )
        from azure.ai.projects import AIProjectClient
    except ImportError as e:
        print(f"[FAIL] Missing package: {e}")
        print('       Run: pip install "azure-ai-projects>=2.0.0" azure-identity')
        return 1

    # 1) Auth + project client.
    # DefaultAzureCredential picks up az CLI / azd / Az PowerShell / managed identity /
    # env vars. If none are present (e.g. no CLI installed), we fall back to an
    # interactive BROWSER login so you don't have to install anything to verify.
    tenant = os.getenv("AZURE_TENANT_ID")
    try:
        browser = (
            InteractiveBrowserCredential(tenant_id=tenant)
            if tenant
            else InteractiveBrowserCredential()
        )
        credential = ChainedTokenCredential(DefaultAzureCredential(), browser)
        project = AIProjectClient(endpoint=ENDPOINT, credential=credential)
        openai = project.get_openai_client()
    except Exception as e:
        print(f"[FAIL] Could not create the project client / acquire a token.")
        print(f"       {type(e).__name__}: {e}")
        print("       A browser window should open for login. If it didn't, or you hit a")
        print("       tenant error, set AZURE_TENANT_ID to your tenant and retry.")
        return 1

    # 2) Call the model via the Responses API
    try:
        resp = openai.responses.create(model=MODEL, input="Say hi in exactly one word.")
        print(f"[OK]   Model replied: {resp.output_text!r}")
        print("\n✅ Endpoint + auth + model deployment all working. Cleared for the Shape-2 PoC.")
        return 0
    except Exception as e:
        msg = str(e)
        print(f"[FAIL] The call to the Responses API failed.")
        print(f"       {type(e).__name__}: {msg}")
        if "401" in msg or "PermissionDenied" in msg or "Forbidden" in msg or "403" in msg:
            print("       Likely cause: your account lacks the 'Foundry User' / "
                  "'Cognitive Services OpenAI User' role on the project.")
        elif "404" in msg or "DeploymentNotFound" in msg or "model" in msg.lower():
            print(f"       Likely cause: '{MODEL}' is not the deployed model name. "
                  "Check Build > Deployments in the Foundry portal and set FOUNDRY_MODEL.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
