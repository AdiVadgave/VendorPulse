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

    # Scheduling algorithm constants
    scheduling_business_start_hour: int = 9   # 09:00
    scheduling_business_end_hour: int = 17    # 17:00
    scheduling_slot_interval_hours: float = 1.0
    scheduling_conflict_penalty: float = 10.0
    scheduling_tz_bonus: float = 5.0
    scheduling_key_attendance_bonus: float = 10.0
    scheduling_top_n_slots: int = 3

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
