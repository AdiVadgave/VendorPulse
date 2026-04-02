import { CheckCircle2, Lock } from 'lucide-react'
import { cn } from '@/utils/cn'
import { WORKFLOW_STATES, WORKFLOW_STATE_LABELS } from '@/utils/constants'
import type { WorkflowState } from '@/utils/constants'

interface WorkflowProgressBarProps {
  currentState: WorkflowState
  compact?: boolean
}

const DISPLAY_STAGES = [
  { label: 'Scheduling', states: ['CYCLE_CREATED', 'ATTENDEE_REFRESH_SENT', 'AVAILABILITY_COLLECTED', 'MEETING_SCHEDULED'] },
  { label: 'Scorecard', states: ['SCORECARD_REQUEST_SENT', 'SCORECARD_COLLECTION', 'SCORECARD_COMPILED'] },
  { label: 'Alignment', states: ['INTERNAL_ALIGNMENT'] },
  { label: 'Vendor Prep', states: ['VENDOR_PREP'] },
  { label: 'Meeting', states: ['MEETING_IN_PROGRESS', 'POST_MEETING_COMPLETE'] },
  { label: 'Complete', states: ['ARCHIVED'] },
]

export default function WorkflowProgressBar({
  currentState,
  compact = false,
}: WorkflowProgressBarProps) {
  const currentIndex = WORKFLOW_STATES.indexOf(currentState)

  const stages = (
    <div className="flex items-center gap-1">
      {DISPLAY_STAGES.map((stage, stageIdx) => {
        const stageStateIndexes = stage.states.map((s) =>
          WORKFLOW_STATES.indexOf(s as WorkflowState)
        )
        const minStateIndex = Math.min(...stageStateIndexes)
        const maxStateIndex = Math.max(...stageStateIndexes)

        const isComplete = currentIndex > maxStateIndex
        const isActive =
          currentIndex >= minStateIndex && currentIndex <= maxStateIndex
        const isLocked = currentIndex < minStateIndex

        return (
          <div key={stage.label} className="flex items-center flex-1 min-w-0">
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-lg text-xs font-medium transition-colors flex-1 justify-center',
                compact ? 'px-2 py-1' : 'px-3 py-1.5',
                isComplete &&
                  'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
                isActive &&
                  'bg-indigo-600 text-white shadow-sm shadow-indigo-200 dark:shadow-indigo-900/30',
                isLocked &&
                  'bg-slate-50 text-slate-400 dark:bg-slate-800/50 dark:text-slate-600'
              )}
            >
              {isComplete && <CheckCircle2 size={12} />}
              {isLocked && <Lock size={12} />}
              <span className="truncate">{stage.label}</span>
            </div>
            {stageIdx < DISPLAY_STAGES.length - 1 && (
              <div
                className={cn(
                  'h-px w-3 shrink-0',
                  currentIndex > maxStateIndex
                    ? 'bg-emerald-300 dark:bg-emerald-700'
                    : 'bg-slate-200 dark:bg-slate-700'
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )

  if (compact) {
    return (
      <div className="w-full border border-slate-200 dark:border-slate-700/60 rounded-lg px-3 py-2">
        {stages}
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
      {stages}
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">
        Current state:{' '}
        <span className="font-medium text-slate-700 dark:text-slate-300">
          {WORKFLOW_STATE_LABELS[currentState]}
        </span>
      </p>
    </div>
  )
}
