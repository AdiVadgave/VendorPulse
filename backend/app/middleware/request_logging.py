"""
Request / Response logging middleware.

Logs for every HTTP request:
  - Request:  method, path, query params, client IP, request body (truncated)
  - Response: status code, duration (ms)
  - Assigns a unique request_id for tracing across log lines.
"""
from __future__ import annotations

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("app.middleware.request_logging")

# Max characters of request body to log (prevents huge payloads flooding logs)
_MAX_BODY_LOG = 2000


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = uuid.uuid4().hex[:12]
        start = time.perf_counter()

        # ── Log incoming request ──────────────────────────────────────
        method = request.method
        path = request.url.path
        query = str(request.url.query) if request.url.query else ""
        client = request.client.host if request.client else "unknown"

        # Read body for POST/PUT/PATCH (non-GET, non-DELETE)
        body_summary = ""
        if method in ("POST", "PUT", "PATCH"):
            try:
                raw = await request.body()
                body_text = raw.decode("utf-8", errors="replace")
                body_summary = body_text[:_MAX_BODY_LOG]
                if len(body_text) > _MAX_BODY_LOG:
                    body_summary += f"... (truncated, total {len(body_text)} chars)"
            except Exception:
                body_summary = "<unable to read body>"

        logger.info(
            "[%s] --> %s %s%s | client=%s | body=%s",
            request_id,
            method,
            path,
            f"?{query}" if query else "",
            client,
            body_summary if body_summary else "<empty>",
        )

        # ── Call the actual endpoint ──────────────────────────────────
        try:
            response = await call_next(request)
        except Exception as exc:
            duration_ms = (time.perf_counter() - start) * 1000
            logger.error(
                "[%s] <-- %s %s | 500 UNHANDLED | %.1fms | error=%s",
                request_id,
                method,
                path,
                duration_ms,
                str(exc),
            )
            raise

        # ── Log response ──────────────────────────────────────────────
        duration_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "[%s] <-- %s %s | status=%d | %.1fms",
            request_id,
            method,
            path,
            response.status_code,
            duration_ms,
        )

        # Attach request_id header for client-side tracing
        response.headers["X-Request-ID"] = request_id
        return response
