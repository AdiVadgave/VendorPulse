"""
Scheduling service — orchestrates the full Module A workflow.

This is the layer that combines attendee management, availability checking,
slot ranking, and invite dispatch into the step-by-step flow described in
the VendorPulse README (Section 10, Module A).

Design principles:
  • All business logic lives here — routes only validate HTTP input.
  • Returns AgentResponse envelopes so the frontend always gets the same shape.
  • AI hook: every method has a clear spot where an LLM tool-call could be
    inserted (marked with # AI_HOOK) without changing the method signature.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from app.models.common import AgentResponse
from app.models.scheduling import (
    CycleAttendeeCreate,
    CycleAttendeeUpdate,
    RankSlotsRequest,
)
from app.core.workflow_engine import workflow_engine
from app.repositories.attendee_repository import AttendeeRepository
from app.repositories.cycle_repository import CycleRepository
from app.repositories.meeting_repository import MeetingRepository
from app.repositories.slot_repository import SlotRepository
from app.repositories.user_repository import UserRepository
from app.services.availability_service import AvailabilityService
from app.services.meeting_service import MeetingService
from app.services.slot_ranking_service import SlotRankingService


class SchedulingService:
    AGENT_NAME = "scheduling_agent"

    def __init__(
        self,
        attendee_repo: AttendeeRepository,
        slot_repo: SlotRepository,
        cycle_repo: CycleRepository,
        meeting_repo: MeetingRepository,
        user_repo: UserRepository,
        availability_svc: AvailabilityService,
        slot_ranking_svc: SlotRankingService,
        meeting_svc: MeetingService,
    ) -> None:
        self._attendees = attendee_repo
        self._slots = slot_repo
        self._cycles = cycle_repo
        self._meetings = meeting_repo
        self._users = user_repo
        self._avail = availability_svc
        self._ranker = slot_ranking_svc
        self._meeting_svc = meeting_svc

    # ──────────────────────────────────────────────────────────────────
    # Step 1 — Attendee management
    # ──────────────────────────────────────────────────────────────────

    def get_attendees(self, cycle_id: str) -> list[dict]:
        return self._attendees.get_for_cycle(cycle_id)

    def add_attendees(self, cycle_id: str, attendees: list[CycleAttendeeCreate]) -> AgentResponse:
        """
        Load / refresh the attendee list for a cycle.

        # AI_HOOK: LLM could verify that all required roles are covered and
        suggest additional stakeholders based on past cycle records.
        """
        inserted: list[dict] = []
        for a in attendees:
            record = {
                "attendee_id": f"att_{uuid.uuid4().hex[:8]}",
                "cycle_id": cycle_id,
                "stakeholder_id": a.stakeholder_id,
                "name": a.name,
                "email": a.email,
                "role": a.role,
                "organisation": a.organisation,
                "is_key": a.is_key,
                "invite_status": "PENDING",
                "availability_submitted": False,
                "user_id": a.user_id,
            }
            self._attendees.insert(record)
            inserted.append(record)

        warnings: list[str] = []
        key_count = sum(1 for a in inserted if a["is_key"])
        if key_count < 2:
            warnings.append("Fewer than 2 key attendees — slot ranking hard constraints may not work correctly")

        # Advance CYCLE_CREATED → ATTENDEE_REFRESH_SENT (idempotent: skip if already past)
        now = datetime.now(timezone.utc).isoformat()
        cycle = self._cycles.get_by_cycle_id(cycle_id)
        if cycle and workflow_engine.can_transition(cycle.get("workflow_state", ""), "ATTENDEE_REFRESH_SENT"):
            workflow_engine.advance(cycle, self._cycles, now)

        return AgentResponse(
            status="success",
            agent=self.AGENT_NAME,
            summary=f"{len(inserted)} attendees added to cycle {cycle_id}.",
            data={"attendees": inserted},
            warnings=warnings,
            next_actions=["SIMULATE_RESPONSES", "RANK_SLOTS"],
        )

    def update_attendee(
        self, attendee_id: str, payload: CycleAttendeeUpdate
    ) -> Optional[dict]:
        updates = payload.model_dump(exclude_none=True)
        return self._attendees.update_by_id("attendee_id", attendee_id, updates)

    def remove_attendee(self, attendee_id: str) -> bool:
        return self._attendees.delete_by_id("attendee_id", attendee_id)

    # ──────────────────────────────────────────────────────────────────
    # Step 2 — Simulate attendee refresh responses (demo helper)
    # ──────────────────────────────────────────────────────────────────

    def simulate_responses(self, cycle_id: str) -> AgentResponse:
        """
        Mark all pending attendees as having submitted their availability.
        Used during demos — in production this would track real form responses.

        # AI_HOOK: LLM could analyse response patterns and flag unusual absences.
        """
        attendees = self._attendees.get_for_cycle(cycle_id)
        updated_count = 0

        for att in attendees:
            if not att.get("availability_submitted"):
                self._attendees.mark_availability_submitted(att["attendee_id"])
                updated_count += 1

        # Advance ATTENDEE_REFRESH_SENT → AVAILABILITY_COLLECTED (idempotent: skip if already past)
        now = datetime.now(timezone.utc).isoformat()
        cycle = self._cycles.get_by_cycle_id(cycle_id)
        if cycle and workflow_engine.can_transition(cycle.get("workflow_state", ""), "AVAILABILITY_COLLECTED"):
            workflow_engine.advance(cycle, self._cycles, now)

        return AgentResponse(
            status="success",
            agent=self.AGENT_NAME,
            summary=f"Availability responses simulated for {updated_count} attendee(s).",
            data={"updated_count": updated_count, "cycle_id": cycle_id},
            next_actions=["RANK_SLOTS"],
        )

    # ──────────────────────────────────────────────────────────────────
    # Step 3 — Slot ranking
    # ──────────────────────────────────────────────────────────────────

    def rank_slots(self, request: RankSlotsRequest) -> AgentResponse:
        """
        Run the deterministic slot-ranking algorithm and persist proposals.

        # AI_HOOK: After ranking, an LLM could draft a short plain-English
        explanation of why the top slot was chosen (e.g.
        "Wednesday 10:00 works best because all key stakeholders are free
        and only David Kim has a conflict").
        """
        proposals = self._ranker.rank_slots(
            cycle_id=request.cycle_id,
            attendee_user_ids=request.attendee_user_ids,
            attendee_names=request.attendee_names,
            attendee_key_flags=request.attendee_key_flags,
            organiser_id=request.organiser_id,
            exec_sponsor_id=request.exec_sponsor_id,
            date_range_start=request.date_range_start,
            date_range_end=request.date_range_end,
            duration_hours=request.duration_hours,
        )

        if not proposals:
            return AgentResponse(
                status="failed",
                agent=self.AGENT_NAME,
                summary="No valid slots found for the given date range and attendees.",
                warnings=["Check that the organiser and exec sponsor have availability in the date range"],
                next_actions=["UPDATE_AVAILABILITY"],
            )

        # Persist — clear old proposals first
        self._slots.clear_for_cycle(request.cycle_id)
        for p in proposals:
            self._slots.insert(p)

        return AgentResponse(
            status="pending_approval",
            agent=self.AGENT_NAME,
            summary=f"{len(proposals)} ranked slot(s) generated. Review and approve one.",
            data={"proposals": proposals},
            next_actions=["APPROVE_SLOT"],
            requires_approval=True,
        )

    def get_slot_proposals(self, cycle_id: str) -> list[dict]:
        return self._slots.get_for_cycle(cycle_id)

    # ──────────────────────────────────────────────────────────────────
    # Step 4 — Approve a slot
    # ──────────────────────────────────────────────────────────────────

    def approve_slot(self, cycle_id: str, slot_id: str, approved_by: str) -> AgentResponse:
        """
        Mark a slot as approved and create a draft calendar invite.

        # AI_HOOK: LLM could draft a personalised invite email body referencing
        the scorecard cycle, vendor name, and attendee roles.
        """
        slot = self._slots.get_by_slot_id(slot_id)
        if not slot:
            return AgentResponse(
                status="failed",
                agent=self.AGENT_NAME,
                summary=f"Slot '{slot_id}' not found.",
            )
        if slot.get("cycle_id") != cycle_id:
            return AgentResponse(
                status="failed",
                agent=self.AGENT_NAME,
                summary=f"Slot '{slot_id}' does not belong to cycle '{cycle_id}'.",
            )

        approved_at = datetime.now(timezone.utc).isoformat()
        updated_slot = self._slots.approve(slot_id, approved_by, approved_at)

        # Build draft invite details
        proposed_dt = slot.get("proposed_time", "")
        invite_draft = {
            "slot_id": slot_id,
            "proposed_time": proposed_dt,
            "attending": slot.get("attending", []),
            "conflicts": slot.get("conflicts", []),
            "draft_subject": f"VendorPulse Governance Meeting — {proposed_dt[:10]}",
            "draft_body": (
                f"You are invited to a governance meeting scheduled for "
                f"{proposed_dt[:10]} at {proposed_dt[11:16]}.\n\n"
                f"Attendees: {', '.join(slot.get('attending', []))}.\n\n"
                f"Please confirm your attendance."
            ),
        }

        warnings: list[str] = []
        if slot.get("conflicts"):
            warnings.append(
                f"{len(slot['conflicts'])} attendee(s) have a conflict: "
                + ", ".join(slot["conflicts"])
            )

        return AgentResponse(
            status="pending_approval",
            agent=self.AGENT_NAME,
            summary=f"Slot approved. Calendar invite draft ready for review.",
            data={"slot": updated_slot, "invite_draft": invite_draft},
            warnings=warnings,
            next_actions=["SEND_INVITE"],
            requires_approval=True,
        )

    # ──────────────────────────────────────────────────────────────────
    # Step 5 — Send invites (mock)
    # ──────────────────────────────────────────────────────────────────

    def send_invites(self, cycle_id: str, slot_id: str, organiser_id: str) -> AgentResponse:
        """
        Create a real meeting record from the approved slot and mark all
        attendees as PENDING.

        In production this would call MockCalendarService + MockEmailService.

        # AI_HOOK: LLM could generate personalised nudge messages for attendees
        who have a calendar conflict.
        """
        slot = self._slots.get_by_slot_id(slot_id)
        if not slot:
            return AgentResponse(
                status="failed",
                agent=self.AGENT_NAME,
                summary=f"Slot '{slot_id}' not found.",
            )
        if not slot.get("is_approved"):
            return AgentResponse(
                status="failed",
                agent=self.AGENT_NAME,
                summary="Slot must be approved before invites can be sent.",
                next_actions=["APPROVE_SLOT"],
            )

        # Collect attendee userIds from the cycle
        attendees = self._attendees.get_for_cycle(cycle_id)
        participant_ids: list[str] = []
        for att in attendees:
            uid = att.get("user_id")
            if uid and uid != organiser_id:
                participant_ids.append(uid)

        proposed_dt = slot.get("proposed_time", "")
        slot_date = proposed_dt[:10]
        slot_start = proposed_dt[11:16]

        # Default 1-hour meeting
        start_h, start_m = int(slot_start[:2]), int(slot_start[3:5])
        end_total = start_h * 60 + start_m + 60
        slot_end = f"{end_total // 60:02d}:{end_total % 60:02d}"

        cycle = self._cycles.get_by_cycle_id(cycle_id)
        vendor_name = cycle.get("vendor_name", "Vendor") if cycle else "Vendor"

        from app.models.meeting import MeetingCreate, MeetingTimeSlot

        meeting_payload = MeetingCreate(
            title=f"Governance Review — {vendor_name}",
            description=f"Governance meeting for cycle {cycle_id}",
            agenda="1) Scorecard Review\n2) Actions\n3) Next Steps",
            organizerId=organiser_id,
            participantIds=participant_ids,
            timeSlot=MeetingTimeSlot(date=slot_date, startTime=slot_start, endTime=slot_end),
            cycleId=cycle_id,
            meetingType="EGB_QBR",
        )

        try:
            meeting, warnings = self._meeting_svc.create_meeting(meeting_payload)
        except ValueError as exc:
            return AgentResponse(
                status="failed",
                agent=self.AGENT_NAME,
                summary=str(exc),
            )

        # Mark attendees as invite sent
        for att in attendees:
            self._attendees.update_invite_status(att["attendee_id"], "PENDING")

        # Advance cycle workflow state through the engine (validates transition)
        now = datetime.now(timezone.utc).isoformat()
        cycle = self._cycles.get_by_cycle_id(cycle_id)
        if cycle:
            workflow_engine.transition_to(cycle, "MEETING_SCHEDULED", self._cycles, now)

        return AgentResponse(
            status="success",
            agent=self.AGENT_NAME,
            summary=f"Invites sent to {len(participant_ids)} participant(s). Meeting created.",
            data={"meeting": meeting},
            warnings=warnings,
            next_actions=["TRACK_RSVP"],
        )

    # ──────────────────────────────────────────────────────────────────
    # Step 6 — RSVP tracking
    # ──────────────────────────────────────────────────────────────────

    def get_rsvp_status(self, cycle_id: str) -> AgentResponse:
        """
        Return current RSVP status for all cycle attendees.

        # AI_HOOK: LLM could draft reminder messages for non-responders.
        """
        attendees = self._attendees.get_for_cycle(cycle_id)
        pending = [a for a in attendees if a.get("invite_status") == "PENDING"]
        accepted = [a for a in attendees if a.get("invite_status") == "ACCEPTED"]
        declined = [a for a in attendees if a.get("invite_status") == "DECLINED"]

        warnings: list[str] = []
        if pending:
            warnings.append(f"{len(pending)} attendee(s) have not responded: "
                            + ", ".join(a["name"] for a in pending))

        return AgentResponse(
            status="success",
            agent=self.AGENT_NAME,
            summary=f"RSVP: {len(accepted)} accepted, {len(pending)} pending, {len(declined)} declined.",
            data={
                "accepted": accepted,
                "pending": pending,
                "declined": declined,
                "total": len(attendees),
            },
            warnings=warnings,
            next_actions=["SEND_REMINDER"] if pending else [],
        )

    def update_rsvp(self, cycle_id: str, attendee_id: str, status: str) -> Optional[dict]:
        """Update the RSVP status of one attendee (accept/decline)."""
        return self._attendees.update_invite_status(attendee_id, status.upper())
