"""
Vendor pushback persistence routes.

Vendor objections raised during prep are stored per-cycle, along with the AI-drafted
response options (factual / neutral / escalation) and which one the coordinator
selected — so the state survives a page refresh.

GET    /api/cycles/{cycleId}/pushback                                 List items (+ responses)
POST   /api/cycles/{cycleId}/pushback                                 Add an item
PATCH  /api/cycles/{cycleId}/pushback/{pushbackId}                    Edit (status/fields)
DELETE /api/cycles/{cycleId}/pushback/{pushbackId}                    Delete item (+ responses)
PUT    /api/cycles/{cycleId}/pushback/{pushbackId}/responses          Replace drafted responses
POST   /api/cycles/{cycleId}/pushback/{pushbackId}/responses/{rid}/select  Select one response
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_cycle_repo, get_pushback_repo, get_pushback_response_repo
from app.models.pushback import PushbackCreate, PushbackResponsesReplace, PushbackUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cycles/{cycleId}/pushback", tags=["pushback"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _require_cycle(cycleId: str) -> None:
    if not get_cycle_repo().get_by_cycle_id(cycleId):
        raise HTTPException(status_code=404, detail=f"Cycle '{cycleId}' not found")


def _response_dto(r: dict) -> dict:
    return {
        "response_id": r.get("response_id"),
        "pushback_id": r.get("pushback_id"),
        "stance": r.get("stance"),
        "content": r.get("content"),
        "is_selected": bool(r.get("is_selected")),
    }


def _item_dto(item: dict, response_repo) -> dict:
    responses = [_response_dto(r) for r in response_repo.get_for_pushback(item["pushback_id"])]
    return {**item, "responses": responses}


@router.get("")
def list_pushback(cycleId: str, repo=Depends(get_pushback_repo), response_repo=Depends(get_pushback_response_repo)):
    """All pushback items for the cycle, each with its drafted responses."""
    items = [_item_dto(p, response_repo) for p in repo.get_for_cycle(cycleId)]
    return {"items": items, "count": len(items)}


@router.post("")
def add_pushback(cycleId: str, payload: PushbackCreate, repo=Depends(get_pushback_repo)):
    """Add a vendor pushback / objection item."""
    _require_cycle(cycleId)
    if not payload.description.strip():
        raise HTTPException(status_code=400, detail="description is required")
    now = _now()
    record = {
        "pushback_id": f"pb_{uuid.uuid4().hex}",
        "cycle_id": cycleId,
        "category": payload.category,
        "description": payload.description.strip(),
        "raised_by": payload.raised_by.strip(),
        "needs_legal_review": payload.needs_legal_review,
        "status": payload.status,
        "created_at": now,
        "updated_at": now,
    }
    repo.insert(record)
    logger.info("PUSHBACK: added %s to cycle %s", record["pushback_id"], cycleId)
    return {"item": {**record, "responses": []}}


@router.patch("/{pushbackId}")
def update_pushback(cycleId: str, pushbackId: str, payload: PushbackUpdate, repo=Depends(get_pushback_repo)):
    """Edit a pushback item (typically its status)."""
    existing = repo.get_by_pushback_id(pushbackId)
    if not existing or existing.get("cycle_id") != cycleId:
        raise HTTPException(status_code=404, detail="Pushback item not found")
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        return {"item": existing}
    updates["updated_at"] = _now()
    updated = repo.update_by_id("pushback_id", pushbackId, updates)
    return {"item": updated}


@router.delete("/{pushbackId}")
def delete_pushback(
    cycleId: str,
    pushbackId: str,
    repo=Depends(get_pushback_repo),
    response_repo=Depends(get_pushback_response_repo),
):
    """Delete a pushback item and its drafted responses (cascade)."""
    existing = repo.get_by_pushback_id(pushbackId)
    if not existing or existing.get("cycle_id") != cycleId:
        raise HTTPException(status_code=404, detail="Pushback item not found")
    repo.delete_by_id("pushback_id", pushbackId)
    response_repo.delete_for_pushback(pushbackId)
    return {"deleted": True, "pushback_id": pushbackId}


@router.put("/{pushbackId}/responses")
def replace_responses(
    cycleId: str,
    pushbackId: str,
    payload: PushbackResponsesReplace,
    repo=Depends(get_pushback_repo),
    response_repo=Depends(get_pushback_response_repo),
):
    """Persist the AI-drafted response set for a pushback item (replaces any prior set)."""
    existing = repo.get_by_pushback_id(pushbackId)
    if not existing or existing.get("cycle_id") != cycleId:
        raise HTTPException(status_code=404, detail="Pushback item not found")
    response_repo.delete_for_pushback(pushbackId)
    saved = []
    for r in payload.responses:
        row = {
            "response_id": f"pr_{uuid.uuid4().hex}",
            "pushback_id": pushbackId,
            "stance": r.stance,
            "content": r.content,
            "is_selected": bool(r.is_selected),
        }
        response_repo.insert(row)
        saved.append(_response_dto(row))
    logger.info("PUSHBACK: saved %d response(s) for %s", len(saved), pushbackId)
    return {"pushback_id": pushbackId, "responses": saved}


@router.post("/{pushbackId}/responses/{responseId}/select")
def select_response(
    cycleId: str,
    pushbackId: str,
    responseId: str,
    repo=Depends(get_pushback_repo),
    response_repo=Depends(get_pushback_response_repo),
):
    """Mark one drafted response as selected; unselects the others for that item."""
    existing = repo.get_by_pushback_id(pushbackId)
    if not existing or existing.get("cycle_id") != cycleId:
        raise HTTPException(status_code=404, detail="Pushback item not found")
    rows = response_repo.get_for_pushback(pushbackId)
    if not any(r.get("response_id") == responseId for r in rows):
        raise HTTPException(status_code=404, detail="Response not found")
    for r in rows:
        response_repo.update_by_id("response_id", r["response_id"],
                                   {"is_selected": r.get("response_id") == responseId})
    return {"pushback_id": pushbackId, "selected_response_id": responseId}
