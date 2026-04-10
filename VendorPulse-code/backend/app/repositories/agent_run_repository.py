from __future__ import annotations

from pathlib import Path
from typing import Optional

from app.repositories.base_repository import BaseRepository


class AgentRunRepository(BaseRepository):
    """
    Persists agent_runs records for full traceability.

    Every agent invocation (success, failure, partial) is logged here.
    The frontend can query this table to show an execution trace log.
    """

    def __init__(self, data_dir: Path) -> None:
        super().__init__("agent_runs.json", data_dir)

    def get_by_run_id(self, run_id: str) -> Optional[dict]:
        return self.find_by_id("run_id", run_id)

    def get_for_cycle(self, cycle_id: str) -> list[dict]:
        return self.find_by_field("cycle_id", cycle_id)

    def get_by_agent(self, agent_name: str) -> list[dict]:
        return self.find_by_field("agent_name", agent_name)

    def get_failed_runs(self) -> list[dict]:
        return self.find_by_field("status", "FAILED")

    def get_recent(self, limit: int = 50) -> list[dict]:
        all_runs = self._read()
        # Sort newest first (created_at desc)
        all_runs.sort(key=lambda r: r.get("created_at", ""), reverse=True)
        return all_runs[:limit]
