"""
Demo attendee mappings for testing Graph integration.

Maps email → display name for 10 attendees in the Zensar tenant.
For live demo, these will be looked up from Graph /users endpoint.
"""

DEMO_ATTENDEES = {
    "richa.sankpal@zensar.com": "Richa Sankpal",
    "anup.kesarwani@zensar.com": "Anup Kesarwani",
    "aditya.vadgave@zensar.com": "Aditya Vadgave",
    "kanishk.punekar@zensar.com": "Kanishk Punekar",
    "rituraj.patil@zensar.com": "Rituraj Patil",
    "hrushikesh.sardesai@zensar.com": "Hrushikesh Sardesai",
    "gaurav.shukla1@zensar.com": "Gaurav Shukla",
    "hemant.yadav@zensar.com": "Hemant Yadav",
    "k.keskar@zensar.com": "K. Keskar",
}

# Testing subset (from user's request)
DEMO_ATTENDEES_FOR_TESTING = [
    "gaurav.shukla1@zensar.com",
    "rituraj.patil@zensar.com",
    "aditya.vadgave@zensar.com",
]


def get_attendee_name(email: str) -> str:
    """Look up display name for an email, or return email if not found."""
    return DEMO_ATTENDEES.get(email.lower(), email)
