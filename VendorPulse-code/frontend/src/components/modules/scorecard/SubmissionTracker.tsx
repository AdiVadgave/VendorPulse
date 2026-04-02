import { useState } from 'react'
import { CheckCircle2, Clock, XCircle, AlertTriangle, RefreshCw, Play } from 'lucide-react'
import { format } from 'date-fns'
import type { StakeholderSubmission } from '@/types/scorecard.types'
import { cn } from '@/utils/cn'

interface Props {
  submissions: StakeholderSubmission[]
  onSimulate: () => void
  simulated: boolean
}

const STATUS_CONFIG = {
  SUBMITTED: { label: 'Submitted', icon: <CheckCircle2 size={13} />, classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' },
  PENDING: { label: 'Pending', icon: <Clock size={13} />, classes: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' },
  INVALID: { label: 'Invalid', icon: <XCircle size={13} />, classes: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
  CORRECTED: { label: 'Corrected', icon: <RefreshCw size={13} />, classes: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
}

export default function SubmissionTracker({ submissions, onSimulate, simulated }: Props) {
  const [filter, setFilter] = useState<'ALL' | 'SUBMITTED' | 'PENDING' | 'INVALID'>('ALL')

  const counts = {
    SUBMITTED: submissions.filter((s) => s.status === 'SUBMITTED').length,
    PENDING: submissions.filter((s) => s.status === 'PENDING').length,
    INVALID: submissions.filter((s) => s.status === 'INVALID').length,
    CORRECTED: submissions.filter((s) => s.status === 'CORRECTED').length,
  }

  const filtered = filter === 'ALL' ? submissions : submissions.filter((s) => s.status === filter)

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
            Submission Tracker
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {counts.SUBMITTED} of {submissions.length} submitted
          </p>
        </div>
        {!simulated && (
          <button
            onClick={onSimulate}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Play size={12} />
            Simulate Submissions
          </button>
        )}
      </div>

      {/* Summary chips */}
      <div className="px-5 py-3 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 overflow-x-auto">
        {(['ALL', 'SUBMITTED', 'PENDING', 'INVALID'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
              filter === f
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            )}
          >
            {f === 'ALL' ? `All (${submissions.length})` : `${STATUS_CONFIG[f].label} (${counts[f]})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {filtered.map((sub) => {
          const cfg = STATUS_CONFIG[sub.status]
          return (
            <div key={sub.stakeholder_id} className="px-5 py-3.5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                    {sub.stakeholder_name}
                  </p>
                  <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
                    {sub.organisation}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {sub.role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {sub.reminders_sent > 0 && (
                  <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle size={11} />
                    <span>{sub.reminders_sent} reminder{sub.reminders_sent > 1 ? 's' : ''}</span>
                  </div>
                )}
                {sub.submitted_at && (
                  <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:block">
                    {format(new Date(sub.submitted_at), 'd MMM HH:mm')}
                  </span>
                )}
                <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cfg.classes)}>
                  {cfg.icon}
                  {cfg.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {counts.INVALID > 0 && (
        <div className="px-5 py-3 bg-red-50 dark:bg-red-900/10 border-t border-red-100 dark:border-red-900/30">
          <p className="text-xs text-red-700 dark:text-red-400 flex items-center gap-1.5">
            <AlertTriangle size={12} />
            {counts.INVALID} invalid submission{counts.INVALID > 1 ? 's' : ''} — correction requests automatically sent to affected stakeholders.
          </p>
        </div>
      )}
    </div>
  )
}
