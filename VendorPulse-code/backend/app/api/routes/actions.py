"""
Shared action-queue routes.

A cycle's action items form ONE queue that is carried across every meeting in the
governance flow (Internal Alignment → Vendor Meeting → further Alignment → final QBR).
Items are created from meeting transcripts (bulk) or added manually, then edited,
re-owned, re-scheduled or closed by the VMO coordinator as they are resolved.

GET    /api/cycles/{cycleId}/actions            List the cycle's action queue
POST   /api/cycles/{cycleId}/actions            Add one action item
POST   /api/cycles/{cycleId}/actions/bulk       Add many (transcript extraction), de-duped
PATCH  /api/cycles/{cycleId}/actions/{actionId} Edit an action item (description/owner/due/status)
DELETE /api/cycles/{cycleId}/actions/{actionId} Delete an action item
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_action_repo, get_cycle_repo
from app.models.action_item import (
    ActionItem,
    ActionItemBulkCreate,
    ActionItemCreate,
    ActionItemUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cycles/{cycleId}/actions", tags=["actions"])

# Two action items count as "the same" for de-duplication when their content words
# overlap at least this much (Jaccard on non-stopword tokens). Deliberately strict so
# genuinely different tasks are never merged, but paraphrases of one task collapse into
# one queue entry across ALL meetings (alignment, vendor prep, second alignment, QBR).
_SIMILARITY_THRESHOLD = 0.7

# Filler words stripped before comparison so wording differences don't defeat de-dup.
_STOPWORDS = frozenset({
    "the", "a", "an", "to", "of", "and", "for", "on", "in", "by", "with", "is", "are",
    "be", "will", "shall", "that", "this", "we", "our", "their", "it", "as", "at", "from",
    "into", "should", "must", "need", "needs", "please", "ensure", "provide", "submit",
})


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return f"act-{uuid.uuid4().hex}"


def _normalize_text(text: str) -> str:
    """Lowercase, drop punctuation, collapse whitespace — a stable comparison key."""
    t = re.sub(r"[^a-z0-9\s]", " ", (text or "").lower())
    return re.sub(r"\s+", " ", t).strip()


def _token_set(text: str) -> set[str]:
    return {w for w in _normalize_text(text).split() if w and w not in _STOPWORDS}


def _is_duplicate(new_desc: str, existing_desc: str) -> bool:
    """True when two action descriptions describe the same task — exact after
    normalisation, or a close paraphrase by content-word overlap. Source/meeting is
    intentionally ignored so a vendor-prep item never re-adds an alignment item."""
    na, nb = _normalize_text(new_desc), _normalize_text(existing_desc)
    if not na or not nb:
        return False
    if na == nb:
        return True
    ta, tb = _token_set(new_desc), _token_set(existing_desc)
    if not ta or not tb:
        return False
    jaccard = len(ta & tb) / len(ta | tb)
    return jaccard >= _SIMILARITY_THRESHOLD


def _build_record(cycle_id: str, payload: ActionItemCreate, *, force_new_id: bool = False) -> dict:
    now = _now()
    action_id = _new_id() if force_new_id or not payload.action_id else payload.action_id
    return ActionItem(
        action_id=action_id,
        cycle_id=cycle_id,
        description=payload.description,
        details=payload.details or "",
        owner=payload.owner or "TBD",
        due_date=payload.due_date,
        source=payload.source,
        status=payload.status,
        origin=payload.origin,
        created_at=now,
        updated_at=now,
    ).model_dump()


def _require_cycle(cycleId: str) -> None:
    if not get_cycle_repo().get_by_cycle_id(cycleId):
        raise HTTPException(status_code=404, detail=f"Cycle '{cycleId}' not found")


@router.get("")
def list_actions(cycleId: str, action_repo=Depends(get_action_repo)):
    """The cycle's full action queue, in stable creation order."""
    items = action_repo.get_for_cycle(cycleId)
    return {"actions": items, "count": len(items)}


