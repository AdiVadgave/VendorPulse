import unittest

from app.utils.scorecard_recipients import is_scorecard_recipient


class ScorecardRecipientTests(unittest.TestCase):
    def test_declined_attendee_is_not_a_scorecard_recipient(self):
        attendee = {
            "is_key": True,
            "type": "Internal Stakeholder",
            "confirmation_status": "DECLINED",
        }

        self.assertFalse(is_scorecard_recipient(attendee))

    def test_confirmed_key_internal_attendee_is_a_scorecard_recipient(self):
        attendee = {
            "is_key": True,
            "type": "Internal Stakeholder",
            "confirmation_status": "CONFIRMED",
        }

        self.assertTrue(is_scorecard_recipient(attendee))

    def test_non_key_or_vendor_attendee_is_not_a_scorecard_recipient(self):
        self.assertFalse(is_scorecard_recipient({"is_key": False, "type": "Internal Stakeholder"}))
        self.assertFalse(is_scorecard_recipient({"is_key": True, "type": "Vendor"}))