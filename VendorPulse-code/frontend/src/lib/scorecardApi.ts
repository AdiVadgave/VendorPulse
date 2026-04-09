/**
 * API functions for the Scorecard module (Module B).
 * Handles email dispatch via Gmail and Google Forms response polling.
 */
import { apiFetch } from './api'

// ── Types ───────────────────────────────────────────────────────────────────

export interface AttendeeEmail {
  name: string
  email: string
}

export interface DispatchRequest {
  cycle_id: string
  vendor_name: string
  quarter: string
  year: number
  attendees: AttendeeEmail[]
  form_url?: string
}

export interface DispatchResult {
  attendee: string
  email: string
  status: 'sent' | 'failed'
  message_id: string | null
  error: string | null
}

export interface DispatchResponse {
  total: number
  sent: number
  failed: number
  results: DispatchResult[]
}

export interface PollResponse {
  total: number
  new: number
  responses: FormResponse[]
}

export interface FormResponse {
  response_id: string
  submitted_at: string
  email?: string
  vendor_name?: string
  cycle_id?: string
  DELIVERY_TIMELINESS?: string
  QUALITY_OF_DELIVERY?: string
  SLA_ADHERENCE?: string
  RESOURCE_CAPABILITY?: string
  OPERATIONAL_EFFICIENCY?: string
  RELEASE_PATCH_MGMT?: string
  SECURITY_RISK_MGMT?: string
  AUDIT_COMPLIANCE?: string
  PRICING_COMPETITIVENESS?: string
  CONTRACT_COMPLIANCE?: string
  COST_CONTROL?: string
  BILLING_ACCURACY?: string
  COMMUNICATION_EFFECTIVENESS?: string
  STAKEHOLDER_ENGAGEMENT?: string
  RESPONSIVENESS?: string
  COLLABORATION_ALIGNMENT?: string
  [key: string]: string | undefined
}

export interface CycleResponsesResult {
  cycle_id: string
  count: number
  responses: FormResponse[]
}

export interface GoogleAuthStatus {
  authenticated: boolean
}

// ── API calls ───────────────────────────────────────────────────────────────

/** Check if Google OAuth is connected */
export async function checkGoogleAuth(): Promise<GoogleAuthStatus> {
  try {
    return await apiFetch<GoogleAuthStatus>('/auth/google/status')
  } catch {
    return { authenticated: false }
  }
}

/** Dispatch scorecard emails to key attendees via Gmail */
export async function dispatchScorecardEmails(
  payload: DispatchRequest
): Promise<DispatchResponse> {
  return apiFetch<DispatchResponse>('/api/scorecard/dispatch', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** Poll Google Forms for new scorecard responses */
export async function pollFormResponses(): Promise<PollResponse> {
  return apiFetch<PollResponse>('/api/scorecard/poll', {
    method: 'POST',
  })
}

/** Get stored responses for a specific cycle */
export async function getCycleResponses(
  cycleId: string
): Promise<CycleResponsesResult> {
  return apiFetch<CycleResponsesResult>(`/api/scorecard/responses/${cycleId}`)
}
