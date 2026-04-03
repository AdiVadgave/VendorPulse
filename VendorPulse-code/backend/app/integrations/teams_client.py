"""
Optional Teams-backend integration client.

When settings.use_teams_backend is True, this client proxies user and
availability reads to the teams-backend service (localhost:3001) so both
apps share the same underlying data.

When False (default), the client is a no-op and the VendorPulse backend
serves its own copy of the data from /data/users.json.

To enable:  set USE_TEAMS_BACKEND=true in .env (or env vars)

Future upgrade path: replace this with a real MS Graph / Teams API client
without changing any service or route code.
"""
from __future__ import annotations

from typing import Optional

import httpx

from app.config import settings


class TeamsBackendClient:
    """
    Thin HTTP wrapper around the mock teams-backend.

    All methods return None when the teams-backend is disabled or unreachable,
    so callers can fall back to the local data store gracefully.
    """

    def __init__(self, base_url: str = "") -> None:
        self._base_url = base_url or settings.teams_backend_url
        self._enabled = settings.use_teams_backend

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------

    def is_healthy(self) -> bool:
        if not self._enabled:
            return False
        try:
            r = httpx.get(f"{self._base_url}/api/health", timeout=2.0)
            return r.status_code == 200
        except Exception:
            return False

    # ------------------------------------------------------------------
    # Users
    # ------------------------------------------------------------------

    def list_users(self) -> Optional[list[dict]]:
        if not self._enabled:
            return None
        try:
            r = httpx.get(f"{self._base_url}/api/users", timeout=5.0)
            r.raise_for_status()
            return r.json().get("users", [])
        except Exception:
            return None

    def get_user(self, user_id: str) -> Optional[dict]:
        if not self._enabled:
            return None
        try:
            r = httpx.get(f"{self._base_url}/api/users/{user_id}", timeout=5.0)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.json().get("user")
        except Exception:
            return None

    # ------------------------------------------------------------------
    # Availability
    # ------------------------------------------------------------------

    def get_availability(self, user_id: str) -> Optional[list[dict]]:
        if not self._enabled:
            return None
        try:
            r = httpx.get(
                f"{self._base_url}/api/users/{user_id}/availability", timeout=5.0
            )
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.json().get("availability", [])
        except Exception:
            return None

    def update_availability(
        self, user_id: str, date: str, slots: list[str]
    ) -> Optional[dict]:
        if not self._enabled:
            return None
        try:
            r = httpx.put(
                f"{self._base_url}/api/users/{user_id}/availability",
                json={"date": date, "slots": slots},
                timeout=5.0,
            )
            r.raise_for_status()
            return r.json()
        except Exception:
            return None

    # ------------------------------------------------------------------
    # Meetings
    # ------------------------------------------------------------------

    def get_meetings(self) -> Optional[list[dict]]:
        if not self._enabled:
            return None
        try:
            r = httpx.get(f"{self._base_url}/api/meetings", timeout=5.0)
            r.raise_for_status()
            return r.json().get("meetings", [])
        except Exception:
            return None


# Module-level singleton — import and use directly
teams_client = TeamsBackendClient()
