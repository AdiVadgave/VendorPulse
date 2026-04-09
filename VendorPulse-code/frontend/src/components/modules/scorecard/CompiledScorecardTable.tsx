import { TrendingUp, CheckCircle2 } from 'lucide-react'
import type { CompiledScorecard } from '@/types/scorecard.types'
import { cn } from '@/utils/cn'

interface Props {
  scorecard: CompiledScorecard
}

function scoreColor(score: number | null) {
  if (score === null) return 'text-slate-400 dark:text-slate-500'
  if (score >= 4.5) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 3.5) return 'text-blue-600 dark:text-blue-400'
  if (score >= 2.5) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function avgBg(value: number | null) {
  if (value === null) return 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
  if (value >= 4.5) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
  if (value >= 3.5) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
  if (value >= 2.5) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
}

function ScoreCell({ value }: { value: number | null }) {
  return (
    <span className={cn('inline-flex items-center justify-center px-2 py-0.5 rounded font-semibold text-sm min-w-[3rem]', avgBg(value))}>
      {value !== null ? value.toFixed(2) : '—'}
    </span>
  )
}

export default function CompiledScorecardTable({ scorecard }: Props) {
  const {
    internal_respondents,
    vendor_respondents,
    overall_internal_avg,
    overall_vendor_avg,
    categories,
  } = scorecard

  const totalRespondents = internal_respondents + vendor_respondents

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <CheckCircle2 size={15} className="text-emerald-500" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Compiled Scorecard
          </h3>
          <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
            {totalRespondents} respondent{totalRespondents !== 1 ? 's' : ''} ({internal_respondents} internal, {vendor_respondents} vendor)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50">
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 w-56">
                  Category / Parameter
                </th>
                <th className="px-3 py-2.5 font-medium text-center min-w-[7rem]">
                  <div className="flex items-center justify-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
                    <span className="text-blue-700 dark:text-blue-400">Internal Stakeholder</span>
                  </div>
                </th>
                <th className="px-3 py-2.5 font-medium text-center min-w-[7rem]">
                  <div className="flex items-center justify-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm bg-orange-500" />
                    <span className="text-orange-700 dark:text-orange-400">Vendor</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {categories.map((cat) => (
                <>
                  {/* Category header row */}
                  <tr key={cat.category} className="bg-slate-50/80 dark:bg-slate-800/40">
                    <td className="px-4 py-2 font-semibold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wide">
                      {cat.category_label}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <ScoreCell value={cat.internal_avg} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <ScoreCell value={cat.vendor_avg} />
                    </td>
                  </tr>
                  {/* Parameter rows */}
                  {cat.parameters.map((param) => (
                    <tr key={param.parameter_key} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-2 pl-8 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {param.parameter_label}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={cn('font-semibold text-sm', scoreColor(param.internal_avg))}>
                          {param.internal_avg !== null ? param.internal_avg.toFixed(1) : '—'}
                        </span>
                        {param.internal_count > 0 && (
                          <span className="text-xs text-slate-400 ml-1">({param.internal_count})</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={cn('font-semibold text-sm', scoreColor(param.vendor_avg))}>
                          {param.vendor_avg !== null ? param.vendor_avg.toFixed(1) : '—'}
                        </span>
                        {param.vendor_count > 0 && (
                          <span className="text-xs text-slate-400 ml-1">({param.vendor_count})</span>
                        )}
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
                <td className="px-3 py-2.5 text-center">
                  <ScoreCell value={overall_internal_avg} />
                </td>
                <td className="px-3 py-2.5 text-center">
                  <ScoreCell value={overall_vendor_avg} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <TrendingUp size={12} className="text-emerald-500" />
            Scores compiled from {totalRespondents} valid submission{totalRespondents !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </div>
  )
}
