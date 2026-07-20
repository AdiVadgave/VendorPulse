import { useState } from 'react'
import { CalendarClock, Loader2, AlertCircle, Link2, Users, ArrowRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { CycleAttendee } from '@/types/scheduling.types'
import { scheduleManualMeeting } from '@/lib/schedulingApi'

type TimeZoneView = 'IST' | 'UTC' | 'GMT'

interface Props {
  cycleId: string
  attendees: CycleAttendee[]
  onBack?: () => void
  /** Called after the meeting date/time is saved to the DB. */
  onScheduled: (info: { startTime: string; timeZone: TimeZoneView; durationMinutes: number; meetingUrl: string | null }) => void
}

const DURATIONS = [
  { value: 30, label: '30 minutes' },
  { value: 60, label: '60 minutes' },
  { value: 90, label: '90 minutes' },
  { value: 120, label: '120 minutes' },
]

/**
 * Manual meeting scheduling — no Microsoft Graph / calendar access. The coordinator
 * picks the date/time (and optionally pastes a meeting link); it's persisted on the
 * cycle so the DB holds the scheduled date, and the workflow advances to
 * MEETING_SCHEDULED.
 */
export default function ManualMeetingPanel({ cycleId, attendees, onBack, onScheduled }: Props) {
  const [startLocal, setStartLocal] = useState('')      // from <input type="datetime-local">
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [timeZone, setTimeZone] = useState<TimeZoneView>('IST')
  const [meetingUrl, setMeetingUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!startLocal) { setError('Pick a date and time first.'); return }
    setSaving(true)
    setError(null)
    const startTime = startLocal.length === 16 ? `${startLocal}:00` : startLocal
    try {
      await scheduleManualMeeting(cycleId, {
        startTime, timeZone, durationMinutes, meetingUrl: meetingUrl.trim() || null,
      })
    } catch (e) {
      // Persisted best-effort; still advance the UI so the flow isn't blocked offline.
      setError(e instanceof Error ? e.message : 'Could not save to the server — continuing locally.')
    }
    setSaving(false)
    onScheduled({ startTime, timeZone, durationMinutes, meetingUrl: meetingUrl.trim() || null })
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
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Schedule the Meeting</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Set the governance meeting date &amp; time. This is saved on the cycle.
              </p>
            </div>
          </div>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Back to Attendees
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

        <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400 mt-3">
          Meeting link <span className="text-slate-400">(optional — paste a Teams/Zoom/Meet link)</span>
          <div className="relative">
            <Link2 size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="url"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              placeholder="https://teams.microsoft.com/l/meetup-join/…"
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </label>

        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Users size={13} className="text-slate-400" />
          {attendees.length} attendee{attendees.length === 1 ? '' : 's'} on this cycle
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
          {saving ? 'Saving…' : 'Confirm Meeting Date'}
        </button>
      </div>
    </div>
  )
}
