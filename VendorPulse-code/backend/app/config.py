from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # Data storage — JSON files (swap path to SQLite DB later)
    data_dir: Path = Path(__file__).parent.parent / "data"

    # Teams-backend integration (optional — set USE_TEAMS_BACKEND=true to proxy)
    use_teams_backend: bool = False
    teams_backend_url: str = "http://localhost:3001"

    # Scheduling algorithm constants
    scheduling_business_start_hour: int = 9   # 09:00
    scheduling_business_end_hour: int = 17    # 17:00
    scheduling_slot_interval_hours: float = 1.0
    scheduling_conflict_penalty: float = 10.0
    scheduling_tz_bonus: float = 5.0
    scheduling_key_attendance_bonus: float = 10.0
    scheduling_top_n_slots: int = 3

    # AI / LLM (stub for future use — not enabled in v1)
    enable_llm: bool = False
    anthropic_api_key: str = ""
    llm_model: str = "claude-opus-4-6"


settings = Settings()
