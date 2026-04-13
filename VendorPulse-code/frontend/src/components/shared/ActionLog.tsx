import { useState } from 'react'
import { CheckCircle2, Clock, AlertCircle, Filter, CheckSquare } from 'lucide-react'
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const filtered = actions.filter((a) => {
    const srcOk = sourceFilter === 'ALL' || a.source === sourceFilter
    const statOk = statusFilter === 'ALL' || a.status === statusFilter
    return srcOk && statOk
  })

  const openCount = actions.filter((a) => a.status === 'OPEN').length
  const inProgressCount = actions.filter((a) => a.status === 'IN_PROGRESS').length

  const allFilteredSelected = filtered.length > 0 && filtered.every((a) => selectedIds.has(a.action_id))
  const someFilteredSelected = filtered.some((a) => selectedIds.has(a.action_id))
  const selectedCount = filtered.filter((a) => selectedIds.has(a.action_id)).length

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        filtered.forEach((a) => next.delete(a.action_id))
      } else {
        filtered.forEach((a) => next.add(a.action_id))
      }
      return next
    })
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const bulkStatusChange = (status: ExtractedAction['status']) => {
    if (!onStatusChange) return
    filtered.forEach((a) => {
      if (selectedIds.has(a.action_id)) onStatusChange(a.action_id, status)
    })
    setSelectedIds(new Set())
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onStatusChange && (
            <button
              onClick={toggleSelectAll}
              title={allFilteredSelected ? 'Deselect all' : 'Select all'}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors',
                someFilteredSelected
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              )}
            >
              <CheckSquare size={12} />
              {allFilteredSelected ? 'Deselect All' : 'Select All'}
            </button>
          )}
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Action Log</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {openCount} open · {inProgressCount} in progress · {actions.length - openCount - inProgressCount} closed
            </p>
          </div>
        </div>
        <Filter size={15} className="text-slate-400" />
      </div>

      {/* Bulk action bar */}
      {selectedCount > 0 && onStatusChange && (
        <div className="px-5 py-2 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-indigo-700 dark:text-indigo-400 mr-1">
            {selectedCount} selected
          </span>
          <span className="text-xs text-indigo-400 dark:text-indigo-600 mr-1">·</span>
          <span className="text-xs text-indigo-600 dark:text-indigo-400 mr-1">Mark as:</span>
          {(['OPEN', 'IN_PROGRESS', 'CLOSED'] as ExtractedAction['status'][]).map((s) => (
            <button
              key={s}
              onClick={() => bulkStatusChange(s)}
              className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors', STATUS_CONFIG[s].classes, 'hover:opacity-80')}
            >
              {STATUS_CONFIG[s].label}
            </button>
          ))}
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-indigo-400 dark:text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
          >
            Clear
          </button>
        </div>
      )}

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
            const isSelected = selectedIds.has(action.action_id)
            return (
              <div
                key={action.action_id}
                className={cn(
                  'px-5 py-3.5 flex items-start gap-3 transition-colors',
                  isSelected
                    ? 'bg-indigo-50/60 dark:bg-indigo-900/10'
                    : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/20'
                )}
              >
                {onStatusChange && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(action.action_id)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 dark:border-slate-600 accent-indigo-600 cursor-pointer"
                  />
                )}
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
