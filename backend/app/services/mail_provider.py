"""
Mail provider — sends scorecard links & meeting minutes (MOM) via Microsoft
Graph using the service mailbox (app-only `Mail.Send`, certificate auth).

This is the single send seam:

    from app.services.mail_provider import get_mail_provider, MailSendError
    get_mail_provider().send_html_email(to_email=..., subject=..., html_body=...)

Gmail has been removed — all outbound mail goes through the functional mailbox
(`GRAPH_MAIL_SENDER`). See docs/MAIL_OUTLOOK_MIGRATION.md.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional, Protocol

from app.config import settings

logger = logging.getLogger(__name__)


class MailSendError(RuntimeError):
    """Mail send failure (transport- or auth-level)."""


class MailProvider(Protocol):
    def send_html_email(
        self, *, to_email: str, subject: str, html_body: str, text_body: Optional[str] = None
    ) -> dict:
        ...


class GraphMailProvider:
    """Sends via Microsoft Graph (Outlook) as the service mailbox — app-only
    `Mail.Send`, authenticated with the SPN certificate."""

    def send_html_email(
        self, *, to_email: str, subject: str, html_body: str, text_body: Optional[str] = None
    ) -> dict:
        from app.services.graph_service import GraphService
        from app.services.graph_auth import get_graph_app_token

        try:
            token = get_graph_app_token()
        except Exception as exc:  # noqa: BLE001 — surface auth failures as send errors
            raise MailSendError(f"Graph token acquisition failed: {exc}") from exc
        if not token:
            raise MailSendError(
                "No Graph credentials — set GRAPH_CERT_PATH (app-only) in .env"
            )

        sender = (settings.graph_mail_sender or "").strip() or None
        result = asyncio.run(
            GraphService(token).send_mail(
                to_email=to_email, subject=subject, html_body=html_body,
                sender=sender, text_body=text_body,
            )
        )
        if isinstance(result, dict) and result.get("error"):
            raise MailSendError(str(result.get("detail") or result.get("error")))
        return result


def get_mail_provider() -> MailProvider:
    """Return the mail provider. Graph (service mailbox) is the only channel."""
    return GraphMailProvider()
