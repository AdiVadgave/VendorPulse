"""
Entra ID (Azure AD) SSO — token validation for the signed-in user.

This is the *delegated* / user-login side of auth, kept separate from
`services/graph_auth.py` (the *app-only* identity that sends mail as the service
mailbox):

    graph_auth.py  → the APP authenticates as itself (certificate) to send mail
    core/auth.py   → validates the USER who signed in via the SPA (this file)

When ``settings.sso_enabled`` is False, ``get_current_user`` returns a fixed dev
principal and no route is blocked — the app behaves exactly as before SSO. When
True, it validates the Entra ID token: signature (against the tenant's JWKS),
issuer, audience (the SPA client id), and expiry.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, Request
from jwt import PyJWKClient

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class CurrentUser:
    """The authenticated principal for a request."""
    sub: str
    email: str
    name: str
    roles: list[str] = field(default_factory=list)
    is_authenticated: bool = True

    def has_role(self, role: str) -> bool:
        return role in self.roles


# Principal used while SSO is off — keeps every route callable in dev without a
# login. Clearly marked so it can never be mistaken for a real user.
_DEV_USER = CurrentUser(
    sub="dev-local",
    email="dev@localhost",
    name="Local Dev (SSO disabled)",
    roles=["VMO"],
    is_authenticated=False,
)


@lru_cache(maxsize=4)
def _jwks_client(tenant_id: str) -> PyJWKClient:
    """One cached JWKS client per tenant (caches + refreshes signing keys)."""
    url = f"https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys"
    return PyJWKClient(url)


def _accepted_audiences() -> list[str]:
    auds = [settings.sso_client_id] if settings.sso_client_id else []
    auds += [a.strip() for a in settings.sso_extra_audiences.split(",") if a.strip()]
    return auds


def _bearer_token(request: Request) -> str | None:
    header = request.headers.get("Authorization") or request.headers.get("authorization")
    if not header:
        return None
    parts = header.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        return None
    return parts[1].strip()


def _decode(token: str) -> dict:
    """Validate signature, issuer, audience and expiry. Raises jwt exceptions."""
    signing_key = _jwks_client(settings.sso_tenant_id).get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=_accepted_audiences(),
        issuer=f"https://login.microsoftonline.com/{settings.sso_tenant_id}/v2.0",
        options={"require": ["exp", "iat", "aud", "iss"]},
    )


def get_current_user(request: Request) -> CurrentUser:
    """
    FastAPI dependency. Returns the authenticated user.

    • SSO off → the dev principal (for local development/testing without a login).
    • SSO on  → validates the bearer token; raises 401 if missing/invalid.

    PRODUCTION: SSO_ENABLED must be true so every API call requires a valid Entra
    ID token. With SSO off the API is open — intended for local dev only.
    """
    if not settings.sso_enabled:
        return _DEV_USER

    if not settings.sso_client_id or not settings.sso_tenant_id:
        logger.error("SSO_ENABLED=true but SSO_CLIENT_ID / SSO_TENANT_ID is not set")
        raise HTTPException(status_code=500, detail="SSO is enabled but not configured")

    token = _bearer_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    try:
        claims = _decode(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as exc:
        logger.warning("SSO token rejected: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid token")

    roles = claims.get("roles") or []
    return CurrentUser(
        sub=claims.get("oid") or claims.get("sub") or "",
        email=(claims.get("preferred_username") or claims.get("email") or "").lower(),
        name=claims.get("name") or claims.get("preferred_username") or "",
        roles=list(roles),
        is_authenticated=True,
    )


def require_roles(*allowed: str):
    """Dependency factory — gate a route to specific app roles.

        @router.post(..., dependencies=[Depends(require_roles("VMO"))])

    While SSO is off the dev principal carries "VMO", so gated routes stay open
    in local dev.
    """
    def _guard(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if allowed and not any(user.has_role(r) for r in allowed):
            raise HTTPException(status_code=403, detail="Insufficient role")
        return user

    return _guard
