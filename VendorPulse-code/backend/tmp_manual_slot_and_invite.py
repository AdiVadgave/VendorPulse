import json
import uuid
import requests
from datetime import datetime, timedelta, timezone
from pathlib import Path

BASE = "http://localhost:8010"
CYCLE_ID = "c_db221556"

# Create a manual fallback slot for tomorrow at 10:00 UTC
start_dt = (datetime.now(timezone.utc) + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
slot_id = f"slot_{uuid.uuid4().hex[:8]}"
slot = {
    "slot_id": slot_id,
    "cycle_id": CYCLE_ID,
    "proposed_time": start_dt.isoformat(),
    "organiser_available": True,
    "exec_sponsor_available": True,
    "rank_score": 75.0,
    "is_approved": False,
    "attendance_count": 3,
    "total_attendees": 3,
    "conflict_count": 0,
    "attending": [
        "anup.kesarwani@zensar.com",
        "kanishk.punekar@zensar.com",
        "aditya.vadgave@zensar.com",
    ],
    "conflicts": [],
}

slot_file = Path(r"C:\Projects\QBR\VendorPulse\VendorPulse-code\backend\data\slot_proposals.json")
if slot_file.exists():
    data = json.loads(slot_file.read_text(encoding="utf-8"))
else:
    data = []

data.append(slot)
slot_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
print("manual_slot_created", slot_id, slot["proposed_time"])

# Approve slot via backend API
r = requests.put(
    f"{BASE}/api/cycles/{CYCLE_ID}/scheduling/slots/{slot_id}/approve",
    json={"approved_by": "s_anup"},
    timeout=20,
)
print("approve_status", r.status_code)
print(r.text)
r.raise_for_status()

# Send invite via Graph endpoint
r = requests.post(
    f"{BASE}/api/cycles/{CYCLE_ID}/scheduling/graph/send-invite",
    json={"slot_id": slot_id, "organiser_email": "anup.kesarwani@zensar.com"},
    timeout=60,
)
print("send_invite_status", r.status_code)
print(r.text)
r.raise_for_status()
print("DONE")
