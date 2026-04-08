import { TrendingUp, CheckCircle2 } from 'lucide-react'
import type { CompiledCategoryScore } from '@/types/scorecard.types'
import { cn } from '@/utils/cn'

interface Props {
  scores: CompiledCategoryScore[]
}

function scoreColor(score: number) {
  if (score >= 4.5) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 3.5) return 'text-blue-600 dark:text-blue-400'
  if (score >= 2.5) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function avgBg(value: number) {
  if (value >= 4.5) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
  if (value >= 3.5) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
  if (value >= 2.5) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
}

function AvgCell({ value }: { value: number }) {
  return (
    <span className={cn('inline-flex items-center justify-center px-2 py-0.5 rounded font-semibold text-sm min-w-[3rem]', avgBg(value))}>
      {value.toFixed(2)}
    </span>
  )
}

export default function CompiledScorecardTable({ scores }: Props) {
  // Gather unique stakeholder names from the first parameter of the first category
  const stakeholders = scores[0]?.parameters[0]?.scores.map((s) => ({
    id: s.stakeholder_id,
    name: s.stakeholder_name,
  })) ?? []

  const submitterCount = stakeholders.length

  // Overall average = average of all category averages
  const overallAvg = scores.length > 0
    ? scores.reduce((sum, c) => sum + c.category_average, 0) / scores.length
    : 0

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <CheckCircle2 size={15} className="text-emerald-500" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Compiled Scorecard
          </h3>
          <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
            {submitterCount} submitter{submitterCount !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50">
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 w-56">
                  Category / Parameter
                </th>
                {stakeholders.map((s) => (
                  <th key={s.id} className="px-3 py-2.5 font-medium text-slate-500 dark:text-slate-400 text-center min-w-[5rem]">
                    {s.name.split(' ')[0]}
                  </th>
                ))}
                <th className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300 text-center bg-slate-100 dark:bg-slate-800 min-w-[4rem]">
                  Avg
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {scores.map((cat) => (
                <>
                  {/* Category header row */}
                  <tr key={cat.category} className="bg-slate-50/80 dark:bg-slate-800/40">
                    <td className="px-4 py-2 font-semibold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wide" colSpan={stakeholders.length + 1}>
                      {cat.category_label}
                    </td>
                    <td className="px-4 py-2 text-center bg-slate-100/60 dark:bg-slate-800/60">
                      <AvgCell value={cat.category_average} />
                    </td>
                  </tr>
                  {/* Parameter rows */}
                  {cat.parameters.map((param) => (
                    <tr key={param.parameter_key} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-2 pl-8 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {param.parameter_label}
                      </td>
                      {param.scores.map((sc) => (
                        <td key={sc.stakeholder_id} className="px-3 py-2 text-center">
                          <span className={cn('font-semibold text-sm', scoreColor(sc.score))}>
                            {sc.score}
                          </span>
                        </td>
                      ))}
                      <td className="px-4 py-2 text-center bg-slate-50/60 dark:bg-slate-800/30">
                        <AvgCell value={param.average} />
                      </td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                <td className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300">
                  Overall Score
                </td>
                {stakeholders.map((s) => {
                  // Per-stakeholder overall = average of all their parameter scores
                  let total = 0
                  let count = 0
                  scores.forEach((cat) =>
                    cat.parameters.forEach((p) => {
                      const sc = p.scores.find((x) => x.stakeholder_id === s.id)
                      if (sc) { total += sc.score; count++ }
                    })
                  )
                  const avg = count > 0 ? total / count : 0
                  return (
                    <td key={s.id} className="px-3 py-2.5 text-center">
                      <span className="font-semibold text-slate-700 dark:text-slate-300 text-sm">
                        {avg.toFixed(2)}
                      </span>
                    </td>
                  )
                })}
                <td className="px-4 py-2.5 text-center">
                  <AvgCell value={overallAvg} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <TrendingUp size={12} className="text-emerald-500" />
            Scores compiled from {submitterCount} valid submission{submitterCount !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </div>
  )
}
