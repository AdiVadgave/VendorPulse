"""
Microsoft Graph app-only authentication via certificate (client-credentials).

Loads the SPN certificate from a `.pfx`/`.p12` (private key + cert), and uses
MSAL's ConfidentialClientApplication to acquire application tokens for Graph.
MSAL caches tokens in-memory and refreshes them automatically, so callers just
ask for a token each time.

Config (see app/config.py):
  graph_client_id, graph_tenant_id, graph_cert_path, graph_cert_password,
  graph_cert_thumbprint (optional — derived from the cert if blank).

If `graph_cert_path` is not set, `get_graph_app_token()` falls back to the
static `graph_access_token` (dev / delegated), so nothing breaks before the
certificate is in place.
"""
from __future__ import annotations

import hashlib
import logging
from functools import lru_cache
from pathlib import Path
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

_GRAPH_SCOPE = ["https://graph.microsoft.com/.default"]


def _load_pfx(path: str, password: str) -> tuple[str, str, str]:
    """Return (private_key_pem, cert_pem, thumbprint_hex) from a PKCS#12 file."""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.serialization import pkcs12

    data = Path(path).read_bytes()
    pwd = password.encode() if password else None
    private_key, certificate, _ = pkcs12.load_key_and_certificates(data, pwd)
    if private_key is None or certificate is None:
        raise ValueError(f"PFX at {path} did not contain both a private key and a certificate")

    key_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    cert_pem = certificate.public_bytes(serialization.Encoding.PEM).decode()
    thumbprint = certificate.fingerprint(hashes.SHA1()).hex().upper()
    return key_pem, cert_pem, thumbprint


@lru_cache(maxsize=1)
def _get_msal_app():
    """Build (once) the MSAL confidential client backed by the certificate."""
    import msal

    if not settings.graph_client_id or not settings.graph_tenant_id:
        raise RuntimeError("graph_client_id / graph_tenant_id are not configured")
    if not settings.graph_cert_path:
        raise RuntimeError("graph_cert_path is not configured")

    key_pem, cert_pem, derived_tp = _load_pfx(settings.graph_cert_path, settings.graph_cert_password)
    thumbprint = (settings.graph_cert_thumbprint or derived_tp).replace(":", "").upper()
    if settings.graph_cert_thumbprint and thumbprint != derived_tp:
        logger.warning(
            "Configured GRAPH_CERT_THUMBPRINT (%s) does not match the .pfx cert (%s) — using the cert's.",
            thumbprint, derived_tp,
        )
        thumbprint = derived_tp

    authority = f"https://login.microsoftonline.com/{settings.graph_tenant_id}"
    app = msal.ConfidentialClientApplication(
        client_id=settings.graph_client_id,
        authority=authority,
        client_credential={
            "private_key": key_pem,
            "thumbprint": thumbprint,
            "public_certificate": cert_pem,
        },
    )
    logger.info("MSAL confidential client built (cert thumbprint=%s)", thumbprint)
    return app


def get_certificate_token() -> str:
    """Acquire an app-only Graph token using the certificate. Raises on failure."""
    app = _get_msal_app()
    result = app.acquire_token_for_client(scopes=_GRAPH_SCOPE)
    if "access_token" not in result:
        detail = result.get("error_description") or result.get("error") or str(result)
        raise RuntimeError(f"MSAL token acquisition failed: {detail}")
    return result["access_token"]


def get_graph_app_token() -> Optional[str]:
    """Return a Graph token for sending mail.

    Prefers the certificate (app-only) flow when `graph_cert_path` is set;
    otherwise falls back to the static `graph_access_token` (dev/delegated).
    Returns None if neither is available.
    """
    if settings.graph_cert_path:
        return get_certificate_token()
    token = (settings.graph_access_token or "").strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    return token or None
