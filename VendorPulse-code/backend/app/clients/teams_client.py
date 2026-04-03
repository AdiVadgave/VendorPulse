"""
Teams Backend client.

Thin httpx wrapper around the mock Teams backend (http://localhost:3001).
Used when settings.use_teams_backend = True so that:
  • Meetings created by VendorPulse are pushed to Teams → visible in Teams frontend
  • User data (availability, profiles) is read from one authoritative source
  • RSVP responses in Teams automatically flow back to VendorPulse

All methods return plain dicts / None — never raise on 404 (return None instead).
Other HTTP errors propagate as httpx.HTTPStatusError.
"""
from __future__ import annotations

import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


class TeamsBackendClient:
    def __init__(self, base_url: str, timeout: float = 10.0) -> None:
        self._base = base_url.rstrip("/")
        self._timeout = timeout
        # Persistent connection pool — avoids TCP handshake overhead on every call.
        # This is the singleton instance shared across all requests (see dependencies.py).
        self._client = httpx.Client(timeout=timeout)

    # ── helpers ──────────────────────────────────────────────────────────────

    def _get(self, path: str) -> dict:
        r = self._client.get(f"{self._base}{path}")
        r.raise_for_status()
        return r.json()

    def _post(self, path: str, body: dict) -> dict:
        r = self._client.post(f"{self._base}{path}", json=body)
        r.raise_for_status()
        return r.json()

    def _put(self, path: str, body: dict) -> dict:
        r = self._client.put(f"{self._base}{path}", json=body)
        r.raise_for_status()
        return r.json()

    def _delete(self, path: str, body: dict) -> dict:
        r = self._client.delete(f"{self._base}{path}", json=body)
        r.raise_for_status()
        return r.json()

    # ── Users ─────────────────────────────────────────────────────────────────

    def get_users(self) -> list[dict]:
        try:
            return self._get("/api/users").get("users", [])
        except Exception as exc:
            logger.warning("teams_client.get_users failed: %s", exc)
            return []

    def get_user(self, user_id: str) -> Optional[dict]:
        try:
            return self._get(f"/api/users/{user_id}").get("user")
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return None
            raise
        except Exception as exc:
            logger.warning("teams_client.get_user(%s) failed: %s", user_id, exc)
            return None

    def get_user_availability(self, user_id: str) -> list[dict]:
        """Returns list of {date, slots} entries."""
        try:
            return self._get(f"/api/users/{user_id}/availability").get("availability", [])
        except Exception as exc:
            logger.warning("teams_client.get_user_availability(%s) failed: %s", user_id, exc)
            return []

    def update_user_availability(self, user_id: str, date: str, slots: list[str]) -> dict:
        return self._put(f"/api/users/{user_id}/availability", {"date": date, "slots": slots})

    # ── Meetings ──────────────────────────────────────────────────────────────

    def get_meetings(self) -> list[dict]:
        try:
            return self._get("/api/meetings").get("meetings", [])
        except Exception as exc:
            logger.warning("teams_client.get_meetings failed: %s", exc)
            return []

    def get_user_meetings(self, user_id: str) -> list[dict]:
        try:
            return self._get(f"/api/users/{user_id}/meetings").get("meetings", [])
        except Exception as exc:
            logger.warning("teams_client.get_user_meetings(%s) failed: %s", user_id, exc)
            return []

    def create_meeting(
        self,
        title: str,
        description: str,
        agenda: str,
        organiser_id: str,
        participant_ids: list[str],
        date: str,
        start_time: str,
        end_time: str,
    ) -> Optional[dict]:
        """
        POST to Teams backend to create a meeting.
        Returns the created meeting dict, or None on failure.
        """
        body = {
            "title": title,
            "description": description,
            "agenda": agenda,
            "organizerId": organiser_id,
            "participantIds": participant_ids,
            "timeSlot": {"date": date, "startTime": start_time, "endTime": end_time},
        }
        try:
            return self._post("/api/meetings", body).get("meeting")
        except httpx.HTTPStatusError as exc:
            logger.error(
                "teams_client.create_meeting failed (HTTP %s): %s",
                exc.response.status_code,
                exc.response.text,
            )
            return None
        except Exception as exc:
            logger.error("teams_client.create_meeting failed: %s", exc)
            return None

    def respond_to_meeting(self, meeting_id: str, user_id: str, status: str) -> Optional[dict]:
        try:
            return self._put(f"/api/meetings/{meeting_id}/respond", {"userId": user_id, "status": status}).get("meeting")
        except Exception as exc:
            logger.warning("teams_client.respond_to_meeting(%s) failed: %s", meeting_id, exc)
            return None

    def cancel_meeting(self, meeting_id: str, organiser_id: str) -> Optional[dict]:
        try:
            return self._delete(f"/api/meetings/{meeting_id}", {"organizerId": organiser_id}).get("meeting")
        except Exception as exc:
            logger.warning("teams_client.cancel_meeting(%s) failed: %s", meeting_id, exc)
            return None
