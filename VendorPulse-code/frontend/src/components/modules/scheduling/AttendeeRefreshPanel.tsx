import { useState } from 'react'
import {
  Users,
  CheckCircle2,
  Key,
  ArrowRight,
  UserPlus,
  X,
  Send,
  Clock,
  Mail,
  UserCheck,
  UserX,
  UserPlus2,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type { CycleAttendee, SchedulingPhase } from '@/types/scheduling.types'
import type { StakeholderRole } from '@/types/cycle.types'
import { ROLE_LABELS } from '@/types/cycle.types'
import { MOCK_ATTENDEES_AFTER_RESPONSES } from '@/mock/scheduling.mock'

interface AttendeeRefreshPanelProps {
  attendees: CycleAttendee[]
  phase: SchedulingPhase
  onDispatchComplete: () => void
  onResponsesSimulated: (updated: CycleAttendee[]) => void
  simulatedAttendees: CycleAttendee[]
}

// Per-person simulated response data for the 3 questions
const SIMULATED_RESPONSES: Record<string, {
  stillOnTeam: boolean
  replacedBy?: string
  replacedByEmail?: string
  additionalInvitees?: string
}> = {
  a1: { stillOnTeam: true },
  a2: { stillOnTeam: true },
  a3: { stillOnTeam: true },
  a4: { stillOnTeam: false, replacedBy: 'Tom Baker', replacedByEmail: 'tom.baker@shell.com' },
  a5: { stillOnTeam: true },
  a6: { stillOnTeam: true, additionalInvitees: 'Nina Patel (Commercial Analyst)' },
  a7: { stillOnTeam: true },
  a8: { stillOnTeam: true },
  a9: { stillOnTeam: true },
}

const EMPTY_FORM = {
  name: '',
  email: '',
  role: 'VENDOR_MANAGER' as StakeholderRole,
  organisation: '',
  is_key: false,
}

export default function AttendeeRefreshPanel({
  attendees,
  phase,
  onDispatchComplete,
  onResponsesSimulated,
}: AttendeeRefreshPanelProps) {
  const dispatched = phase === 'refresh_dispatched'
  const [responsesIn, setResponsesIn] = useState(false)
  const [currentAttendees, setCurrentAttendees] = useState<CycleAttendee[]>(attendees)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  function handleSimulateResponses() {
    setCurrentAttendees(MOCK_ATTENDEES_AFTER_RESPONSES)
    setResponsesIn(true)
  }

  function handleAddAttendee() {
    if (!form.name.trim() || !form.email.trim() || !form.organisation.trim()) {
      setFormError('Name, email, and organisation are required.')
      return
    }
    const newAttendee: CycleAttendee = {
      attendee_id: `a_new_${Date.now()}`,
      stakeholder_id: `s_new_${Date.now()}`,
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      organisation: form.organisation.trim(),
      is_key: form.is_key,
      invite_status: 'PENDING',
      availability_submitted: false,
    }
    setCurrentAttendees((prev) => [...prev, newAttendee])
    setForm(EMPTY_FORM)
    setFormError('')
    setShowAddForm(false)
  }

  function handleRemoveAttendee(id: string) {
    setCurrentAttendees((prev) => prev.filter((a) => a.attendee_id !== id))
  }

  const respondedCount = Object.keys(SIMULATED_RESPONSES).length
  const replacements = Object.values(SIMULATED_RESPONSES).filter((r) => !r.stillOnTeam)
  const additions = Object.values(SIMULATED_RESPONSES).filter((r) => r.additionalInvitees)

  return (
    <div className="space-y-4 fade-in">

      {/* ── Header card ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center shrink-0">
            <Users size={18} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
              Attendee Refresh
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Starting from the last meeting invite, reach out to each attendee to confirm
              they are still part of the team, identify replacements if not, and capture
              any additional invitees.
            </p>
          </div>
        </div>

        {/* Channel note */}
        <div className="mt-4 flex items-start gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-600 dark:text-slate-400">
          <Mail size={13} className="shrink-0 mt-0.5 text-slate-400" />
          <span>
            Outreach is sent as an <strong>email</strong> to each attendee. The email
            includes three questions: (1) Are you still part of the team? (2) If not, who
            replaces you? (3) Should anyone else be invited to this review?
          </span>
        </div>

        {/* Step 1 — pre-dispatch */}
        {!dispatched && !responsesIn && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-400 flex items-start gap-2">
            <Send size={13} className="shrink-0 mt-0.5" />
            <span>
              Ready to send refresh email to all{' '}
              <strong>{attendees.length} attendees</strong> from the previous
              meeting invite. Click below to dispatch.
            </span>
          </div>
        )}

        {/* Step 2 — awaiting responses */}
        {dispatched && !responsesIn && (
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
            <Clock size={13} className="shrink-0 mt-0.5" />
            <span>
              Refresh email dispatched to {attendees.length} attendees. Awaiting
              replies — the list below will update as responses arrive.
            </span>
          </div>
        )}

        {/* Step 3 — responses received */}
        {responsesIn && (
          <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-2">
            <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
            <span>
              All {respondedCount} responses received.{' '}
              {replacements.length > 0 && (
                <><strong>{replacements.length} replacement(s)</strong> confirmed. </>
              )}
              {additions.length > 0 && (
                <><strong>{additions.length} additional invitee(s)</strong> suggested. </>
              )}
              Review the updated list below, then proceed to check availability.
            </span>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {!dispatched && (
            <button
              onClick={onDispatchComplete}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Send size={14} />
              Dispatch Refresh Email
            </button>
          )}
          {dispatched && !responsesIn && (
            <button
              onClick={handleSimulateResponses}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Clock size={14} />
              Simulate Responses
            </button>
          )}
          {responsesIn && (
            <button
              onClick={() => onResponsesSimulated(currentAttendees)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Proceed to Availability Check
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Per-person responses (shown after simulate) ── */}
      {responsesIn && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Refresh Responses
            </span>
            <span className="ml-2 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full text-xs">
              {respondedCount}/{attendees.length} replied
            </span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {attendees.map((a) => {
              const resp = SIMULATED_RESPONSES[a.attendee_id]
              if (!resp) return null
              return (
                <div key={a.attendee_id} className="px-5 py-3.5 flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {resp.stillOnTeam
                      ? <UserCheck size={15} className="text-emerald-500" />
                      : <UserX size={15} className="text-red-500" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        {a.name}
                      </span>
                      {a.is_key && <Key size={11} className="text-amber-500" />}
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {ROLE_LABELS[a.role]}
                      </span>
                    </div>
                    {resp.stillOnTeam ? (
                      <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                        Still on the team
                      </p>
                    ) : (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                        No longer on team — replaced by{' '}
                        <strong>{resp.replacedBy}</strong>{' '}
                        <span className="text-slate-400">({resp.replacedByEmail})</span>
                      </p>
                    )}
                    {resp.additionalInvitees && (
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5 flex items-center gap-1">
                        <UserPlus2 size={11} />
                        Suggested additional invitee: <strong>{resp.additionalInvitees}</strong>
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Updated attendee list ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {responsesIn ? 'Updated Attendee List' : 'Previous Meeting Attendees'}
            </span>
            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-xs">
              {currentAttendees.length}
            </span>
          </div>
          {responsesIn && (
            <button
              onClick={() => { setShowAddForm((v) => !v); setFormError('') }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                showAddForm
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
              )}
            >
              <UserPlus size={13} />
              {showAddForm ? 'Cancel' : 'Add Attendee'}
            </button>
          )}
        </div>

        {/* Add Attendee Form */}
        {showAddForm && (
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">New Attendee</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Name *</label>
                <input type="text" value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Full name"
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Email *</label>
                <input type="email" value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@example.com"
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Organisation *</label>
                <input type="text" value={form.organisation}
                  onChange={(e) => setForm((f) => ({ ...f, organisation: e.target.value }))}
                  placeholder="Organisation name"
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Role</label>
                <select value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as StakeholderRole }))}
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {(Object.entries(ROLE_LABELS) as [StakeholderRole, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input type="checkbox" id="is_key" checked={form.is_key}
                onChange={(e) => setForm((f) => ({ ...f, is_key: e.target.checked }))}
                className="rounded border-slate-300 dark:border-slate-600 text-indigo-600"
              />
              <label htmlFor="is_key" className="text-xs text-slate-600 dark:text-slate-400">
                Key attendee (hard constraint for scheduling)
              </label>
            </div>
            {formError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{formError}</p>}
            <div className="mt-3 flex gap-2">
              <button onClick={handleAddAttendee}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <UserPlus size={13} />
                Add to List
              </button>
              <button onClick={() => { setShowAddForm(false); setFormError(''); setForm(EMPTY_FORM) }}
                className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
                <th className="text-left px-5 py-2.5 font-medium">Name</th>
                <th className="text-left px-4 py-2.5 font-medium">Role</th>
                <th className="text-left px-4 py-2.5 font-medium">Organisation</th>
                <th className="text-left px-4 py-2.5 font-medium">Notes</th>
                {responsesIn && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {currentAttendees.map((a) => (
                <tr key={a.attendee_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {a.is_key && <Key size={12} className="text-amber-500 shrink-0" />}
                      <span className="font-medium text-slate-800 dark:text-slate-200">{a.name}</span>
                      {a.replacement_note && (
                        <span className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded text-xs">
                          New
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{a.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">{ROLE_LABELS[a.role]}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">{a.organisation}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 italic">
                    {a.replacement_note ?? '—'}
                  </td>
                  {responsesIn && (
                    <td className="px-4 py-3">
                      <button onClick={() => handleRemoveAttendee(a.attendee_id)}
                        className="p-1 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors rounded"
                        title="Remove attendee"
                      >
                        <X size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <Key size={11} className="text-amber-500" />
            <span>Key attendee — hard constraint for scheduling</span>
          </div>
        </div>
      </div>
    </div>
  )
}
