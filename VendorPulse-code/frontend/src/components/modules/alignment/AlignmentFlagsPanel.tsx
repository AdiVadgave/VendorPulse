import { AlertTriangle, HelpCircle } from 'lucide-react'
import type { AlignmentFlag } from '@/types/alignment.types'
import { CATEGORY_LABELS } from '@/types/scorecard.types'

interface Props {
  flags: AlignmentFlag[]
}

export default function AlignmentFlagsPanel({ flags }: Props) {
  if (flags.length === 0) {
    return (
      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 text-center">
        <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
          No alignment flags — all stakeholders are within acceptable spread.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
        <AlertTriangle size={15} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Alignment Flags
        </h3>
        <span className="ml-auto text-xs bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
          {flags.length} flag{flags.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {flags.map((flag) => (
          <div key={flag.flag_id} className="p-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-8 h-8 bg-amber-50 dark:bg-amber-900/20 rounded-lg flex items-center justify-center shrink-0">
                <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {CATEGORY_LABELS[flag.category]}
                  </span>
                  <span className="text-xs bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 px-1.5 py-0.5 rounded font-medium">
                    Spread: {flag.spread.toFixed(1)} pts
                  </span>
                </div>

                {/* High/Low comparison */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2 text-center">
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{flag.high_stakeholder}</p>
                    <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{flag.high_score}</p>
                  </div>
                  <span className="text-slate-400 dark:text-slate-500 text-sm font-medium">vs</span>
                  <div className="flex-1 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 text-center">
                    <p className="text-xs text-red-600 dark:text-red-400 font-medium">{flag.low_stakeholder}</p>
                    <p className="text-xl font-bold text-red-700 dark:text-red-400">{flag.low_score}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Prompt question */}
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <HelpCircle size={14} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed">
                {flag.prompt_question}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
