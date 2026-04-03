"""
User management routes.

When USE_TEAMS_BACKEND=true all user/availability reads and writes are
proxied to the Teams backend (http://localhost:3001) — that is the single
source of truth for user data.

When USE_TEAMS_BACKEND=false (default) the local users.json is used.

GET  /api/users                         List all users
POST /api/users                         Create user
GET  /api/users/{userId}                Get user
PUT  /api/users/{userId}                Update user
GET  /api/users/{userId}/availability   Get availability
PUT  /api/users/{userId}/availability   Update availability for one date
GET  /api/users/{userId}/meetings       Get user's meetings
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.config import settings
from app.dependencies import get_meeting_repo, get_teams_client, get_user_service
from app.models.user import AvailabilityUpdate, UserCreate, UserUpdate
from app.services.user_service import UserService

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("")
def list_users(svc: UserService = Depends(get_user_service)):
    if settings.use_teams_backend:
        teams = get_teams_client()
        return {"users": teams.get_users()}
    return {"users": svc.list_users()}


@router.post("", status_code=201)
def create_user(payload: UserCreate, svc: UserService = Depends(get_user_service)):
    if settings.use_teams_backend:
        teams = get_teams_client()
        try:
            result = teams._post("/api/users", {
                "name": payload.name,
                "email": payload.email,
                "role": payload.role or "Member",
            })
            return {"user": result.get("user"), "message": "User created via Teams backend"}
        except Exception as exc:
            raise HTTPException(status_code=409, detail=str(exc))
    try:
        user = svc.create_user(payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return {"user": user, "message": "User created successfully"}


@router.get("/{userId}")
def get_user(userId: str, svc: UserService = Depends(get_user_service)):
    if settings.use_teams_backend:
        user = get_teams_client().get_user(userId)
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")
        return {"user": user}
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


@router.get("/{userId}/availability")
def get_availability(userId: str, svc: UserService = Depends(get_user_service)):
    if settings.use_teams_backend:
        teams = get_teams_client()
        user = teams.get_user(userId)
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")
        avail = teams.get_user_availability(userId)
        return {"userId": userId, "name": user.get("name"), "availability": avail}
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
    if settings.use_teams_backend:
        teams = get_teams_client()
        if teams.get_user(userId) is None:
            raise HTTPException(status_code=404, detail="User not found")
        result = teams.update_user_availability(userId, payload.date, payload.slots)
        return {"userId": userId, "availability": result.get("availability", [])}
    user = svc.get_user(userId)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    updated = svc.update_availability(userId, payload.date, payload.slots)
    return {"userId": userId, "availability": updated.get("availability", [])}


@router.get("/{userId}/meetings")
def get_user_meetings(
    userId: str,
    svc: UserService = Depends(get_user_service),
    meeting_repo=Depends(get_meeting_repo),
):
    if settings.use_teams_backend:
        teams = get_teams_client()
        if teams.get_user(userId) is None:
            raise HTTPException(status_code=404, detail="User not found")
        return {"meetings": teams.get_user_meetings(userId)}
    user = svc.get_user(userId)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    meetings = svc.get_user_meetings(userId, meeting_repo)
    return {"meetings": meetings}
