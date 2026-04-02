import { AlertTriangle, CheckCircle2, Building2 } from 'lucide-react'
import type { RecurringIssue } from '@/types/analytics.types'
import { cn } from '@/utils/cn'

interface Props {
  issues: RecurringIssue[]
}

export default function RecurringIssueAlerts({ issues }: Props) {
  const openIssues = issues.filter((i) => i.status === 'OPEN')
  const resolvedIssues = issues.filter((i) => i.status === 'RESOLVED')

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={15} className="text-red-400" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Recurring Issue Alerts
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {openIssues.length > 0 && (
            <span className="text-xs bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">
              {openIssues.length} open
            </span>
          )}
          {resolvedIssues.length > 0 && (
            <span className="text-xs bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">
              {resolvedIssues.length} resolved
            </span>
          )}
        </div>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {issues.map((issue) => (
          <div
            key={issue.issue_id}
            className={cn(
              'p-4',
              issue.status === 'OPEN'
                ? 'border-l-4 border-l-red-400'
                : 'border-l-4 border-l-emerald-400 opacity-70'
            )}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
                  <Building2 size={13} className="text-slate-500 dark:text-slate-400" />
                </div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{issue.vendor_name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={cn(
                    'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                    issue.status === 'OPEN'
                      ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                  )}
                >
                  {issue.status === 'OPEN' ? <AlertTriangle size={10} /> : <CheckCircle2 size={10} />}
                  {issue.status === 'OPEN' ? 'Open' : 'Resolved'}
                </span>
              </div>
            </div>

            <p className="text-sm text-slate-800 dark:text-slate-200 mb-2">{issue.description}</p>

            <div className="flex items-center gap-3 flex-wrap">
              <span className={cn(
                'text-xs font-bold px-2 py-0.5 rounded',
                issue.occurrences >= 3
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              )}>
                {issue.occurrences}× consecutive
              </span>
              <div className="flex items-center gap-1">
                {issue.cycles_affected.map((cycle) => (
                  <span key={cycle} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">
                    {cycle}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
