import { useState } from 'react'
import { Users, UserPlus, Trash2, ChevronDown, ChevronRight, Key } from 'lucide-react'
import { cn } from '@/utils/cn'
import { apiFetch } from '@/lib/api'
import { SearchAddAttendeeForm } from './AttendeeRefreshPanel'
import type { CycleAttendee } from '@/types/scheduling.types'
import { ROLE_LABELS } from '@/types/cycle.types'

interface Props {
  cycleId: string
  attendees: CycleAttendee[]
  onAttendeesChanged: (updated: CycleAttendee[]) => void
  /** Collapsed by default when embedded mid-cycle; expandable on demand. */
  defaultOpen?: boolean
}

/**
 * Add / remove / re-key cycle attendees at ANY point in the cycle.
 *
 * The attendee CRUD endpoints are not workflow-gated, so this panel stays usable
 * throughout — you can add a late stakeholder (e.g. someone who must still fill the
 * scorecard) without rewinding the workflow. Rendered persistently in the Scheduling
 * tab regardless of the scheduling phase.
 */
export default function CycleAttendeesPanel({ cycleId, attendees, onAttendeesChanged, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [adding, setAdding] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function handleRemove(attendeeId: string) {
    setBusyId(attendeeId)
    try {
      await apiFetch(`/api/cycles/${cycleId}/attendees/${attendeeId}`, { method: 'DELETE' })
    } catch { /* keep optimistic removal even if backend is offline */ }
    onAttendeesChanged(attendees.filter((a) => a.attendee_id !== attendeeId))
    setBusyId(null)
    setConfirmRemove(null)
  }

  async function toggleKey(attendee: CycleAttendee) {
    const next = !attendee.is_key
    setBusyId(attendee.attendee_id)
    try {
      await apiFetch(`/api/cycles/${cycleId}/attendees/${attendee.attendee_id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_key: next }),
      })
    } catch { /* keep optimistic toggle */ }
    onAttendeesChanged(attendees.map((a) => (a.attendee_id === attendee.attendee_id ? { ...a, is_key: next } : a)))
    setBusyId(null)
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          {open ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
          <Users size={15} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="text-sm font-semibold text-slate-900 dark:text-white">Cycle Attendees</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {attendees.length} total · add or remove at any time
          </span>
        </button>
        <button
          onClick={() => { setOpen(true); setAdding((a) => !a) }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 shrink-0"
        >
          <UserPlus size={13} /> Add attendee
        </button>
      </div>

      {open && (
        <div className="p-4 space-y-3">
          {adding && (
            <SearchAddAttendeeForm
              cycleId={cycleId}
              // The form filters directory results by user_id — match that key so
              // people already on the cycle are excluded (no duplicate adds).
              existingAttendeeIds={attendees.map((a) => a.user_id ?? a.attendee_id)}
              onAdded={(attendee) => { onAttendeesChanged([...attendees, attendee]); setAdding(false) }}
              onCancel={() => setAdding(false)}
            />
          )}

          {attendees.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">
              No attendees yet. Use “Add attendee” to search the directory and add one.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-100 dark:border-slate-800">
              {attendees.map((a) => (
                <div key={a.attendee_id} className="px-3 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{a.name}</span>
                      <span className={cn(
                        'text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0',
                        a.type === 'Vendor'
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      )}>
                        {a.type}
                      </span>
                      {a.shell_department && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 shrink-0">
                          {a.shell_department}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {ROLE_LABELS[a.role] ?? a.role} · {a.email}
                    </p>
                  </div>
                  {a.type === 'Internal Stakeholder' && (
                    <button
                      onClick={() => toggleKey(a)}
                      disabled={busyId === a.attendee_id}
                      title={a.is_key ? 'Key stakeholder (fills the scorecard) — click to unset' : 'Mark as key (will be asked to fill the scorecard)'}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg border shrink-0 transition-colors disabled:opacity-50',
                        a.is_key
                          ? 'border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20'
                          : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      )}
                    >
                      <Key size={12} /> {a.is_key ? 'Key' : 'Not key'}
                    </button>
                  )}
                  {confirmRemove === a.attendee_id ? (
                    <span className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleRemove(a.attendee_id)}
                        disabled={busyId === a.attendee_id}
                        className="px-2 py-1 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        Remove
                      </button>
                      <button
                        onClick={() => setConfirmRemove(null)}
                        className="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmRemove(a.attendee_id)}
                      title="Remove attendee from this cycle"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
