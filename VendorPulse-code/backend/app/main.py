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
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import actions, alignment, analytics, meeting_agent, meetings, pushback, scheduling, scorecard, scorecard_v2, users, vendor_prep, vendors
from app.config import settings
from app.core.auth import get_current_user
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
    # Start the daily scorecard-reminder scheduler (no-op if APScheduler absent).
    from app.services.reminder_scheduler import start_reminder_scheduler, stop_reminder_scheduler
    start_reminder_scheduler()
    yield
    stop_reminder_scheduler()
    close_pool()


app = FastAPI(
    title="VendorPulse Backend",
    version="1.0.0",
    description=(
        "Backend engine for VendorPulse — governance cycle automation. "
        "Handles meeting scheduling, availability management, and the Module A "
        "scheduling agent workflow."
    ),
    # Public API docs expose the full endpoint map — disable them in production
    # (whenever SSO is enforced). In local dev (SSO off) they stay available.
    docs_url=None if settings.sso_enabled else "/docs",
    redoc_url=None if settings.sso_enabled else "/redoc",
    openapi_url=None if settings.sso_enabled else "/openapi.json",
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
# Every API router requires a valid signed-in user. get_current_user validates the
# Entra ID token when SSO is on (401 on missing/invalid), and returns the dev
# principal (never raising) when SSO is off, so local dev stays open. /api/health
# and the SPA static fallback below are routes on `app` (not routers), so they
# remain public — the health probe and the login screen must load without a token.
_auth = [Depends(get_current_user)]
app.include_router(users.router, dependencies=_auth)
app.include_router(meetings.router, dependencies=_auth)
app.include_router(scheduling.router, dependencies=_auth)
app.include_router(scorecard.router, dependencies=_auth)
app.include_router(scorecard_v2.router, dependencies=_auth)
app.include_router(vendors.router, dependencies=_auth)
app.include_router(alignment.router, dependencies=_auth)
app.include_router(actions.router, dependencies=_auth)
app.include_router(vendor_prep.router, dependencies=_auth)
app.include_router(pushback.router, dependencies=_auth)
app.include_router(meeting_agent.router, dependencies=_auth)
app.include_router(analytics.router, dependencies=_auth)

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


# ── Serve the built React frontend (single App Service deployment) ─────────────
# The Vite build (`frontend/dist`) is copied into `backend/static/` at deploy
# time. When that folder is present we serve it: hashed asset bundles under
# /assets, and an index.html fallback for every non-API path so the client-side
# router (react-router) can take over. All API/docs routes are registered ABOVE
# this block, so they are matched first — the catch-all only handles the rest.
_FRONTEND_DIST = Path(__file__).resolve().parent.parent / "static"
if _FRONTEND_DIST.is_dir():
    _ASSETS_DIR = _FRONTEND_DIST / "assets"
    if _ASSETS_DIR.is_dir():
        app.mount("/assets", StaticFiles(directory=_ASSETS_DIR), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        candidate = _FRONTEND_DIST / full_path
        # A real file at the root (favicon, vite.svg, etc.) is served directly;
        # everything else returns index.html for the SPA router to resolve.
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_FRONTEND_DIST / "index.html")

    logger.info("Serving frontend static build from %s", _FRONTEND_DIST)
else:
    logger.info("No frontend static build found at %s — running API-only", _FRONTEND_DIST)
