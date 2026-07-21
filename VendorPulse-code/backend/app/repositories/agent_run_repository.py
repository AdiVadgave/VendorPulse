from __future__ import annotations

from typing import Optional

from app.repositories.base_repository import BaseRepository


class AgentRunRepository(BaseRepository):
    """Persists agent_runs records for full traceability. Every agent invocation
    (success, failure, partial) is logged here for an execution-trace view."""

    table = "agent_runs"
    pk = "run_id"
    columns = (
        "run_id", "agent_name", "cycle_id", "input_payload", "output_payload",
        "status", "triggered_by", "error_message", "created_at",
        "approval_status", "approved_by", "approved_at",
    )
    json_columns = frozenset({"input_payload", "output_payload"})

    def get_by_run_id(self, run_id: str) -> Optional[dict]:
        return self.find_by_id("run_id", run_id)

    def get_for_cycle(self, cycle_id: str) -> list[dict]:
        return self.find_by_field("cycle_id", cycle_id)

    def get_by_agent(self, agent_name: str) -> list[dict]:
        return self.find_by_field("agent_name", agent_name)

    def get_failed_runs(self) -> list[dict]:
        return self.find_by_field("status", "FAILED")

    def get_recent(self, limit: int = 50) -> list[dict]:
        all_runs = self.find_all()
        all_runs.sort(key=lambda r: r.get("created_at") or "", reverse=True)
        return all_runs[:limit]
