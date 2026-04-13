/**
 * Typed API functions for the Alignment module (Module C).
 * All calls go through the base apiFetch wrapper.
 */
import { apiFetch } from './api'
import type { ExtractedAction } from '@/types/alignment.types'
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

// ── Extract Actions ─────────────────────────────────────────────────────────

export interface ActionsPayload {
  actions: ExtractedAction[]
}

export async function extractAlignmentActions(
  cycleId: string,
  notesText: string
): Promise<AgentResponse<ActionsPayload>> {
  return apiFetch<AgentResponse<ActionsPayload>>(
    `/api/cycles/${cycleId}/alignment/extract-actions`,
    {
      method: 'POST',
      body: JSON.stringify({
        cycle_id: cycleId,
        notes_text: notesText,
      }),
    }
  )
}

// ── Find Available Times ────────────────────────────────────────────────────

export interface FindTimesResponse {
  message: string
  slot_proposals: SlotProposal[]
  attendee_count: number
}

export async function findAlignmentTimes(
  cycleId: string,
  organiserEmail: string,
  dateRangeStart: string,
  dateRangeEnd: string,
  durationHours = 0.5,
  timeZone = 'UTC'
): Promise<FindTimesResponse> {
  return apiFetch<FindTimesResponse>(
    `/api/cycles/${cycleId}/alignment/find-times`,
    {
      method: 'POST',
      body: JSON.stringify({
        cycle_id: cycleId,
        organiser_email: organiserEmail,
        date_range_start: dateRangeStart,
        date_range_end: dateRangeEnd,
        duration_hours: durationHours,
        time_zone: timeZone,
      }),
    }
  )
}

// ── Schedule Meeting (send invite for selected slot) ────────────────────────

export interface ScheduleMeetingResponse {
  message: string
  event_id: string
  teams_meeting_url: string | null
  web_link: string | null
  attendee_count: number
  attendee_emails: string[]
}

export async function scheduleAlignmentMeeting(
  cycleId: string,
  organiserEmail: string,
  slotId: string,
  startTime: string,
  durationMinutes = 30,
  timeZone = 'UTC'
): Promise<ScheduleMeetingResponse> {
  return apiFetch<ScheduleMeetingResponse>(
    `/api/cycles/${cycleId}/alignment/schedule-meeting`,
    {
      method: 'POST',
      body: JSON.stringify({
        cycle_id: cycleId,
        organiser_email: organiserEmail,
        slot_id: slotId,
        start_time: startTime,
        duration_minutes: durationMinutes,
        time_zone: timeZone,
      }),
    }
  )
}
