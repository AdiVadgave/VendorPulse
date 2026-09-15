/**
 * API functions for the Scorecard module (Module B).
 * Scorecard collection is in-app (see the weighted / v2 helpers below); the form
 * link is emailed via the service mailbox (Microsoft Graph).
 */
import { apiFetch, apiFetchBlob } from './api'

// ── Types ───────────────────────────────────────────────────────────────────

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

// ── API calls ───────────────────────────────────────────────────────────────

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
  payload: {
    selected_measure_keys: string[]
    weights: Record<string, number>
    /** measure_key -> team names asked to score it ([] = nobody). */
    measure_teams?: Record<string, string[]>
  }
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

export interface ScorecardMeasureSummary {
  measure_key: string
  theme: string
  measure: string
  comment_count: number
  summary: string
}

export interface ScorecardCommentSummary {
  cycle_id: string
  measures: ScorecardMeasureSummary[]
  comment_count: number
  team_count: number
  llm_used: boolean
  generated_at: string
}

/** Per-measure LLM synthesis of the teams' scorecard comments (same wiring as Alignment/Vendor Prep). */
export async function getScorecardCommentSummary(cycleId: string): Promise<ScorecardCommentSummary> {
  return apiFetch<ScorecardCommentSummary>(`/api/scorecard/comment-summary/${cycleId}`, {
    method: 'POST',
  })
}

/** Download the two-sheet Excel export of the consolidated scorecard. */
export async function downloadScorecardExcel(cycleId: string): Promise<void> {
  const { blob, filename } = await apiFetchBlob(`/api/scorecard/export/${cycleId}`)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `SPR_Scorecard_${cycleId}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export interface InAppDispatchRecipient {
  attendee_id: string
  name: string
  email: string
  team?: string
}

/** Email the in-app scorecard form link to recipients via the service mailbox (Outlook) */
export async function dispatchInAppScorecard(payload: {
  cycle_id: string
  vendor_name: string
  quarter: string
  year: number
  form_base_url: string
  recipients: InAppDispatchRecipient[]
  /** True when re-sending after a mistake — reviewers get the correction notice. */
  reissue?: boolean
  /** Edited draft overrides ({{name}}/{{link}} substituted per recipient server-side). */
  subject_override?: string
  html_body_override?: string
  text_body_override?: string
}): Promise<DispatchResponse> {
  return apiFetch<DispatchResponse>('/api/scorecard/dispatch-inapp', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** The default scorecard dispatch email draft (subject + HTML) to seed an editable preview. */
export async function getScorecardDispatchPreview(
  cycleId: string,
  reissue = false,
): Promise<{ subject: string; html_body: string; text_body: string }> {
  return apiFetch(`/api/scorecard/dispatch-preview/${cycleId}`, { params: { reissue: String(reissue) } })
}

/**
 * Reopen scorecard collection after a mistake: discards all submissions and
 * clears the dispatched marker so the config can be edited and re-sent. Only the
 * newly-collected (latest) scorecard is then considered.
 */
export async function redoScorecard(cycleId: string): Promise<{ cycle_id: string; reopened: boolean }> {
  return apiFetch(`/api/scorecard/redo/${cycleId}`, { method: 'POST' })
}

export interface ScorecardBriefing {
  cycle_id: string
  overall_score: number | null
  trend: 'improving' | 'stable' | 'declining'
  most_improved: string | null
  most_concerning: string | null
  recurring_issue_count: number
  predicted_challenges: string[]
  has_previous_cycle: boolean
  team_count: number
}

/**
 * Pre-meeting trend briefing — computed live from this cycle's consolidated
 * scorecard and the previous cycle's. Nothing hardcoded.
 */
export async function getScorecardBriefing(cycleId: string): Promise<ScorecardBriefing> {
  return apiFetch<ScorecardBriefing>(`/api/scorecard/briefing/${cycleId}`)
}

/**
 * Delete an attendee's scorecard submission for a cycle. Re-opens the scorecard so
 * that attendee can fill it again; consolidated figures recompute automatically.
 */
export async function deleteScorecardSubmission(
  cycleId: string,
  attendeeId: string
): Promise<{ deleted: boolean; attendee_id: string; count: number }> {
  return apiFetch<{ deleted: boolean; attendee_id: string; count: number }>(
    `/api/scorecard/submission/${cycleId}/${attendeeId}`,
    { method: 'DELETE' }
  )
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
