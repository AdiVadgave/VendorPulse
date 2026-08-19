"""
Legacy Google-Forms scorecard response store (read-only).

Scorecard collection moved in-app (see `scorecard_v2`), so the live Google-Forms
polling machinery has been removed. What remains is a read-only accessor over any
previously-stored responses (`data/scorecard_responses.json`), used solely by the
legacy compiled-scorecard view. If the file is absent (the normal case now), reads
return an empty list.
"""
from __future__ import annotations

import json
import logging

from app.config import settings

logger = logging.getLogger(__name__)

RESPONSES_PATH = settings.data_dir / "scorecard_responses.json"


def _load_stored_responses() -> list[dict]:
    if RESPONSES_PATH.exists():
        return json.loads(RESPONSES_PATH.read_text(encoding="utf-8"))
    return []


def get_responses_for_cycle(cycle_id: str) -> list[dict]:
    """Return all stored responses that match a given cycle_id (empty if none)."""
    stored = _load_stored_responses()
    return [r for r in stored if r.get("cycle_id") == cycle_id]
