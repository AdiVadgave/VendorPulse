"""
Validate Microsoft Graph Mail.Send (app-only certificate) end to end.

  python scripts/test_graph_mail.py                 # acquire a token only
  python scripts/test_graph_mail.py you@shell.com   # acquire + send a test email

Reads GRAPH_CLIENT_ID / GRAPH_TENANT_ID / GRAPH_CERT_PATH / GRAPH_CERT_PASSWORD /
GRAPH_MAIL_SENDER from .env. Does NOT require MAIL_PROVIDER=graph.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.services.graph_auth import get_certificate_token  # noqa: E402


def main() -> int:
    if not settings.graph_cert_path:
        print("ERROR: GRAPH_CERT_PATH is not set in .env", file=sys.stderr)
        return 1
    if not Path(settings.graph_cert_path).exists():
        print(f"ERROR: cert file not found: {settings.graph_cert_path}", file=sys.stderr)
        return 1

    print(f"Client ID : {settings.graph_client_id}")
    print(f"Tenant ID : {settings.graph_tenant_id}")
    print(f"Cert      : {settings.graph_cert_path}")
    print(f"Send as   : {settings.graph_mail_sender}\n")

    print("Acquiring app-only token via certificate ...")
    try:
        token = get_certificate_token()
    except Exception as exc:  # noqa: BLE001
        print(f"TOKEN FAILED: {exc}", file=sys.stderr)
        return 1
    print(f"  OK — token acquired ({len(token)} chars)\n")

    to_email = sys.argv[1] if len(sys.argv) > 1 else None
    if not to_email:
        print("No recipient given — token check only. Pass an email to send a test message.")
        return 0

    from app.services.graph_service import GraphService

    print(f"Sending test email to {to_email} as {settings.graph_mail_sender} ...")
    result = asyncio.run(
        GraphService(token).send_mail(
            to_email=to_email,
            subject="VendorPulse — Graph Mail.Send test",
            html_body="<p>This is a test email sent via Microsoft Graph (app-only certificate auth).</p>",
            sender=(settings.graph_mail_sender or None),
        )
    )
    if isinstance(result, dict) and result.get("error"):
        print(f"SEND FAILED: {result.get('detail') or result.get('error')}", file=sys.stderr)
        return 1
    print(f"  OK — {result}")
    print("\nSUCCESS — Graph Mail.Send is working.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
