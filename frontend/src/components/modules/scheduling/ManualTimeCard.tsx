import { useState } from 'react'
import { Clock, CalendarPlus } from 'lucide-react'

type TimeZoneView = 'IST' | 'UTC' | 'GMT'

interface ManualTimeCardProps {
  /** Called with the chosen local ISO start, timezone, and duration (minutes). */
  onSchedule: (startLocalISO: string, timeZone: TimeZoneView, durationMinutes: number) => void
  defaultDuration?: number
  defaultTimeZone?: TimeZoneView
}

/**
 * "Prefer a specific time?" — schedule the meeting at a coordinator-chosen time
 * instead of a ranked suggestion. Used both on the Attendees page (before running
 * Find Slots) and inside the Slot Ranking panel. The chosen time still goes through
 * the same delegated Calendars.ReadWrite create path — all attendees are invited.
 */
export default function ManualTimeCard({
  onSchedule,
  defaultDuration = 60,
  defaultTimeZone = 'IST',
}: ManualTimeCardProps) {
  const [manualDateTime, setManualDateTime] = useState('')
  const [manualDuration, setManualDuration] = useState<number>(defaultDuration)
  const [timeZone, setTimeZone] = useState<TimeZoneView>(defaultTimeZone)

  function handleSchedule() {
    if (!manualDateTime) return
    const startISO = manualDateTime.length === 16 ? `${manualDateTime}:00` : manualDateTime
    onSchedule(startISO, timeZone, manualDuration)
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Clock size={15} className="text-slate-400" />
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Prefer a specific time?</h4>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        Skip the suggestions and schedule at a time you choose. All attendees are still invited.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="block text-xs text-slate-600 dark:text-slate-400">Date &amp; time</label>
          <input
            type="datetime-local"
            value={manualDateTime}
            onChange={(e) => setManualDateTime(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-slate-600 dark:text-slate-400">Timezone</label>
          <select
            value={timeZone}
            onChange={(e) => setTimeZone(e.target.value as TimeZoneView)}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="IST">IST</option>
            <option value="UTC">UTC</option>
            <option value="GMT">GMT</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-slate-600 dark:text-slate-400">Duration</label>
          <select
            value={manualDuration}
            onChange={(e) => setManualDuration(Number(e.target.value))}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value={30}>30 min</option>
            <option value={60}>60 min</option>
            <option value={90}>90 min</option>
            <option value={120}>120 min</option>
          </select>
        </div>
      </div>
      <button
        type="button"
        onClick={handleSchedule}
        disabled={!manualDateTime}
        className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
      >
        <CalendarPlus size={14} />
        Schedule at this time
      </button>
    </div>
  )
}
