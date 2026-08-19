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
    # The app stores every entity in a normalized 3NF Postgres schema — one real
    # table per entity with typed columns, domain PKs and FK constraints; JSONB
    # is used only for genuinely nested/variable data (see app/db/schema.py). A
    # full DSN in DATABASE_URL takes precedence; otherwise it is assembled from
    # the PG_* parts below. Azure Database for PostgreSQL requires SSL.
    #   DATABASE_URL=postgresql://<user>:<password>@<host>:5432/vendorpulse?sslmode=require
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

    # Mail — all outbound mail (scorecard links & meeting minutes) sends via
    # Microsoft Graph using the service mailbox. Gmail has been removed.
    # Kept for compatibility; Graph is the only channel. See docs/MAIL_OUTLOOK_MIGRATION.md.
    mail_provider: str = "graph"
    # Service-account mailbox (UPN) to send AS (app-only Mail.Send).
    graph_mail_sender: str = ""

    # ── Microsoft Graph app-only auth (certificate client-credentials) ───────
    # Used by mail_provider="graph" to obtain an app token via MSAL, signing with
    # the SPN certificate's private key (the .pfx). Falls back to the static
    # graph_access_token only if graph_cert_path is empty.
    graph_client_id: str = ""
    graph_tenant_id: str = ""
    graph_cert_path: str = ""          # path to the .pfx / .p12 (private key)
    graph_cert_password: str = ""      # PFX password (empty if none)
    graph_cert_thumbprint: str = ""    # SHA-1 thumbprint (optional; derived from the cert if blank)

    # ── SSO (Entra ID user sign-in — delegated) ──────────────────────────────
    # Separate identity from Graph Mail.Send: this authenticates the *user* who
    # logs in (SPA + OIDC), whereas graph_* authenticates the *app* that sends
    # mail. While sso_enabled is False, get_current_user() returns a dev principal
    # and no route is gated, so the app runs unchanged.
    # PRODUCTION: SSO_ENABLED must be true so every API call requires a valid
    # Entra ID token. With SSO off the API is open (dev principal) — intended for
    # local development/testing only.
    sso_enabled: bool = False
    sso_client_id: str = ""            # Application (client) ID of the SPA registration
    sso_tenant_id: str = ""            # Directory (tenant) ID (Shell: db1e96a8-...)
    # Extra accepted audiences (comma-separated) beyond sso_client_id.
    sso_extra_audiences: str = ""

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
