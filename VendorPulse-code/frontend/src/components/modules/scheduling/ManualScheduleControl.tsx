import { useState } from 'react'
import { CalendarClock, Loader2, AlertCircle, PencilLine } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { SlotProposal } from '@/types/scheduling.types'
import { scheduleMeetingManual, getTokenOwnerOrganizerEmail } from '@/lib/schedulingApi'

type TimeZoneView = 'IST' | 'UTC' | 'GMT'

interface ManualScheduleControlProps {
  cycleId: string
  mode: 'schedule' | 'reschedule'
  defaultTimeZone?: TimeZoneView
  /** Called after the Teams meeting is created/updated via Graph. */
  onScheduled: (slot: SlotProposal, timeZone: TimeZoneView, teamsUrl: string | null) => void
}

const DURATION_OPTIONS = [
  { value: 0.5, label: '30 minutes' },
  { value: 1, label: '60 minutes' },
  { value: 1.5, label: '90 minutes' },
  { value: 2, label: '120 minutes' },
]

export default function ManualScheduleControl({
  cycleId,
  mode,
  defaultTimeZone = 'IST',
  onScheduled,
}: ManualScheduleControlProps) {
  const [open, setOpen] = useState(false)
  const [startLocal, setStartLocal] = useState('') // from <input type="datetime-local">
  const [durationHours, setDurationHours] = useState(0.5)
  const [timeZone, setTimeZone] = useState<TimeZoneView>(defaultTimeZone)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isReschedule = mode === 'reschedule'
  const ctaLabel = isReschedule ? 'Reschedule to this time' : 'Schedule at this time'

  async function handleSubmit() {
    if (!startLocal) {
      setError('Pick a date and time first.')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const organiserEmail = await getTokenOwnerOrganizerEmail()
      if (!organiserEmail) {
        setError('Could not resolve the organiser from the Graph token. Refresh GRAPH_ACCESS_TOKEN and retry.')
        return
      }
      // datetime-local yields "YYYY-MM-DDTHH:mm"; add seconds for the backend.
      const startTime = startLocal.length === 16 ? `${startLocal}:00` : startLocal
      const result = await scheduleMeetingManual(cycleId, {
        organiserEmail,
        startTime,
        durationHours,
        timeZone,
        reschedule: isReschedule,
      })
      if (result.slot) {
        onScheduled(result.slot, timeZone, result.teams_meeting_url ?? null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule the meeting via Graph')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        isReschedule
          ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
          : 'border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30'
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 text-left"
      >
        {isReschedule ? (
          <CalendarClock size={15} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
        ) : (
          <PencilLine size={15} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
        )}
        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
          {isReschedule ? 'Reschedule this meeting' : 'Schedule manually instead'}
        </span>
        <span className="ml-auto text-xs text-indigo-600 dark:text-indigo-400">
          {open ? 'Hide' : isReschedule ? 'Change time' : 'Pick my own time'}
        </span>
      </button>

      {!open && !isReschedule && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
          Prefer not to use the recommendations above? Set your own date and time — VendorPulse will still
          create the Teams meeting and send invites via Microsoft Graph.
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400 md:col-span-1">
              Date &amp; time
              <input
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
              Duration
              <select
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value))}
                className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
              Timezone
              <select
                value={timeZone}
                onChange={(e) => setTimeZone(e.target.value as TimeZoneView)}
                className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="IST">IST</option>
                <option value="UTC">UTC</option>
                <option value="GMT">GMT</option>
              </select>
            </label>
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertCircle size={12} />
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !startLocal}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              isSubmitting || !startLocal
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            )}
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />}
            {isSubmitting ? 'Scheduling via Graph…' : ctaLabel}
          </button>
        </div>
      )}
    </div>
  )
}
