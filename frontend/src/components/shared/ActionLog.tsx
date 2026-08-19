import { useState } from 'react'
import { CheckCircle2, Clock, AlertCircle, Filter, CheckCheck, Pencil, Trash2, Check, X } from 'lucide-react'
import { format } from 'date-fns'
import type { ExtractedAction } from '@/types/alignment.types'
import { cn } from '@/utils/cn'

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

export interface ActionEdit {
  description?: string
  details?: string
  owner?: string
  due_date?: string | null
}

interface Props {
  actions: (ExtractedAction & { cycle_ref?: string; origin?: string | null })[]
  showCycleRef?: boolean
  onStatusChange?: (id: string, status: ExtractedAction['status']) => void
  /** When provided, each row gets edit controls (description / owner / due date). */
  onEdit?: (id: string, updates: ActionEdit) => void
  /** When provided, each row gets a delete button. */
  onDelete?: (id: string) => void
  /** Omit the outer card + title header (for embedding inside another panel). */
  bare?: boolean
}

export default function ActionLog({ actions, showCycleRef = false, onStatusChange, onEdit, onDelete, bare = false }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ description: string; details: string; owner: string; due_date: string }>({
    description: '', details: '', owner: '', due_date: '',
  })
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const startEdit = (a: ExtractedAction) => {
    setConfirmDeleteId(null)
    setEditingId(a.action_id)
    setDraft({ description: a.description, details: a.details || '', owner: a.owner || '', due_date: a.due_date || '' })
  }
  const saveEdit = () => {
    if (editingId && onEdit) {
      onEdit(editingId, {
        description: draft.description.trim(),
        details: draft.details.trim(),
        owner: draft.owner.trim() || 'TBD',
        due_date: draft.due_date ? draft.due_date : null,
      })
    }
    setEditingId(null)
  }

  const filtered = actions.filter((a) => statusFilter === 'ALL' || a.status === statusFilter)

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
    <div className={cn(!bare && 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden')}>
      {!bare && (
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
      )}

      {/* Filter — status only (the one that matters for tracking what's pending). */}
      <div className="px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 flex-wrap">
        {bare && onStatusChange && hasUnclosed && (
          <button
            onClick={handleMarkAllClosed}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors mr-1"
          >
            <CheckCheck size={13} />
            Mark All Completed
          </button>
        )}
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
            const isEditing = editingId === action.action_id

            if (isEditing) {
              return (
                <div key={action.action_id} className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-800/30 space-y-2">
                  <input
                    value={draft.description}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                    placeholder="Action (short title)"
                  />
                  <textarea
                    value={draft.details}
                    onChange={(e) => setDraft((d) => ({ ...d, details: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 resize-y"
                    placeholder="Description — the what & why (optional)"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-xs text-slate-500 dark:text-slate-400">Owner
                      <input
                        value={draft.owner}
                        onChange={(e) => setDraft((d) => ({ ...d, owner: e.target.value }))}
                        className="ml-1.5 px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                        placeholder="Owner"
                      />
                    </label>
                    <label className="text-xs text-slate-500 dark:text-slate-400">Due
                      <input
                        type="date"
                        value={draft.due_date}
                        onChange={(e) => setDraft((d) => ({ ...d, due_date: e.target.value }))}
                        className="ml-1.5 px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                      />
                    </label>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <button
                        onClick={saveEdit}
                        disabled={!draft.description.trim()}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                      >
                        <Check size={13} /> Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <X size={13} /> Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )
            }

            return (
              <div key={action.action_id} className="px-5 py-3.5 flex items-start gap-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 mb-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-snug flex-1">
                      {action.description}
                    </p>
                  </div>
                  {action.details && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug mb-1.5">
                      {action.details}
                    </p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', SOURCE_COLORS[action.source])}>
                      {SOURCE_LABELS[action.source]}
                    </span>
                    {action.origin && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">{action.origin}</span>
                    )}
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
                <div className="shrink-0 flex items-center gap-1.5">
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
                  {onEdit && (
                    <button
                      onClick={() => startEdit(action)}
                      title="Edit action item"
                      className="p-1 rounded-md text-slate-400 hover:text-violet-600 hover:bg-slate-100 dark:hover:bg-slate-800 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  {onDelete && (
                    confirmDeleteId === action.action_id ? (
                      <span className="flex items-center gap-1">
                        <button
                          onClick={() => { onDelete(action.action_id); setConfirmDeleteId(null) }}
                          className="px-2 py-0.5 text-xs font-semibold rounded bg-rose-600 text-white hover:bg-rose-700"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-0.5 text-xs rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(action.action_id)}
                        title="Delete action item"
                        className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={13} />
                      </button>
                    )
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
