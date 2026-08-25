/**
 * Typed API functions for the Alignment module (Module C).
 * All calls go through the base apiFetch wrapper.
 */
import { apiFetch } from './api'
import type { ExtractedAction, AlignmentInsight } from '@/types/alignment.types'
import type { CycleAttendee } from '@/types/scheduling.types'

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

// ── Schedule Meeting (manual, coordinator-chosen time) ──────────────────────

export interface ScheduleMeetingResponse {
  message: string
  event_id: string
  teams_meeting_url: string | null
  web_link: string | null
  attendee_count: number
  attendee_emails: string[]
}

/**
 * Schedule an alignment meeting at a coordinator-chosen time (no Microsoft Graph /
 * calendar access). Persists the time — and an optional pasted meeting link — so
 * the state survives a refresh. Reschedules the same index in place.
 */
export async function scheduleAlignmentMeetingManual(
  cycleId: string,
  opts: {
    startTime: string
    durationMinutes?: number
    timeZone?: string
    meetingUrl?: string | null
    meetingIndex?: number
  }
): Promise<ScheduleMeetingResponse> {
  return apiFetch<ScheduleMeetingResponse>(
    `/api/cycles/${cycleId}/alignment/manual-meeting`,
    {
      method: 'POST',
      body: JSON.stringify({
        start_time: opts.startTime,
        duration_minutes: opts.durationMinutes ?? 30,
        time_zone: opts.timeZone ?? 'IST',
        meeting_url: opts.meetingUrl ?? null,
        meeting_index: opts.meetingIndex ?? 1,
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
  time_slot: { date: string; start_time: string; end_time: string } | null
  /** UTC ISO instant of the scheduled start (for display). */
  start_time: string | null
  time_zone: string | null
  duration_minutes: number | null
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
  cycleId: string,
  meetingIndex = 1
): Promise<AlignmentAttendeesResponse> {
  return apiFetch<AlignmentAttendeesResponse>(
    `/api/cycles/${cycleId}/alignment/attendees`,
    { params: { index: String(meetingIndex) } }
  )
}

export async function addAlignmentAttendee(
  cycleId: string,
  attendee: {
    name: string; email: string; role?: string; organisation?: string; is_key?: boolean
    type?: string; attendance_requirement?: string; lt_status?: string
    shell_department?: string | null; user_id?: string; stakeholder_id?: string
  },
  meetingIndex = 1
): Promise<{ attendee: CycleAttendee; message: string }> {
  return apiFetch<{ attendee: CycleAttendee; message: string }>(
    `/api/cycles/${cycleId}/alignment/attendees/add`,
    {
      method: 'POST',
      params: { index: String(meetingIndex) },
      body: JSON.stringify({
        cycle_id: cycleId,
        ...attendee,
      }),
    }
  )
}

export async function removeAlignmentAttendee(
  cycleId: string,
  attendeeId: string,
  meetingIndex = 1
): Promise<{ message: string; attendee_id: string }> {
  return apiFetch<{ message: string; attendee_id: string }>(
    `/api/cycles/${cycleId}/alignment/attendees/remove`,
    {
      method: 'POST',
      params: { index: String(meetingIndex) },
      body: JSON.stringify({
        cycle_id: cycleId,
        attendee_id: attendeeId,
      }),
    }
  )
}

/** Reset this alignment meeting's roster back to the cycle's internal stakeholders
 *  (used on reschedule so the full attendee list is available to re-pick). */
export async function resetAlignmentAttendees(
  cycleId: string,
  meetingIndex = 1
): Promise<AlignmentAttendeesResponse> {
  return apiFetch<AlignmentAttendeesResponse>(
    `/api/cycles/${cycleId}/alignment/attendees/reset`,
    { method: 'POST', params: { index: String(meetingIndex) } }
  )
}
