from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Literal, Optional

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


data_dir = Path(__file__).parent / "data"


def _read_json(filename: str):
    path = data_dir / filename
    if not path.exists():
        # Keep behavior predictable; return empty list as these are list-backed stores.
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(filename: str, data) -> None:
    path = data_dir / filename
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


# ----------------------
# Booked-slots helpers
# ----------------------

def _add_booked_slot(user_id: str, date: str, slot: str, users: list) -> None:
    """Add a booked slot entry for user_id on date. Mutates the users list in place."""
    idx = next((i for i, u in enumerate(users) if u.get("userId") == user_id), None)
    if idx is None:
        return
    booked: list = list(users[idx].setdefault("booked_slots", []))
    day_idx = next((i for i, b in enumerate(booked) if b.get("date") == date), None)
    if day_idx is not None:
        slots: list = list(booked[day_idx].get("slots", []))
        if slot not in slots:
            slots.append(slot)
        booked[day_idx] = {"date": date, "slots": slots}
    else:
        booked.append({"date": date, "slots": [slot]})
    users[idx]["booked_slots"] = booked


def _remove_booked_slot(user_id: str, date: str, slot: str, users: list) -> None:
    """Remove a booked slot entry for user_id on date. Mutates the users list in place."""
    idx = next((i for i, u in enumerate(users) if u.get("userId") == user_id), None)
    if idx is None:
        return
    booked: list = list(users[idx].get("booked_slots", []))
    day_idx = next((i for i, b in enumerate(booked) if b.get("date") == date), None)
    if day_idx is not None:
        remaining = [s for s in booked[day_idx].get("slots", []) if s != slot]
        if remaining:
            booked[day_idx] = {"date": date, "slots": remaining}
        else:
            booked.pop(day_idx)
    users[idx]["booked_slots"] = booked


# ----------------------
# Pydantic models (Swagger examples)
# ----------------------


class UserCreate(BaseModel):
    name: str = Field(..., examples=["Asha Kapoor"])
    email: str = Field(..., examples=["asha.kapoor@zensar.com"])
    role: Optional[str] = Field(default="Member", examples=["VMO_COORDINATOR"])


class AvailabilityUpdate(BaseModel):
    date: str = Field(..., description="YYYY-MM-DD", examples=["2026-04-03"])
    slots: list[str] = Field(
        ..., description="List of available slots (HH:MM-HH:MM)", examples=[["09:00-09:30", "10:00-10:30"]]
    )


class MeetingTimeSlot(BaseModel):
    date: str = Field(..., description="YYYY-MM-DD", examples=["2026-04-03"])
    startTime: str = Field(..., description="HH:MM", examples=["10:00"])
    endTime: str = Field(..., description="HH:MM", examples=["10:30"])


class MeetingCreate(BaseModel):
    title: str = Field(..., examples=["VendorPulse - Internal Alignment"])
    description: Optional[str] = Field(default="", examples=["Discuss SLA breaches and next steps"])
    agenda: Optional[str] = Field(default="", examples=["1) Scorecard review\n2) Risks\n3) Actions"])
    organizerId: str = Field(..., examples=["u12345678"])
    participantIds: list[str] = Field(..., examples=[["u23456789", "u34567890"]])
    timeSlot: MeetingTimeSlot


class MeetingRespond(BaseModel):
    userId: str = Field(..., examples=["u23456789"])
    status: Literal["accepted", "declined"] = Field(..., examples=["accepted"])


class CancelMeeting(BaseModel):
    organizerId: str = Field(..., examples=["u12345678"])


class NudgeCreate(BaseModel):
    userId: str = Field(..., examples=["u23456789"])
    message: str = Field(..., examples=["Please respond to the meeting invite."])


# ----------------------
# FastAPI app
# ----------------------

app = FastAPI(
    title="Mock Teams Backend (FastAPI)",
    version="1.0.0",
    description="FastAPI port of the Express mock backend used by the Teams frontend. Includes Swagger examples.",
)

# Allow Teams frontend to call without changes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "mock-teams-backend-fastapi",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "endpoints": {
            "users": "GET|POST /api/users",
            "userById": "GET /api/users/{userId}",
            "availability": "GET|PUT /api/users/{userId}/availability",
            "userMeetings": "GET /api/users/{userId}/meetings",
            "meetings": "GET|POST /api/meetings",
            "meetingById": "GET /api/meetings/{meetingId}",
            "respond": "PUT /api/meetings/{meetingId}/respond",
            "cancel": "DELETE /api/meetings/{meetingId}",
        },
    }


