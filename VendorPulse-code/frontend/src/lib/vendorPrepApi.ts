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
