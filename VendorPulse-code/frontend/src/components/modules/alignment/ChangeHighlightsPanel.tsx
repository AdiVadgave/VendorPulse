import { TrendingUp, TrendingDown, Minus, Sparkles, AlertTriangle, Info, CheckCircle2 } from 'lucide-react'
import type { ScoreDelta, AlignmentInsight } from '@/types/alignment.types'
import { CATEGORY_LABELS } from '@/types/scorecard.types'
import { cn } from '@/utils/cn'

interface Props {
  deltas: ScoreDelta[]
  whatChangedBullets: string[]
  insights?: AlignmentInsight[]
}

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertTriangle,
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    iconColor: 'text-red-600 dark:text-red-400',
    textColor: 'text-red-800 dark:text-red-300',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    iconColor: 'text-amber-600 dark:text-amber-400',
    textColor: 'text-amber-800 dark:text-amber-300',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  info: {
    icon: Info,
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    iconColor: 'text-blue-600 dark:text-blue-400',
    textColor: 'text-blue-800 dark:text-blue-300',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
}

export default function ChangeHighlightsPanel({ deltas, whatChangedBullets, insights }: Props) {
  const significant = deltas.filter((d) => d.significant)

  return (
    <div className="space-y-4">
      {/* AI Summary */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 bg-amber-50 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
            <Sparkles size={14} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">What Changed — AI Summary</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Generated from score diff vs previous cycle</p>
          </div>
        </div>
        <ul className="space-y-2">
          {whatChangedBullets.map((bullet, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
              <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                {i + 1}
              </span>
              {bullet}
            </li>
          ))}
        </ul>
      </div>

      {/* Score deltas table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Category Score Comparison vs Previous Cycle
          </h3>
          {significant.length > 0 && (
            <span className="text-xs bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
              {significant.length} significant change{significant.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {deltas.map((delta) => {
            const Icon =
              delta.direction === 'up' ? TrendingUp :
              delta.direction === 'down' ? TrendingDown : Minus
            const iconColor =
              delta.direction === 'up' ? 'text-emerald-500' :
              delta.direction === 'down' ? 'text-red-500' : 'text-slate-400'
            const deltaColor =
              delta.direction === 'up'
                ? 'text-emerald-600 dark:text-emerald-400'
                : delta.direction === 'down'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-400'

            return (
              <div
                key={delta.category}
                className={cn(
                  'px-5 py-3.5 flex items-center gap-4',
                  delta.significant && 'bg-amber-50/40 dark:bg-amber-900/10'
                )}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {CATEGORY_LABELS[delta.category]}
                    </p>
                    {delta.significant && (
                      <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">
                        Significant
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-slate-400 dark:text-slate-500">Previous</p>
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                      {delta.previous_avg.toFixed(1)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Icon size={16} className={iconColor} />
                    <span className={cn('text-sm font-bold', deltaColor)}>
                      {delta.direction !== 'flat' ? (delta.direction === 'up' ? '+' : '') : ''}
                      {delta.delta.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400 dark:text-slate-500">Current</p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {delta.current_avg.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* AI Insights */}
      {insights && insights.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <Sparkles size={15} className="text-indigo-500" />
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              AI-Generated Insights
            </h3>
            <span className="ml-auto text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 px-2 py-0.5 rounded-full font-medium">
              {insights.length} insight{insights.length > 1 ? 's' : ''}
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {insights.map((insight) => {
              const config = SEVERITY_CONFIG[insight.severity]
              const SeverityIcon = config.icon

              return (
                <div
                  key={insight.insight_id}
                  className={cn('px-5 py-3 flex items-start gap-3', config.bg)}
                >
                  <div className={cn('mt-0.5 shrink-0', config.iconColor)}>
                    {insight.type === 'positive_trend' ? (
                      <CheckCircle2 size={15} />
                    ) : (
                      <SeverityIcon size={15} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm leading-relaxed', config.textColor)}>
                      {insight.message}
                    </p>
                  </div>
                  <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium shrink-0', config.badge)}>
                    {insight.severity}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
