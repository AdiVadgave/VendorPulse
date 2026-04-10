import requests
import datetime

BASE = "http://localhost:8010"

# 1) Create cycle
cycle_payload = {
    "vendor_id": "v_samsung",
    "vendor_name": "Samsung",
    "quarter": "Q2",
    "year": 2026,
}
r = requests.post(f"{BASE}/api/cycles", json=cycle_payload, timeout=20)
print("create_cycle_status", r.status_code)
print(r.text)
r.raise_for_status()
cycle_id = r.json()["cycle"]["cycle_id"]
print("cycle_id", cycle_id)

# 2) Add attendees
attendees = [
    {
        "stakeholder_id": "s_anup",
        "name": "Anup Kesarwani",
        "email": "anup.kesarwani@zensar.com",
        "role": "VMO_COORDINATOR",
        "organisation": "Zensar",
        "is_key": True,
    },
    {
        "stakeholder_id": "s_kanishk",
        "name": "Kanishk Punekar",
        "email": "kanishk.punekar@zensar.com",
        "role": "INTERNAL_LEAD",
        "organisation": "Zensar",
        "is_key": True,
    },
    {
        "stakeholder_id": "s_aditya",
        "name": "Aditya Vadgave",
        "email": "aditya.vadgave@zensar.com",
        "role": "TECHNICAL_LEAD",
        "organisation": "Zensar",
        "is_key": False,
    },
]
r = requests.post(f"{BASE}/api/cycles/{cycle_id}/attendees", json=attendees, timeout=20)
print("add_attendees_status", r.status_code)
print(r.text)
r.raise_for_status()

# 3) Advance workflow
r = requests.post(
    f"{BASE}/api/cycles/{cycle_id}/scheduling/simulate-responses",
    json={"cycle_id": cycle_id},
    timeout=20,
)
print("simulate_status", r.status_code)
print(r.text)
r.raise_for_status()

# 4) Find real slots
start = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
end = (datetime.date.today() + datetime.timedelta(days=14)).isoformat()
find_payload = {
    "organiser_email": "anup.kesarwani@zensar.com",
    "date_range_start": start,
    "date_range_end": end,
    "duration_hours": 0.5,
    "use_specific_attendees": [
        "anup.kesarwani@zensar.com",
        "kanishk.punekar@zensar.com",
        "aditya.vadgave@zensar.com",
    ],
    "time_zone": "UTC",
}
r = requests.post(
    f"{BASE}/api/cycles/{cycle_id}/scheduling/graph/find-times",
    json=find_payload,
    timeout=40,
)
print("find_times_status", r.status_code)
print(r.text)
r.raise_for_status()
slots = r.json().get("slot_proposals", [])
if not slots:
    raise SystemExit("No slots returned from Graph")
slot_id = slots[0]["slot_id"]
print("selected_slot", slot_id, "at", slots[0].get("proposed_time"))

# 5) Approve slot
r = requests.put(
    f"{BASE}/api/cycles/{cycle_id}/scheduling/slots/{slot_id}/approve",
    json={"approved_by": "s_anup"},
    timeout=20,
)
print("approve_status", r.status_code)
print(r.text)
r.raise_for_status()

# 6) Send invite
send_payload = {
    "slot_id": slot_id,
    "organiser_email": "anup.kesarwani@zensar.com",
}
r = requests.post(
    f"{BASE}/api/cycles/{cycle_id}/scheduling/graph/send-invite",
    json=send_payload,
    timeout=40,
)
print("send_invite_status", r.status_code)
print(r.text)
r.raise_for_status()
print("DONE")
