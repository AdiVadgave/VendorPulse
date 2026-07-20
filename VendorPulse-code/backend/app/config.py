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

    # ── Database (PostgreSQL) ────────────────────────────────────────────────
    # The app stores every entity in Postgres (one JSONB table per entity). A
    # full DSN in DATABASE_URL takes precedence; otherwise it is assembled from
    # the PG_* parts below. Azure Database for PostgreSQL requires SSL.
    #   DATABASE_URL=postgresql://user:pass@host:5432/vendorpulse?sslmode=require
    database_url: str = ""
    pg_host: str = ""
    pg_port: int = 5432
    pg_database: str = "vendorpulse"
    pg_user: str = ""
    pg_password: str = ""
    pg_sslmode: str = "require"        # Azure requires "require"; use "disable" for a local box
    pg_pool_min: int = 1
    pg_pool_max: int = 10

    # Legacy JSON data directory — no longer the live store; still read by the
    # one-time migration script (scripts/migrate_json_to_postgres.py) to seed
    # Postgres from the historical *.json files.
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
    ai_provider: str = "azure"          # "azure" | "openai" | "foundry"

    # Azure OpenAI
    azure_openai_api_key: str = ""
    azure_openai_endpoint: str = ""
    azure_openai_deployment_name: str = ""
    azure_openai_api_version: str = "2024-12-01-preview"

    # Standard OpenAI (fallback)
    openai_api_key: str = ""
    llm_model: str = "gpt-4o"

    # ── Microsoft Foundry (ai.azure.com) — Shape-2 PoC ───────────────────────
    # Set AI_PROVIDER=foundry to route the agent layer through a Foundry project
    # via the Responses API, authenticated with Entra ID (DefaultAzureCredential,
    # falling back to an interactive browser login on dev boxes without the CLI).
    # Endpoint format: https://<resource>.services.ai.azure.com/api/projects/<project>
    foundry_project_endpoint: str = ""
    foundry_model: str = ""             # deployed model/deployment name (e.g. gpt-4o)
    azure_tenant_id: str = ""           # optional — pin the Entra tenant for login
    # When the Foundry client is active, drive the agent loop with the Responses
    # API (Foundry's single entry point) instead of Chat Completions.
    use_responses_api: bool = True

    # Microsoft Graph API
    graph_access_token: str = ""
    graph_meeting_duration_minutes: int = 30   # configurable: 30, 60, 90, etc.

    # CORS — comma-separated list of allowed browser origins. Never use "*" with
    # credentials. Override in production with the deployed frontend origin(s).
    cors_origins: str = "http://localhost:5173,http://localhost:5174"

    # Mail provider — which channel sends scorecard links & meeting minutes (MOM).
    # "gmail" (current) or "graph"/"outlook" (Microsoft Graph Mail.Send via a
    # service account). Flip to "graph" once the tenant grants Mail.Send.
    # See docs/MAIL_OUTLOOK_MIGRATION.md.
    mail_provider: str = "gmail"
    # Service-account mailbox (UPN) to send AS when mail_provider="graph" (app-only).
    # Empty falls back to the token owner (/me) in dev.
    graph_mail_sender: str = ""

    # Google OAuth2 (Gmail + Forms)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_project_id: str = ""
    google_redirect_uri: str = "http://localhost:8000/auth/callback"
    google_form_id: str = ""
    google_form_url: str = "https://forms.gle/zeMdJ8uvFkryFDTr6"

    # Google Forms prefill entry IDs (e.g. "entry.123456789").
    # When set, the dispatch email links go to a prefilled form so reviewers
    # don't have to re-type these fields. Get the IDs from the form's
    # "Get pre-filled link" feature. Empty = no prefill (reviewer types it).
    google_form_prefill_cycle_id_entry: str = ""
    google_form_prefill_email_entry: str = ""
    google_form_prefill_vendor_entry: str = ""

    # Scorecard polling
    scorecard_poll_interval_seconds: int = 90

    @property
    def effective_database_url(self) -> str:
        """The Postgres DSN to connect with. Prefers DATABASE_URL; otherwise
        assembles one from the PG_* parts. Returns "" if nothing is configured."""
        if self.database_url:
            return self.database_url
        if not self.pg_host:
            return ""
        from urllib.parse import quote_plus

        auth = ""
        if self.pg_user:
            auth = quote_plus(self.pg_user)
            if self.pg_password:
                auth += f":{quote_plus(self.pg_password)}"
            auth += "@"
        return (
            f"postgresql://{auth}{self.pg_host}:{self.pg_port}/{self.pg_database}"
            f"?sslmode={self.pg_sslmode}"
        )


settings = Settings()
