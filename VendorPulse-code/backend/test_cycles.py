#!/usr/bin/env python
import sys
sys.path.insert(0, '.')
from app.config import settings
from app.repositories.cycle_repository import CycleRepository
from app.repositories.attendee_repository import AttendeeRepository

cycle_repo = CycleRepository(settings.data_dir)
attendee_repo = AttendeeRepository(settings.data_dir)

cycles = cycle_repo.find_all()
print(f"Total cycles: {len(cycles)}\n")

for c in cycles[:5]:  # Show first 5
    cycle_id = c['cycle_id']
    print(f"Cycle ID: {cycle_id}")
    print(f"  Vendor: {c.get('vendor_name', 'N/A')}")
    print(f"  Status: {c.get('workflow_state', 'N/A')}")
    
    attendees = attendee_repo.get_for_cycle(cycle_id)
    print(f"  Attendees: {len(attendees)}")
    for a in attendees:
        print(f"    - {a.get('name')} ({a.get('email')})")
    print()
