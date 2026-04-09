import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { VendorTrend } from '@/types/analytics.types'
import { SCORECARD_CATEGORIES, CATEGORY_LABELS } from '@/types/scorecard.types'
import type { ScorecardCategoryKey } from '@/types/scorecard.types'
import { cn } from '@/utils/cn'

interface Props {
  trend: VendorTrend
}

const CATEGORY_ACCENT: Record<ScorecardCategoryKey, { bg: string; text: string; border: string }> = {
  RISK_COMPLIANCE: { bg: 'bg-red-50 dark:bg-red-950/30',      text: 'text-red-600 dark:text-red-400',      border: 'border-red-200 dark:border-red-900' },
  PERFORMANCE:     { bg: 'bg-indigo-50 dark:bg-indigo-950/30', text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-200 dark:border-indigo-900' },
  COMMERCIAL:      { bg: 'bg-amber-50 dark:bg-amber-950/30',   text: 'text-amber-600 dark:text-amber-400',   border: 'border-amber-200 dark:border-amber-900' },
  RELATIONSHIP:    { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-900' },
}

function scoreColor(score: number) {
  if (score >= 4.0) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 3.0) return 'text-blue-600 dark:text-blue-400'
  if (score >= 2.5) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function scoreBadgeBg(score: number) {
  if (score >= 4.0) return 'bg-emerald-50 dark:bg-emerald-950/40'
  if (score >= 3.0) return 'bg-blue-50 dark:bg-blue-950/40'
  if (score >= 2.5) return 'bg-amber-50 dark:bg-amber-950/40'
  return 'bg-red-50 dark:bg-red-950/40'
}

export default function CategoryScoreCards({ trend }: Props) {
  const cycles = trend.cycles
  const current = cycles[cycles.length - 1]
  const previous = cycles[cycles.length - 2]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {SCORECARD_CATEGORIES.map((cat) => {
        const curr = current?.scores[cat] ?? 0
        const prev = previous?.scores[cat] ?? 0
        const delta = parseFloat((curr - prev).toFixed(2))
        const accent = CATEGORY_ACCENT[cat]

        return (
          <div
            key={cat}
            className={cn(
              'rounded-xl border p-4 flex flex-col gap-2',
              accent.bg,
              accent.border,
            )}
          >
            <p className={cn('text-xs font-semibold uppercase tracking-wide', accent.text)}>
              {CATEGORY_LABELS[cat]}
            </p>

            <div className="flex items-end justify-between">
              <span className={cn('text-3xl font-bold', scoreColor(curr), scoreBadgeBg(curr), 'px-1 rounded')}>
                {curr.toFixed(2)}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">/ 5</span>
            </div>

            <div className="flex items-center gap-1">
              {delta > 0 ? (
                <TrendingUp size={13} className="text-emerald-500" />
              ) : delta < 0 ? (
                <TrendingDown size={13} className="text-red-500" />
              ) : (
                <Minus size={13} className="text-slate-400" />
              )}
              <span
                className={cn(
                  'text-xs font-medium',
                  delta > 0 ? 'text-emerald-600 dark:text-emerald-400' :
                  delta < 0 ? 'text-red-600 dark:text-red-400' :
                  'text-slate-400',
                )}
              >
                {delta > 0 ? '+' : ''}{delta.toFixed(2)} vs Q4 2025
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