@router.post("")
def add_action(cycleId: str, payload: ActionItemCreate, action_repo=Depends(get_action_repo)):
    """Add a single action item (manual entry)."""
    _require_cycle(cycleId)
    if not payload.description.strip():
        raise HTTPException(status_code=400, detail="description is required")
    record = _build_record(cycleId, payload, force_new_id=True)
    action_repo.insert(record)
    logger.info("ACTIONS: added %s to cycle %s (source=%s)", record["action_id"], cycleId, record["source"])
    return {"action": record}


@router.post("/bulk")
def add_actions_bulk(cycleId: str, payload: ActionItemBulkCreate, action_repo=Depends(get_action_repo)):
    """Add several action items (e.g. extracted from a transcript), de-duplicated
    against the WHOLE cycle queue regardless of which meeting produced them.

    A new item is dropped when it repeats one already in the queue (exact or a close
    paraphrase) — so the items surfaced at vendor prep are genuinely new relative to
    internal alignment, with no repetition. When a dropped item carries a description
    the existing entry lacks, that detail is consolidated onto the existing entry.
    Ids are generated server-side, so a reused client/LLM id never collides."""
    _require_cycle(cycleId)
    # Live view of the queue; newly-inserted items are appended so later items in the
    # SAME batch also de-dup against them.
    existing: list[dict] = list(action_repo.get_for_cycle(cycleId))
    added: list[dict] = []
    consolidated = 0
    for item in payload.actions:
        desc = (item.description or "").strip()
        if not desc:
            continue
        match = next((e for e in existing if _is_duplicate(desc, e.get("description", ""))), None)
        if match:
            # Consolidate: enrich the kept entry's empty details from the duplicate.
            new_details = (item.details or "").strip()
            if new_details and not (match.get("details") or "").strip():
                action_repo.update_by_id("action_id", match["action_id"],
                                         {"details": new_details, "updated_at": _now()})
                match["details"] = new_details
                consolidated += 1
            continue
        record = _build_record(cycleId, item, force_new_id=True)
        action_repo.insert(record)
        existing.append(record)
        added.append(record)
    logger.info(
        "ACTIONS: bulk %d submitted -> %d added, %d duplicate(s) skipped, %d consolidated (cycle %s)",
        len(payload.actions), len(added), len(payload.actions) - len(added), consolidated, cycleId,
    )
    return {"added": added, "count": len(added), "consolidated": consolidated}


@router.patch("/{actionId}")
def update_action(
    cycleId: str,
    actionId: str,
    payload: ActionItemUpdate,
    action_repo=Depends(get_action_repo),
):
    """Edit an action item — description, owner, due date, source or status."""
    existing = action_repo.get_by_action_id(actionId)
    if not existing or existing.get("cycle_id") != cycleId:
        raise HTTPException(status_code=404, detail="Action item not found")

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    # Allow explicitly clearing the due date (null passes exclude_unset but is dropped above).
    if "due_date" in payload.model_fields_set:
        updates["due_date"] = payload.due_date
    if not updates:
        return {"action": existing}
    updates["updated_at"] = _now()
    updated = action_repo.update_by_id("action_id", actionId, updates)
    logger.info("ACTIONS: updated %s (%s)", actionId, ", ".join(updates.keys()))
    return {"action": updated}


@router.delete("/{actionId}")
def delete_action(cycleId: str, actionId: str, action_repo=Depends(get_action_repo)):
    """Delete an action item the coordinator no longer wants in the queue."""
    existing = action_repo.get_by_action_id(actionId)
    if not existing or existing.get("cycle_id") != cycleId:
        raise HTTPException(status_code=404, detail="Action item not found")
    action_repo.delete_by_id("action_id", actionId)
    logger.info("ACTIONS: deleted %s from cycle %s", actionId, cycleId)
    return {"deleted": True, "action_id": actionId}
