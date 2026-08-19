/**
 * Typed API for the portfolio analytics (Module F) — REAL data computed on the
 * backend from stored cycles + scorecard submissions (no mock/dummy data).
 */
import { apiFetch } from './api'

export interface AnalyticsCyclePoint {
  cycle_id: string
  label: string
  quarter: string
  year: number
  overall_score: number | null
  themes: Record<string, number>
  team_count: number
  workflow_state: string
}

export type Trajectory = 'improving' | 'declining' | 'stable' | 'n/a'

export interface AnalyticsVendor {
  vendor_id: string
  vendor_name: string
  cycles: AnalyticsCyclePoint[]
  latest: AnalyticsCyclePoint
  previous_label: string | null
  trajectory: Trajectory
  delta: number | null
}

export interface PortfolioAnalytics {
  vendors: AnalyticsVendor[]
  themes: string[]
  kpis: {
    vendors_tracked: number
    avg_overall: number | null
    improving: number
    declining: number
    stable: number
    cycles_scored: number
  }
}

export async function getPortfolioAnalytics(): Promise<PortfolioAnalytics> {
  return apiFetch<PortfolioAnalytics>('/api/analytics/portfolio')
}
