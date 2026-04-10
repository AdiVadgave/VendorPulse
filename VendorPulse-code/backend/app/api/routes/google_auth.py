"""
Google OAuth2 authentication routes.

Flow:
  1. Frontend/user visits  GET /auth/google  → redirected to Google consent screen
  2. Google redirects back GET /auth/callback?code=...  → token exchanged & saved
  3. GET /auth/google/status  → check if authenticated
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse

from app.services.google_auth_service import (
    exchange_code_for_token,
    is_authenticated,
    start_oauth_flow,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["google-auth"])


@router.get("/auth/google")
def google_auth_start():
    """Redirect to Google's OAuth2 consent screen."""
    logger.info("AUTH: starting Google OAuth flow")
    auth_url, state = start_oauth_flow()
    logger.info("AUTH: generated auth URL, state=%s", state)
    logger.debug("AUTH: auth_url=%s", auth_url)
    return RedirectResponse(auth_url)

@router.get("/auth/callback")
def google_auth_callback(code: str | None = None, error: str | None = None, state: str | None = None):
    """Handle the OAuth2 callback from Google."""
    logger.info("AUTH: callback received — code_present=%s, error=%s", bool(code), error)

    if error:
        raise HTTPException(status_code=400, detail=f"OAuth error: {error}")
    if not code:
        raise HTTPException(status_code=400, detail="No authorization code received")

    try:
        logger.info("AUTH: exchanging authorization code for token...")
        exchange_code_for_token(code, state)
        logger.info("AUTH: token exchange successful")
    except Exception as exc:
        logger.exception("AUTH: token exchange failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Token exchange failed: {exc}")

    return HTMLResponse(
        content="""\
<!DOCTYPE html>
<html>
<head><title>VendorPulse — Google Auth</title></head>
<body style="font-family: 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc;">
  <div style="text-align: center; background: white; padding: 48px; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
    <div style="font-size: 48px; margin-bottom: 16px;">&#10004;&#65039;</div>
    <h1 style="color: #1e293b; margin: 0 0 8px;">Google Account Connected</h1>
    <p style="color: #64748b; margin: 0 0 24px;">VendorPulse can now send emails via your Gmail and read Google Forms responses.</p>
    <p style="color: #94a3b8; font-size: 13px;">You can close this tab and return to VendorPulse.</p>
  </div>
</body>
</html>""",
        status_code=200,
    )


@router.get("/auth/google/status")
def google_auth_status():
    """Check whether the user has authenticated with Google."""
    return {"authenticated": is_authenticated()}
