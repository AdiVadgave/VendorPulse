/**
 * Typed API functions for the Scheduling module (Module A).
 * All calls go through the base apiFetch wrapper.
 */
import { apiFetch } from './api'
import type { CycleAttendee, SlotProposal } from '@/types/scheduling.types'
import type { GovernanceCycle } from '@/types/cycle.types'

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

// ── Manual meeting (no Graph / calendar access) ──────────────────────────────

export interface ManualMeetingResult {
  cycle: { workflow_state: string; teams_meeting_scheduled_at?: string | null; teams_meeting_url?: string | null }
  scheduled_at: string
  time_zone: string
  duration_minutes: number
  meeting_url: string | null
}

/** Record a manually-chosen meeting date/time on the cycle (persists to the DB and
 *  advances the workflow to MEETING_SCHEDULED). No calendar.readwrite required. */
export async function scheduleManualMeeting(
  cycleId: string,
  input: { startTime: string; timeZone: string; durationMinutes?: number; meetingUrl?: string | null; eventId?: string | null }
): Promise<ManualMeetingResult> {
  return apiFetch<ManualMeetingResult>(`/api/cycles/${cycleId}/scheduling/manual-meeting`, {
    method: 'POST',
    body: JSON.stringify({
      start_time: input.startTime,
      time_zone: input.timeZone,
      duration_minutes: input.durationMinutes ?? 60,
      meeting_url: input.meetingUrl ?? null,
      event_id: input.eventId ?? null,
    }),
  })
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
  organisation: string
  role: string
  avatar: string
}

export async function fetchSystemUsers(search?: string): Promise<SystemUser[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : ''
  return apiFetch<SystemUser[]>(`/api/users${params}`)
}
