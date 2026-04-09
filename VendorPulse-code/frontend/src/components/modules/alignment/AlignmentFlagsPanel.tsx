import { useState } from 'react'
import { AlertTriangle, HelpCircle, ChevronDown, ChevronRight } from 'lucide-react'
import type { AlignmentFlag } from '@/types/alignment.types'
import type { ScorecardCategoryKey } from '@/types/scorecard.types'
import { CATEGORY_LABELS } from '@/types/scorecard.types'

interface Props {
  flags: AlignmentFlag[]
}

interface CategoryGroup {
  category: ScorecardCategoryKey
  label: string
  maxSpread: number
  flags: AlignmentFlag[]
  avgStakeholder: number
  avgVendor: number
}

export default function AlignmentFlagsPanel({ flags }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  if (flags.length === 0) {
    return (
      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 text-center">
        <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
          No alignment flags — Stakeholder and Vendor scores are within acceptable range.
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
    const highScores = catFlags.map((f) => f.high_score)
    const lowScores = catFlags.map((f) => f.low_score)
    return {
      category: cat,
      label: CATEGORY_LABELS[cat],
      maxSpread: Math.max(...catFlags.map((f) => f.spread)),
      flags: catFlags,
      avgStakeholder: catFlags.reduce((s, f) => s + (f.high_stakeholder === 'Stakeholder' ? f.high_score : f.low_score), 0) / catFlags.length,
      avgVendor: catFlags.reduce((s, f) => s + (f.high_stakeholder === 'Vendor' ? f.high_score : f.low_score), 0) / catFlags.length,
    }
  }).sort((a, b) => b.maxSpread - a.maxSpread)

  function toggle(category: string) {
    setExpanded((prev) => ({ ...prev, [category]: !prev[category] }))
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
        <AlertTriangle size={15} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Alignment Flags — Internal Stakeholder vs Vendor Gaps
        </h3>
        <span className="ml-auto text-xs bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
          {flags.length} flag{flags.length > 1 ? 's' : ''} across {groups.length} categor{groups.length > 1 ? 'ies' : 'y'}
        </span>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
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
                  {/* Stakeholder vs Vendor at category level */}
                  <div className="flex items-center gap-2">
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-2.5 py-1.5 text-center min-w-[4.5rem]">
                      <p className="text-[10px] text-blue-500 dark:text-blue-400 font-medium">Stakeholder</p>
                      <p className="text-base font-bold text-blue-700 dark:text-blue-400">{group.avgStakeholder.toFixed(1)}</p>
                    </div>
                    <span className="text-slate-300 dark:text-slate-600 text-xs">vs</span>
                    <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg px-2.5 py-1.5 text-center min-w-[4.5rem]">
                      <p className="text-[10px] text-orange-500 dark:text-orange-400 font-medium">Vendor</p>
                      <p className="text-base font-bold text-orange-700 dark:text-orange-400">{group.avgVendor.toFixed(1)}</p>
                    </div>
                  </div>

                  <span className="text-xs bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 px-1.5 py-0.5 rounded font-medium">
                    Max gap: 0.5 pts
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
      </div>
    </div>
  )
}
