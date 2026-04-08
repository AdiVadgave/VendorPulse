import type { ScorecardCategoryKey } from './scorecard.types'

/* ── Score Delta: category-level change vs previous cycle ──── */

export interface ScoreDelta {
  category: ScorecardCategoryKey
  current_avg: number
  previous_avg: number
  delta: number
  direction: 'up' | 'down' | 'flat'
  significant: boolean // delta >= 1
}

/* ── Parameter-level Stakeholder vs Vendor comparison ──────── */

export interface ParameterComparison {
  parameter_key: string
  parameter_label: string
  category: ScorecardCategoryKey
  category_label: string
  stakeholder_score: number
  vendor_score: number
  difference: number          // stakeholder - vendor (absolute)
  high_variance: boolean      // difference > 1
  low_score: boolean          // either score < 3
}

export interface CategoryComparison {
  category: ScorecardCategoryKey
  category_label: string
  stakeholder_avg: number
  vendor_avg: number
  difference: number
  parameters: ParameterComparison[]
}

/* ── AI-generated alignment insight ────────────────────────── */

export interface AlignmentInsight {
  insight_id: string
  type: 'needs_discussion' | 'significant_drop' | 'low_score' | 'high_variance' | 'positive_trend'
  category: ScorecardCategoryKey
  parameter_key?: string
  parameter_label?: string
  message: string
  severity: 'info' | 'warning' | 'critical'
}

/* ── Alignment Flag (stakeholder vs vendor score gap) ──────── */

export interface AlignmentFlag {
  flag_id: string
  category: ScorecardCategoryKey
  parameter_key?: string
  parameter_label?: string
  spread: number
  high_stakeholder: string     // "Stakeholder" or "Vendor"
  high_score: number
  low_stakeholder: string
  low_score: number
  prompt_question: string
}

/* ── Face-off Model ────────────────────────────────────────── */

export interface FaceOffPosition {
  position_number: number
  client_name: string
  client_role: string
  vendor_name: string
  vendor_role: string
}

/* ── Extracted Action Items ────────────────────────────────── */

export interface ExtractedAction {
  action_id: string
  description: string
  owner: string
  due_date: string | null
  source: 'alignment' | 'vendor_prep' | 'meeting'
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED'
}
