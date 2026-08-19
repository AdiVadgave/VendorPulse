"""
User management routes.

GET    /api/users                       List all users
POST   /api/users                       Create user
GET    /api/users/{userId}              Get user
PUT    /api/users/{userId}              Update user
DELETE /api/users/{userId}              Delete user (directory only)
GET  /api/users/{userId}/availability   Get availability
PUT  /api/users/{userId}/availability   Update availability for one date
GET  /api/users/{userId}/meetings       Get user's meetings
"""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from app.config import settings
from app.dependencies import get_meeting_participant_repo, get_meeting_repo, get_user_service
from app.models.user import AvailabilityUpdate, UserCreate, UserUpdate
from app.services.user_service import UserService

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("")
def list_users(search: Optional[str] = None, svc: UserService = Depends(get_user_service)):
    users = svc.list_users(search)
    # Return as an array of SystemUsers for the frontend search
    return [
        {
            "user_id": u["user_id"],
            "name": u["name"],
            "email": u["email"],
            "organisation": u.get("organisation", ""),
            "role": u.get("role", ""),
            "avatar": u.get("avatar", ""),
        }
        for u in users
    ]


@router.post("", status_code=201)
def create_user(payload: UserCreate, svc: UserService = Depends(get_user_service)):
    try:
        user = svc.create_user(payload)
    except ValueError:
        raise HTTPException(status_code=409, detail="Unable to create user")
    return {"user": user, "message": "User created successfully"}


@router.get("/{userId}")
def get_user(userId: str, svc: UserService = Depends(get_user_service)):
    user = svc.get_user(userId)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user": user}


@router.put("/{userId}")
def update_user(
    userId: str, payload: UserUpdate, svc: UserService = Depends(get_user_service)
):
    user = svc.update_user(userId, payload)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user": user}


@router.delete("/{userId}")
def delete_user(userId: str, svc: UserService = Depends(get_user_service)):
    """Remove a person from the directory. Does not touch any cycle they were
    already added to as an attendee (those are separate records)."""
    if svc.get_user(userId) is None:
        raise HTTPException(status_code=404, detail="User not found")
    svc.delete_user(userId)
    return {"deleted": True, "user_id": userId}


@router.get("/{userId}/availability")
def get_availability(userId: str, svc: UserService = Depends(get_user_service)):
    result = svc.get_availability(userId)
    if result is None:
        raise HTTPException(status_code=404, detail="User not found")
    return result


@router.put("/{userId}/availability")
def update_availability(
    userId: str,
    payload: AvailabilityUpdate,
    svc: UserService = Depends(get_user_service),
):
    user = svc.get_user(userId)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    availability = svc.update_availability(userId, payload.date, payload.slots)
    return {"user_id": userId, "availability": availability}


@router.get("/{userId}/meetings")
def get_user_meetings(
    userId: str,
    svc: UserService = Depends(get_user_service),
    meeting_repo=Depends(get_meeting_repo),
    participant_repo=Depends(get_meeting_participant_repo),
):
    user = svc.get_user(userId)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    meetings = svc.get_user_meetings(userId, meeting_repo, participant_repo)
    return {"meetings": meetings}
