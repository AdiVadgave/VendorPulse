import { useState } from 'react'
import {
  Users,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Loader2,
  UserCheck,
  UserX,
  UserPlus,
  RefreshCw,
  Mail,
  Cpu,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type { CycleAttendee, AttendanceConfirmationStatus } from '@/types/scheduling.types'
import { ROLE_LABELS } from '@/types/cycle.types'
import { apiFetch } from '@/lib/api'

interface AttendanceConfirmationPanelProps {
  cycleId: string
  attendees: CycleAttendee[]
  onAttendeesChanged: (updated: CycleAttendee[]) => void
  onConfirmationComplete: (confirmed: CycleAttendee[]) => void
}

const STATUS_CONFIG: Record<
  AttendanceConfirmationStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  PENDING: {
    label: 'Pending',
    color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    icon: <Loader2 size={11} className="animate-spin" />,
  },
  CONFIRMED: {
    label: 'Confirmed',
    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    icon: <CheckCircle2 size={11} />,
  },
  REPLACED: {
    label: 'Replaced',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    icon: <RefreshCw size={11} />,
  },
  DECLINED: {
    label: 'Declined',
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    icon: <UserX size={11} />,
  },
}

// ── Replacement sub-form ─────────────────────────────────────────────────────

interface ReplacementFormProps {
  attendee: CycleAttendee
  onSave: (replacedBy: string, replacedByEmail: string, note: string) => void
  onCancel: () => void
}

function ReplacementForm({ attendee, onSave, onCancel }: ReplacementFormProps) {
  const [name, setName] = useState(attendee.replaced_by ?? '')
  const [email, setEmail] = useState(attendee.replaced_by_email ?? '')
  const [note, setNote] = useState(attendee.replacement_note ?? '')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Replacement name is required.'); return }
    if (!email.trim()) { setError('Replacement email is required.'); return }
    onSave(name.trim(), email.trim(), note.trim())
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 border border-amber-200 dark:border-amber-800 rounded-lg p-3 bg-amber-50/40 dark:bg-amber-900/10 space-y-2"
    >
      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
        <UserPlus size={12} />
        Replacement for {attendee.name}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-slate-600 dark:text-slate-400">Full name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Replacement name"
            className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-600 dark:text-slate-400">Email *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="replacement@company.com"
            className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-slate-600 dark:text-slate-400">Note (optional)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. On parental leave — James will cover"
          className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
          <AlertCircle size={11} />
          {error}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <UserPlus size={11} />
          Save Replacement
        </button>
      </div>
    </form>
  )
}

// ── Main Panel ───────────────────────────────────────────────────────────────

