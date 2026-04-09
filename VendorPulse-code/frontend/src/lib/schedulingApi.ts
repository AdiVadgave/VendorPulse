/**
 * Typed API functions for the Scheduling module (Module A).
 * All calls go through the base apiFetch wrapper.
 */
import { apiFetch } from './api'
import type { CycleAttendee, SlotProposal } from '@/types/scheduling.types'
import type { GovernanceCycle } from '@/types/cycle.types'

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
  const res = await apiFetch<{ attendees: CycleAttendee[] }>(
    `/api/cycles/${cycleId}/attendees`
  )
  return res.attendees ?? []
}

export async function getTokenOwnerOrganizerEmail(): Promise<string | null> {
  try {
    const res = await apiFetch<GraphTokenInfo>('/api/graph/token-info')
    const user = (res.user ?? '').trim().toLowerCase()
    if (!user) return null
    return user
  } catch {
    return null
  }
}

export function getPreferredOrganizerEmail(attendees: CycleAttendee[]): string | null {
  const coordinator = attendees.find((attendee) => attendee.role === 'VMO_COORDINATOR')
  if (coordinator?.email) return coordinator.email

  const keyAttendee = attendees.find((attendee) => attendee.is_key)
  if (keyAttendee?.email) return keyAttendee.email

  return attendees[0]?.email ?? null
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
