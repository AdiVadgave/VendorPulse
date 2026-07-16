/**
 * Typed API for the shared action queue (Module C–E).
 *
 * A cycle's action items are ONE persistent queue carried across every meeting
 * (Internal Alignment → Vendor Meeting → further Alignment → final QBR). All meeting
 * tabs read and write this same list.
 */
import { apiFetch } from './api'
import type { ExtractedAction } from '@/types/alignment.types'

/** An action item as stored/returned by the backend (adds origin + timestamps). */
export interface ActionItem extends ExtractedAction {
  cycle_id?: string
  origin?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface NewActionInput {
  description: string
  details?: string
  owner?: string
  due_date?: string | null
  source?: ExtractedAction['source']
  status?: ExtractedAction['status']
  origin?: string | null
  action_id?: string
}

export async function getActions(cycleId: string): Promise<{ actions: ActionItem[]; count: number }> {
  return apiFetch<{ actions: ActionItem[]; count: number }>(
    `/api/cycles/${cycleId}/actions`
  )
}

export async function addAction(cycleId: string, action: NewActionInput): Promise<{ action: ActionItem }> {
  return apiFetch<{ action: ActionItem }>(
    `/api/cycles/${cycleId}/actions`,
    { method: 'POST', body: JSON.stringify(action) }
  )
}

/** Add several actions (e.g. from a transcript). De-duped server-side by action_id. */
export async function addActionsBulk(
  cycleId: string,
  actions: NewActionInput[]
): Promise<{ added: ActionItem[]; count: number }> {
  return apiFetch<{ added: ActionItem[]; count: number }>(
    `/api/cycles/${cycleId}/actions/bulk`,
    { method: 'POST', body: JSON.stringify({ actions }) }
  )
}

export async function updateAction(
  cycleId: string,
  actionId: string,
  updates: Partial<Omit<NewActionInput, 'action_id'>>
): Promise<{ action: ActionItem }> {
  return apiFetch<{ action: ActionItem }>(
    `/api/cycles/${cycleId}/actions/${actionId}`,
    { method: 'PATCH', body: JSON.stringify(updates) }
  )
}

export async function deleteAction(
  cycleId: string,
  actionId: string
): Promise<{ deleted: boolean; action_id: string }> {
  return apiFetch<{ deleted: boolean; action_id: string }>(
    `/api/cycles/${cycleId}/actions/${actionId}`,
    { method: 'DELETE' }
  )
}
