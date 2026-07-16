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


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return f"act-{uuid.uuid4().hex[:8]}"


def _content_sig(source: str, description: str, origin) -> tuple:
    """Identity of an action by CONTENT, not by client id — so re-parsing the same
    transcript never doubles the queue, while genuinely different items from different
    meetings are always added (client-supplied ids are not globally unique)."""
    return (source or "", (description or "").strip().lower(), (origin or "").strip().lower())


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
    """Add several action items (e.g. extracted from a transcript).

    Identity is by CONTENT (source + description + origin), and ids are generated
    server-side — so re-parsing the same transcript never doubles the queue, and two
    different meetings never collide just because a client/LLM reused an id."""
    _require_cycle(cycleId)
    seen = {
        _content_sig(a.get("source"), a.get("description"), a.get("origin"))
        for a in action_repo.get_for_cycle(cycleId)
    }
    added: list[dict] = []
    for item in payload.actions:
        if not (item.description or "").strip():
            continue
        sig = _content_sig(item.source, item.description, item.origin)
        if sig in seen:
            continue
        record = _build_record(cycleId, item, force_new_id=True)
        action_repo.insert(record)
        seen.add(sig)
        added.append(record)
    logger.info("ACTIONS: bulk-added %d of %d item(s) to cycle %s", len(added), len(payload.actions), cycleId)
    return {"added": added, "count": len(added)}


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