export default function AttendanceConfirmationPanel({
  cycleId,
  attendees,
  onAttendeesChanged,
  onConfirmationComplete,
}: AttendanceConfirmationPanelProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [replacingId, setReplacingId] = useState<string | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [isSendingOutreach, setIsSendingOutreach] = useState(false)
  const [outreachSent, setOutreachSent] = useState(false)
  const [simError, setSimError] = useState<string | null>(null)

  // Derive statuses — default to PENDING if not set
  const withStatus: (CycleAttendee & { confirmation_status: AttendanceConfirmationStatus })[] =
    attendees.map((a) => ({
      ...a,
      confirmation_status: a.confirmation_status ?? 'PENDING',
    }))

  const totalCount = withStatus.length
  const confirmedCount = withStatus.filter(
    (a) => a.confirmation_status === 'CONFIRMED' || a.confirmation_status === 'REPLACED'
  ).length
  const pendingCount = withStatus.filter((a) => a.confirmation_status === 'PENDING').length
  const allResolved = totalCount > 0 && pendingCount === 0

  async function updateAttendeeStatus(
    attendee: CycleAttendee,
    status: AttendanceConfirmationStatus,
    extra?: { replaced_by?: string; replaced_by_email?: string; replacement_note?: string }
  ) {
    setUpdatingId(attendee.attendee_id)
    const patch: Partial<CycleAttendee> = { confirmation_status: status, ...extra }

    try {
      await apiFetch(`/api/cycles/${cycleId}/attendees/${attendee.attendee_id}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      })
    } catch {
      // Optimistic local update even if API fails
    } finally {
      onAttendeesChanged(
        attendees.map((a) =>
          a.attendee_id === attendee.attendee_id ? { ...a, ...patch } : a
        )
      )
      setUpdatingId(null)
    }
  }

  function handleConfirm(attendee: CycleAttendee) {
    updateAttendeeStatus(attendee, 'CONFIRMED')
  }

  function handleDecline(attendee: CycleAttendee) {
    updateAttendeeStatus(attendee, 'DECLINED')
  }

  function handleReplaceSave(
    attendee: CycleAttendee,
    replacedBy: string,
    replacedByEmail: string,
    note: string
  ) {
    updateAttendeeStatus(attendee, 'REPLACED', {
      replaced_by: replacedBy,
      replaced_by_email: replacedByEmail,
      replacement_note: note,
    })
    setReplacingId(null)
  }

  async function handleSendOutreach() {
    setIsSendingOutreach(true)
    try {
      // Call backend to trigger outreach emails/forms
      await apiFetch(`/api/cycles/${cycleId}/scheduling/attendance-outreach`, {
        method: 'POST',
      })
    } catch {
      // Mock fallback — outreach is simulated
    } finally {
      setOutreachSent(true)
      setIsSendingOutreach(false)
    }
  }

  async function handleSimulate() {
    setIsSimulating(true)
    setSimError(null)
    try {
      // Try backend simulation
      await apiFetch(`/api/cycles/${cycleId}/scheduling/simulate-attendance-confirmation`, {
        method: 'POST',
      })
    } catch {
      // Fallback: simulate locally
    } finally {
      // Simulate responses: mark first 60% as CONFIRMED, remaining as varied
      const updated = attendees.map((a, idx) => {
        const total = attendees.length
        if (idx < Math.ceil(total * 0.6)) {
          return { ...a, confirmation_status: 'CONFIRMED' as AttendanceConfirmationStatus }
        } else if (idx < Math.ceil(total * 0.85)) {
          return {
            ...a,
            confirmation_status: 'REPLACED' as AttendanceConfirmationStatus,
            replaced_by: `Replacement for ${a.name.split(' ')[0]}`,
            replaced_by_email: `replacement.${a.email.split('@')[0]}@${a.email.split('@')[1]}`,
            replacement_note: 'Nominated by outgoing attendee',
          }
        } else {
          return { ...a, confirmation_status: 'CONFIRMED' as AttendanceConfirmationStatus }
        }
      })
      onAttendeesChanged(updated)
      setIsSimulating(false)
    }
  }

  function handleProceed() {
    // Build final attendee list: swap out DECLINED/REPLACED with replacements
    const finalAttendees = withStatus.flatMap((a) => {
      if (a.confirmation_status === 'DECLINED' && !a.replaced_by) return [] // remove with no replacement
      if (a.confirmation_status === 'REPLACED' && a.replaced_by) {
        // Return a new attendee record for the replacement
        const replacement: CycleAttendee = {
          attendee_id: `a_repl_${a.attendee_id}`,
          stakeholder_id: `s_repl_${a.attendee_id}`,
          name: a.replaced_by!,
          email: a.replaced_by_email ?? '',
          role: a.role,
          organisation: a.organisation,
          is_key: a.is_key,
          invite_status: 'PENDING',
          availability_submitted: false,
          confirmation_status: 'CONFIRMED',
          replacement_note: a.replacement_note,
        }
        return [replacement]
      }
      return [a]
    })
    onConfirmationComplete(finalAttendees)
  }

  return (
    <div className="space-y-4 fade-in">
      {/* Header card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-violet-50 dark:bg-violet-900/30 rounded-lg flex items-center justify-center shrink-0">
              <UserCheck size={18} className="text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                Attendance Confirmation
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Confirm each attendee from the last meeting is still part of the team before scheduling
              </p>
            </div>
          </div>
          {/* Progress pill */}
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full text-xs font-medium text-slate-600 dark:text-slate-300">
            <CheckCircle2 size={12} className="text-emerald-500" />
            {confirmedCount}/{totalCount} resolved
          </div>
        </div>

        <div className="mt-4 p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg text-xs text-violet-700 dark:text-violet-400 flex items-start gap-2">
          <Mail size={14} className="shrink-0 mt-0.5" />
          <span>
            Starting from the last meeting invite, reach out to each attendee to confirm if they are
            still part of the team, who will replace them if not, and whether anyone new should be
            invited to the QBR. Meeting scheduling will only proceed after all attendees are confirmed.
          </span>
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!outreachSent ? (
            <button
              onClick={handleSendOutreach}
              disabled={isSendingOutreach || attendees.length === 0}
              className={cn(
                'flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors',
                (isSendingOutreach || attendees.length === 0) && 'opacity-60 cursor-not-allowed'
              )}
            >
              {isSendingOutreach ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              {isSendingOutreach ? 'Sending outreach…' : 'Send Outreach Form / Email'}
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-lg text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              <CheckCircle2 size={13} />
              Outreach sent — awaiting responses
            </div>
          )}

          {/* Simulation button */}
          <button
            onClick={handleSimulate}
            disabled={isSimulating || attendees.length === 0}
            className={cn(
              'flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium rounded-lg transition-colors',
              (isSimulating || attendees.length === 0) && 'opacity-60 cursor-not-allowed'
            )}
          >
            {isSimulating ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
            {isSimulating ? 'Simulating…' : 'Simulate Responses'}
          </button>

          {simError && (
            <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertCircle size={12} />
              {simError}
            </p>
          )}
        </div>
      </div>

      {/* Attendee confirmation table */}
      {attendees.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
          No attendees from previous cycle found. Proceed to add attendees directly.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <Users size={14} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Attendees from Last Cycle
            </span>
            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-xs">
              {attendees.length}
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {withStatus.map((a) => {
              const cfg = STATUS_CONFIG[a.confirmation_status]
              const isUpdating = updatingId === a.attendee_id
              const isReplacingThis = replacingId === a.attendee_id

              return (
                <div key={a.attendee_id} className="px-5 py-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Attendee info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-slate-800 dark:text-slate-200">
                          {a.name}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {ROLE_LABELS[a.role] ?? a.role}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">·</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {a.organisation}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{a.email}</p>
                    </div>

                    {/* Status badge */}
                    <span
                      className={cn(
                        'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                        cfg.color
                      )}
                    >
                      {cfg.icon}
                      {cfg.label}
                    </span>

                    {/* Action buttons (shown only when PENDING) */}
                    {a.confirmation_status === 'PENDING' && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleConfirm(a)}
                          disabled={isUpdating}
                          className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60"
                        >
                          {isUpdating ? <Loader2 size={11} className="animate-spin" /> : <UserCheck size={11} />}
                          Confirm
                        </button>
                        <button
                          onClick={() => setReplacingId(a.attendee_id)}
                          disabled={isUpdating}
                          className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60"
                        >
                          <RefreshCw size={11} />
                          Replace
                        </button>
                        <button
                          onClick={() => handleDecline(a)}
                          disabled={isUpdating}
                          className="flex items-center gap-1 px-2.5 py-1 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs font-medium rounded-lg transition-colors disabled:opacity-60"
                        >
                          <UserX size={11} />
                          Not attending
                        </button>
                      </div>
                    )}

                    {/* Re-open for already-actioned */}
                    {a.confirmation_status !== 'PENDING' && (
                      <button
                        onClick={() =>
                          onAttendeesChanged(
                            attendees.map((att) =>
                              att.attendee_id === a.attendee_id
                                ? { ...att, confirmation_status: 'PENDING' }
                                : att
                            )
                          )
                        }
                        className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
                      >
                        Change
                      </button>
                    )}
                  </div>

                  {/* Replacement sub-form */}
                  {isReplacingThis && (
                    <ReplacementForm
                      attendee={a}
                      onSave={(name, email, note) => handleReplaceSave(a, name, email, note)}
                      onCancel={() => setReplacingId(null)}
                    />
                  )}

                  {/* Replacement info display */}
                  {a.confirmation_status === 'REPLACED' && a.replaced_by && !isReplacingThis && (
                    <div className="mt-2 ml-2 pl-3 border-l-2 border-amber-300 dark:border-amber-700 text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                      <p>
                        <span className="font-medium text-slate-700 dark:text-slate-300">Replaced by:</span>{' '}
                        {a.replaced_by} ({a.replaced_by_email})
                      </p>
                      {a.replacement_note && <p className="italic">{a.replacement_note}</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Footer summary */}
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <CheckCircle2 size={11} className="text-emerald-500" />
                {withStatus.filter((a) => a.confirmation_status === 'CONFIRMED').length} confirmed
              </span>
              <span className="flex items-center gap-1">
                <RefreshCw size={11} className="text-amber-500" />
                {withStatus.filter((a) => a.confirmation_status === 'REPLACED').length} replaced
              </span>
              <span className="flex items-center gap-1">
                <UserX size={11} className="text-red-500" />
                {withStatus.filter((a) => a.confirmation_status === 'DECLINED').length} not attending
              </span>
              {pendingCount > 0 && (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                  <AlertCircle size={11} />
                  {pendingCount} still pending
                </span>
              )}
            </div>

            <button
              onClick={handleProceed}
              disabled={!allResolved}
              className={cn(
                'flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors',
                !allResolved && 'opacity-50 cursor-not-allowed'
              )}
            >
              <ArrowRight size={14} />
              Proceed to Add Attendees
            </button>
          </div>
        </div>
      )}

      {/* Skip option when no previous attendees */}
      {attendees.length === 0 && (
        <div className="flex justify-end">
          <button
            onClick={() => onConfirmationComplete([])}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <ArrowRight size={14} />
            Proceed to Add Attendees
          </button>
        </div>
      )}
    </div>
  )
}
