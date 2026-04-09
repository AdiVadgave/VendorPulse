"""
Google OAuth2 service — handles the OAuth2 flow for Gmail and Google Forms API.

Stores tokens in a JSON file (data/google_token.json) so the user only needs
to authenticate once.  On subsequent requests the refresh token is used
automatically.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

from app.config import settings

# Allow HTTP redirect URIs for local development (localhost).
# In production, use HTTPS and remove this.
if settings.google_redirect_uri.startswith("http://localhost"):
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"
    print(f"[AUTH-ENV] OAUTHLIB_INSECURE_TRANSPORT = 1 (redirect_uri={settings.google_redirect_uri})")

print(f"[AUTH-ENV] google_client_id = {settings.google_client_id[:20]}...")
print(f"[AUTH-ENV] google_project_id = {settings.google_project_id}")
print(f"[AUTH-ENV] google_redirect_uri = {settings.google_redirect_uri}")
print(f"[AUTH-ENV] SCOPES will be: gmail.send, forms.responses.readonly")

logger = logging.getLogger(__name__)

# Scopes needed for sending Gmail and reading Google Forms responses
SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/forms.responses.readonly",
]

TOKEN_PATH = settings.data_dir / "google_token.json"

# Store pending OAuth flows keyed by state token so the callback can
# reuse the same Flow (and its PKCE code_verifier).
_pending_flows: dict[str, Flow] = {}


def _client_config() -> dict[str, Any]:
    """Build the client config dict from env settings."""
    config = {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "project_id": settings.google_project_id,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "redirect_uris": [settings.google_redirect_uri],
        }
    }
    print(f"[AUTH-CONFIG] client_config built — client_id={config['web']['client_id'][:20]}..., token_uri={config['web']['token_uri']}, redirect_uris={config['web']['redirect_uris']}")
    return config


def build_oauth_flow() -> Flow:
    """Create a Google OAuth2 flow for the consent redirect."""
    print("[AUTH-FLOW] Building OAuth flow...")
    flow = Flow.from_client_config(
        _client_config(),
        scopes=SCOPES,
        redirect_uri=settings.google_redirect_uri,
    )
    print(f"[AUTH-FLOW] Flow created — redirect_uri={settings.google_redirect_uri}, scopes={SCOPES}")
    return flow


def start_oauth_flow() -> tuple[str, str]:
    """Build a flow, generate the auth URL, cache the flow, and return (auth_url, state)."""
    flow = build_oauth_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    _pending_flows[state] = flow
    print(f"[AUTH] Cached flow for state={state}")
    return auth_url, state


def exchange_code_for_token(code: str, state: str | None = None) -> Credentials:
    """Exchange the authorization code for credentials and persist them."""
    print(f"[AUTH-EXCHANGE] Starting token exchange...")
    print(f"[AUTH-EXCHANGE] Code (first 20 chars): {code[:20]}...")

    # Reuse the original Flow that generated the auth URL (has the PKCE
    # code_verifier).  Fall back to a fresh flow if state is missing.
    flow = _pending_flows.pop(state, None) if state else None
    if flow is None:
        print("[AUTH-EXCHANGE] WARNING: no cached flow found, creating fresh one")
        flow = build_oauth_flow()

    flow.oauth2session._state = None  # type: ignore[attr-defined]
    print("[AUTH-EXCHANGE] Session state set to None (bypassing state check)")

    os.environ.pop("OAUTHLIB_RELAX_TOKEN_SCOPE", None)

    token_uri = flow.oauth2session.auto_refresh_url or "https://oauth2.googleapis.com/token"
    print(f"[AUTH-EXCHANGE] Token URI: {token_uri}")
    print(f"[AUTH-EXCHANGE] Calling flow.fetch_token(code=...)...")

    try:
        flow.fetch_token(code=code)
        print(f"[AUTH-EXCHANGE] fetch_token succeeded!")
    except Exception as exc:
        print(f"[AUTH-EXCHANGE] fetch_token FAILED: {type(exc).__name__}: {exc}")
        raise

    creds = flow.credentials
    print(f"[AUTH-EXCHANGE] Credentials obtained — token present: {bool(creds.token)}, refresh_token present: {bool(creds.refresh_token)}")
    print(f"[AUTH-EXCHANGE] Token (first 20 chars): {creds.token[:20] if creds.token else 'None'}...")

    _save_token(creds)
    print(f"[AUTH-EXCHANGE] Token saved to {TOKEN_PATH}")
    logger.info("Google authentication successful")
    return creds


def get_credentials() -> Credentials | None:
    """Load saved credentials, refreshing if expired. Returns None if
    the user has not authenticated yet."""
    if not TOKEN_PATH.exists():
        return None

    try:
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    except Exception:
        logger.warning("Corrupt token file — re-auth required")
        return None

    if creds.valid:
        return creds

    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            _save_token(creds)
            return creds
        except Exception:
            logger.warning("Token refresh failed — re-auth required")
            return None

    return None


def is_authenticated() -> bool:
    return get_credentials() is not None


def _save_token(creds: Credentials) -> None:
    TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_PATH.write_text(creds.to_json(), encoding="utf-8")
    logger.info("Google token saved to %s", TOKEN_PATH)