# ----------------------
# Users
# ----------------------


@app.get("/api/users")
def list_users():
    users = _read_json("users.json")
    return {"users": users}


@app.get("/api/users/{userId}")
def get_user(userId: str):
    users = _read_json("users.json")
    user = next((u for u in users if u.get("userId") == userId), None)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user": user}


@app.post("/api/users", status_code=201)
def create_user(payload: UserCreate):
    users = _read_json("users.json")

    if any(u.get("email", "").lower() == payload.email.lower() for u in users):
        raise HTTPException(status_code=409, detail="A user with this email already exists")

    initials = "".join([part[0] for part in payload.name.split() if part]).upper()[:2]
    # Keep the same ID format as the Node version (u + 8 hex-like chars)
    import uuid

    new_user = {
        "userId": f"u{uuid.uuid4().hex[:8]}",
        "name": payload.name,
        "email": payload.email,
        "role": payload.role or "Member",
        "avatar": initials,
        "availability": [],
        "createdAt": datetime.utcnow().isoformat() + "Z",
    }

    users.append(new_user)
    _write_json("users.json", users)

    return {"user": new_user, "message": "User created successfully"}


@app.get("/api/users/{userId}/availability")
def get_user_availability(userId: str):
    users = _read_json("users.json")
    user = next((u for u in users if u.get("userId") == userId), None)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "userId": user.get("userId"),
        "name": user.get("name"),
        "availability": user.get("availability", []),
    }


@app.put("/api/users/{userId}/availability")
def update_user_availability(userId: str, payload: AvailabilityUpdate):
    users = _read_json("users.json")
    idx = next((i for i, u in enumerate(users) if u.get("userId") == userId), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="User not found")

    availability = users[idx].setdefault("availability", [])
    existing_idx = next((i for i, a in enumerate(availability) if a.get("date") == payload.date), None)

    if existing_idx is not None:
        availability[existing_idx]["slots"] = payload.slots
    else:
        availability.append({"date": payload.date, "slots": payload.slots})

    _write_json("users.json", users)
    return {"userId": users[idx].get("userId"), "availability": availability}


@app.get("/api/users/{userId}/meetings")
def get_user_meetings(userId: str):
    meetings = _read_json("meetings.json")
    user_meetings = [
        m
        for m in meetings
        if m.get("organizerId") == userId
        or any(p.get("userId") == userId for p in m.get("participants", []))
    ]
    return {"meetings": user_meetings}


# ----------------------
# Meetings
# ----------------------


@app.get("/api/meetings")
def list_meetings():
    meetings = _read_json("meetings.json")
    return {"meetings": meetings}


@app.get("/api/meetings/{meetingId}")
def get_meeting(meetingId: str):
    meetings = _read_json("meetings.json")
    meeting = next((m for m in meetings if m.get("meetingId") == meetingId), None)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {"meeting": meeting}


@app.post("/api/meetings", status_code=201)
def create_meeting(payload: MeetingCreate):
    # validate organizer + participants exist
    users = _read_json("users.json")
    if not any(u.get("userId") == payload.organizerId for u in users):
        raise HTTPException(status_code=404, detail="Organizer not found")

    invalid_participants = [pid for pid in payload.participantIds if not any(u.get("userId") == pid for u in users)]
    if invalid_participants:
        raise HTTPException(status_code=404, detail=f"Participants not found: {', '.join(invalid_participants)}")

    import uuid

    new_meeting = {
        "meetingId": f"m{uuid.uuid4().hex[:8]}",
        "title": payload.title,
        "description": payload.description or "",
        "agenda": payload.agenda or "",
        "organizerId": payload.organizerId,
        "participants": [{"userId": uid, "status": "pending"} for uid in payload.participantIds],
        "timeSlot": payload.timeSlot.model_dump(),
        "status": "scheduled",
        "createdAt": datetime.utcnow().isoformat() + "Z",
    }

    meetings = _read_json("meetings.json")
    meetings.append(new_meeting)
    _write_json("meetings.json", meetings)

    # Book the slot for the organizer in booked_slots (organizer is committed on creation)
    slot_str = f"{payload.timeSlot.startTime}-{payload.timeSlot.endTime}"
    _add_booked_slot(payload.organizerId, payload.timeSlot.date, slot_str, users)
    _write_json("users.json", users)

    return {"meeting": new_meeting, "message": "Meeting invite sent successfully"}


