/**
 * Typed API functions for the Scheduling module (Module A).
 * All calls go through the base apiFetch wrapper.
 */
import { apiFetch } from './api'
import type { CycleAttendee, SlotProposal } from '@/types/scheduling.types'
import type { CycleMeeting, GovernanceCycle } from '@/types/cycle.types'

// ── Response shapes ──────────────────────────────────────────────────────────

export interface AgentRunResponse {
  status: 'success' | 'failed'
  agent: string
  summary: string
  data: { slots?: SlotProposal[]; [key: string]: unknown } | null
  warnings: string[]
  next_actions: string[]
  requires_approval: boolean
  run_id?: string
}

export interface GraphTokenInfo {
  token_present: boolean
  user?: string
}

// ── Cycles ───────────────────────────────────────────────────────────────────

export async function fetchCycle(cycleId: string): Promise<GovernanceCycle | null> {
  try {
    const res = await apiFetch<{ cycle: GovernanceCycle }>(`/api/cycles/${cycleId}`)
    return res.cycle ?? null
  } catch {
    return null
  }
}

export async function fetchAllCycles(): Promise<GovernanceCycle[]> {
  try {
    const res = await apiFetch<{ cycles: GovernanceCycle[] }>('/api/cycles')
    return res.cycles ?? []
  } catch {
    return []
  }
}

// ── Attendees ────────────────────────────────────────────────────────────────

export async function fetchAttendees(cycleId: string): Promise<CycleAttendee[]> {
  const res = await apiFetch<{ attendees: CycleAttendee[] }>(`/api/cycles/${cycleId}/attendees`)
  return res.attendees ?? []
}

export async function fetchAttendeesSeeded(
  cycleId: string,
  options?: { seedFromPrevious?: boolean }
): Promise<CycleAttendee[]> {
  const seedFromPrevious = options?.seedFromPrevious ?? false
  const url = seedFromPrevious
    ? `/api/cycles/${cycleId}/attendees?seedFromPrevious=true`
    : `/api/cycles/${cycleId}/attendees`

  const res = await apiFetch<{ attendees: CycleAttendee[] }>(url)
  return res.attendees ?? []
}

export async function completeAttendanceConfirmation(
  cycleId: string
): Promise<GovernanceCycle> {
  const res = await apiFetch<{ cycle: GovernanceCycle }>(
    `/api/cycles/${cycleId}/scheduling/attendance-confirmation/complete`,
    { method: 'POST' }
  )
  return res.cycle
}

/**
 * Fast-forward the backend cycle's workflow_state to `target`.
 *
 * Used by the frontend store after any local advance to keep the backend in
 * sync, so progress survives localStorage clears and cross-device use.
 * Backward transitions are rejected server-side; no-ops when already at/past.
 */
export async function setBackendWorkflowState(
  cycleId: string,
  target: string
): Promise<GovernanceCycle | null> {
  try {
    const res = await apiFetch<{ cycle: GovernanceCycle }>(
      `/api/cycles/${cycleId}/workflow-state`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      }
    )
    return res.cycle ?? null
  } catch {
    // Backend offline or cycle not backend-persisted (e.g. mock) — local state
    // remains the source of truth via localStorage.
    return null
  }
}

// ── Meeting plan ───────────────────────────────────────────────────────────

/** Replace the cycle's meeting plan (which meetings are included in this cycle). */
export async function updateMeetingPlan(
  cycleId: string,
  meetingPlan: CycleMeeting[]
): Promise<CycleMeeting[]> {
  const res = await apiFetch<{ cycle: GovernanceCycle; meeting_plan: CycleMeeting[] }>(
    `/api/cycles/${cycleId}/meeting-plan`,
    { method: 'PUT', body: JSON.stringify({ meeting_plan: meetingPlan }) }
  )
  return res.meeting_plan ?? meetingPlan
}

// ── Manual / reschedule (main governance meeting) ────────────────────────────

export interface ScheduleManualResult {
  message: string
  event_id?: string
  teams_meeting_url?: string | null
  web_link?: string | null
  slot?: SlotProposal
  rescheduled: boolean
}

