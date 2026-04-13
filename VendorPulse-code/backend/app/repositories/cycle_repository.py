from __future__ import annotations

from pathlib import Path
from typing import Optional

from app.repositories.base_repository import BaseRepository


class CycleRepository(BaseRepository):
    def __init__(self, data_dir: Path) -> None:
        super().__init__("cycles.json", data_dir)

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
        """Persist the Graph-returned Teams meeting metadata on the cycle.

        Lets the frontend rehydrate the "Start Meeting" link after a page refresh.
        """
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
