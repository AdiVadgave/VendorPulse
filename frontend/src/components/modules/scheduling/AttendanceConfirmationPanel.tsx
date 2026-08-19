import { useState } from 'react'
import { Users, CheckCircle2, ArrowRight, Loader2, UserCheck, UserX } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { CycleAttendee, AttendanceConfirmationStatus } from '@/types/scheduling.types'
import { ROLE_LABELS } from '@/types/cycle.types'
import { apiFetch } from '@/lib/api'

interface AttendanceConfirmationPanelProps {
  cycleId: string
  attendees: CycleAttendee[]
  onAttendeesChanged: (updated: CycleAttendee[]) => void
  onConfirmationComplete: (confirmed: CycleAttendee[]) => void | Promise<void>
}

const STATUS_CONFIG: Record<
  AttendanceConfirmationStatus,
  { label: string; color: string }
> = {
  PENDING: { label: 'Not set', color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  CONFIRMED: { label: 'Confirmed', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  REPLACED: { label: 'Replaced', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  DECLINED: { label: 'Not attending', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
}

export default function AttendanceConfirmationPanel({
  cycleId,
  attendees,
  onAttendeesChanged,
  onConfirmationComplete,
}: AttendanceConfirmationPanelProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [isProceeding, setIsProceeding] = useState(false)

  const withStatus = attendees.map((a) => ({
    ...a,
    confirmation_status: (a.confirmation_status ?? 'PENDING') as AttendanceConfirmationStatus,
  }))
  const confirmedCount = withStatus.filter((a) => a.confirmation_status === 'CONFIRMED').length
  const declinedCount = withStatus.filter((a) => a.confirmation_status === 'DECLINED').length

  async function setStatus(attendee: CycleAttendee, status: AttendanceConfirmationStatus) {
    setUpdatingId(attendee.attendee_id)
    try {
      await apiFetch(`/api/cycles/${cycleId}/attendees/${attendee.attendee_id}`, {
        method: 'PUT',
        body: JSON.stringify({ confirmation_status: status }),
      })
    } catch {
      /* optimistic — keep local change even if the API is unavailable */
    } finally {
      onAttendeesChanged(
        attendees.map((a) => (a.attendee_id === attendee.attendee_id ? { ...a, confirmation_status: status } : a))
      )
      setUpdatingId(null)
    }
  }

  async function handleProceed() {
    setIsProceeding(true)
    // Carry forward everyone except those marked "Not attending".
    const finalAttendees = withStatus.filter((a) => a.confirmation_status !== 'DECLINED')
    try {
      await Promise.resolve(onConfirmationComplete(finalAttendees))
    } finally {
      setIsProceeding(false)
    }
  }

  return (
    <div className="space-y-4 fade-in">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-50 dark:bg-violet-900/30 rounded-lg flex items-center justify-center shrink-0">
            <UserCheck size={18} className="text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Attendance Confirmation</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Mark whether each attendee from the last cycle is still attending. Anyone set to
              &ldquo;Not attending&rdquo; is dropped when you continue.
            </p>
          </div>
        </div>
      </div>

      {attendees.length === 0 ? (
        <>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No attendees from a previous cycle. Proceed to add attendees directly.
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => onConfirmationComplete([])}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <ArrowRight size={14} /> Proceed to Add Attendees
            </button>
          </div>
        </>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <Users size={14} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Attendees from Last Cycle</span>
            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-xs">
              {attendees.length}
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {withStatus.map((a) => {
              const cfg = STATUS_CONFIG[a.confirmation_status]
              const isUpdating = updatingId === a.attendee_id
              const actioned = a.confirmation_status === 'CONFIRMED' || a.confirmation_status === 'DECLINED'
              return (
                <div key={a.attendee_id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-slate-800 dark:text-slate-200">{a.name}</span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">{ROLE_LABELS[a.role] ?? a.role}</span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">·</span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">{a.organisation}</span>
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{a.email}</p>
                  </div>

                  {actioned && (
                    <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cfg.color)}>
                      {a.confirmation_status === 'CONFIRMED' ? <CheckCircle2 size={11} /> : <UserX size={11} />}
                      {cfg.label}
                    </span>
                  )}

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setStatus(a, 'CONFIRMED')}
                      disabled={isUpdating}
                      className={cn(
                        'flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors disabled:opacity-60',
                        a.confirmation_status === 'CONFIRMED'
                          ? 'bg-emerald-600 text-white'
                          : 'border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                      )}
                    >
                      {isUpdating ? <Loader2 size={11} className="animate-spin" /> : <UserCheck size={11} />}
                      Confirm
                    </button>
                    <button
                      onClick={() => setStatus(a, 'DECLINED')}
                      disabled={isUpdating}
                      className={cn(
                        'flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors disabled:opacity-60',
                        a.confirmation_status === 'DECLINED'
                          ? 'bg-red-600 text-white'
                          : 'border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                      )}
                    >
                      <UserX size={11} />
                      Not attending
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1"><CheckCircle2 size={11} className="text-emerald-500" />{confirmedCount} confirmed</span>
              <span className="flex items-center gap-1"><UserX size={11} className="text-red-500" />{declinedCount} not attending</span>
            </div>
            <button
              onClick={handleProceed}
              disabled={isProceeding}
              className={cn(
                'flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors',
                isProceeding && 'opacity-60 cursor-not-allowed'
              )}
            >
              {isProceeding ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
              Proceed to Add Attendees
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
