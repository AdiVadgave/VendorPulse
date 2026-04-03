# VendorPulse Backend (FastAPI)

FastAPI backend for VendorPulse. Provides APIs for:

- **Users**: create/update users, availability, and user meetings
- **Meetings**: meeting CRUD + invite responses
- **Scheduling (Module A)**: governance cycles, cycle attendees, slot ranking, slot approval, sending invites, RSVP tracking
- **Agent runs**: trace log of scheduling/agent actions

## Requirements

- Windows (PowerShell)
- Python 3.11+ (recommended)

## Setup

1) Open PowerShell at `VendorPulse-code\backend`.

2) Create and activate a virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

3) Install dependencies:

```powershell
pip install -r requirements.txt
```

## Run the backend

From `VendorPulse-code\backend`:

```powershell
python run.py
```

- API base URL: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/api/health`

To run without auto-reload:

```powershell
python run.py --no-reload
```

## Configuration

Configuration is defined in `app/config.py` and can be overridden via a `.env` file in `VendorPulse-code\backend`.

Common settings:

- `HOST` (default `0.0.0.0`)
- `PORT` (default `8000`)
- `USE_TEAMS_BACKEND` (default `false`) — when enabled, some calls may proxy to the mock Teams backend
- `TEAMS_BACKEND_URL` (default `http://localhost:3001`)

## Data storage

This backend currently uses JSON files under `data/` as its data store (demo-friendly). If you need a clean reset, you can replace these JSON files with the originals from version control.

## Key endpoints (quick reference)

- `GET /api/health`

Users:
- `GET /api/users`
- `POST /api/users`
- `GET /api/users/{userId}`
- `PUT /api/users/{userId}`
- `GET /api/users/{userId}/availability`
- `PUT /api/users/{userId}/availability`
- `GET /api/users/{userId}/meetings`

Meetings:
- `GET /api/meetings`
- `POST /api/meetings`
- `GET /api/meetings/{meetingId}`
- `PUT /api/meetings/{meetingId}`
- `DELETE /api/meetings/{meetingId}`
- `PUT /api/meetings/{meetingId}/respond`

Scheduling (cycles):
- `GET /api/cycles`
- `POST /api/cycles`
- `GET /api/cycles/{cycleId}`
- `GET /api/cycles/{cycleId}/attendees`
- `POST /api/cycles/{cycleId}/attendees`
- `PUT /api/cycles/{cycleId}/attendees/{attendeeId}`
- `DELETE /api/cycles/{cycleId}/attendees/{attendeeId}`

Scheduling (Module A flow):
- `POST /api/cycles/{cycleId}/scheduling/simulate-responses`
- `POST /api/cycles/{cycleId}/scheduling/rank-slots`
- `GET /api/cycles/{cycleId}/scheduling/slots`
- `PUT /api/cycles/{cycleId}/scheduling/slots/{slotId}/approve`
- `POST /api/cycles/{cycleId}/scheduling/send-invites`
- `GET /api/cycles/{cycleId}/scheduling/rsvp`
- `PUT /api/cycles/{cycleId}/scheduling/rsvp/{attendeeId}`

Agent runs:
- `GET /api/agent-runs`
- `GET /api/agent-runs/{runId}`

## Optional: run the mock Teams backend

If you want to run the mock Teams backend (separate folder) so the VendorPulse backend can proxy to it when `USE_TEAMS_BACKEND=true`:

1) In a second terminal, open `VendorPulse-code\teams-backend`.

2) Create + activate venv and install:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

3) Run it:

```powershell
python app.py
```

Then create a `.env` in `VendorPulse-code\backend` with:

```text
USE_TEAMS_BACKEND=true
TEAMS_BACKEND_URL=http://localhost:3001
```
