import { Fragment } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/utils/cn'

export interface ProgressStep {
  label: string
  /** True when this step has actually happened (derived from real data, not a single
   *  linear workflow state). Steps are tracked independently, so scheduling a later
   *  meeting no longer implies the earlier steps are done. */
  done: boolean
}

interface WorkflowProgressBarProps {
  steps: ProgressStep[]
  compact?: boolean
}

export default function WorkflowProgressBar({ steps, compact = false }: WorkflowProgressBarProps) {
  const doneCount = steps.filter((s) => s.done).length

  const bar = (
    // Flat layout: every pill is an equal-width flex-1 child and every connector is
    // the same fixed width, so segments and gaps stay uniform.
    <div className="flex items-center gap-2">
      {steps.map((step, i) => (
        <Fragment key={step.label}>
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-lg text-xs font-medium transition-colors flex-1 min-w-0 justify-center',
              compact ? 'px-2 py-1' : 'px-3 py-1.5',
              step.done
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200 ring-1 ring-emerald-200 dark:ring-emerald-500/30'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800/70 dark:text-slate-300'
            )}
            title={step.done ? `${step.label} — done` : `${step.label} — not done yet`}
          >
            {step.done && <CheckCircle2 size={12} />}
            <span className="truncate">{step.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={cn(
                'h-px w-3 shrink-0',
                step.done ? 'bg-emerald-400 dark:bg-emerald-700' : 'bg-slate-300 dark:bg-slate-700'
              )}
            />
          )}
        </Fragment>
      ))}
    </div>
  )

  if (compact) {
    return (
      <div className="w-full border border-slate-200 dark:border-slate-700/60 rounded-lg px-3 py-2">
        {bar}
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
      {bar}
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">
        <span className="font-medium text-slate-700 dark:text-slate-300">{doneCount}</span> of {steps.length} steps done
      </p>
    </div>
  )
}
