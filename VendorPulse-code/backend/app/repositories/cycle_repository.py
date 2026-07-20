"""
Cycles.

`vendor_name` is NOT stored (it would duplicate vendors.name); the cycle keeps
only `vendor_id` and the repository reconstructs `vendor_name` on read by
joining `vendors`, so callers still see it on the dict.
"""
from __future__ import annotations

from typing import Optional

from app.repositories.base_repository import BaseRepository
from app.repositories.vendor_repository import VendorRepository


class CycleRepository(BaseRepository):
    table = "cycles"
    pk = "cycle_id"
    columns = (
        "cycle_id", "vendor_id", "cycle_type", "quarter", "year", "description",
        "workflow_state", "created_at", "updated_at", "meeting_plan", "scorecard_config",
        "teams_meeting_url", "teams_meeting_web_link", "teams_meeting_event_id",
        "teams_meeting_scheduled_at", "scorecard_dispatched_at", "scorecard_dispatched_to",
    )
    json_columns = frozenset({"meeting_plan", "scorecard_config", "scorecard_dispatched_to"})

    def __init__(self, vendor_repo: VendorRepository, data_dir=None) -> None:
        super().__init__(data_dir)
        self._vendor_repo = vendor_repo

    def _enrich(self, rows: list[dict]) -> list[dict]:
        if not rows:
            return rows
        vendors = {v["vendor_id"]: v for v in self._vendor_repo.find_all()}
        return [
            {**c, "vendor_name": (vendors.get(c.get("vendor_id")) or {}).get("name")}
            for c in rows
        ]

    def find_all(self) -> list[dict]:
        return self._enrich(super().find_all())

    def find_by_id(self, id_field: str, id_value) -> Optional[dict]:
        row = super().find_by_id(id_field, id_value)
        return self._enrich([row])[0] if row else None

    def find_by_field(self, field: str, value) -> list[dict]:
        return self._enrich(super().find_by_field(field, value))

    # ── convenience API (unchanged signatures) ───────────────────────────────
    def get_by_cycle_id(self, cycle_id: str) -> Optional[dict]:
        return self.find_by_id("cycle_id", cycle_id)

    def get_by_vendor(self, vendor_id: str) -> list[dict]:
        return self.find_by_field("vendor_id", vendor_id)

    def advance_workflow_state(self, cycle_id: str, new_state: str, updated_at: str) -> Optional[dict]:
        return self.update_by_id(
            "cycle_id", cycle_id, {"workflow_state": new_state, "updated_at": updated_at}
        )

    def mark_scorecard_dispatched(
        self, cycle_id: str, dispatched_at: str, emails: list[str]
    ) -> Optional[dict]:
        return self.update_by_id(
            "cycle_id",
            cycle_id,
            {"scorecard_dispatched_at": dispatched_at, "scorecard_dispatched_to": emails},
        )

    def mark_teams_meeting_scheduled(
        self,
        cycle_id: str,
        *,
        teams_meeting_url: Optional[str],
        web_link: Optional[str],
        event_id: Optional[str],
        scheduled_at: str,
    ) -> Optional[dict]:
        """Persist the Graph-returned Teams meeting metadata on the cycle."""
        return self.update_by_id(
            "cycle_id",
            cycle_id,
            {
                "teams_meeting_url": teams_meeting_url,
                "teams_meeting_web_link": web_link,
                "teams_meeting_event_id": event_id,
                "teams_meeting_scheduled_at": scheduled_at,
            },
        )
