/**
 * Typed API functions for the Vendor Prep module (Module D).
 * All calls go through the base apiFetch wrapper.
 */
import { apiFetch } from './api'
import type { VendorBrief, PushbackResponse, PushbackCategory } from '@/types/vendor-prep.types'
import type { SlotProposal } from '@/types/scheduling.types'

// ── Response shape ──────────────────────────────────────────────────────────

export interface AgentResponse<T = unknown> {
  status: 'success' | 'failed' | 'partial' | 'pending_approval'
  agent: string
  summary: string
  data: T | null
  warnings: string[]
  next_actions: string[]
  requires_approval: boolean
  run_id?: string
}

// ── Vendor Brief ────────────────────────────────────────────────────────────

export interface BriefPayload {
  brief: VendorBrief
}

export async function generateVendorBrief(
  cycleId: string,
  vendorName?: string
): Promise<AgentResponse<BriefPayload>> {
  return apiFetch<AgentResponse<BriefPayload>>(
    `/api/cycles/${cycleId}/vendor-prep/brief`,
    {
      method: 'POST',
      body: JSON.stringify({
        cycle_id: cycleId,
        vendor_name: vendorName,
      }),
    }
  )
}

// ── Pushback Responses ──────────────────────────────────────────────────────

export interface PushbackPayload {
  pushback_id: string
  responses: PushbackResponse[]
}

export async function generatePushbackResponses(
  cycleId: string,
  pushbackId: string,
  category: PushbackCategory,
  description: string,
  raisedBy: string,
  needsLegalReview = false
): Promise<AgentResponse<PushbackPayload>> {
  return apiFetch<AgentResponse<PushbackPayload>>(
    `/api/cycles/${cycleId}/vendor-prep/pushback`,
    {
      method: 'POST',
      body: JSON.stringify({
        cycle_id: cycleId,
        pushback_id: pushbackId,
        category,
        description,
        raised_by: raisedBy,
        needs_legal_review: needsLegalReview,
      }),
    }
  )
}

// ── Approval ───────────────────────────────────────────────────────────────

export interface ApprovalResult {
  status: string
  run_id: string
  approved_by: string
  approved_at: string
}

export async function approveBrief(
  cycleId: string,
  runId: string,
  approvedBy = 'coordinator'
): Promise<ApprovalResult> {
  return apiFetch<ApprovalResult>(
    `/api/cycles/${cycleId}/vendor-prep/brief/approve`,
    {
      method: 'POST',
      body: JSON.stringify({ run_id: runId, approved_by: approvedBy }),
    }
  )
}

export async function approvePushbackResponse(
  cycleId: string,
  runId: string,
  approvedBy = 'coordinator'
): Promise<ApprovalResult> {
  return apiFetch<ApprovalResult>(
    `/api/cycles/${cycleId}/vendor-prep/pushback/approve`,
    {
      method: 'POST',
      body: JSON.stringify({ run_id: runId, approved_by: approvedBy }),
    }
  )
}

// ── Vendor Prep Meeting (Teams via Graph — shares the meetings store) ─────────

export interface VPFindTimesResponse {
  message: string
  slot_proposals: SlotProposal[]
  attendee_count: number
}

export interface VPScheduleResponse {
  message: string
  event_id: string
  teams_meeting_url: string | null
  web_link: string | null
  attendee_count: number
  attendee_emails: string[]
}

export interface VendorPrepMeeting {
  meeting_index: number
  event_id: string
  teams_meeting_url: string | null
  web_link: string | null
  attendee_count: number
  status: string
  time_slot: { date: string; startTime: string; endTime: string } | null
  title: string
  attendee_emails: string[]
}

/** Find candidate times for the vendor-prep call. `attendeeEmails` = the edited
 *  subset to invite (omit to check everyone: internal team + vendor). */
export async function findVendorPrepTimes(
  cycleId: string,
  organiserEmail: string,
  dateRangeStart: string,
  dateRangeEnd: string,
  durationHours = 0.5,
  timeZone = 'UTC',
  attendeeEmails?: string[]
): Promise<VPFindTimesResponse> {
  return apiFetch<VPFindTimesResponse>(
    `/api/cycles/${cycleId}/vendor-prep/find-times`,
    {
      method: 'POST',
      body: JSON.stringify({
        cycle_id: cycleId,
        organiser_email: organiserEmail,
        date_range_start: dateRangeStart,
        date_range_end: dateRangeEnd,
        duration_hours: durationHours,
        time_zone: timeZone,
        attendee_emails: attendeeEmails,
      }),
    }
  )
}

/** Create (or reschedule) the single vendor-prep Teams meeting. */
export async function scheduleVendorPrepMeeting(
  cycleId: string,
  organiserEmail: string,
  slotId: string,
  startTime: string,
  durationMinutes = 30,
  timeZone = 'UTC',
  attendeeEmails?: string[]
): Promise<VPScheduleResponse> {
  return apiFetch<VPScheduleResponse>(
    `/api/cycles/${cycleId}/vendor-prep/schedule-meeting`,
    {
      method: 'POST',
      body: JSON.stringify({
        cycle_id: cycleId,
        organiser_email: organiserEmail,
        slot_id: slotId,
        start_time: startTime,
        duration_minutes: durationMinutes,
        time_zone: timeZone,
        attendee_emails: attendeeEmails,
      }),
    }
  )
}

export async function getVendorPrepMeeting(
  cycleId: string
): Promise<{ meeting: VendorPrepMeeting | null }> {
  return apiFetch<{ meeting: VendorPrepMeeting | null }>(
    `/api/cycles/${cycleId}/vendor-prep/meeting`
  )
}

export async function deleteVendorPrepMeeting(
  cycleId: string
): Promise<{ deleted: boolean; cancelled: boolean; meeting_index?: number; message?: string }> {
  return apiFetch(`/api/cycles/${cycleId}/vendor-prep/meeting`, { method: 'DELETE' })
}
