import { useState } from 'react'
import { Building2, TrendingUp, TrendingDown, Minus, Users } from 'lucide-react'
import {
  MOCK_VENDOR_TRENDS,
  MOCK_RADAR_DATA,
  MOCK_CROSS_VENDOR_DATA,
  MOCK_LEADERSHIP_BRIEFS,
  MOCK_STAKEHOLDER_VS_VENDOR,
} from '@/mock/analytics.mock'
import type { ScorecardCategoryKey } from '@/types/scorecard.types'
import { CATEGORY_LABELS, SCORECARD_CATEGORIES } from '@/types/scorecard.types'
import TrendLineChart from '@/components/modules/analytics/TrendLineChart'
import CrossVendorComparison from '@/components/modules/analytics/CrossVendorComparison'
import CategoryScoreCards from '@/components/modules/analytics/CategoryScoreCards'
import StakeholderVendorGap from '@/components/modules/analytics/StakeholderVendorGap'
import { cn } from '@/utils/cn'

const VENDOR_OPTIONS = [
  { id: 'v1', name: 'NovaTech Services',  trend: 'improving' as const },
  { id: 'v2', name: 'CoreSystems Ltd',    trend: 'declining' as const },
  { id: 'v3', name: 'Meridian IT',        trend: 'stable'   as const },
]

const TREND_ICON = {
  improving: <TrendingUp   size={12} className="text-emerald-500" />,
  declining: <TrendingDown size={12} className="text-red-500"     />,
  stable:    <Minus        size={12} className="text-slate-400"   />,
}

const TRAJECTORY_CONFIG = {
  improving: { label: 'Improving', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-800' },
  declining: { label: 'Declining', color: 'text-red-600 dark:text-red-400',         bg: 'bg-red-50 dark:bg-red-950/40',         border: 'border-red-200 dark:border-red-800'         },
  stable:    { label: 'Stable',    color: 'text-slate-500 dark:text-slate-400',      bg: 'bg-slate-50 dark:bg-slate-800/40',      border: 'border-slate-200 dark:border-slate-700'      },
}

function overallScore(vendorId: string): number {
  const trend = MOCK_VENDOR_TRENDS.find((t) => t.vendor_id === vendorId)
  if (!trend) return 0
  const latest = trend.cycles[trend.cycles.length - 1]
  const vals = Object.values(latest.scores) as number[]
  return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2))
}

function overallScoreColor(score: number) {
  if (score >= 4.0) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 3.0) return 'text-blue-600 dark:text-blue-400'
  if (score >= 2.5) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

export default function Analytics() {
  const [selectedVendorId, setSelectedVendorId] = useState('v1')
  const [selectedCategory, setSelectedCategory] = useState<ScorecardCategoryKey | 'ALL'>('ALL')

  const selectedTrend   = MOCK_VENDOR_TRENDS.find((t) => t.vendor_id === selectedVendorId)!
  const gapData         = MOCK_STAKEHOLDER_VS_VENDOR[selectedVendorId]
  const vendorOption    = VENDOR_OPTIONS.find((v) => v.id === selectedVendorId)!
  const brief           = MOCK_LEADERSHIP_BRIEFS[selectedVendorId]
  const trajectory      = brief?.trajectory ?? 'stable'
  const trajectoryConf  = TRAJECTORY_CONFIG[trajectory]
  const overall         = overallScore(selectedVendorId)

  // Radar data retained for future use
  void MOCK_RADAR_DATA

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* ── Header ────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Analytics Dashboard</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Strategic vendor insights derived from scorecard data — trends, gaps, and decision support
        </p>
      </div>

      {/* ── Vendor selector ───────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          Vendor:
        </span>
        {VENDOR_OPTIONS.map((v) => (
          <button
            key={v.id}
            onClick={() => setSelectedVendorId(v.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border',
              selectedVendorId === v.id
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-700',
            )}
          >
            <Building2 size={13} />
            {v.name}
            {TREND_ICON[v.trend]}
          </button>
        ))}
      </div>

      {/* ── KPI summary row ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Overall score */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Overall Score</p>
          <p className={cn('text-3xl font-bold', overallScoreColor(overall))}>{overall}</p>
          <p className="text-xs text-slate-400 mt-0.5">out of 5.0 · Q1 2026</p>
        </div>

        {/* Trajectory */}
        <div className={cn('rounded-xl border p-4', trajectoryConf.bg, trajectoryConf.border)}>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Trajectory</p>
          <p className={cn('text-2xl font-bold flex items-center gap-2', trajectoryConf.color)}>
            {TREND_ICON[trajectory]}
            {trajectoryConf.label}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">5-cycle pattern</p>
        </div>
      </div>

      {/* ── Category score cards ──────────────────────────────────── */}
      <CategoryScoreCards trend={selectedTrend} />

      {/* ── Category filter for trend chart ──────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          Filter:
        </span>
        <button
          onClick={() => setSelectedCategory('ALL')}
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
            selectedCategory === 'ALL'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700',
          )}
        >
          All Categories
        </button>
        {SCORECARD_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
              selectedCategory === cat
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700',
            )}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* ── Trend chart ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <TrendLineChart trend={selectedTrend} selectedCategory={selectedCategory} />
        </div>
      </div>

      {/* ── Stakeholder vs Vendor gap ─────────────────────────────── */}
      <StakeholderVendorGap data={gapData} vendorName={vendorOption.name} />

      {/* ── Cross-vendor comparison ───────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Users size={14} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">All Vendors — Q1 2026</span>
        </div>
        <CrossVendorComparison data={MOCK_CROSS_VENDOR_DATA} />
      </div>
    </div>
  )
}
