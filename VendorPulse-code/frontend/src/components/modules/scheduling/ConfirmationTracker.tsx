import { useState } from 'react'
import { format } from 'date-fns'
import {
  CheckCircle2,
  XCircle,
  Clock,
  Bell,
  CalendarCheck,
  Key,
  Play,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import type { CycleAttendee, InviteStatus, SlotProposal } from '@/types/scheduling.types'
import { ROLE_LABELS } from '@/types/cycle.types'

interface ConfirmationTrackerProps {
  attendees: CycleAttendee[]
  slot: SlotProposal
}

const STATUS_CONFIG: Record<
  InviteStatus,
  { icon: React.ReactNode; label: string; classes: string }
> = {
  ACCEPTED: {
    icon: <CheckCircle2 size={14} />,
    label: 'Accepted',
    classes:
      'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  },
  DECLINED: {
    icon: <XCircle size={14} />,
    label: 'Declined',
    classes: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  },
  PENDING: {
    icon: <Clock size={14} />,
    label: 'Pending',
    classes:
      'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  },
}

export default function ConfirmationTracker({
  attendees: initialAttendees,
  slot,
}: ConfirmationTrackerProps) {
  const [attendees, setAttendees] = useState<CycleAttendee[]>(initialAttendees)
  const [nudgeSent, setNudgeSent] = useState<Set<string>>(new Set())
  const [simulating, setSimulating] = useState(false)

  const dateObj = new Date(slot.proposed_time)
  const accepted = attendees.filter((a) => a.invite_status === 'ACCEPTED')
  const declined = attendees.filter((a) => a.invite_status === 'DECLINED')
  const pending = attendees.filter((a) => a.invite_status === 'PENDING')

  function simulateRsvps() {
    setSimulating(true)
    setTimeout(() => {
      setAttendees((prev) =>
        prev.map((a) => a.invite_status === 'PENDING' ? { ...a, invite_status: 'ACCEPTED' } : a)
      )
      setSimulating(false)
    }, 1200)
  }

  function sendNudge(attendeeId: string) {
    setNudgeSent((prev) => new Set([...prev, attendeeId]))
  }

  return (
    <div className="space-y-4 fade-in">
      {/* Meeting confirmed banner */}
      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg flex items-center justify-center shrink-0">
            <CalendarCheck size={18} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-emerald-800 dark:text-emerald-300 text-sm">
              Meeting Scheduled
            </h3>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
              {format(dateObj, 'EEEE, d MMMM yyyy')} at{' '}
              {format(dateObj, 'h:mm a')} GMT · Conference Room B / Teams
            </p>
          </div>
          <AgentStatusBadge status="complete" label="Invite Sent" />
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { count: accepted.length, label: 'Accepted', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' },
          { count: pending.length, label: 'Pending', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
          { count: declined.length, label: 'Declined', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
        ].map((stat) => (
          <div
            key={stat.label}
            className={cn(
              'border rounded-xl p-4 text-center',
              stat.bg
            )}
          >
            <p className={cn('text-2xl font-bold', stat.color)}>
              {stat.count}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* RSVP table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            RSVP Status
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {accepted.length} accepted · {declined.length} declined ·{' '}
              {pending.length} pending
            </span>
            {pending.length > 0 && (
              <button
                onClick={simulateRsvps}
                disabled={simulating}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Play size={11} />
                {simulating ? 'Simulating…' : 'Simulate RSVPs'}
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
                <th className="text-left px-5 py-2.5 font-medium">Name</th>
                <th className="text-left px-4 py-2.5 font-medium">Role</th>
                <th className="text-left px-4 py-2.5 font-medium">Organisation</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-left px-4 py-2.5 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {attendees.map((a) => {
                const cfg = STATUS_CONFIG[a.invite_status]
                const nudged = nudgeSent.has(a.attendee_id)

                return (
                  <tr
                    key={a.attendee_id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        {a.is_key && (
                          <Key size={12} className="text-amber-500 shrink-0" />
                        )}
                        <span className="font-medium text-slate-800 dark:text-slate-200 text-sm">
                          {a.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                      {ROLE_LABELS[a.role]}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                      {a.organisation}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',
                          cfg.classes
                        )}
                      >
                        {cfg.icon}
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {a.invite_status === 'PENDING' && (
                        <button
                          onClick={() => sendNudge(a.attendee_id)}
                          disabled={nudged}
                          className={cn(
                            'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors',
                            nudged
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-default'
                              : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-amber-200 dark:border-amber-800'
                          )}
                        >
                          <Bell size={11} />
                          {nudged ? 'Nudge sent' : 'Send nudge'}
                        </button>
                      )}
                      {a.invite_status === 'DECLINED' && (
                        <span className="text-xs text-slate-400 dark:text-slate-500 italic">
                          No action required
                        </span>
                      )}
                      {a.invite_status === 'ACCEPTED' && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Auto-nudge notice */}
        {pending.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-amber-50/50 dark:bg-amber-900/10">
            <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <Bell size={12} />
              <span>
                {pending.length} attendee{pending.length > 1 ? 's have' : ' has'} not
                responded. Automated nudges are scheduled for{' '}
                <strong>T−2 days</strong> and <strong>T−day</strong> before the
                meeting.
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
