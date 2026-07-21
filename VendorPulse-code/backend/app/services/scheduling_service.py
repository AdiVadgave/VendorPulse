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

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.models.common import AgentResponse

logger = logging.getLogger(__name__)
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
from app.services.graph_service import GraphService
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

    def get_attendees(self, cycle_id: str, *, seed_from_previous: bool = False) -> list[dict]:
        """
        Get attendees for a cycle.

        If `seed_from_previous=True` and the cycle is new (CYCLE_CREATED) and has no
        attendees, attempt to import them from the previous cycle for the same vendor.
        """
        logger.info("get_attendees — cycle_id=%s, seed_from_previous=%s", cycle_id, seed_from_previous)
        current_attendees = self._attendees.get_for_cycle(cycle_id)
        if current_attendees:
            logger.info("get_attendees: found %d existing attendees for cycle %s", len(current_attendees), cycle_id)
            return current_attendees

        if not seed_from_previous:
            return []

        # Brand new cycle? Try to seed from the previous cycle for the same vendor.
        cycle = self._cycles.get_by_cycle_id(cycle_id)
        if not cycle or cycle.get("workflow_state") != "CYCLE_CREATED":
            return []

        vendor_id = cycle.get("vendor_id")
        if not vendor_id:
            return []

        quarter = cycle.get("quarter")
        vendor_name = cycle.get("vendor_name")

        def _parse_dt(value: str) -> Optional[datetime]:
            if not value:
                return None
            try:
                # Handle both RFC3339 'Z' and Python-style '+00:00'
                if value.endswith("Z"):
                    value = value[:-1] + "+00:00"
                return datetime.fromisoformat(value)
            except Exception:
                return None

        # Find previous cycles for this vendor.
        # Note: frontend can create custom vendors with a shared id (e.g., 'v_custom'),
        # so also match vendor_name in that case to avoid cross-vendor seeding.
        all_vendor_cycles = self._cycles.get_by_vendor(vendor_id)
        if vendor_id == "v_custom" and vendor_name:
            all_vendor_cycles = [c for c in all_vendor_cycles if c.get("vendor_name") == vendor_name]

        current_created_at = cycle.get("created_at", "")
        current_dt = _parse_dt(current_created_at)

        # Prefer a timestamp-based comparison; fall back to lexicographic ISO compare.
        def _is_before_current(other: dict) -> bool:
            if other.get("cycle_id") == cycle_id:
                return False
            other_created_at = other.get("created_at", "")
            other_dt = _parse_dt(other_created_at)
            if current_dt and other_dt:
                return other_dt < current_dt
            return other_created_at < current_created_at

        previous_cycles = [c for c in all_vendor_cycles if _is_before_current(c)]
        if not previous_cycles:
            return []

        # Sort most recent → oldest. Use parsed datetime when possible.
        def _sort_key(c: dict):
            dt = _parse_dt(c.get("created_at", ""))
            return (dt is not None, dt or datetime.min, c.get("created_at", ""))

        previous_cycles.sort(key=_sort_key, reverse=True)

        # Prefer the most recent cycle for the same quarter first.
        same_quarter_cycles = (
            [c for c in previous_cycles if quarter and c.get("quarter") == quarter]
            if quarter
            else []
        )
        candidate_groups: list[list[dict]] = []
        if same_quarter_cycles:
            candidate_groups.append(same_quarter_cycles)
        candidate_groups.append(previous_cycles)

        # Walk back until we find the most recent cycle that *actually* has attendees.
        # This avoids false "no attendees" when the immediately previous cycle was created
        # but never had attendees added.
        prev_attendee_records: list[dict] = []
        for group in candidate_groups:
            for prev in group:
                prev_attendee_records = self._attendees.get_for_cycle(prev["cycle_id"])
                if prev_attendee_records:
                    break
            if prev_attendee_records:
                break
        if not prev_attendee_records:
            return []

        # Seed current cycle with these attendees.
        # Filter out people who were replaced in that previous cycle.
        new_attendees = []
        for old in prev_attendee_records:
            if old.get("replaced_by"):
                continue

            new_record = {
                "attendee_id": f"att_{uuid.uuid4().hex}",
                "cycle_id": cycle_id,
                "stakeholder_id": old.get("stakeholder_id"),
                "name": old.get("name"),
                "email": old.get("email"),
                "role": old.get("role"),
                "organisation": old.get("organisation"),
                "is_key": old.get("is_key"),
                "invite_status": "PENDING",
                "availability_submitted": False,
                "user_id": old.get("user_id"),
                "confirmation_status": "PENDING",
            }
            self._attendees.insert(new_record)
            new_attendees.append(new_record)

        logger.info("get_attendees: seeded %d attendees from previous cycle into cycle %s", len(new_attendees), cycle_id)
        return new_attendees

    def add_attendees(self, cycle_id: str, attendees: list[CycleAttendeeCreate]) -> AgentResponse:
        """
        Load / refresh the attendee list for a cycle.

        # AI_HOOK: LLM could verify that all required roles are covered and
        suggest additional stakeholders based on past cycle records.
        """
        logger.info("add_attendees — cycle_id=%s, count=%d", cycle_id, len(attendees))
        inserted: list[dict] = []
        for a in attendees:
            record = {
                "attendee_id": f"att_{uuid.uuid4().hex}",
                "cycle_id": cycle_id,
                "stakeholder_id": a.stakeholder_id,
                "name": a.name,
                "email": a.email,
                "role": a.role,
                "organisation": a.organisation,
                "type": getattr(a, "type", "Internal Stakeholder") or "Internal Stakeholder",
                "is_key": a.is_key,
                "attendance_requirement": getattr(a, "attendance_requirement", "Required") or "Required",
                "lt_status": getattr(a, "lt_status", "Non-LT") or "Non-LT",
                "shell_department": getattr(a, "shell_department", None),
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
    # Step 1b — Attendance confirmation (new governance cycle gate)
    # ──────────────────────────────────────────────────────────────────

    def complete_attendance_confirmation(self, cycle_id: str) -> dict:
        """Validate attendee confirmations and advance workflow to ATTENDEE_REFRESH_SENT."""
        cycle = self._cycles.get_by_cycle_id(cycle_id)
        if not cycle:
            raise ValueError(f"Cycle '{cycle_id}' not found")

        # Idempotent: if we're already past this point, just return the cycle.
        if workflow_engine.state_index(cycle.get("workflow_state", "CYCLE_CREATED")) >= workflow_engine.state_index(
            "ATTENDEE_REFRESH_SENT"
        ):
            return cycle

        attendees = self._attendees.get_for_cycle(cycle_id)
        if not attendees:
            raise ValueError("No attendees found to confirm")

        pending = [
            a
            for a in attendees
            if (a.get("confirmation_status") in (None, "PENDING"))
        ]
        if pending:
            raise ValueError(f"{len(pending)} attendee(s) still pending confirmation")

        now = datetime.now(timezone.utc).isoformat()
        if workflow_engine.can_transition(cycle.get("workflow_state", ""), "ATTENDEE_REFRESH_SENT"):
            return workflow_engine.advance(cycle, self._cycles, now)

        return self._cycles.get_by_cycle_id(cycle_id) or cycle

    def send_attendance_outreach(
        self,
        cycle_id: str,
        graph_service: Optional[GraphService] = None,
    ) -> AgentResponse:
        """Send attendance outreach to each attendee (draft → send when Graph is available).

        If `graph_service` is not provided, this falls back to demo behaviour and only
        ensures `confirmation_status` is set to PENDING.

        Stores reply-tracking fields on each attendee record when Graph is used:
          - outreach_message_id
          - outreach_conversation_id
          - outreach_sent_at
        """
        logger.info("send_attendance_outreach — cycle_id=%s, graph_service=%s", cycle_id, "present" if graph_service else "None")
        attendees = self._attendees.get_for_cycle(cycle_id)

        # Always ensure confirmation_status exists so the UI can track confirmations.
        for att in attendees:
            if att.get("confirmation_status") is None:
                self._attendees.update_by_id(
                    "attendee_id",
                    att["attendee_id"],
                    {"confirmation_status": "PENDING"},
                )

        if graph_service is None:
            return AgentResponse(
                status="success",
                agent=self.AGENT_NAME,
                summary=f"Attendance outreach marked as sent for {len(attendees)} attendee(s) (demo mode).",
                data={"cycle_id": cycle_id, "outreach_count": len(attendees), "mode": "demo"},
                next_actions=["AWAIT_ATTENDANCE_CONFIRMATION"],
            )

        cycle = self._cycles.get_by_cycle_id(cycle_id) or {}
        vendor_name = cycle.get("vendor_name") or "Vendor"
        quarter = cycle.get("quarter") or ""
        year = cycle.get("year") or ""

        subject = f"Attendance Confirmation — {vendor_name} {quarter} {year}".strip()
        body = (
            "Hello,\n\n"
            "Please confirm whether you are still part of the team for the upcoming governance cycle.\n"
            "If you are not attending, please reply with who will replace you (name + email).\n"
            "If someone new should be invited, please include them as well.\n\n"
            "Thanks.\n"
        )

        import asyncio

        async def _send_for_attendee(att: dict) -> dict:
            # Idempotent: if we already have a conversationId + message id, don't re-send.
            if att.get("outreach_conversation_id") and att.get("outreach_message_id"):
                return {
                    "attendee_id": att.get("attendee_id"),
                    "email": att.get("email"),
                    "status": "skipped",
                    "message": "Outreach already sent",
                    "message_id": att.get("outreach_message_id"),
                    "conversation_id": att.get("outreach_conversation_id"),
                }

            email = (att.get("email") or "").strip()
            if not email:
                return {
                    "attendee_id": att.get("attendee_id"),
                    "status": "failed",
                    "message": "Attendee has no email address",
                }

            draft = await graph_service.create_draft_message(
                subject=subject,
                content=body,
                to_recipients=[email],
                content_type="Text",
            )
            if "error" in draft:
                code = draft.get("code") if isinstance(draft, dict) else None
                code_suffix = f" (code: {code})" if code else ""
                return {
                    "attendee_id": att.get("attendee_id"),
                    "email": email,
                    "status": "failed",
                    "message": f"{draft.get('detail') or draft.get('error')}{code_suffix}",
                }

            message_id = draft.get("id")
            conversation_id = draft.get("conversationId")
            if not message_id:
                return {
                    "attendee_id": att.get("attendee_id"),
                    "email": email,
                    "status": "failed",
                    "message": "Draft created but message id missing",
                }

            sent = await graph_service.send_draft_message(message_id)
            if "error" in sent:
                code = sent.get("code") if isinstance(sent, dict) else None
                code_suffix = f" (code: {code})" if code else ""
                return {
                    "attendee_id": att.get("attendee_id"),
                    "email": email,
                    "status": "failed",
                    "message": f"{sent.get('detail') or sent.get('error')}{code_suffix}",
                    "message_id": message_id,
                    "conversation_id": conversation_id,
                }

            now = datetime.now(timezone.utc).isoformat()
            self._attendees.update_by_id(
                "attendee_id",
                att["attendee_id"],
                {
                    "outreach_message_id": message_id,
                    "outreach_conversation_id": conversation_id,
                    "outreach_sent_at": now,
                },
            )

            return {
                "attendee_id": att.get("attendee_id"),
                "email": email,
                "status": "sent",
                "message_id": message_id,
                "conversation_id": conversation_id,
            }

        async def _run_all() -> list[dict]:
            out: list[dict] = []
            for att in attendees:
                out.append(await _send_for_attendee(att))
            return out

        results = asyncio.run(_run_all())

        sent_count = sum(1 for r in results if r.get("status") == "sent")
        failed = [r for r in results if r.get("status") == "failed"]
        skipped_count = sum(1 for r in results if r.get("status") == "skipped")

        warnings: list[str] = []
        if failed:
            warnings.append(
                f"{len(failed)} outreach email(s) failed — ensure GRAPH_ACCESS_TOKEN is a delegated /me token with Mail.ReadWrite + Mail.Send (and Mail.Read for reply query)."
            )

        status = "success" if not failed else ("partial" if sent_count > 0 else "failed")
        summary = (
            f"Attendance outreach processed for {len(attendees)} attendee(s): "
            f"{sent_count} sent, {skipped_count} skipped, {len(failed)} failed."
        )

        return AgentResponse(
            status=status,
            agent=self.AGENT_NAME,
            summary=summary,
            data={
                "cycle_id": cycle_id,
                "mode": "graph",
                "results": results,
            },
            warnings=warnings,
            next_actions=["AWAIT_ATTENDANCE_CONFIRMATION"],
        )

    async def get_attendance_outreach_messages(
        self,
        cycle_id: str,
        graph_service: GraphService,
    ) -> dict:
        """Query mailbox messages (original + replies) for stored conversationIds."""
        attendees = self._attendees.get_for_cycle(cycle_id)
        conversation_ids = [
            a.get("outreach_conversation_id")
            for a in attendees
            if a.get("outreach_conversation_id")
        ]
        unique_conversation_ids = list(dict.fromkeys(conversation_ids))

        conversations: dict[str, dict] = {}
        for conv_id in unique_conversation_ids:
            conversations[conv_id] = await graph_service.query_messages_by_conversation_id(conv_id)

        return {
            "cycle_id": cycle_id,
            "conversation_ids": unique_conversation_ids,
            "conversations": conversations,
        }

    def simulate_attendance_confirmation(self, cycle_id: str) -> AgentResponse:
        """
        Simulate attendance confirmation responses (demo helper).
        ~60% CONFIRMED, ~25% REPLACED with dummy replacement info, rest CONFIRMED.

        # AI_HOOK: LLM could flag attendees who've historically been slow to respond
        and pre-emptively suggest likely replacements.
        """
        attendees = self._attendees.get_for_cycle(cycle_id)
        total = len(attendees)
        updated: list[dict] = []

        for idx, att in enumerate(attendees):
            if idx < int(total * 0.6):
                patch = {"confirmation_status": "CONFIRMED"}
            elif idx < int(total * 0.85):
                first = att["name"].split()[0]
                domain = att["email"].split("@")[-1] if "@" in att["email"] else "company.com"
                patch = {
                    "confirmation_status": "REPLACED",
                    "replaced_by": f"Replacement for {first}",
                    "replaced_by_email": f"replacement.{att['email'].split('@')[0]}@{domain}",
                    "replacement_note": "Nominated by outgoing attendee (simulated)",
                }
            else:
                patch = {"confirmation_status": "CONFIRMED"}

            self._attendees.update_by_id("attendee_id", att["attendee_id"], patch)
            updated.append({**att, **patch})

        return AgentResponse(
            status="success",
            agent=self.AGENT_NAME,
            summary=f"Attendance confirmation simulated for {total} attendee(s).",
            data={"cycle_id": cycle_id, "attendees": updated},
            next_actions=["REVIEW_ATTENDANCE_CONFIRMATION"],
        )

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

    def approve_slot(
        self,
        cycle_id: str,
        slot_id: str,
        approved_by: str,
        time_zone: Optional[str] = None,
    ) -> AgentResponse:
        """
        Mark a slot as approved and create a draft calendar invite.

        # AI_HOOK: LLM could draft a personalised invite email body referencing
        the scorecard cycle, vendor name, and attendee roles.
        """
        logger.info("approve_slot — cycle_id=%s, slot_id=%s, approved_by=%s, time_zone=%s", cycle_id, slot_id, approved_by, time_zone)
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
        updated_slot = self._slots.approve(slot_id, approved_by, approved_at, time_zone=time_zone)

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
        logger.info("send_invites — cycle_id=%s, slot_id=%s, organiser_id=%s", cycle_id, slot_id, organiser_id)
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
            organizer_id=organiser_id,
            participant_ids=participant_ids,
            time_slot=MeetingTimeSlot(date=slot_date, start_time=slot_start, end_time=slot_end),
            cycle_id=cycle_id,
            meeting_type="EGB_QBR",
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
        logger.info("get_rsvp_status — cycle_id=%s", cycle_id)
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
            next_actions=["FOLLOW_UP_PENDING"],
        )

    def update_rsvp(self, cycle_id: str, attendee_id: str, status: str) -> Optional[dict]:
        """Update the RSVP status of one attendee (ACCEPTED/DECLINED/PENDING)."""
        logger.info("update_rsvp — cycle_id=%s, attendee_id=%s, status=%s", cycle_id, attendee_id, status)
        attendee = self._attendees.get_by_attendee_id(attendee_id)
        if attendee is None:
            return None
        if attendee.get("cycle_id") != cycle_id:
            return None
        return self._attendees.update_invite_status(attendee_id, status.upper())
