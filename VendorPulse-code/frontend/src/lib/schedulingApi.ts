/**
 * Typed API functions for the Scheduling module (Module A).
 * All calls go through the base apiFetch wrapper.
 */
import { apiFetch } from './api'
import type { CycleAttendee, SlotProposal } from '@/types/scheduling.types'

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

// ── Attendees ────────────────────────────────────────────────────────────────

export async function fetchAttendees(cycleId: string): Promise<CycleAttendee[]> {
  const res = await apiFetch<{ attendees: CycleAttendee[] }>(
    `/api/cycles/${cycleId}/attendees`
  )
  return res.attendees ?? []
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

// ── Agent run — autonomous scheduling ────────────────────────────────────────

/**
 * Runs the Scheduling Agent for the given cycle.
 * When ENABLE_LLM=true: GPT-4o drives simulate → rank autonomously.
 * When disabled: deterministic fallback runs the same steps.
 * Returns ranked slot proposals in response.data.slots.
 */
export async function runSchedulingAgent(
  cycleId: string,
  message = 'Simulate availability responses then rank the best meeting slots for this cycle.'
): Promise<AgentRunResponse> {
  return apiFetch<AgentRunResponse>(
    `/api/cycles/${cycleId}/scheduling/agent/run`,
    { method: 'POST', body: JSON.stringify({ message }) }
  )
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
  approvedBy = 'coordinator'
): Promise<AgentRunResponse> {
  return apiFetch<AgentRunResponse>(
    `/api/cycles/${cycleId}/scheduling/slots/${slotId}/approve`,
    { method: 'PUT', body: JSON.stringify({ approved_by: approvedBy }) }
  )
}

// ── Send invites ─────────────────────────────────────────────────────────────

export async function sendInvites(
  cycleId: string,
  slotId: string,
  organiserId: string
): Promise<AgentRunResponse> {
  return apiFetch<AgentRunResponse>(
    `/api/cycles/${cycleId}/scheduling/send-invites`,
    {
      method: 'POST',
      body: JSON.stringify({ slot_id: slotId, organiser_id: organiserId }),
    }
  )
}

// ── RSVP ─────────────────────────────────────────────────────────────────────

export async function fetchRsvpStatus(cycleId: string) {
  return apiFetch<{ attendees: CycleAttendee[]; summary: Record<string, number> }>(
    `/api/cycles/${cycleId}/scheduling/rsvp`
  )
}
