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

/** Get real submission tracker for a cycle */
export async function getSubmissionTracker(
  cycleId: string
): Promise<import('@/types/scorecard.types').SubmissionTrackerData> {
  return apiFetch(`/api/scorecard/submissions/${cycleId}`)
}

/** Get compiled scorecard (Internal vs Vendor 2-column) for a cycle */
export async function getCompiledScorecard(
  cycleId: string
): Promise<import('@/types/scorecard.types').CompiledScorecard> {
  return apiFetch(`/api/scorecard/compiled/${cycleId}`)
}

// ── Weighted scorecard (v2 / in-app form) ────────────────────────────────────

import type {
  ScorecardFormMeta,
  ScorecardSubmissionPayload,
  WeightedScorecard,
  TeamSubmissionsData,
  ScorecardCatalogTheme,
  ScorecardConfig,
} from '@/types/scorecard.types'

// ── Per-SPR scorecard configuration (catalog + selection) ─────────────────────

/** The full catalog of themes/measures a VMO can choose from. */
export async function getScorecardCatalog(): Promise<ScorecardCatalogTheme[]> {
  const res = await apiFetch<{ catalog: ScorecardCatalogTheme[] }>('/api/scorecard/catalog')
  return res.catalog
}

/** The effective scorecard configuration for a cycle (measures + weights). */
export async function getScorecardConfig(cycleId: string): Promise<ScorecardConfig> {
  const res = await apiFetch<{ config: ScorecardConfig }>(`/api/scorecard/config/${cycleId}`)
  return res.config
}

/** Save the VMO's scorecard selection (measure keys + per-theme weights). */
export async function saveScorecardConfig(
  cycleId: string,
  payload: { selected_measure_keys: string[]; weights: Record<string, number> }
): Promise<ScorecardConfig> {
  const res = await apiFetch<{ config: ScorecardConfig }>(`/api/scorecard/config/${cycleId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  return res.config
}

/** Form metadata (vendor/quarter + structure + respondent identity) for the in-app scorecard page */
export async function getScorecardFormMeta(cycleId: string, attendeeId?: string): Promise<ScorecardFormMeta> {
  return apiFetch<ScorecardFormMeta>(`/api/scorecard/form-meta/${cycleId}`, {
    params: attendeeId ? { attendee: attendeeId } : undefined,
  })
}

/** Build the tokenless scorecard form link for a given attendee (used for dispatch + copy-link). */
export function buildScorecardLink(cycleId: string, attendeeId: string): string {
  return `${window.location.origin}/scorecard?cycle=${cycleId}&attendee=${attendeeId}`
}

/** Submit one team's in-app scorecard */
export async function submitScorecard(
  payload: ScorecardSubmissionPayload
): Promise<{ status: string; submission_id: string; submitted_at: string }> {
  return apiFetch('/api/scorecard/submit', { method: 'POST', body: JSON.stringify(payload) })
}

/** Real-time team submission tracker (key internal stakeholders) */
export async function getTeamSubmissions(cycleId: string): Promise<TeamSubmissionsData> {
  return apiFetch<TeamSubmissionsData>(`/api/scorecard/team-submissions/${cycleId}`)
}

/** Whether the given attendee has already submitted for this cycle (one submission per reviewer) */
export async function checkAlreadySubmitted(cycleId: string, attendeeId: string): Promise<boolean> {
  if (!attendeeId.trim()) return false
  try {
    const res = await apiFetch<{ submitted: boolean }>(
      `/api/scorecard/submitted-check/${cycleId}`,
      { params: { attendee: attendeeId.trim() } }
    )
    return res.submitted
  } catch {
    return false
  }
}

/** Compiled weighted scorecard (team columns + weighted overall) */
export async function getWeightedScorecard(cycleId: string): Promise<WeightedScorecard> {
  return apiFetch<WeightedScorecard>(`/api/scorecard/weighted/${cycleId}`)
}

export interface InAppDispatchRecipient {
  attendee_id: string
  name: string
  email: string
  team?: string
}

/** Email the in-app scorecard form link to recipients via Gmail */
export async function dispatchInAppScorecard(payload: {
  cycle_id: string
  vendor_name: string
  quarter: string
  year: number
  form_base_url: string
  recipients: InAppDispatchRecipient[]
}): Promise<DispatchResponse> {
  return apiFetch<DispatchResponse>('/api/scorecard/dispatch-inapp', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// ── Final (admin-adjusted) scorecard ─────────────────────────────────────────

export interface FinalScorecard {
  cycle_id: string
  categories: WeightedScorecard['categories']
  overall_score: number | null
  note?: string
  updated_at?: string
}

export async function getFinalScorecard(cycleId: string): Promise<FinalScorecard | null> {
  const res = await apiFetch<{ cycle_id: string; final: FinalScorecard | null }>(
    `/api/scorecard/final/${cycleId}`
  )
  return res.final ?? null
}

export async function saveFinalScorecard(
  cycleId: string,
  payload: { categories: WeightedScorecard['categories']; overall_score: number | null; note?: string }
): Promise<FinalScorecard> {
  const res = await apiFetch<{ status: string; final: FinalScorecard }>(
    `/api/scorecard/final/${cycleId}`,
    { method: 'POST', body: JSON.stringify(payload) }
  )
  return res.final
}

export async function resetFinalScorecard(cycleId: string): Promise<void> {
  await apiFetch(`/api/scorecard/final/${cycleId}`, { method: 'DELETE' })
}
