import { useState } from 'react'
import { BarChart3, AlertTriangle, ArrowDown, ChevronDown, ChevronRight } from 'lucide-react'
import type { CategoryComparison } from '@/types/alignment.types'
import { cn } from '@/utils/cn'

interface Props {
  comparisons: CategoryComparison[]
}

function ScoreBar({ score, color, label }: { score: number; color: string; label: string }) {
  const pct = (score / 5) * 100
  return (
    <div className="flex items-center gap-2 flex-1">
      <span className={cn('text-xs font-medium w-16 text-right', color)}>{label}</span>
      <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            label === 'Stakeholder'
              ? 'bg-blue-500 dark:bg-blue-600'
              : 'bg-orange-500 dark:bg-orange-600'
          )}
          style={{ width: `${pct}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow-sm">
          {score.toFixed(1)}
        </span>
      </div>
    </div>
  )
}

export default function ScoreComparisonPanel({ comparisons }: Props) {
  const [panelOpen, setPanelOpen] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const hasFlags = comparisons.some((c) =>
    c.parameters.some((p) => p.high_variance || p.low_score)
  )

  function toggle(category: string) {
    setExpanded((prev) => ({ ...prev, [category]: !prev[category] }))
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className="w-full px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
      >
        <BarChart3 size={15} className="text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Internal Stakeholder vs Vendor — Score Comparison
        </h3>
        <span className="ml-auto flex items-center gap-2">
          {hasFlags && (
            <span className="text-xs bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
              Discrepancies found
            </span>
          )}
          <span className="text-slate-400 dark:text-slate-500">
            {panelOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </span>
      </button>

      {panelOpen && <>
      {/* Legend */}
      <div className="px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-6 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-blue-500" />
          <span>Internal Stakeholder (Shell)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-orange-500" />
          <span>Vendor</span>
        </div>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {comparisons.map((cat) => {
          const isOpen = !!expanded[cat.category]
          const flaggedCount = cat.parameters.filter((p) => p.high_variance || p.low_score).length

          return (
            <div key={cat.category}>
              {/* Category summary row */}
              <button
                onClick={() => toggle(cat.category)}
                className="w-full px-5 py-4 flex items-center gap-4 hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors text-left"
              >
                <div className="text-slate-400 dark:text-slate-500 shrink-0">
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>

                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex-1">
                  {cat.category_label}
                </h4>

                {flaggedCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                    <AlertTriangle size={12} />
                    {flaggedCount} issue{flaggedCount > 1 ? 's' : ''}
                  </span>
                )}

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-center min-w-[4rem]">
                    <p className="text-xs text-blue-500 dark:text-blue-400 font-medium">Stakeholder</p>
                    <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{cat.stakeholder_avg.toFixed(1)}</p>
                  </div>
                  <span className="text-slate-300 dark:text-slate-600 text-xs">vs</span>
                  <div className="text-center min-w-[4rem]">
                    <p className="text-xs text-orange-500 dark:text-orange-400 font-medium">Vendor</p>
                    <p className="text-lg font-bold text-orange-700 dark:text-orange-400">{cat.vendor_avg.toFixed(1)}</p>
                  </div>

                  <span className={cn(
                    'text-xs font-bold px-2 py-1 rounded min-w-[3.5rem] text-center',
                    cat.difference > 1
                      ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                      : cat.difference > 0
                        ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                  )}>
                    {cat.difference === 0 ? 'Aligned' : `\u0394 ${cat.difference.toFixed(2)}`}
                  </span>
                </div>
              </button>

              {/* Expandable parameter details */}
              {isOpen && (
                <div className="px-5 pb-4 pl-12 space-y-2">
                  {cat.parameters.map((param) => (
                    <div
                      key={param.parameter_key}
                      className={cn(
                        'rounded-lg px-3 py-2.5',
                        param.high_variance && 'bg-red-50/50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30',
                        param.low_score && !param.high_variance && 'bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30',
                        !param.high_variance && !param.low_score && 'bg-slate-50/50 dark:bg-slate-800/30'
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            {param.parameter_label}
                          </p>
                          {param.high_variance && (
                            <span className="flex items-center gap-0.5 text-xs text-red-600 dark:text-red-400 font-medium">
                              <AlertTriangle size={11} />
                              High variance
                            </span>
                          )}
                          {param.low_score && (
                            <span className="flex items-center gap-0.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                              <ArrowDown size={11} />
                              Low score
                            </span>
                          )}
                        </div>
                        <span className={cn(
                          'text-xs font-bold px-1.5 py-0.5 rounded',
                          param.difference > 1
                            ? 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30'
                            : param.difference > 0
                              ? 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800'
                              : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                        )}>
                          {param.difference === 0 ? 'Aligned' : `\u0394 ${param.difference.toFixed(1)}`}
                        </span>
                      </div>

                      <div className="flex gap-3">
                        <ScoreBar
                          score={param.stakeholder_score}
                          color="text-blue-600 dark:text-blue-400"
                          label="Stakeholder"
                        />
                        <ScoreBar
                          score={param.vendor_score}
                          color="text-orange-600 dark:text-orange-400"
                          label="Vendor"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      </>}
    </div>
  )
}
