from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parent.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # Data storage — JSON files (swap path to SQLite DB later)
    data_dir: Path = Path(__file__).parent.parent / "data"

    # ── Scheduling: legacy / deterministic algorithm ─────────────────────────
    scheduling_business_start_hour: int = 9   # 09:00 local time
    scheduling_business_end_hour: int = 17    # 17:00 local time
    scheduling_slot_interval_hours: float = 1.0
    scheduling_conflict_penalty: float = 10.0
    scheduling_tz_bonus: float = 5.0
    scheduling_key_attendance_bonus: float = 10.0
    scheduling_top_n_slots: int = 3

    # ── Scheduling: Graph API — slot discovery constraints ────────────────────
    # Maximum number of slot candidates Graph may return.
    scheduling_max_graph_candidates: int = 12
    # False = organiser MUST be free (Graph enforces this server-side).
    scheduling_is_organizer_optional: bool = False
    # True = discard any slot where at least one attendee has a hard conflict.
    scheduling_require_all_attendees: bool = True
    # Graph timeConstraint activityDomain ("work" | "personal" | "unrestricted").
    scheduling_activity_domain: str = "work"

    # ── Scheduling: role-based constraints ───────────────────────────────────
    # Stakeholder role that identifies the executive sponsor (hard constraint).
    scheduling_exec_sponsor_role: str = "EGB_CHAIR"

    # ── Scheduling: confidence → base score mapping ──────────────────────────
    # Graph returns confidenceLevel as a string ("high"/"medium"/"low") or
    # a numeric value (0–100 or 0–1).  Values at or above the high threshold
    # receive the high score; values at or above the medium threshold receive
    # the medium score; everything else gets the low/fallback score.
    scheduling_confidence_high_threshold: float = 90.0
    scheduling_confidence_medium_threshold: float = 70.0
    scheduling_confidence_high_score: float = 100.0
    scheduling_confidence_medium_score: float = 80.0
    scheduling_confidence_low_score: float = 60.0   # also used when confidence is absent

    # ── Scheduling: score adjustments ────────────────────────────────────────
    # Points deducted from the base score for each tentative attendee.
    scheduling_tentative_penalty: float = 15.0
    # Final score is clamped to [score_min, score_max].
    scheduling_score_min: float = 0.0
    scheduling_score_max: float = 100.0

    # ── Scheduling: LLM token budgets ────────────────────────────────────────
    # Maximum tokens for each scheduling-specific LLM prompt.
    scheduling_llm_rationale_max_tokens: int = 60    # per-slot ranking rationale sentence
    scheduling_llm_nudge_max_tokens: int = 120       # per-person conflict nudge message
    scheduling_llm_invite_max_tokens: int = 300      # full invite email body draft

    # AI / LLM — set ENABLE_LLM=true and fill in provider credentials in .env
    enable_llm: bool = False
    ai_provider: str = "azure"          # "azure" or "openai"

    # Azure OpenAI
    azure_openai_api_key: str = ""
    azure_openai_endpoint: str = ""
    azure_openai_deployment_name: str = ""
    azure_openai_api_version: str = "2024-12-01-preview"

    # Standard OpenAI (fallback)
    openai_api_key: str = ""
    llm_model: str = "gpt-4o"

    # Microsoft Graph API
    graph_access_token: str = ""
    graph_meeting_duration_minutes: int = 30   # configurable: 30, 60, 90, etc.

    # Google OAuth2 (Gmail + Forms)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_project_id: str = ""
    google_redirect_uri: str = "http://localhost:8000/auth/callback"
    google_form_id: str = ""
    google_form_url: str = "https://forms.gle/zeMdJ8uvFkryFDTr6"

   

    # Scorecard polling
    scorecard_poll_interval_seconds: int = 90


settings = Settings()
