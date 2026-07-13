"""
FastAPI dependency providers.

All services and repositories are instantiated here and injected via
Depends().  This keeps routes thin and makes unit-testing easy — just
override the provider in test fixtures.
"""
from __future__ import annotations

from functools import lru_cache


from app.config import settings
from app.repositories.agent_run_repository import AgentRunRepository
from app.repositories.attendee_repository import AttendeeRepository
from app.repositories.cycle_repository import CycleRepository
from app.repositories.meeting_repository import MeetingRepository
from app.repositories.slot_repository import SlotRepository
from app.repositories.user_repository import UserRepository
from app.repositories.vendor_repository import VendorRepository
from app.services.availability_service import AvailabilityService
from app.services.llm_service import LLMService
from app.services.meeting_service import MeetingService
from app.services.mock.mock_calendar import MockCalendarService
from app.services.mock.mock_email import MockEmailService
from app.services.mock.mock_forms import MockFormService
from app.services.mock.mock_notifications import MockNotificationService
from app.services.scheduling_service import SchedulingService
from app.services.slot_ranking_service import SlotRankingService
from app.services.user_service import UserService


# ── Repositories (stateless JSON wrappers — safe to cache) ───────────────────


@lru_cache(maxsize=None)
def get_user_repo() -> UserRepository:
    return UserRepository(settings.data_dir)


@lru_cache(maxsize=None)
def get_meeting_repo() -> MeetingRepository:
    return MeetingRepository(settings.data_dir)


@lru_cache(maxsize=None)
def get_cycle_repo() -> CycleRepository:
    return CycleRepository(settings.data_dir)


@lru_cache(maxsize=None)
def get_attendee_repo() -> AttendeeRepository:
    return AttendeeRepository(settings.data_dir)


@lru_cache(maxsize=None)
def get_slot_repo() -> SlotRepository:
    return SlotRepository(settings.data_dir)


@lru_cache(maxsize=None)
def get_agent_run_repo() -> AgentRunRepository:
    return AgentRunRepository(settings.data_dir)


@lru_cache(maxsize=None)
def get_vendor_repo() -> VendorRepository:
    return VendorRepository(settings.data_dir)


# ── Core services ─────────────────────────────────────────────────────────────


def get_user_service() -> UserService:
    return UserService(get_user_repo())


def get_availability_service() -> AvailabilityService:
    return AvailabilityService(
        user_repo=get_user_repo(),
    )


def get_slot_ranking_service() -> SlotRankingService:
    return SlotRankingService(get_availability_service())





def get_meeting_service() -> MeetingService:
    return MeetingService(
        meeting_repo=get_meeting_repo(),
        user_repo=get_user_repo(),
        availability_svc=get_availability_service(),
    )


def get_scheduling_service() -> SchedulingService:
    return SchedulingService(
        attendee_repo=get_attendee_repo(),
        slot_repo=get_slot_repo(),
        cycle_repo=get_cycle_repo(),
        meeting_repo=get_meeting_repo(),
        user_repo=get_user_repo(),
        availability_svc=get_availability_service(),
        slot_ranking_svc=get_slot_ranking_service(),
        meeting_svc=get_meeting_service(),
    )


# ── LLM service (disabled by default — flip enable_llm in .env) ──────────────


@lru_cache(maxsize=None)
def get_llm_service() -> LLMService:
    return LLMService()


# ── Mock external services (singletons — preserve in-process outbox/log) ─────


@lru_cache(maxsize=None)
def get_mock_calendar() -> MockCalendarService:
    return MockCalendarService()


@lru_cache(maxsize=None)
def get_mock_email() -> MockEmailService:
    return MockEmailService()


@lru_cache(maxsize=None)
def get_mock_forms() -> MockFormService:
    return MockFormService()


@lru_cache(maxsize=None)
def get_mock_notifications() -> MockNotificationService:
    return MockNotificationService()


# ── Agent providers ───────────────────────────────────────────────────────────


def get_scheduling_agent(cycle_id: str | None = None):
    """
    Returns a SchedulingAgent wired with all dependencies.
    Pass cycle_id when the agent is scoped to a specific governance cycle.
    """
    from app.agents.scheduling_agent import SchedulingAgent

    return SchedulingAgent(
        scheduling_svc=get_scheduling_service(),
        cycle_id=cycle_id,
        llm_svc=get_llm_service() if settings.enable_llm else None,
        agent_run_repo=get_agent_run_repo(),
    )


def _fetch_compiled_scorecard(cycle_id: str) -> dict:
    """
    Legacy 2-column compiled scorecard (Google Forms era). Kept for agents that
    still reference it; new flows should use _fetch_weighted_compiled.
    """
    from app.api.routes.scorecard import get_compiled_scorecard
    return get_compiled_scorecard(cycle_id)


def _fetch_weighted_compiled(cycle_id: str) -> dict:
    """
    Consolidated internal scorecard (new weighted format), adapted to the
    compiled shape the agents expect. Scorecards are collected from internal
    stakeholders only — there is no vendor self-report.
    """
    from app.api.routes.scorecard_v2 import weighted_as_compiled
    return weighted_as_compiled(cycle_id)


def get_vendor_prep_agent(cycle_id: str | None = None):
    """Returns a VendorPrepAgent wired with all dependencies."""
    from app.agents.vendor_prep_agent import VendorPrepAgent

    return VendorPrepAgent(
        scorecard_fetcher=_fetch_weighted_compiled,
        cycle_id=cycle_id,
        llm_svc=get_llm_service() if settings.enable_llm else None,
        agent_run_repo=get_agent_run_repo(),
    )


def get_meeting_agent(cycle_id: str | None = None):
    """Returns a MeetingAgent wired with all dependencies."""
    from app.agents.meeting_agent import MeetingAgent

    return MeetingAgent(
        meeting_repo=get_meeting_repo(),
        cycle_id=cycle_id,
        llm_svc=get_llm_service() if settings.enable_llm else None,
        agent_run_repo=get_agent_run_repo(),
    )


def get_scorecard_agent(cycle_id: str | None = None):
    """Returns a ScorecardAgent wired with all dependencies."""
    from app.agents.scorecard_agent import ScorecardAgent

    return ScorecardAgent(
        scorecard_fetcher=_fetch_compiled_scorecard,
        cycle_id=cycle_id,
        llm_svc=get_llm_service() if settings.enable_llm else None,
        agent_run_repo=get_agent_run_repo(),
    )


def get_alignment_agent(cycle_id: str | None = None):
    """Returns an AlignmentAgent wired with all dependencies."""
    from app.agents.alignment_agent import AlignmentAgent

    return AlignmentAgent(
        scorecard_fetcher=_fetch_compiled_scorecard,
        cycle_id=cycle_id,
        llm_svc=get_llm_service() if settings.enable_llm else None,
        agent_run_repo=get_agent_run_repo(),
    )


def get_memory_agent(cycle_id: str | None = None):
    """Returns a MemoryAgent wired with all dependencies."""
    from app.agents.memory_agent import MemoryAgent

    return MemoryAgent(
        cycle_repo=get_cycle_repo(),
        scorecard_fetcher=_fetch_compiled_scorecard,
        cycle_id=cycle_id,
        llm_svc=get_llm_service() if settings.enable_llm else None,
        agent_run_repo=get_agent_run_repo(),
    )
