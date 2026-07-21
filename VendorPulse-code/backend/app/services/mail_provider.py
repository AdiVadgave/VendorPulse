"""
Mail provider abstraction — one seam for sending scorecard links & meeting
minutes (MOM), so we can switch the channel from Gmail to Microsoft Graph
(Outlook) with a single config value.

Today: `mail_provider="gmail"` → GmailMailProvider (unchanged behaviour).
Future: `mail_provider="graph"` → GraphMailProvider, sending via a service
account with the `Mail.Send` permission.

Both providers expose the SAME method as the current `gmail_service.send_html_email`:

    send_html_email(*, to_email, subject, html_body, text_body=None) -> dict

so a call site only has to swap
    from app.services.gmail_service import send_html_email
    ... send_html_email(...)
for
    from app.services.mail_provider import get_mail_provider, MailSendError
    ... get_mail_provider().send_html_email(...)

and broaden `except GmailSendError` to `except MailSendError`. See
docs/MAIL_OUTLOOK_MIGRATION.md for the exact switch checklist.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional, Protocol

from app.config import settings

logger = logging.getLogger(__name__)


class MailSendError(RuntimeError):
    """Provider-agnostic send failure. `GmailSendError` is re-raised as this so
    call sites can catch a single exception regardless of the active provider."""


class MailProvider(Protocol):
    def send_html_email(
        self, *, to_email: str, subject: str, html_body: str, text_body: Optional[str] = None
    ) -> dict:
        ...


class GmailMailProvider:
    """Current provider — sends via the authenticated Gmail account (unchanged)."""

    def send_html_email(
        self, *, to_email: str, subject: str, html_body: str, text_body: Optional[str] = None
    ) -> dict:
        from app.services.gmail_service import send_html_email as _gmail_send, GmailSendError
        try:
            return _gmail_send(
                to_email=to_email, subject=subject, html_body=html_body, text_body=text_body
            )
        except GmailSendError as exc:
            raise MailSendError(str(exc)) from exc


class GraphMailProvider:
    """Future provider — sends via Microsoft Graph (Outlook) using a service
    account (app-only `Mail.Send`). Ready to use once the tenant grants Mail.Send."""

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
                "No Graph credentials — set GRAPH_CERT_PATH (app-only) or GRAPH_ACCESS_TOKEN"
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
    """Return the active mail provider, chosen by `settings.mail_provider`."""
    provider = (settings.mail_provider or "gmail").strip().lower()
    if provider in ("graph", "outlook", "microsoft"):
        return GraphMailProvider()
    return GmailMailProvider()
