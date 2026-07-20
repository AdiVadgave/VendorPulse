import { useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  Clock,
  Bell,
  CalendarCheck,
  Key,
  ArrowRight,
  CalendarClock,
  ExternalLink,
  Link2Off,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import type { CycleAttendee, InviteStatus, SlotProposal } from '@/types/scheduling.types'
import { ROLE_LABELS } from '@/types/cycle.types'

interface ConfirmationTrackerProps {
  cycleId: string
  attendees: CycleAttendee[]
  slot: SlotProposal
  timeZoneOverride?: 'IST' | 'UTC' | 'GMT'
  onProceed?: () => void
  /** Go back and change the manually-set meeting date/time. */
  onReschedule?: () => void
  /** The meeting join link the coordinator pasted (if any). */
  meetingUrl?: string | null
}

const STATUS_CONFIG: Record<
  InviteStatus,
  { icon: React.ReactNode; label: string; classes: string }
> = {
  ACCEPTED: {
    icon: <CheckCircle2 size={14} />,
    label: 'Accepted',
    classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  },
  DECLINED: {
    icon: <XCircle size={14} />,
    label: 'Declined',
    classes: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  },
  PENDING: {
    icon: <Clock size={14} />,
    label: 'Pending',
    classes: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  },
}

export default function ConfirmationTracker({
  attendees,
  slot,
  timeZoneOverride,
  onProceed,
  onReschedule,
  meetingUrl,
}: ConfirmationTrackerProps) {
  const [nudgeSent, setNudgeSent] = useState<Set<string>>(new Set())
  const [nudgingId, setNudgingId] = useState<string | null>(null)
  const dateObj = new Date(slot.proposed_time)
  const durationMin = slot.duration_minutes ?? 60

  const slotTimeZone = timeZoneOverride ?? slot.proposed_time_zone ?? 'UTC'
  const displayZone = slotTimeZone.toUpperCase().includes('IST') ? 'IST'
    : slotTimeZone.toUpperCase().includes('GMT') ? 'GMT'
      : 'UTC'

  const ianaZone = displayZone === 'IST'
    ? 'Asia/Kolkata'
    : displayZone === 'GMT'
      ? 'Etc/GMT'
      : 'UTC'

  const displayDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: ianaZone,
  })

  const displayTime = dateObj.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: ianaZone,
  })
  const accepted = attendees.filter((a) => a.invite_status === 'ACCEPTED')
  const declined = attendees.filter((a) => a.invite_status === 'DECLINED')
  const pending   = attendees.filter((a) => a.invite_status === 'PENDING')



  async function sendNudge(attendee: CycleAttendee) {
    setNudgingId(attendee.attendee_id)

    // Simulate network delay for UI
    await new Promise(resolve => setTimeout(resolve, 800))

    setNudgeSent((prev) => new Set([...prev, attendee.attendee_id]))
    setNudgingId(null)
  }

  return (
    <div className="space-y-4 fade-in">
      {/* Meeting scheduled banner */}
      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-9 h-9 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg flex items-center justify-center shrink-0">
            <CalendarCheck size={18} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-emerald-800 dark:text-emerald-300 text-sm">Meeting Scheduled</h3>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
              {displayDate} at {displayTime} {displayZone} · {durationMin} min
            </p>
            <div className="mt-1.5">
              {meetingUrl ? (
                <a
                  href={meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  <ExternalLink size={12} /> Join meeting link
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700/70 dark:text-emerald-400/70">
                  <Link2Off size={12} /> No meeting link added
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onReschedule && (
              <button
                onClick={onReschedule}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 bg-white/60 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-800 transition-colors"
              >
                <CalendarClock size={13} /> Reschedule
              </button>
            )}
            <AgentStatusBadge status="complete" label="Scheduled" />
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { count: accepted.length, label: 'Accepted', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' },
          { count: pending.length,  label: 'Pending',  color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
          { count: declined.length, label: 'Declined', color: 'text-red-600 dark:text-red-400',        bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
        ].map((stat) => (
          <div
            key={stat.label}
            className={cn('border rounded-xl p-4 text-center', stat.bg)}
          >
            <p className={cn('text-2xl font-bold', stat.color)}>{stat.count}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* RSVP table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            RSVP Status
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {accepted.length} accepted · {declined.length} declined · {pending.length} pending
          </span>
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
                const cfg    = STATUS_CONFIG[a.invite_status]
                const nudged = nudgeSent.has(a.attendee_id)
                const isNudging = nudgingId === a.attendee_id

                return (
                  <tr
                    key={a.attendee_id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        {a.is_key && <Key size={12} className="text-amber-500 shrink-0" />}
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
                          onClick={() => sendNudge(a)}
                          disabled={nudged || isNudging}
                          className={cn(
                            'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors',
                            nudged || isNudging
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-default'
                              : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-amber-200 dark:border-amber-800'
                          )}
                        >
                          <Bell size={11} />
                          {isNudging ? 'Sending…' : nudged ? 'Nudge sent' : 'Send nudge'}
                        </button>
                      )}
                      {a.invite_status === 'DECLINED' && (
                        <span className="text-xs text-slate-400 dark:text-slate-500 italic">
                          No action required
                        </span>
                      )}
                      {a.invite_status === 'ACCEPTED' && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {pending.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-amber-50/50 dark:bg-amber-900/10">
            <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <Bell size={12} />
              <span>
                {pending.length} attendee{pending.length > 1 ? 's have' : ' has'} not
                responded yet. Use <strong>Send nudge</strong> to log a reminder for them.
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Proceed to Scorecard — the meeting date is saved; move on whenever ready. */}
      {onProceed && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Meeting date saved</p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
              You can move on to collecting scorecards whenever you&rsquo;re ready.
            </p>
          </div>
          <button
            onClick={onProceed}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Proceed to Scorecard
            <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
