import type { ScorecardCategory } from './scorecard.types'

export interface CycleTrend {
  cycle_label: string // e.g. "Q1 2025"
  quarter: string
  year: number
  scores: Record<ScorecardCategory, number>
}

export interface VendorTrend {
  vendor_id: string
  vendor_name: string
  cycles: CycleTrend[]
}

export interface RecurringIssue {
  issue_id: string
  vendor_id: string
  vendor_name: string
  description: string
  occurrences: number
  first_seen: string
  last_seen: string
  status: 'OPEN' | 'RESOLVED'
  cycles_affected: string[]
}

export interface LeadershipBrief {
  vendor_id: string
  vendor_name: string
  trajectory: 'improving' | 'stable' | 'declining'
  trajectory_summary: string
  recurring_issues: string[]
  prior_commitments: string[]
  recommended_focus: string[]
  generated_at: string
}

export interface RadarDataPoint {
  category: string
  current: number
  previous: number
}

export interface CrossVendorDataPoint {
  category: string
  novatech: number
  coresystems: number
  meridian: number
}
