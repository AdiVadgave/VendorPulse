/**
 * Typed API functions for the Alignment module (Module C).
 * All calls go through the base apiFetch wrapper.
 */
import { apiFetch } from './api'
import type { ExtractedAction, AlignmentInsight } from '@/types/alignment.types'
import type { CycleAttendee, SlotProposal } from '@/types/scheduling.types'

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

// ── AI-Generated Insights (from consolidated internal scorecard) ─────────────

export interface InsightsPayload {
  insights: AlignmentInsight[]
}

/**
 * Generate alignment insights from the consolidated internal scorecard.
 * Runtime — computed from the actual submitted scores (LLM narrates when enabled).
 */
export async function getAlignmentInsights(
  cycleId: string
): Promise<AgentResponse<InsightsPayload>> {
  return apiFetch<AgentResponse<InsightsPayload>>(
    `/api/cycles/${cycleId}/alignment/insights`,
    { method: 'POST', body: JSON.stringify({ cycle_id: cycleId }) }
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
  timeZone = 'UTC',
  meetingIndex = 1
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
        meeting_index: meetingIndex,
      }),
    }
  )
}

// ── Alignment Meeting State (persistence) ──────────────────────────────────

export interface AlignmentMeeting {
  meeting_index: number
  event_id: string
  teams_meeting_url: string | null
  web_link: string | null
  attendee_count: number
  status: string
  time_slot: { date: string; startTime: string; endTime: string } | null
  title: string
}

export interface AlignmentMeetingState {
  meeting: AlignmentMeeting | null
}

/** Fetch a single alignment meeting's persisted state by 1-based index. */
export async function getAlignmentMeeting(
  cycleId: string,
  meetingIndex = 1
): Promise<AlignmentMeetingState> {
  return apiFetch<AlignmentMeetingState>(
    `/api/cycles/${cycleId}/alignment/meeting`,
    { params: { index: String(meetingIndex) } }
  )
}

/** List all alignment meetings scheduled for this cycle (ordered by index). */
export async function listAlignmentMeetings(
  cycleId: string
): Promise<{ meetings: AlignmentMeeting[]; count: number }> {
  return apiFetch<{ meetings: AlignmentMeeting[]; count: number }>(
    `/api/cycles/${cycleId}/alignment/meetings`
  )
}

/**
 * Delete an alignment meeting the admin added by mistake. Cancels the underlying
 * Teams event (best-effort) and removes the record. Safe to call even if nothing
 * was scheduled at that index yet.
 */
export async function deleteAlignmentMeeting(
  cycleId: string,
  meetingIndex: number
): Promise<{ deleted: boolean; cancelled: boolean; meeting_index?: number; message?: string }> {
  return apiFetch<{ deleted: boolean; cancelled: boolean; meeting_index?: number; message?: string }>(
    `/api/cycles/${cycleId}/alignment/meeting`,
    { method: 'DELETE', params: { index: String(meetingIndex) } }
  )
}

// ── Internal Attendees ─────────────────────────────────────────────────────

export interface AlignmentAttendeesResponse {
  attendees: CycleAttendee[]
  count: number
}

export async function getAlignmentAttendees(
  cycleId: string
): Promise<AlignmentAttendeesResponse> {
  return apiFetch<AlignmentAttendeesResponse>(
    `/api/cycles/${cycleId}/alignment/attendees`
  )
}

export async function addAlignmentAttendee(
  cycleId: string,
  attendee: { name: string; email: string; role?: string; organisation?: string; is_key?: boolean }
): Promise<{ attendee: CycleAttendee; message: string }> {
  return apiFetch<{ attendee: CycleAttendee; message: string }>(
    `/api/cycles/${cycleId}/alignment/attendees/add`,
    {
      method: 'POST',
      body: JSON.stringify({
        cycle_id: cycleId,
        ...attendee,
      }),
    }
  )
}

export async function removeAlignmentAttendee(
  cycleId: string,
  attendeeId: string
): Promise<{ message: string; attendee_id: string }> {
  return apiFetch<{ message: string; attendee_id: string }>(
    `/api/cycles/${cycleId}/alignment/attendees/remove`,
    {
      method: 'POST',
      body: JSON.stringify({
        cycle_id: cycleId,
        attendee_id: attendeeId,
      }),
    }
  )
}
