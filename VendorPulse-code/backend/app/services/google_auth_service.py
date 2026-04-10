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

from app.config import settings


from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

from app.config import settings

logger = logging.getLogger(__name__)

# Scopes needed for sending Gmail and reading Google Forms responses
SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/forms.responses.readonly",
    "https://www.googleapis.com/auth/forms.body.readonly",
]

# Allow HTTP redirect URIs for local development (localhost).
# In production, use HTTPS and remove this.
if settings.google_redirect_uri.startswith("http://localhost"):
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"
    logger.info("AUTH-ENV: OAUTHLIB_INSECURE_TRANSPORT=1 (redirect_uri=%s)", settings.google_redirect_uri)

logger.info("AUTH-ENV: google_client_id=%s..., project=%s, redirect_uri=%s",
            settings.google_client_id[:20], settings.google_project_id, settings.google_redirect_uri)
logger.debug("AUTH-ENV: SCOPES=%s", SCOPES)

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
    logger.debug("AUTH-CONFIG: client_config built — client_id=%s..., redirect_uris=%s",
                 config["web"]["client_id"][:20], config["web"]["redirect_uris"])
    return config


def build_oauth_flow() -> Flow:
    """Create a Google OAuth2 flow for the consent redirect."""
    logger.info("AUTH-FLOW: building OAuth flow")
    flow = Flow.from_client_config(
        _client_config(),
        scopes=SCOPES,
        redirect_uri=settings.google_redirect_uri,
    )
    logger.info("AUTH-FLOW: flow created — redirect_uri=%s", settings.google_redirect_uri)
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
    logger.info("AUTH: cached flow for state=%s", state)
    return auth_url, state


def exchange_code_for_token(code: str, state: str | None = None) -> Credentials:
    """Exchange the authorization code for credentials and persist them."""
    logger.info("AUTH-EXCHANGE: starting token exchange")

    # Reuse the original Flow that generated the auth URL (has the PKCE
    # code_verifier).  Fall back to a fresh flow if state is missing.
    flow = _pending_flows.pop(state, None) if state else None
    if flow is None:
        logger.warning("AUTH-EXCHANGE: no cached flow found, creating fresh one")
        flow = build_oauth_flow()

    flow.oauth2session._state = None  # type: ignore[attr-defined]

    os.environ.pop("OAUTHLIB_RELAX_TOKEN_SCOPE", None)

    token_uri = flow.oauth2session.auto_refresh_url or "https://oauth2.googleapis.com/token"
    logger.debug("AUTH-EXCHANGE: token_uri=%s", token_uri)

    try:
        flow.fetch_token(code=code)
        logger.info("AUTH-EXCHANGE: fetch_token succeeded")
    except Exception as exc:
        logger.exception("AUTH-EXCHANGE: fetch_token FAILED: %s", exc)
        raise

    creds = flow.credentials
    logger.info(
        "AUTH-EXCHANGE: credentials obtained — token_present=%s, refresh_token_present=%s",
        bool(creds.token), bool(creds.refresh_token),
    )

    _save_token(creds)
    logger.info("AUTH-EXCHANGE: token saved to %s", TOKEN_PATH)
    return creds


def get_credentials() -> Credentials | None:
    """Load saved credentials, refreshing if expired. Returns None if
    the user has not authenticated yet."""
    logger.debug("AUTH-CREDS: loading credentials from %s", TOKEN_PATH)
    if not TOKEN_PATH.exists():
        logger.debug("AUTH-CREDS: token file not found — not authenticated")
        return None

    try:
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    except Exception as exc:
        logger.warning("AUTH-CREDS: corrupt token file — re-auth required: %s", exc)
        return None

    # Check that the stored token has ALL required scopes
    stored_scopes = set(creds.scopes or [])
    required_scopes = set(SCOPES)
    missing = required_scopes - stored_scopes
    if missing:
        logger.warning("AUTH-CREDS: token missing scopes %s — re-auth required (stored=%s)", missing, stored_scopes)
        # Delete the stale token so user is prompted to re-authenticate
        try:
            TOKEN_PATH.unlink()
            logger.info("AUTH-CREDS: deleted stale token file")
        except Exception:
            pass
        return None

    if creds.valid:
        logger.debug("AUTH-CREDS: credentials valid")
        return creds

    if creds.expired and creds.refresh_token:
        logger.info("AUTH-CREDS: token expired, attempting refresh")
        try:
            creds.refresh(Request())
            _save_token(creds)
            logger.info("AUTH-CREDS: token refreshed successfully")
            return creds
        except Exception as exc:
            logger.warning("AUTH-CREDS: token refresh failed — re-auth required: %s", exc)
            return None

    logger.warning("AUTH-CREDS: credentials not valid and cannot refresh")
    return None


def is_authenticated() -> bool:
    return get_credentials() is not None


def _save_token(creds: Credentials) -> None:
    TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_PATH.write_text(creds.to_json(), encoding="utf-8")
    logger.info("Google token saved to %s", TOKEN_PATH)
