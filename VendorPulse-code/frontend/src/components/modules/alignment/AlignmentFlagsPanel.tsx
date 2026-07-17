import { useState } from 'react'
import { AlertTriangle, HelpCircle, ChevronDown, ChevronRight } from 'lucide-react'
import type { AlignmentFlag } from '@/types/alignment.types'
import type { ScorecardCategoryKey } from '@/types/scorecard.types'
import { CATEGORY_LABELS } from '@/types/scorecard.types'
import { cn } from '@/utils/cn'

interface Props {
  flags: AlignmentFlag[]
}

interface CategoryGroup {
  category: ScorecardCategoryKey
  label: string
  maxSpread: number
  flags: AlignmentFlag[]
}

export default function AlignmentFlagsPanel({ flags }: Props) {
  const [panelOpen, setPanelOpen] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  if (flags.length === 0) {
    return (
      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 text-center">
        <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
          No alignment flags — internal teams are aligned on the scores.
        </p>
      </div>
    )
  }

  // Group flags by category
  const groupMap = new Map<ScorecardCategoryKey, AlignmentFlag[]>()
  for (const flag of flags) {
    const list = groupMap.get(flag.category) ?? []
    list.push(flag)
    groupMap.set(flag.category, list)
  }

  const groups: CategoryGroup[] = Array.from(groupMap.entries()).map(([cat, catFlags]) => {
    return {
      category: cat,
      label: CATEGORY_LABELS[cat],
      maxSpread: Math.max(...catFlags.map((f) => f.spread)),
      flags: catFlags,
    }
  }).sort((a, b) => b.maxSpread - a.maxSpread)

  function toggle(category: string) {
    setExpanded((prev) => ({ ...prev, [category]: !prev[category] }))
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className="w-full px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
      >
        <span className="text-slate-400 dark:text-slate-500 shrink-0">
          {panelOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <AlertTriangle size={15} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Alignment Flags — Cross-Team Score Divergence
        </h3>
        <span className="ml-auto flex items-center gap-2">
          <span className="text-xs bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
            {flags.length} flag{flags.length > 1 ? 's' : ''} across {groups.length} categor{groups.length > 1 ? 'ies' : 'y'}
          </span>
        </span>
      </button>

      {panelOpen && <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {groups.map((group) => {
          const isOpen = !!expanded[group.category]

          return (
            <div key={group.category}>
              {/* Category summary row */}
              <button
                onClick={() => toggle(group.category)}
                className="w-full px-5 py-4 flex items-center gap-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors text-left"
              >
                <div className="text-slate-400 dark:text-slate-500 shrink-0">
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>

                <div className="w-8 h-8 bg-amber-50 dark:bg-amber-900/20 rounded-lg flex items-center justify-center shrink-0">
                  <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400" />
                </div>

                <div className="flex-1">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {group.label}
                  </span>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {group.flags.length} parameter{group.flags.length > 1 ? 's' : ''} flagged
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 px-2 py-0.5 rounded font-medium">
                    Max gap: {group.maxSpread.toFixed(1)} pts
                  </span>
                </div>
              </button>

              {/* Expandable parameter-level details */}
              {isOpen && (
                <div className="px-5 pb-4 pl-14 space-y-3">
                  {group.flags.map((flag) => (
                    <div key={flag.flag_id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {flag.parameter_label ?? CATEGORY_LABELS[flag.category]}
                        </span>
                        <span className="text-xs bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 px-1.5 py-0.5 rounded font-medium">
                          Gap: {flag.spread.toFixed(1)} pts
                        </span>
                      </div>

                      {flag.team_scores && flag.team_scores.length > 0 ? (
                        // Cross-team divergence: show every team that scored this
                        // measure, with the highest rater(s) blue and the lowest orange.
                        <div className="flex flex-wrap gap-2 mb-3">
                          {flag.team_scores.map((t, i) => {
                            const isHigh = t.score === flag.high_score
                            const isLow = t.score === flag.low_score
                            return (
                              <div
                                key={`${t.label}-${i}`}
                                className={cn(
                                  'min-w-[92px] flex-1 rounded-lg border px-3 py-1.5 text-center',
                                  isHigh
                                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                                    : isLow
                                      ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
                                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                                )}
                              >
                                <p
                                  className={cn(
                                    'text-xs font-medium truncate',
                                    isHigh ? 'text-blue-600 dark:text-blue-400'
                                      : isLow ? 'text-orange-600 dark:text-orange-400'
                                        : 'text-slate-600 dark:text-slate-400'
                                  )}
                                  title={t.label}
                                >
                                  {t.label}
                                </p>
                                <p
                                  className={cn(
                                    'text-lg font-bold',
                                    isHigh ? 'text-blue-700 dark:text-blue-400'
                                      : isLow ? 'text-orange-700 dark:text-orange-400'
                                        : 'text-slate-700 dark:text-slate-300'
                                  )}
                                >
                                  {t.score}
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        // Legacy Stakeholder-vs-Vendor flags (two sides).
                        <div className="flex items-center gap-3 mb-3">
                          <div className="flex-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-1.5 text-center">
                            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">{flag.high_stakeholder}</p>
                            <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{flag.high_score}</p>
                          </div>
                          <span className="text-slate-400 dark:text-slate-500 text-xs font-medium">vs</span>
                          <div className="flex-1 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg px-3 py-1.5 text-center">
                            <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">{flag.low_stakeholder}</p>
                            <p className="text-lg font-bold text-orange-700 dark:text-orange-400">{flag.low_score}</p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-start gap-2 p-2.5 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
                        <HelpCircle size={13} className="text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-indigo-800 dark:text-indigo-300 leading-relaxed">
                          {flag.prompt_question}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>}
    </div>
  )
}
