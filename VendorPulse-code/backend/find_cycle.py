#!/usr/bin/env python
import sys
sys.path.insert(0, '.')
from app.config import settings
from app.repositories.cycle_repository import CycleRepository
from app.repositories.attendee_repository import AttendeeRepository

cycle_repo = CycleRepository(settings.data_dir)
attendee_repo = AttendeeRepository(settings.data_dir)

# Find c_08de2127
cycles = cycle_repo.find_all()
target = next((c for c in cycles if c['cycle_id'] == 'c_08de2127'), None)

if target:
    cycle_id = target['cycle_id']
    print(f"Found Cycle: {cycle_id}")
    print(f"  Vendor: {target.get('vendor_name', 'N/A')}")
    print(f"  Status: {target.get('workflow_state', 'N/A')}")
    
    attendees = attendee_repo.get_for_cycle(cycle_id)
    print(f"  Attendees: {len(attendees)}")
    for a in attendees:
        print(f"    - {a.get('name')} ({a.get('email')})")
else:
    print("Cycle c_08de2127 not found")
    print("\nAvailable cycles with attendees:")
    for c in cycles:
        attendees = attendee_repo.get_for_cycle(c['cycle_id'])
        if len(attendees) > 0:
            print(f"  {c['cycle_id']}: {len(attendees)} attendees")
