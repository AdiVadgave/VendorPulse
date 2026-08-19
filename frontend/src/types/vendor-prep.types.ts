export type PushbackCategory =
  | 'DATA_DISPUTE'
  | 'PROCESS_CONCERN'
  | 'RESOURCE_CONSTRAINT'
  | 'SCOPE_DISAGREEMENT'
  | 'OTHER'

export const PUSHBACK_CATEGORY_LABELS: Record<PushbackCategory, string> = {
  DATA_DISPUTE: 'Data Dispute',
  PROCESS_CONCERN: 'Process Concern',
  RESOURCE_CONSTRAINT: 'Resource Constraint',
  SCOPE_DISAGREEMENT: 'Scope Disagreement',
  OTHER: 'Other',
}

export interface VendorBrief {
  overall_score: number
  overall_trend: 'improving' | 'declining' | 'stable'
  category_ratings: {
    category: string
    score: number
    rationale: string
    trend: 'up' | 'down' | 'flat'
  }[]
  key_concerns: string[]
  positive_areas: string[]
  open_actions: number
  generated_at: string
}

export interface PushbackItem {
  pushback_id: string
  cycle_id: string
  category: PushbackCategory
  description: string
  raised_by: string
  needs_legal_review: boolean
  status: 'OPEN' | 'RESOLVED' | 'ESCALATED'
  created_at: string
}

export interface PushbackResponse {
  response_id: string
  pushback_id: string
  stance: 'factual' | 'neutral' | 'escalation'
  content: string
  is_selected: boolean
}
