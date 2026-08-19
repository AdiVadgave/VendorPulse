import { useState } from 'react'
import { ChevronDown, ListChecks, Plus } from 'lucide-react'
import ActionLog from './ActionLog'
import type { ActionEdit } from './ActionLog'
import AddActionForm from './AddActionForm'
import type { ExtractedAction } from '@/types/alignment.types'
import type { NewActionInput } from '@/lib/actionsApi'
import { cn } from '@/utils/cn'

interface Props {
  actions: (ExtractedAction & { cycle_ref?: string; origin?: string | null })[]
  /** Which meeting this panel is shown in — used as the source/origin of manual adds. */
  source: ExtractedAction['source']
  originLabel?: string
  onAdd: (a: NewActionInput) => void
  onStatusChange: (id: string, status: ExtractedAction['status']) => void
  onEdit: (id: string, updates: ActionEdit) => void
  onDelete: (id: string) => void
  defaultOpen?: boolean
}

/**
 * The shared action queue, shown persistently in every meeting tab so the VMO
 * coordinator can always see what is still pending as the flow moves from one
 * meeting to the next. The same queue is read/written everywhere.
 */
export default function ActionQueuePanel({
  actions, source, originLabel, onAdd, onStatusChange, onEdit, onDelete, defaultOpen = true,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [adding, setAdding] = useState(false)

  const openCount = actions.filter((a) => a.status !== 'CLOSED').length

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <ChevronDown
            size={16}
            className={cn('text-slate-400 transition-transform', open ? '' : '-rotate-90')}
          />
          <ListChecks size={15} className="text-violet-600 dark:text-violet-400 shrink-0" />
          <span className="text-sm font-semibold text-slate-900 dark:text-white shrink-0">Action Items Queue</span>
          <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
            <span className="whitespace-nowrap">{openCount} pending · {actions.length} total</span>
            <span className="hidden sm:inline"> · carried across all meetings</span>
          </span>
        </button>
        <button
          onClick={() => { setOpen(true); setAdding((a) => !a) }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 shrink-0"
        >
          <Plus size={13} /> Add action
        </button>
      </div>

      {open && (
        <>
          {adding && (
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <AddActionForm
                source={source}
                originLabel={originLabel}
                onAdd={(a) => { onAdd(a); setAdding(false) }}
                onCancel={() => setAdding(false)}
              />
            </div>
          )}

          {actions.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
              No action items yet. They appear here once extracted from a meeting transcript
              (or added manually) and carry forward to the next meeting.
            </div>
          ) : (
            <ActionLog
              actions={actions}
              bare
              showCycleRef={false}
              onStatusChange={onStatusChange}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          )}
        </>
      )}
    </div>
  )
}
