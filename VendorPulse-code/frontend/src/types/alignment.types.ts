import type { ScorecardCategory } from './scorecard.types'

export interface ScoreDelta {
  category: ScorecardCategory
  current_avg: number
  previous_avg: number
  delta: number
  direction: 'up' | 'down' | 'flat'
  significant: boolean // delta >= 1
}

export interface AlignmentFlag {
  flag_id: string
  category: ScorecardCategory
  spread: number
  high_stakeholder: string
  high_score: number
  low_stakeholder: string
  low_score: number
  prompt_question: string
}

export interface FaceOffPosition {
  position_number: number
  client_name: string
  client_role: string
  vendor_name: string
  vendor_role: string
}

export interface ExtractedAction {
  action_id: string
  description: string
  owner: string
  due_date: string | null
  source: 'alignment' | 'vendor_prep' | 'meeting'
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED'
}
