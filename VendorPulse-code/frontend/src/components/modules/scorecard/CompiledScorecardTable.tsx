import { AlertTriangle, TrendingUp, CheckCircle2 } from 'lucide-react'
import type { CompiledScore } from '@/types/scorecard.types'
import { CATEGORY_LABELS } from '@/types/scorecard.types'
import { cn } from '@/utils/cn'

interface Props {
  scores: CompiledScore[]
}

function ScoreCell({ score, isOutlier }: { score: number; isOutlier: boolean }) {
  const color =
    score >= 4.5 ? 'text-emerald-600 dark:text-emerald-400' :
    score >= 3.5 ? 'text-blue-600 dark:text-blue-400' :
    score >= 2.5 ? 'text-amber-600 dark:text-amber-400' :
    'text-red-600 dark:text-red-400'

  return (
    <div className="flex items-center justify-center gap-1">
      <span className={cn('font-semibold text-sm', color)}>{score}</span>
      {isOutlier && (
        <AlertTriangle size={11} className="text-amber-500" />
      )}
    </div>
  )
}

function AvgCell({ value }: { value: number }) {
  const bg =
    value >= 4.5 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
    value >= 3.5 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
    value >= 2.5 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'

  return (
    <span className={cn('inline-flex items-center justify-center px-2 py-0.5 rounded font-semibold text-sm min-w-[3rem]', bg)}>
      {value.toFixed(2)}
    </span>
  )
}

export default function CompiledScorecardTable({ scores }: Props) {
  const hasOutliers = scores.some((s) => s.scores.some((sc) => sc.is_outlier))

  // Get unique stakeholder names in order
  const stakeholders = scores[0]?.scores.map((s) => s.stakeholder_name) ?? []

  return (
    <div className="space-y-4">
      {hasOutliers && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Outlier detected</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              One or more scores deviate by more than 1.5 standard deviations from the group average. These are flagged with{' '}
              <AlertTriangle size={10} className="inline text-amber-500" /> and should be discussed during the internal alignment call.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <CheckCircle2 size={15} className="text-emerald-500" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Compiled Scorecard
          </h3>
          <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
            {scores[0]?.scores.length ?? 0} submitters
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50">
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 w-36">
                  Category
                </th>
                {stakeholders.map((name) => (
                  <th key={name} className="px-3 py-2.5 font-medium text-slate-500 dark:text-slate-400 text-center">
                    {name.split(' ')[0]}
                  </th>
                ))}
                <th className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300 text-center bg-slate-100 dark:bg-slate-800">
                  Avg
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {scores.map((row) => (
                <tr key={row.category} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {CATEGORY_LABELS[row.category]}
                  </td>
                  {row.scores.map((sc) => (
                    <td key={sc.stakeholder_id} className="px-3 py-2.5 text-center">
                      <ScoreCell score={sc.score} isOutlier={sc.is_outlier} />
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-center bg-slate-50/60 dark:bg-slate-800/30">
                    <AvgCell value={row.average} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                <td className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300">
                  Overall Avg
                </td>
                {stakeholders.map((name) => {
                  const total = scores.reduce((sum, row) => {
                    const sc = row.scores.find((s) => s.stakeholder_name === name)
                    return sum + (sc?.score ?? 0)
                  }, 0)
                  return (
                    <td key={name} className="px-3 py-2.5 text-center">
                      <span className="font-semibold text-slate-700 dark:text-slate-300 text-sm">
                        {(total / scores.length).toFixed(1)}
                      </span>
                    </td>
                  )
                })}
                <td className="px-4 py-2.5 text-center">
                  <AvgCell
                    value={
                      scores.reduce((sum, row) => sum + row.average, 0) / scores.length
                    }
                  />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <TrendingUp size={12} className="text-emerald-500" />
            Scores compiled from 6 valid submissions
          </div>
          {hasOutliers && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle size={12} />
              1 outlier flagged — review in Alignment tab
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