@app.put("/api/meetings/{meetingId}/respond")
def respond_to_meeting(meetingId: str, payload: MeetingRespond):
    from datetime import timezone as _tz
    meetings = _read_json("meetings.json")
    idx = next((i for i, m in enumerate(meetings) if m.get("meetingId") == meetingId), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Meeting not found")

    participants = meetings[idx].get("participants", [])
    pidx = next((i for i, p in enumerate(participants) if p.get("userId") == payload.userId), None)
    if pidx is None:
        raise HTTPException(status_code=403, detail="User is not a participant in this meeting")

    prev_status = participants[pidx].get("status", "pending")
    participants[pidx]["status"] = payload.status
    participants[pidx]["respondedAt"] = datetime.now(_tz.utc).isoformat()

    _write_json("meetings.json", meetings)

    # Sync booked_slots: add when accepted, remove when declined
    ts = meetings[idx].get("timeSlot", {})
    slot_date = ts.get("date", "")
    slot_str = f"{ts.get('startTime', '')}-{ts.get('endTime', '')}"

    if slot_date and slot_str != "-":
        users = _read_json("users.json")
        if payload.status == "accepted" and prev_status != "accepted":
            _add_booked_slot(payload.userId, slot_date, slot_str, users)
        elif payload.status == "declined" and prev_status == "accepted":
            _remove_booked_slot(payload.userId, slot_date, slot_str, users)
        _write_json("users.json", users)

    return {"meeting": meetings[idx], "message": f"Meeting {payload.status} successfully"}


@app.delete("/api/meetings/{meetingId}")
def cancel_meeting(
    meetingId: str,
    payload: CancelMeeting = Body(
        ...,
        examples=[{"organizerId": "u12345678"}],
    ),
):
    meetings = _read_json("meetings.json")
    idx = next((i for i, m in enumerate(meetings) if m.get("meetingId") == meetingId), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if meetings[idx].get("organizerId") != payload.organizerId:
        raise HTTPException(status_code=403, detail="Only the organizer can cancel this meeting")

    meetings[idx]["status"] = "cancelled"
    _write_json("meetings.json", meetings)

    # Remove booked slots for organizer and all accepted participants
    ts = meetings[idx].get("timeSlot", {})
    slot_date = ts.get("date", "")
    slot_str = f"{ts.get('startTime', '')}-{ts.get('endTime', '')}"

    if slot_date and slot_str != "-":
        users = _read_json("users.json")
        _remove_booked_slot(meetings[idx].get("organizerId", ""), slot_date, slot_str, users)
        for p in meetings[idx].get("participants", []):
            if p.get("status") in ("accepted", "pending"):
                _remove_booked_slot(p.get("userId", ""), slot_date, slot_str, users)
        _write_json("users.json", users)

    return {"message": "Meeting cancelled successfully", "meeting": meetings[idx]}


# ----------------------
# Nudges (reminders)
# ----------------------


@app.post("/api/meetings/{meetingId}/nudge", status_code=201)
def send_nudge(meetingId: str, payload: NudgeCreate):
    meetings = _read_json("meetings.json")
    idx = next((i for i, m in enumerate(meetings) if m.get("meetingId") == meetingId), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Meeting not found")

    nudge = {
        "userId": payload.userId,
        "message": payload.message or "Please respond to your meeting invitation.",
        "sentAt": datetime.utcnow().isoformat() + "Z",
    }
    meetings[idx].setdefault("nudges", []).append(nudge)
    _write_json("meetings.json", meetings)
    return {"message": "Nudge sent successfully", "meeting": meetings[idx]}


@app.get("/api/meetings/{meetingId}/nudges")
def get_nudges(meetingId: str):
    meetings = _read_json("meetings.json")
    meeting = next((m for m in meetings if m.get("meetingId") == meetingId), None)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {"nudges": meeting.get("nudges", [])}
