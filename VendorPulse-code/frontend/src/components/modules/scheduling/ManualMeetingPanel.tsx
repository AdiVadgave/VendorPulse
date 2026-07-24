import { useState } from 'react'
import { CalendarClock, Loader2, AlertCircle, Users, ArrowRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { CycleAttendee } from '@/types/scheduling.types'
import { scheduleManualMeeting } from '@/lib/schedulingApi'
import { updateMeetingTime, createMeetingEvent, findEventIdByJoinUrl, isSchedulingAvailable } from '@/lib/graphScheduling'

type TimeZoneView = 'IST' | 'UTC' | 'GMT'

interface Props {
  cycleId: string
  attendees: CycleAttendee[]
  /** Graph event id of the meeting being rescheduled (null → looked up by join link). */
  existingEventId: string | null
  /** Existing meeting join link — used to locate the event when its id isn't stored. */
  existingMeetingUrl: string | null
  vendorName: string
  quarter: string
  year: number
  onBack?: () => void
  /** Called after the meeting has been rescheduled on the calendar + persisted. */
  onScheduled: (info: {
    startTime: string
    timeZone: TimeZoneView
    durationMinutes: number
    meetingUrl: string | null
    eventId: string | null
  }) => void
}

const DURATIONS = [
  { value: 30, label: '30 minutes' },
  { value: 60, label: '60 minutes' },
  { value: 90, label: '90 minutes' },
  { value: 120, label: '120 minutes' },
]

/**
 * Reschedule the governance meeting. Because the Teams meeting is managed via
 * delegated Calendars.ReadWrite, this updates the ACTUAL calendar event time (Graph
 * PATCH), which re-notifies attendees — there is no manual meeting-link to paste.
 * Requires an SSO session (same as scheduling).
 */
export default function ManualMeetingPanel({
  cycleId,
  attendees,
  existingEventId,
  existingMeetingUrl,
  vendorName,
  quarter,
  year,
  onBack,
  onScheduled,
}: Props) {
  const [startLocal, setStartLocal] = useState('')      // from <input type="datetime-local">
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [timeZone, setTimeZone] = useState<TimeZoneView>('IST')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!startLocal) { setError('Pick a date and time first.'); return }
    if (!isSchedulingAvailable()) {
      setError("You can't reschedule — you're not signed in with Shell (SSO). Sign in with your Shell account and try again.")
      return
    }
    setSaving(true)
    setError(null)
    const startTime = startLocal.length === 16 ? `${startLocal}:00` : startLocal
    try {
      // Resolve the existing event: prefer the stored id; otherwise locate it by its
      // join link so we MOVE that meeting instead of creating a duplicate.
      let eventId: string | null = existingEventId
      if (!eventId && existingMeetingUrl) {
        eventId = await findEventIdByJoinUrl(existingMeetingUrl)
      }
      let meetingUrl: string | null = existingMeetingUrl

      if (eventId) {
        // Move the existing Teams event — Graph re-sends the updated invite.
        const updated = await updateMeetingTime({ eventId, startISO: startTime, durationMinutes })
        if (updated.teams_meeting_url) meetingUrl = updated.teams_meeting_url
      } else {
        // Genuinely no existing event to move → create one at the new time.
        const subject = `EGB/QBR Meeting Invitation — ${vendorName} ${quarter} ${year}`
        const bodyHtml =
          `<p>Dear Team,</p>` +
          `<p>You are invited to the <strong>EGB/QBR governance review</strong> for ` +
          `<strong>${vendorName} — ${quarter} ${year}</strong>.</p>` +
          `<p>Please accept or decline via Microsoft Teams.</p><p>— Mobility Vendor Pulse</p>`
        const created = await createMeetingEvent({
          slot: {
            slot_id: 'reschedule',
            cycle_id: cycleId,
            proposed_time: startTime,
            proposed_time_zone: timeZone,
            duration_minutes: durationMinutes,
          } as unknown as Parameters<typeof createMeetingEvent>[0]['slot'],
          attendees,
          subject,
          bodyText: bodyHtml,
        })
        meetingUrl = created.teams_meeting_url
        eventId = created.event_id
      }

      // Persist the new time (+ resolved event id / link) so future reschedules move it too.
      await scheduleManualMeeting(cycleId, { startTime, timeZone, durationMinutes, meetingUrl, eventId })
      setSaving(false)
      onScheduled({ startTime, timeZone, durationMinutes, meetingUrl, eventId })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reschedule the meeting.')
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center shrink-0">
              <CalendarClock size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Reschedule the Meeting</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pick a new time — the Teams meeting is updated and attendees are re-notified automatically.
              </p>
            </div>
          </div>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Back
            </button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
            Date &amp; time
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              className="px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
            Duration
            <select
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
            Timezone
            <select
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value as TimeZoneView)}
              className="px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="IST">IST</option>
              <option value="UTC">UTC</option>
              <option value="GMT">GMT</option>
            </select>
          </label>
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Users size={13} className="text-slate-400" />
          {attendees.length} attendee{attendees.length === 1 ? '' : 's'} will be re-notified
        </div>

        {error && (
          <p className="mt-3 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
            <AlertCircle size={12} /> {error}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={saving || !startLocal}
          className={cn(
            'mt-4 w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-colors',
            saving || !startLocal
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
          )}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
          {saving ? 'Rescheduling…' : 'Reschedule Meeting'}
        </button>
      </div>
    </div>
  )
}
