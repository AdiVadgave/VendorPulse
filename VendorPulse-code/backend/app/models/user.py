from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class AvailabilitySlot(BaseModel):
    """One day's worth of available time windows for a user."""

    date: str = Field(..., description="YYYY-MM-DD")
    slots: list[str] = Field(
        ...,
        description="Available windows in HH:MM-HH:MM format",
        examples=[["09:00-10:00", "14:00-15:00"]],
    )


class UserCreate(BaseModel):
    name: str = Field(..., examples=["Alex Johnson"])
    email: str = Field(..., examples=["alex@zensar.com"])
    role: str = Field(default="Member", examples=["VMO_COORDINATOR"])
    organisation: Optional[str] = Field(default=None, examples=["Shell VMO"])
    gmail: Optional[str] = Field(default=None, examples=["alex@gmail.com"])


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    organisation: Optional[str] = None
    gmail: Optional[str] = None


class AvailabilityUpdate(BaseModel):
    date: str = Field(..., description="YYYY-MM-DD", examples=["2026-04-07"])
    slots: list[str] = Field(
        ...,
        description="Replace the availability for this date with these slots",
        examples=[["09:00-10:00", "11:00-12:00"]],
    )


class User(BaseModel):
    """Full user record as stored in users.json. Availability lives in its own
    store (user_availability), not embedded here."""

    user_id: str
    name: str
    email: str
    role: str
    avatar: str
    created_at: str
