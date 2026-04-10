"""
VendorPulse Backend — FastAPI application entry point.

Serves:
  • /api/users          — User management
  • /api/meetings       — Meeting CRUD + invite response
  • /api/cycles/...     — Governance cycles + Module A scheduling workflow
  • /api/health         — Health check
  • /docs               — Auto-generated Swagger UI
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import google_auth, graph_scheduling, llm_routes, meetings, scheduling, scorecard, users
from app.config import settings
from app.core.logging_config import setup_logging
from app.middleware.request_logging import RequestLoggingMiddleware

# ── Initialize logging before anything else ───────────────────────────────────
setup_logging()
logger = logging.getLogger(__name__)

app = FastAPI(
    title="VendorPulse Backend",
    version="1.0.0",
    description=(
        "Backend engine for VendorPulse — governance cycle automation. "
        "Handles meeting scheduling, availability management, and the Module A "
        "scheduling agent workflow."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── Middleware (order matters: last added = first executed) ────────────────────

# Allow all origins during development. Restrict in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*" , "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request/response logging with request IDs
app.add_middleware(RequestLoggingMiddleware)

# ── Register routers ──────────────────────────────────────────────────────────
app.include_router(users.router)
app.include_router(meetings.router)
app.include_router(scheduling.router)
app.include_router(graph_scheduling.router)
app.include_router(google_auth.router)
app.include_router(scorecard.router)
app.include_router(llm_routes.router)

logger.info("VendorPulse backend initialized — routers registered, middleware active")


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/api/health", tags=["system"])
def health():
    return {
        "status": "ok",
        "service": "vendorpulse-backend",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "llm_enabled": settings.enable_llm,
        "endpoints": {
            "users": "GET|POST /api/users",
            "userDetail": "GET|PUT /api/users/{userId}",
            "userAvailability": "GET|PUT /api/users/{userId}/availability",
            "userMeetings": "GET /api/users/{userId}/meetings",
            "meetings": "GET|POST /api/meetings",
            "meetingDetail": "GET|PUT|DELETE /api/meetings/{meetingId}",
            "meetingRespond": "PUT /api/meetings/{meetingId}/respond",
            "googleAuth": "GET /auth/google",
            "googleAuthStatus": "GET /auth/google/status",
            "scorecardDispatch": "POST /api/scorecard/dispatch",
            "scorecardPoll": "POST /api/scorecard/poll",
            "scorecardResponses": "GET /api/scorecard/responses/{cycleId}",
            "cycles": "GET|POST /api/cycles",
            "cycleDetail": "GET /api/cycles/{cycleId}",
            "attendees": "GET|POST /api/cycles/{cycleId}/attendees",
            "slots": "GET /api/cycles/{cycleId}/scheduling/slots",
            "approveSlot": "PUT /api/cycles/{cycleId}/scheduling/slots/{slotId}/approve",
            "graphTokenInfo": "GET /api/graph/token-info",
            "graphFindTimes": "POST /api/cycles/{cycleId}/scheduling/graph/find-times",
            "graphSendInvite": "POST /api/cycles/{cycleId}/scheduling/graph/send-invite",
            "rsvp": "GET|PUT /api/cycles/{cycleId}/scheduling/rsvp",
        },
    }
