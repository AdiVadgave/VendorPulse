import { useState } from 'react'
import { Building2, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import {
  MOCK_VENDOR_TRENDS,
  MOCK_RECURRING_ISSUES,
  MOCK_RADAR_DATA,
  MOCK_CROSS_VENDOR_DATA,
  MOCK_LEADERSHIP_BRIEFS,
} from '@/mock/analytics.mock'
import type { ScorecardCategory } from '@/types/scorecard.types'
import { CATEGORY_LABELS, SCORECARD_CATEGORIES } from '@/types/scorecard.types'
import type { LeadershipBrief } from '@/types/analytics.types'
import TrendLineChart from '@/components/modules/analytics/TrendLineChart'
import RadarChartComponent from '@/components/modules/analytics/RadarChartComponent'
import CrossVendorComparison from '@/components/modules/analytics/CrossVendorComparison'
import RecurringIssueAlerts from '@/components/modules/analytics/RecurringIssueAlerts'
import LeadershipBriefCard from '@/components/modules/analytics/LeadershipBriefCard'
import { cn } from '@/utils/cn'

const VENDOR_OPTIONS = [
  { id: 'v1', name: 'NovaTech Services', trend: 'improving' as const },
  { id: 'v2', name: 'CoreSystems Ltd', trend: 'declining' as const },
  { id: 'v3', name: 'Meridian IT', trend: 'stable' as const },
]

const TREND_ICON = {
  improving: <TrendingUp size={12} className="text-emerald-500" />,
  declining: <TrendingDown size={12} className="text-red-500" />,
  stable: <Minus size={12} className="text-slate-400" />,
}

export default function Analytics() {
  const [selectedVendorId, setSelectedVendorId] = useState('v1')
  const [selectedCategory, setSelectedCategory] = useState<ScorecardCategory | 'ALL'>('ALL')
  const [leadershipBriefs, setLeadershipBriefs] = useState<Record<string, LeadershipBrief>>(
    MOCK_LEADERSHIP_BRIEFS
  )

  const selectedTrend = MOCK_VENDOR_TRENDS.find((t) => t.vendor_id === selectedVendorId)!
  const radarData = MOCK_RADAR_DATA[selectedVendorId]
  const vendorOption = VENDOR_OPTIONS.find((v) => v.id === selectedVendorId)!

  function handleGenerateBrief() {
    setLeadershipBriefs((prev) => ({
      ...prev,
      [selectedVendorId]: {
        ...MOCK_LEADERSHIP_BRIEFS[selectedVendorId],
        generated_at: new Date().toISOString(),
      },
    }))
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Analytics Dashboard</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Cross-cycle memory, trend analysis, and leadership briefing — Module F
          </p>
        </div>
      </div>

      {/* Vendor selector */}
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
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-700'
            )}
          >
            <Building2 size={13} />
            {v.name}
            {TREND_ICON[v.trend]}
          </button>
        ))}
      </div>

      {/* Category filter for trend chart */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          Category:
        </span>
        <button
          onClick={() => setSelectedCategory('ALL')}
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
            selectedCategory === 'ALL'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
          )}
        >
          All
        </button>
        {SCORECARD_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
              selectedCategory === cat
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            )}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <TrendLineChart trend={selectedTrend} selectedCategory={selectedCategory} />
        </div>
        <div>
          <RadarChartComponent data={radarData} vendorName={vendorOption.name} />
        </div>
      </div>

      {/* Cross-vendor */}
      <CrossVendorComparison data={MOCK_CROSS_VENDOR_DATA} />

      {/* Recurring issues + Leadership brief */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <RecurringIssueAlerts issues={MOCK_RECURRING_ISSUES} />
        <LeadershipBriefCard
          vendorId={selectedVendorId}
          vendorName={vendorOption.name}
          brief={leadershipBriefs[selectedVendorId] ?? null}
          onGenerate={handleGenerateBrief}
        />
      </div>
    </div>
  )
}
