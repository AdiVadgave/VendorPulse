export type ScorecardCategory =
  | 'DELIVERY_QUALITY'
  | 'SLA_COMPLIANCE'
  | 'INNOVATION'
  | 'COMMUNICATION'
  | 'VALUE_FOR_MONEY'

export const CATEGORY_LABELS: Record<ScorecardCategory, string> = {
  DELIVERY_QUALITY: 'Delivery Quality',
  SLA_COMPLIANCE: 'SLA Compliance',
  INNOVATION: 'Innovation',
  COMMUNICATION: 'Communication',
  VALUE_FOR_MONEY: 'Value for Money',
}

export const SCORECARD_CATEGORIES: ScorecardCategory[] = [
  'DELIVERY_QUALITY',
  'SLA_COMPLIANCE',
  'INNOVATION',
  'COMMUNICATION',
  'VALUE_FOR_MONEY',
]

export type SubmissionStatus = 'PENDING' | 'SUBMITTED' | 'INVALID' | 'CORRECTED'

export interface ScorecardEntry {
  scorecard_id: string
  cycle_id: string
  stakeholder_id: string
  stakeholder_name: string
  category: ScorecardCategory
  score: number
  comment: string
  is_valid: boolean
  validation_flags: string[]
  submitted_at: string | null
}

export interface StakeholderSubmission {
  stakeholder_id: string
  stakeholder_name: string
  role: string
  organisation: string
  status: SubmissionStatus
  submitted_at: string | null
  reminders_sent: number
  last_reminder: string | null
}

export interface CompiledScore {
  category: ScorecardCategory
  scores: { stakeholder_id: string; stakeholder_name: string; score: number; is_outlier: boolean }[]
  average: number
  std_dev: number
  min: number
  max: number
}
