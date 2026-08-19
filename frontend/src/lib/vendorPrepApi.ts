/**
 * Typed API functions for the Vendor Prep module (Module D).
 * All calls go through the base apiFetch wrapper.
 */
import { apiFetch } from './api'
import type { VendorBrief, PushbackResponse, PushbackCategory } from '@/types/vendor-prep.types'

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

// ── Vendor Prep Meeting (manual scheduling — shares the meetings store) ───────

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
  time_slot: { date: string; start_time: string; end_time: string } | null
  /** UTC ISO instant of the scheduled start (for display). */
  start_time: string | null
  time_zone: string | null
  duration_minutes: number | null
  title: string
  attendee_emails: string[]
}

/**
 * Schedule (or reschedule) the vendor-prep call at a coordinator-chosen time — no
 * Microsoft Graph / calendar access. Persists the time and an optional pasted
 * meeting link so the state survives a refresh.
 */
export async function scheduleVendorPrepMeetingManual(
  cycleId: string,
  opts: {
    startTime: string
    durationMinutes?: number
    timeZone?: string
    attendeeEmails?: string[]
    meetingUrl?: string | null
  }
): Promise<VPScheduleResponse> {
  return apiFetch<VPScheduleResponse>(
    `/api/cycles/${cycleId}/vendor-prep/manual-meeting`,
    {
      method: 'POST',
      body: JSON.stringify({
        start_time: opts.startTime,
        duration_minutes: opts.durationMinutes ?? 30,
        time_zone: opts.timeZone ?? 'IST',
        attendee_emails: opts.attendeeEmails,
        meeting_url: opts.meetingUrl ?? null,
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
