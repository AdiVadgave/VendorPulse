/**
 * Typed API for vendor pushback persistence (Module D).
 * Items + their AI-drafted responses are stored per-cycle so state survives refresh.
 */
import { apiFetch } from './api'
import type { PushbackItem, PushbackResponse, PushbackCategory } from '@/types/vendor-prep.types'

export interface PushbackItemWithResponses extends PushbackItem {
  responses: PushbackResponse[]
}

export async function getPushback(
  cycleId: string
): Promise<{ items: PushbackItemWithResponses[]; count: number }> {
  return apiFetch(`/api/cycles/${cycleId}/pushback`)
}

export async function addPushback(
  cycleId: string,
  body: {
    category: PushbackCategory
    description: string
    raised_by: string
    needs_legal_review: boolean
    status?: PushbackItem['status']
  }
): Promise<{ item: PushbackItemWithResponses }> {
  return apiFetch(`/api/cycles/${cycleId}/pushback`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updatePushbackStatus(
  cycleId: string,
  pushbackId: string,
  status: PushbackItem['status']
): Promise<{ item: PushbackItem }> {
  return apiFetch(`/api/cycles/${cycleId}/pushback/${pushbackId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

/** Edit a pushback item's fields (category / description / raised_by / legal flag / status). */
export async function updatePushback(
  cycleId: string,
  pushbackId: string,
  patch: Partial<Pick<PushbackItem, 'category' | 'description' | 'raised_by' | 'needs_legal_review' | 'status'>>
): Promise<{ item: PushbackItem }> {
  return apiFetch(`/api/cycles/${cycleId}/pushback/${pushbackId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export async function deletePushback(cycleId: string, pushbackId: string): Promise<{ deleted: boolean }> {
  return apiFetch(`/api/cycles/${cycleId}/pushback/${pushbackId}`, { method: 'DELETE' })
}

/** Persist the full drafted response set for a pushback item (replaces any prior set). */
export async function savePushbackResponses(
  cycleId: string,
  pushbackId: string,
  responses: { stance: PushbackResponse['stance']; content: string; is_selected?: boolean }[]
): Promise<{ pushback_id: string; responses: PushbackResponse[] }> {
  return apiFetch(`/api/cycles/${cycleId}/pushback/${pushbackId}/responses`, {
    method: 'PUT',
    body: JSON.stringify({ responses }),
  })
}

export async function selectPushbackResponse(
  cycleId: string,
  pushbackId: string,
  responseId: string
): Promise<{ selected_response_id: string }> {
  return apiFetch(`/api/cycles/${cycleId}/pushback/${pushbackId}/responses/${responseId}/select`, {
    method: 'POST',
  })
}
