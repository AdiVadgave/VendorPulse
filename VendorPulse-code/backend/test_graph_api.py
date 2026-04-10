#!/usr/bin/env python
import sys
import requests
import json
sys.path.insert(0, '.')

cycle_id = "c_08de2127"
url = f"http://localhost:8000/api/cycles/{cycle_id}/scheduling/graph/find-times"

payload = {
    "organiser_email": "chinmay.kotkar@zensar.com",
    "date_range_start": "2025-04-07",
    "date_range_end": "2025-04-21",
    "duration_hours": 0.5,
    "use_specific_attendees": [
        "gaurav.shukla1@zensar.com",
        "rituraj.patil@zensar.com",
        "aditya.vadgave@zensar.com"
    ],
    "time_zone": "IST"
}

print(f"Testing Graph find-times endpoint")
print(f"URL: {url}")
print(f"Payload: {json.dumps(payload, indent=2)}\n")

try:
    response = requests.post(url, json=payload)
    print(f"Status Code: {response.status_code}")
    print(f"Response:\n{json.dumps(response.json(), indent=2)}")
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
