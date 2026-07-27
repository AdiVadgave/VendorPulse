import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle2,
  XCircle,
  Clock,
  CircleDot,
  Bell,
  CalendarCheck,
  Key,
  ArrowRight,
  CalendarClock,
  ExternalLink,
  Link2Off,
  UserPlus,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import type { CycleAttendee, SlotProposal } from '@/types/scheduling.types'
import { ROLE_LABELS } from '@/types/cycle.types'
import { getEventAttendeeResponses, isSchedulingAvailable, type RsvpResponse } from '@/lib/graphScheduling'

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
  /** Graph event id — enables reading live RSVP responses from Outlook. */
  eventId?: string | null
  /** Toggle the inline "add attendee" panel (rendered by the parent below this). */
  onAddAttendee?: () => void
  /** Whether the inline add-attendee panel is currently open. */
  addAttendeeOpen?: boolean
  /** Rendered between the summary stats and the RSVP table (the add-attendee block). */
  addAttendeeSlot?: React.ReactNode
}

// The RSVP status we actually display (live from Outlook, falling back to stored).
type DisplayStatus = 'accepted' | 'tentative' | 'declined' | 'pending'

const STATUS_CONFIG: Record<
  DisplayStatus,
  { icon: React.ReactNode; label: string; classes: string }
> = {
  accepted: {
    icon: <CheckCircle2 size={14} />,
    label: 'Accepted',
    classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  },
  tentative: {
    icon: <CircleDot size={14} />,
    label: 'Tentative',
    classes: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  },
  declined: {
    icon: <XCircle size={14} />,
    label: 'Declined',
    classes: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  },
  pending: {
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
  eventId,
  onAddAttendee,
  addAttendeeOpen,
  addAttendeeSlot,
}: ConfirmationTrackerProps) {
  const [nudgeSent, setNudgeSent] = useState<Set<string>>(new Set())

  // Live RSVP responses from the Outlook event (email → response).
  const [liveRsvp, setLiveRsvp] = useState<Record<string, RsvpResponse>>({})
  const [rsvpLoading, setRsvpLoading] = useState(false)
  const [rsvpError, setRsvpError] = useState<string | null>(null)
  const [rsvpFetched, setRsvpFetched] = useState(false)
  const canReadRsvp = Boolean(eventId) && isSchedulingAvailable()

  const refreshRsvp = useCallback(async () => {
    if (!eventId || !isSchedulingAvailable()) return
    setRsvpLoading(true)
    setRsvpError(null)
    try {
      setLiveRsvp(await getEventAttendeeResponses(eventId))
      setRsvpFetched(true)
    } catch (e) {
      setRsvpError(e instanceof Error ? e.message : 'Could not read RSVP responses')
    } finally {
      setRsvpLoading(false)
    }
  }, [eventId])

  // Pull live responses on mount / when the event becomes available.
  useEffect(() => { void refreshRsvp() }, [refreshRsvp])

  // Effective status = live Outlook response when known, else the stored invite status.
  const statusOf = useCallback((a: CycleAttendee): DisplayStatus => {
    const live = liveRsvp[(a.email || '').toLowerCase()]
    if (live === 'accepted' || live === 'organizer') return 'accepted'
    if (live === 'declined') return 'declined'
    if (live === 'tentative') return 'tentative'
    // live === 'none' (not responded) or no live data → fall back to stored status.
    if (a.invite_status === 'ACCEPTED') return 'accepted'
    if (a.invite_status === 'DECLINED') return 'declined'
    return 'pending'
  }, [liveRsvp])
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
  const accepted  = attendees.filter((a) => statusOf(a) === 'accepted')
  const tentative = attendees.filter((a) => statusOf(a) === 'tentative')
  const declined  = attendees.filter((a) => statusOf(a) === 'declined')
  const pending   = attendees.filter((a) => statusOf(a) === 'pending')



  // Mark a local follow-up reminder for a pending attendee. This does NOT send an
  // email (meeting RSVPs are driven by the Outlook invite itself) — it's a tracking
  // marker for the coordinator, so the copy is deliberately "log", not "send".
  function logReminder(attendee: CycleAttendee) {
    setNudgeSent((prev) => new Set([...prev, attendee.attendee_id]))
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

      {/* Summary stats (Tentative tile shown only when someone responded tentatively) */}
      {(() => {
        const tiles = [
          { count: accepted.length, label: 'Accepted', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' },
          ...(tentative.length > 0 ? [{ count: tentative.length, label: 'Tentative', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' }] : []),
          { count: pending.length,  label: 'Pending',  color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
          { count: declined.length, label: 'Declined', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
        ]
        return (
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
            {tiles.map((stat) => (
              <div key={stat.label} className={cn('border rounded-xl p-4 text-center', stat.bg)}>
                <p className={cn('text-2xl font-bold', stat.color)}>{stat.count}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Add-attendee block — sits below the stats, above the RSVP table. */}
      {addAttendeeSlot}

      {/* RSVP table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            RSVP Status
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
              {accepted.length} accepted{tentative.length ? ` · ${tentative.length} tentative` : ''} · {declined.length} declined · {pending.length} pending
            </span>
            {canReadRsvp && (
              <button
                type="button"
                onClick={() => void refreshRsvp()}
                disabled={rsvpLoading}
                title="Refresh RSVP responses from Outlook"
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors"
              >
                {rsvpLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Refresh
              </button>
            )}
            {onAddAttendee && (
              <button
                type="button"
                onClick={onAddAttendee}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
              >
                <UserPlus size={12} />
                {addAttendeeOpen ? 'Close' : 'Add attendee'}
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
                const status = statusOf(a)
                const cfg    = STATUS_CONFIG[status]
                const nudged = nudgeSent.has(a.attendee_id)

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
                      {status === 'pending' && (
                        <button
                          onClick={() => logReminder(a)}
                          disabled={nudged}
                          title="Log a follow-up reminder for this attendee (does not send an email — RSVPs come from the Outlook invite)"
                          className={cn(
                            'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors',
                            nudged
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-default'
                              : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-amber-200 dark:border-amber-800'
                          )}
                        >
                          <Bell size={11} />
                          {nudged ? 'Reminder logged' : 'Log reminder'}
                        </button>
                      )}
                      {status === 'declined' && (
                        <span className="text-xs text-slate-400 dark:text-slate-500 italic">
                          No action required
                        </span>
                      )}
                      {(status === 'accepted' || status === 'tentative') && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Source of the statuses shown above. */}
        <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-800">
          {rsvpError ? (
            <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <XCircle size={12} /> Couldn&rsquo;t read live RSVPs: {rsvpError}
            </p>
          ) : canReadRsvp ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-emerald-500" />
              Live from Outlook — reflects each invitee&rsquo;s actual response.{rsvpFetched ? '' : ' Loading…'} Use <strong>Refresh</strong> to update.
            </p>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
              <Clock size={12} /> Sign in with Shell to read live RSVP responses — showing the last saved status.
            </p>
          )}
        </div>

        {pending.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-amber-50/50 dark:bg-amber-900/10">
            <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <Bell size={12} />
              <span>
                {pending.length} attendee{pending.length > 1 ? 's have' : ' has'} not
                responded yet. Use <strong>Log reminder</strong> to note a follow-up for them.
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