/**
 * Manually schedule (or reschedule) the main governance meeting at a
 * coordinator-chosen time, bypassing the ranked slot recommendations.
 * Creates/updates a real Teams meeting via Microsoft Graph.
 */
export async function scheduleMeetingManual(
  cycleId: string,
  params: {
    organiserEmail: string
    startTime: string // local wall-clock, e.g. "2026-07-20T14:30:00"
    durationHours: number
    timeZone: 'IST' | 'UTC' | 'GMT'
    reschedule?: boolean
  }
): Promise<ScheduleManualResult> {
  return apiFetch<ScheduleManualResult>(
    `/api/cycles/${cycleId}/scheduling/graph/schedule-manual`,
    {
      method: 'POST',
      body: JSON.stringify({
        organiser_email: params.organiserEmail,
        start_time: params.startTime,
        duration_hours: params.durationHours,
        time_zone: params.timeZone,
        reschedule: params.reschedule ?? false,
      }),
    }
  )
}

export function getPreferredOrganizerEmail(attendees: CycleAttendee[]): string | null {
  const coordinator = attendees.find((attendee) => attendee.role === 'VMO_COORDINATOR')
  if (coordinator?.email) return coordinator.email

  const keyAttendee = attendees.find((attendee) => attendee.is_key)
  if (keyAttendee?.email) return keyAttendee.email

  return attendees[0]?.email ?? null
}

export async function getTokenOwnerOrganizerEmail(): Promise<string | null> {
  try {
    const info = await apiFetch<GraphTokenInfo>(`/api/graph/token-info`)
    if (!info?.token_present) return null
    const user = (info.user ?? '').trim().toLowerCase()
    return user || null
  } catch {
    return null
  }
}

export async function approveAttendeeKey(
  cycleId: string,
  attendeeId: string,
  isKey: boolean
): Promise<CycleAttendee> {
  const res = await apiFetch<{ attendee: CycleAttendee }>(
    `/api/cycles/${cycleId}/attendees/${attendeeId}`,
    { method: 'PUT', body: JSON.stringify({ is_key: isKey }) }
  )
  return res.attendee
}

// ── Slot proposals ───────────────────────────────────────────────────────────

export async function fetchSlots(cycleId: string): Promise<SlotProposal[]> {
  const res = await apiFetch<{ proposals: SlotProposal[] }>(
    `/api/cycles/${cycleId}/scheduling/slots`
  )
  return res.proposals ?? []
}

export async function approveSlot(
  cycleId: string,
  slotId: string,
  approvedBy = 'coordinator',
  timeZone?: 'IST' | 'UTC' | 'GMT'
): Promise<AgentRunResponse> {
  const payload: Record<string, unknown> = { approved_by: approvedBy }
  if (timeZone) payload.time_zone = timeZone
  return apiFetch<AgentRunResponse>(
    `/api/cycles/${cycleId}/scheduling/slots/${slotId}/approve`,
    { method: 'PUT', body: JSON.stringify(payload) }
  )
}

// ── RSVP ─────────────────────────────────────────────────────────────────────

export async function fetchRsvpStatus(cycleId: string) {
  return apiFetch<{ attendees: CycleAttendee[]; summary: Record<string, number> }>(
    `/api/cycles/${cycleId}/scheduling/rsvp`
  )
}

// ── Vendors ──────────────────────────────────────────────────────────────────

export interface VendorRecord {
  vendor_id: string
  name: string
  category: string
  status: string
}

export async function fetchVendors(): Promise<VendorRecord[]> {
  try {
    const res = await apiFetch<{ vendors: VendorRecord[] }>('/api/vendors')
    return res.vendors ?? []
  } catch {
    return []
  }
}

export async function fetchCategories(): Promise<string[]> {
  try {
    const res = await apiFetch<{ categories: string[] }>('/api/categories')
    return res.categories ?? []
  } catch {
    return []
  }
}

// ── Users ───────────────────────────────────────────────────────────────────

export interface SystemUser {
  user_id: string
  name: string
  email: string
  gmail: string
  organisation: string
  role: string
  avatar: string
}

export async function fetchSystemUsers(search?: string): Promise<SystemUser[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : ''
  return apiFetch<SystemUser[]>(`/api/users${params}`)
}
