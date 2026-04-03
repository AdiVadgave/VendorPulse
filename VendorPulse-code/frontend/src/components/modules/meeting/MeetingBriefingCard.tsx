import { TrendingUp, TrendingDown, Minus, AlertTriangle, BarChart3 } from 'lucide-react'
import { cn } from '@/utils/cn'

interface Props {
  vendorName?: string
  overallScore: number
  trend: 'improving' | 'stable' | 'declining'
  mostImproved: string
  mostConcerning: string
  recurringIssueCount: number
  predictedChallenges: string[]
}

export default function MeetingBriefingCard({
  
  overallScore,
  trend,
  mostImproved,
  mostConcerning,
  recurringIssueCount,
  predictedChallenges,
}: Props) {
  const TrendIcon = trend === 'improving' ? TrendingUp : trend === 'declining' ? TrendingDown : Minus
  const trendColor = trend === 'improving'
    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
    : trend === 'declining'
      ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
      : 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800'

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={16} className="text-indigo-600 dark:text-indigo-400" />
        <h3 className="text-sm font-semibold text-indigo-800 dark:text-indigo-300">
          Pre-Meeting Trend Briefing
        </h3>
        <span className="ml-auto text-xs text-indigo-500 dark:text-indigo-400">From Module F</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-white dark:bg-slate-900 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{overallScore}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Overall Score</p>
        </div>
        <div className={cn('rounded-lg p-3 text-center', trendColor)}>
          <TrendIcon size={20} className="mx-auto mb-1" />
          <p className="text-xs font-medium capitalize">{trend}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg p-3 text-center">
          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 truncate">{mostImproved}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Most Improved</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg p-3 text-center">
          <p className="text-sm font-semibold text-red-600 dark:text-red-400 truncate">{mostConcerning}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Most Concerning</p>
        </div>
      </div>

      {recurringIssueCount > 0 && (
        <div className="flex items-center gap-2 p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-3">
          <AlertTriangle size={13} className="text-red-600 dark:text-red-400 shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-400 font-medium">
            {recurringIssueCount} recurring issue{recurringIssueCount > 1 ? 's' : ''} — vendor likely to raise these
          </p>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 mb-1.5">
          Predicted Vendor Challenge Areas
        </p>
        <ul className="space-y-1">
          {predictedChallenges.map((c, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-indigo-700 dark:text-indigo-400">
              <span className="w-3.5 h-3.5 rounded-full bg-indigo-200 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                {i + 1}
              </span>
              {c}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
