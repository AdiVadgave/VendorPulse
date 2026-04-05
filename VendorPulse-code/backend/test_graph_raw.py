#!/usr/bin/env python
import sys
sys.path.insert(0, '.')
from app.config import settings
from app.services.graph_service import GraphService
import asyncio
import json

async def test_graph():
    if not settings.graph_access_token:
        print("ERROR: GRAPH_ACCESS_TOKEN not set")
        return
    
    service = GraphService(settings.graph_access_token)
    
    result = await service.find_meeting_times(
        attendee_emails=[
            "gaurav.shukla1@zensar.com",
            "rituraj.patil@zensar.com",
            "aditya.vadgave@zensar.com"
        ],
        date_range_start="2025-04-07",
        date_range_end="2025-04-21",
        duration_hours=0.5,
        time_zone="IST"
    )
    
    print("Graph API Response:")
    print(json.dumps(result, indent=2))
    
    if "error" in result:
        print(f"\nError: {result['error']}")
        if "detail" in result:
            print(f"Details: {result['detail']}")
    else:
        suggestions = result.get("meetingTimeSuggestions", [])
        print(f"\nFound {len(suggestions)} suggestions")
        for i, sugg in enumerate(suggestions):
            print(f"\nSuggestion {i+1}:")
            print(json.dumps(sugg, indent=2))

asyncio.run(test_graph())
