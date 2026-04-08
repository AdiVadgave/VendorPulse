"""
GraphService — wrapper around Microsoft Graph API for meeting scheduling.

Handles:
  • findMeetingTimes — find common availability across attendees
  • createEvent — create online Teams meeting + send invites
  • lookupUser — resolve email to user ID  
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Optional

try:
    import httpx
except ImportError:
    httpx = None


class GraphService:
    """
    Client for Microsoft Graph API calls.
    Requires GRAPH_ACCESS_TOKEN set in .env (from Graph Explorer or OAuth2).
    """

    BASE_URL = "https://graph.microsoft.com/v1.0"

    _TZ_ALIASES = {
        "IST": "India Standard Time",
        "UTC": "UTC",
        "GMT": "GMT Standard Time",
    }

    @staticmethod
    def _build_graph_error(status_code: int, result: dict | None, fallback: str = "Unknown error") -> dict:
        """Normalize Graph error payload so routes can map status and detail safely."""
        error_obj = (result or {}).get("error") if isinstance(result, dict) else None
        detail = fallback
        code = None

        if isinstance(error_obj, dict):
            detail = error_obj.get("message") or fallback
            code = error_obj.get("code")

        payload = {
            "error": f"Graph API error: {status_code}",
            "status_code": status_code,
            "detail": detail,
        }
        if code:
            payload["code"] = code
        return payload

    def __init__(self, access_token: str):
        """
        Initialize with a delegated or app-only access token.
        
        Args:
            access_token: Bearer token from Microsoft Entra ID
        """
        if not access_token:
            raise ValueError("GRAPH_ACCESS_TOKEN is required but not set in .env")
        
        # Accept raw JWT or "Bearer <token>" to make .env usage resilient.
        normalized_token = access_token.strip()
        if normalized_token.lower().startswith("bearer "):
            normalized_token = normalized_token[7:].strip()

        self.access_token = normalized_token
        self.headers = {
            "Authorization": f"Bearer {normalized_token}",
            "Content-Type": "application/json",
        }

    async def find_meeting_times(
        self,
        attendee_emails: list[str],
        date_range_start: str,  # "YYYY-MM-DD"
        date_range_end: str,    # "YYYY-MM-DD" 
        duration_hours: float = 1.0,
        time_zone: str = "UTC",
        min_time_between_meetings: int = 0,
        max_candidates: int = 3,
        is_organizer_optional: bool = False,
    ) -> dict:
        """
        Call POST me/findMeetingTimes to find common availability.
        
        Args:
            attendee_emails: List of attendee email addresses
            date_range_start: Start date in YYYY-MM-DD
            date_range_end: End date in YYYY-MM-DD
            duration_hours: Meeting duration (0.5 for 30 min, 1.0 for 1 hour, etc.)
            time_zone: Timezone for meeting time (default: "UTC")
            min_time_between_meetings: Minutes buffer between meetings
            max_candidates: Max meeting time slots to return
            is_organizer_optional: If False, organizer availability is hard constraint
            
        Returns:
            {
                "meetingTimeSuggestions": [
                    {
                        "meetingDateTime": {"dateTime": "...", "timeZone": "..."},
                        "confidenceLevel": "high" | "medium" | "low",
                        "attendeeAvailability": [{"availability": "free" | "tentative" | "busy", ...}],
                        "locations": [...]
                    },
                    ...
                ],
                "error": None or error details
            }
        """
        if not httpx:
            raise ImportError("httpx is required. Install with: pip install httpx")

        # Parse dates
        try:
            start_dt = datetime.strptime(date_range_start, "%Y-%m-%d")
            end_dt = datetime.strptime(date_range_end, "%Y-%m-%d")
        except ValueError as e:
            return {"error": f"Invalid date format: {e}"}

        graph_tz = self._TZ_ALIASES.get(time_zone.upper(), time_zone)

        # Build attendees list
        attendees = [
            {"emailAddress": {"address": email}, "type": "required"}
            for email in attendee_emails
        ]

        # Request body
        body = {
            "attendees": attendees,
            "isOrganizerOptional": is_organizer_optional,
            "timeConstraint": {
                "activityDomain": "work",
                "timeSlots": [
                    {
                        "start": {
                            "dateTime": start_dt.strftime("%Y-%m-%dT09:00:00"),
                            "timeZone": graph_tz,
                        },
                        "end": {
                            "dateTime": end_dt.strftime("%Y-%m-%dT17:00:00"),
                            "timeZone": graph_tz,
                        },
                    }
                ],
            },
            "meetingDuration": f"PT{int(duration_hours * 60)}M",  # Convert to minutes
            "returnSuggestionReasons": True,
            "minimumAttendeePercentage": 100 if not is_organizer_optional else 50,
            "maxCandidates": max_candidates,
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.BASE_URL}/me/findMeetingTimes",
                    json=body,
                    headers=self.headers,
                    timeout=30.0,
                )
                result = response.json()
                
                if response.status_code != 200:
                    return self._build_graph_error(response.status_code, result)
                
                return result
        except Exception as e:
            return {"error": f"Request failed: {str(e)}"}

    async def create_event(
        self,
        subject: str,
        attendee_emails: list[str],
        start_time: str,  # ISO-8601: "2025-04-10T14:00:00"
        duration_hours: float = 1.0,
        organiser_email: str = "",
        is_online_meeting: bool = True,
        time_zone: str = "UTC",
    ) -> dict:
        """
        Create an online Teams meeting event and send invites.
        
        Args:
            subject: Meeting title
            attendee_emails: List of invitee email addresses
            start_time: ISO-8601 start datetime
            duration_hours: Duration in hours (default 1.0)
            organiser_email: Email of organiser (for display)
            is_online_meeting: If True, creates Teams meeting URL
            time_zone: Timezone
            
        Returns:
            {
                "id": "event_id",
                "webLink": "Teams meeting URL",
                "onlineMeetingUrl": "Teams meeting URL",
                "error": None or error details
            }
        """
        if not httpx:
            raise ImportError("httpx is required. Install with: pip install httpx")

        graph_tz = self._TZ_ALIASES.get(time_zone.upper(), time_zone)

        # Parse start time and compute end time
        try:
            start_dt = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        except ValueError as e:
            return {"error": f"Invalid datetime format: {e}"}

        # Graph expects local wall-clock time in dateTime with explicit timeZone.
        if start_dt.tzinfo is not None and graph_tz == "UTC":
            start_local = start_dt.astimezone(timezone.utc).replace(tzinfo=None)
        else:
            start_local = start_dt.replace(tzinfo=None) if start_dt.tzinfo is not None else start_dt

        end_local = start_local + timedelta(hours=duration_hours)

        # Build attendees list
        attendees = [
            {
                "emailAddress": {"address": email},
                "type": "required",
            }
            for email in attendee_emails
        ]

        # Request body
        body = {
            "subject": subject,
            "start": {
                "dateTime": start_local.isoformat(timespec="seconds"),
                "timeZone": graph_tz,
            },
            "end": {
                "dateTime": end_local.isoformat(timespec="seconds"),
                "timeZone": graph_tz,
            },
            "attendees": attendees,
            "isOnlineMeeting": is_online_meeting,
            "onlineMeetingProvider": "teamsForBusiness" if is_online_meeting else None,
            "isReminderOn": True,
            "reminderMinutesBeforeStart": 15,
            "ResponseRequested": True,
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.BASE_URL}/me/events",
                    json=body,
                    headers=self.headers,
                    timeout=30.0,
                )
                result = response.json()
                
                if response.status_code not in (200, 201):
                    return self._build_graph_error(response.status_code, result)
                
                return {
                    "id": result.get("id"),
                    "webLink": result.get("webLink"),
                    "onlineMeetingUrl": result.get("onlineMeeting", {}).get("joinUrl"),
                    "iCalUId": result.get("iCalUId"),
                }
        except Exception as e:
            return {"error": f"Request failed: {str(e)}"}

    async def lookup_user(self, email: str) -> dict | None:
        """
        Look up user by email address.
        
        Returns:
            {
                "id": "user_id",
                "userPrincipalName": "email",
                "displayName": "Display Name"
            }
            or None if not found
        """
        if not httpx:
            raise ImportError("httpx is required. Install with: pip install httpx")

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/users/{email}",
                    headers=self.headers,
                    timeout=30.0,
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    return None
        except Exception as e:
            return None
