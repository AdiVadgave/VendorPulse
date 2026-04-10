"""
GraphService — wrapper around Microsoft Graph API for meeting scheduling.

Handles:
  • findMeetingTimes — find common availability across attendees
  • createEvent — create online Teams meeting + send invites
  • lookupUser — resolve email to user ID
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

try:
    import httpx
except ImportError:
    httpx = None

logger = logging.getLogger(__name__)


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
        require_all_attendees: bool = True,
        activity_domain: str = "unrestricted",
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
        logger.info(
            "find_meeting_times — attendees=%s, range=%s to %s, duration_hours=%s, tz=%s",
            attendee_emails, date_range_start, date_range_end, duration_hours, time_zone,
        )
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
                # 'work' can be overly restrictive when mailbox working hours are not configured.
                "activityDomain": activity_domain,
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
            # Keep attendee requirement strict even if organiser is optional.
            "minimumAttendeePercentage": 100 if require_all_attendees else (100 if not is_organizer_optional else 50),
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

                # Attach non-sensitive HTTP diagnostics to help debug empty slot results.
                # Do NOT include Authorization header or full diagnostic blobs.
                try:
                    request_id = response.headers.get("request-id")
                except Exception:
                    request_id = None
                if isinstance(result, dict):
                    result.setdefault(
                        "_http",
                        {
                            "status_code": response.status_code,
                            "request_id": request_id,
                        },
                    )
                
                if response.status_code != 200:
                    logger.error("find_meeting_times: Graph API error — status=%d", response.status_code)
                    return self._build_graph_error(response.status_code, result)

                suggestions = result.get("meetingTimeSuggestions", []) if isinstance(result, dict) else []
                logger.info("find_meeting_times: success — %d suggestions returned", len(suggestions))
                return result
        except Exception as e:
            logger.exception("find_meeting_times: request failed — %s", e)
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
        logger.info(
            "create_event — subject=%s, attendees=%s, start=%s, duration_hours=%s, tz=%s, online=%s",
            subject, attendee_emails, start_time, duration_hours, time_zone, is_online_meeting,
        )
        if not httpx:
            raise ImportError("httpx is required. Install with: pip install httpx")

        graph_tz = self._TZ_ALIASES.get(time_zone.upper(), time_zone)

        # For converting an absolute datetime (with tzinfo) into a Graph local wall-clock,
        # we need an IANA timezone. Graph uses Windows timezone IDs in the payload.
        # This mapping is intentionally small — extend when new UI timezone options are added.
        try:
            from zoneinfo import ZoneInfo  # Python 3.9+
        except Exception:  # pragma: no cover
            ZoneInfo = None  # type: ignore

        def _to_zoneinfo(graph_time_zone: str):
            if ZoneInfo is None:
                return None
            iana = {
                "India Standard Time": "Asia/Kolkata",
                "UTC": "UTC",
                "GMT Standard Time": "Europe/London",
            }.get(graph_time_zone, graph_time_zone)
            try:
                return ZoneInfo(iana)
            except Exception:
                return None

        def _fixed_offset_minutes(graph_time_zone: str) -> int | None:
            """Return a deterministic UTC offset fallback when zoneinfo data is unavailable."""
            normalized = (graph_time_zone or "").strip().upper()
            if normalized in {"INDIA STANDARD TIME", "IST"}:
                return 330
            if normalized in {"UTC", "GMT STANDARD TIME", "GMT"}:
                return 0
            return None

        # Parse start time and compute end time
        try:
            start_dt = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        except ValueError as e:
            return {"error": f"Invalid datetime format: {e}"}

        # Graph expects local wall-clock time in dateTime with explicit timeZone.
        # If the input has tzinfo (e.g. "...Z"), convert it into the requested timezone
        # *before* stripping tzinfo so the absolute instant stays the same.
        if start_dt.tzinfo is not None:
            if graph_tz == "UTC":
                start_local = start_dt.astimezone(timezone.utc).replace(tzinfo=None)
            else:
                tzinfo_target = _to_zoneinfo(graph_tz)
                if tzinfo_target is not None:
                    start_local = start_dt.astimezone(tzinfo_target).replace(tzinfo=None)
                else:
                    # Fallback for environments without tzdata (common on Windows):
                    # preserve the absolute UTC instant by applying a deterministic
                    # offset for known Graph zones.
                    offset_minutes = _fixed_offset_minutes(graph_tz)
                    if offset_minutes is None:
                        # Last-resort fallback for unknown zones.
                        start_local = start_dt.replace(tzinfo=None)
                    else:
                        utc_dt = start_dt.astimezone(timezone.utc)
                        start_local = (utc_dt + timedelta(minutes=offset_minutes)).replace(tzinfo=None)
        else:
            # Naive datetime is assumed to already be in the provided timezone.
            start_local = start_dt

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
            "responseRequested": True,
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
                    logger.error("create_event: Graph API error — status=%d", response.status_code)
                    return self._build_graph_error(response.status_code, result)

                logger.info("create_event: success — event_id=%s", result.get("id"))
                return {
                    "id": result.get("id"),
                    "webLink": result.get("webLink"),
                    "onlineMeetingUrl": result.get("onlineMeeting", {}).get("joinUrl"),
                    "iCalUId": result.get("iCalUId"),
                }
        except Exception as e:
            logger.exception("create_event: request failed — %s", e)
            return {"error": f"Request failed: {str(e)}"}

    async def get_me_profile(self) -> dict:
        """Fetch /me profile (debug helper).

        Returns a dict with keys like: id, displayName, mail, userPrincipalName.
        Attaches a non-sensitive _http block (status_code, request_id).
        """
        if not httpx:
            raise ImportError("httpx is required. Install with: pip install httpx")

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/me",
                    headers=self.headers,
                    timeout=30.0,
                )
                result = response.json()
                try:
                    request_id = response.headers.get("request-id")
                except Exception:
                    request_id = None

                if isinstance(result, dict):
                    result.setdefault(
                        "_http",
                        {
                            "status_code": response.status_code,
                            "request_id": request_id,
                        },
                    )

                if response.status_code != 200:
                    return self._build_graph_error(response.status_code, result)

                return result
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

    # ──────────────────────────────────────────────────────────────────
    # Mail (reply tracking via conversationId)
    # ──────────────────────────────────────────────────────────────────

    async def create_draft_message(
        self,
        subject: str,
        content: str,
        to_recipients: list[str],
        content_type: str = "Text",
    ) -> dict:
        """
        Create a draft email under /me/messages.

        Returns at minimum:
          {"id": "...", "conversationId": "..."}
        """
        if not httpx:
            raise ImportError("httpx is required. Install with: pip install httpx")

        recipients = [r.strip() for r in to_recipients if r and r.strip()]
        if not recipients:
            return {"error": "No to_recipients provided"}

        body = {
            "subject": subject,
            "body": {"contentType": content_type, "content": content},
            "toRecipients": [
                {"emailAddress": {"address": addr}} for addr in recipients
            ],
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.BASE_URL}/me/messages",
                    json=body,
                    headers=self.headers,
                    timeout=30.0,
                )
                result = response.json() if response.content else {}

                if response.status_code not in (200, 201):
                    return self._build_graph_error(
                        response.status_code,
                        result,
                        fallback="Failed to create message draft",
                    )

                return {
                    "id": result.get("id"),
                    "conversationId": result.get("conversationId"),
                }
        except Exception as exc:
            return {"error": f"Request failed: {str(exc)}"}

    async def send_draft_message(self, message_id: str) -> dict:
        """Send a previously created draft email."""
        if not httpx:
            raise ImportError("httpx is required. Install with: pip install httpx")

        if not message_id:
            return {"error": "message_id is required"}

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.BASE_URL}/me/messages/{message_id}/send",
                    headers=self.headers,
                    timeout=30.0,
                )

                if response.status_code not in (200, 202, 204):
                    result = response.json() if response.content else {}
                    return self._build_graph_error(
                        response.status_code,
                        result,
                        fallback="Failed to send message",
                    )

                return {"status": "sent", "id": message_id}
        except Exception as exc:
            return {"error": f"Request failed: {str(exc)}"}

    async def query_messages_by_conversation_id(
        self,
        conversation_id: str,
        select_fields: Optional[list[str]] = None,
        top: int = 50,
    ) -> dict:
        """
        Query messages in the mailbox by conversationId.

        GET /me/messages?$filter=conversationId eq '{conversationId}'
        """
        if not httpx:
            raise ImportError("httpx is required. Install with: pip install httpx")

        if not conversation_id:
            return {"error": "conversation_id is required"}

        if select_fields is None:
            select_fields = [
                "id",
                "subject",
                "from",
                "receivedDateTime",
                "conversationId",
                "bodyPreview",
            ]

        params = {
            "$filter": f"conversationId eq '{conversation_id}'",
            "$top": str(int(top)),
            "$select": ",".join(select_fields),
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/me/messages",
                    params=params,
                    headers=self.headers,
                    timeout=30.0,
                )
                result = response.json() if response.content else {}

                if response.status_code != 200:
                    return self._build_graph_error(
                        response.status_code,
                        result,
                        fallback="Failed to query messages",
                    )

                return result
        except Exception as exc:
            return {"error": f"Request failed: {str(exc)}"}
