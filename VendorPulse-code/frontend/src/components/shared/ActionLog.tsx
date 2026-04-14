import { useState } from 'react'
import { CheckCircle2, Clock, AlertCircle, Filter, CheckCheck } from 'lucide-react'
import { format } from 'date-fns'
import type { ExtractedAction } from '@/types/alignment.types'
import { cn } from '@/utils/cn'

type SourceFilter = 'ALL' | 'alignment' | 'vendor_prep' | 'meeting'
type StatusFilter = 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED'

const SOURCE_LABELS: Record<string, string> = {
  alignment: 'Alignment',
  vendor_prep: 'Vendor Prep',
  meeting: 'Meeting',
}

const SOURCE_COLORS: Record<string, string> = {
  alignment: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  vendor_prep: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400',
  meeting: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
}

const STATUS_CONFIG = {
  OPEN: { label: 'Open', icon: <AlertCircle size={12} />, classes: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
  IN_PROGRESS: { label: 'In Progress', icon: <Clock size={12} />, classes: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' },
  CLOSED: { label: 'Closed', icon: <CheckCircle2 size={12} />, classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' },
}

interface Props {
  actions: (ExtractedAction & { cycle_ref?: string })[]
  showCycleRef?: boolean
  onStatusChange?: (id: string, status: ExtractedAction['status']) => void
}

export default function ActionLog({ actions, showCycleRef = false, onStatusChange }: Props) {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

  const filtered = actions.filter((a) => {
    const srcOk = sourceFilter === 'ALL' || a.source === sourceFilter
    const statOk = statusFilter === 'ALL' || a.status === statusFilter
    return srcOk && statOk
  })

  const openCount = actions.filter((a) => a.status === 'OPEN').length
  const inProgressCount = actions.filter((a) => a.status === 'IN_PROGRESS').length
  const hasUnclosed = openCount + inProgressCount > 0

  const handleMarkAllClosed = () => {
    if (!onStatusChange) return
    actions.forEach((a) => {
      if (a.status !== 'CLOSED') {
        onStatusChange(a.action_id, 'CLOSED')
      }
    })
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Action Log</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {openCount} open · {inProgressCount} in progress · {actions.length - openCount - inProgressCount} closed
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onStatusChange && hasUnclosed && (
            <button
              onClick={handleMarkAllClosed}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            >
              <CheckCheck size={14} />
              Mark All Completed
            </button>
          )}
          <Filter size={15} className="text-slate-400" />
        </div>
      </div>

      {/* Filters */}
      <div className="px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          {(['ALL', 'alignment', 'vendor_prep', 'meeting'] as SourceFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setSourceFilter(f)}
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                sourceFilter === f
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              )}
            >
              {f === 'ALL' ? 'All Sources' : SOURCE_LABELS[f]}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
        <div className="flex items-center gap-1">
          {(['ALL', 'OPEN', 'IN_PROGRESS', 'CLOSED'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                statusFilter === f
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              )}
            >
              {f === 'ALL' ? 'All Status' : f.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {filtered.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
            No actions match the current filters.
          </div>
        ) : (
          filtered.map((action) => {
            const statusCfg = STATUS_CONFIG[action.status]
            return (
              <div key={action.action_id} className="px-5 py-3.5 flex items-start gap-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 mb-1">
                    <p className="text-sm text-slate-800 dark:text-slate-200 leading-snug flex-1">
                      {action.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', SOURCE_COLORS[action.source])}>
                      {SOURCE_LABELS[action.source]}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Owner: <span className="font-medium text-slate-700 dark:text-slate-300">{action.owner}</span>
                    </span>
                    {action.due_date && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        Due: {format(new Date(action.due_date), 'd MMM yyyy')}
                      </span>
                    )}
                    {showCycleRef && (action as never as { cycle_ref?: string }).cycle_ref && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {(action as never as { cycle_ref?: string }).cycle_ref}
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0">
                  {onStatusChange ? (
                    <select
                      value={action.status}
                      onChange={(e) => onStatusChange(action.action_id, e.target.value as ExtractedAction['status'])}
                      className={cn(
                        'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border-0 cursor-pointer',
                        statusCfg.classes
                      )}
                    >
                      <option value="OPEN">Open</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="CLOSED">Closed</option>
                    </select>
                  ) : (
                    <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', statusCfg.classes)}>
                      {statusCfg.icon}
                      {statusCfg.label}
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
