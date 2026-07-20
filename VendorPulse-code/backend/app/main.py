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

import truststore
truststore.inject_into_ssl()

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import actions, alignment, analytics, google_auth, meeting_agent, meetings, pushback, scheduling, scorecard, scorecard_v2, users, vendor_prep, vendors
from app.config import settings
from app.core.logging_config import setup_logging
from app.db.pool import close_pool, get_pool
from app.db.schema import ensure_schema
from app.middleware.request_logging import RequestLoggingMiddleware

# ── Initialize logging before anything else ───────────────────────────────────
setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Postgres-only: fail fast if the database is unreachable, then guarantee the
    # schema exists before serving any request.
    pool = get_pool()
    pool.wait()
    ensure_schema(pool)
    logger.info("VendorPulse backend ready — PostgreSQL connected, schema ensured")
    yield
    close_pool()


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
    lifespan=lifespan,
)

# ── Middleware (order matters: last added = first executed) ────────────────────

# Explicit allow-list from settings (comma-separated). Never "*" with credentials —
# a wildcard origin plus credentials lets any site make credentialed calls.
_cors_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
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
app.include_router(google_auth.router)
app.include_router(scorecard.router)
app.include_router(scorecard_v2.router)
app.include_router(vendors.router)
app.include_router(alignment.router)
app.include_router(actions.router)
app.include_router(vendor_prep.router)
app.include_router(pushback.router)
app.include_router(meeting_agent.router)
app.include_router(analytics.router)

logger.info("VendorPulse backend initialized — routers registered, middleware active")


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/api/health", tags=["system"])
def health():
    try:
        with get_pool().connection() as conn:
            conn.execute("SELECT 1")
        db_status = "connected"
    except Exception as exc:  # noqa: BLE001 — health must never raise
        logger.warning("Health check DB probe failed: %s", exc)
        db_status = "unavailable"
    return {
        "status": "ok" if db_status == "connected" else "degraded",
        "service": "vendorpulse-backend",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": db_status,
        "llm_enabled": settings.enable_llm,
        "endpoints": {
            "users": "GET|POST /api/users",
            "userDetail": "GET|PUT /api/users/{userId}",
            "userAvailability": "GET|PUT /api/users/{userId}/availability",
            "googleAuth": "GET /auth/google",
            "googleAuthStatus": "GET /auth/google/status",
            "cycles": "GET|POST /api/cycles",
            "cycleDetail": "GET /api/cycles/{cycleId}",
            "attendees": "GET|POST /api/cycles/{cycleId}/attendees",
            "slots": "GET /api/cycles/{cycleId}/scheduling/slots",
            "manualMeeting": "POST /api/cycles/{cycleId}/scheduling/manual-meeting",
            "rsvp": "GET|PUT /api/cycles/{cycleId}/scheduling/rsvp",
            "scorecardStructure": "GET /api/scorecard/structure",
            "scorecardSubmit": "POST /api/scorecard/submit",
            "scorecardWeighted": "GET /api/scorecard/weighted/{cycleId}",
            "alignmentInsights": "POST /api/cycles/{cycleId}/alignment/insights",
            "alignmentExtractActions": "POST /api/cycles/{cycleId}/alignment/extract-actions",
            "alignmentManualMeeting": "POST /api/cycles/{cycleId}/alignment/manual-meeting",
            "actions": "GET|POST /api/cycles/{cycleId}/actions",
            "vendorPrepBrief": "POST /api/cycles/{cycleId}/vendor-prep/brief",
            "vendorPrepPushback": "POST /api/cycles/{cycleId}/vendor-prep/pushback",
            "vendorPrepManualMeeting": "POST /api/cycles/{cycleId}/vendor-prep/manual-meeting",
            "meetingParseTranscript": "POST /api/cycles/{cycleId}/meeting/parse-transcript",
            "meetingMinutes": "POST /api/cycles/{cycleId}/meeting/minutes",
            "analyticsPortfolio": "GET /api/analytics/portfolio",
        },
    }
