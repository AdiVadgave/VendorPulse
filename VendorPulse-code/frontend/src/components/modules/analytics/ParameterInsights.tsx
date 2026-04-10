import { AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { ParameterInsight } from '@/types/analytics.types'
import { cn } from '@/utils/cn'

interface Props {
  insights: ParameterInsight[]
  vendorName: string
}

function GapIndicator({ gap }: { gap: number }) {
  if (gap > 0.5) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
        <TrendingUp size={12} />
        Vendor +{gap.toFixed(1)} above stakeholder
      </span>
    )
  }
  if (gap < -0.5) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
        <TrendingDown size={12} />
        Stakeholder +{Math.abs(gap).toFixed(1)} above vendor
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs text-slate-400">
      <Minus size={12} />
      Aligned
    </span>
  )
}

function ScoreDot({ score }: { score: number }) {
  const color =
    score >= 4.5 ? 'bg-emerald-500' :
    score >= 3.5 ? 'bg-blue-500' :
    score >= 2.5 ? 'bg-amber-500' :
    'bg-red-500'
  return (
    <span
      className={cn('inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-xs font-bold', color)}
    >
      {score}
    </span>
  )
}

export default function ParameterInsights({ insights, vendorName }: Props) {
  // Sort by absolute gap descending, then by average ascending (low performers first)
  const sorted = [...insights].sort((a, b) => {
    const gapDiff = Math.abs(b.gap) - Math.abs(a.gap)
    if (gapDiff !== 0) return gapDiff
    return a.average - b.average
  })

  const lowPerformers = sorted.filter((i) => i.average < 3.0)
  const gapAlerts     = sorted.filter((i) => Math.abs(i.gap) >= 1 && i.average >= 3.0)

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Parameter-Level Insights
        </h3>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {vendorName} — Q1 2026 · Flags low performers and vendor/stakeholder perception gaps
        </p>
      </div>

      {lowPerformers.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle size={13} className="text-red-500" />
            <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">
              Low Performers (avg &lt; 3.0)
            </span>
          </div>
          <div className="space-y-2">
            {lowPerformers.map((insight) => (
              <ParameterRow key={insight.parameter_key} insight={insight} />
            ))}
          </div>
        </div>
      )}

      {gapAlerts.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle size={13} className="text-amber-500" />
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
              Perception Gaps (|gap| ≥ 1.0)
            </span>
          </div>
          <div className="space-y-2">
            {gapAlerts.map((insight) => (
              <ParameterRow key={insight.parameter_key} insight={insight} />
            ))}
          </div>
        </div>
      )}

      {lowPerformers.length === 0 && gapAlerts.length === 0 && (
        <p className="text-sm text-slate-400 dark:text-slate-500 italic">
          No critical flags — all parameters above threshold and vendor/stakeholder scores aligned.
        </p>
      )}
    </div>
  )
}

function ParameterRow({ insight }: { insight: ParameterInsight }) {
  const CATEGORY_PILL_CLASS: Record<string, string> = {
    'Risk & Compliance': 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400',
    'Performance':       'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400',
    'Commercial':        'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
    'Relationship':      'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
  }
  const pill = CATEGORY_PILL_CLASS[insight.category_label] ?? 'bg-slate-100 text-slate-600'

  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
            {insight.parameter_label}
          </span>
          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', pill)}>
            {insight.category_label}
          </span>
        </div>
        <div className="mt-0.5">
          <GapIndicator gap={insight.gap} />
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-center">
          <ScoreDot score={insight.vendor_score} />
          <p className="text-[9px] text-slate-400 mt-0.5">Vendor</p>
        </div>
        <div className="text-center">
          <ScoreDot score={insight.stakeholder_score} />
          <p className="text-[9px] text-slate-400 mt-0.5">Stakeh.</p>
        </div>
      </div>
    </div>
  )
}

