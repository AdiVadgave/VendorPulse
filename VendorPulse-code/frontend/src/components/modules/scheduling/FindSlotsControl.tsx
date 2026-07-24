/**
 * "Find meeting slots" — pick a date range + duration, then ask Microsoft Graph
 * (delegated, as the signed-in coordinator) for common free slots across all
 * selected attendees' calendars. Ranked slots are handed back via onSlotsFound.
 *
 * Requires an SSO session (the calendar token comes from the coordinator's login).
 */
import { useState } from 'react'
import { CalendarSearch, Loader2, AlertCircle } from 'lucide-react'
import { findMeetingSlots, isSchedulingAvailable } from '@/lib/graphScheduling'
import type { CycleAttendee, SlotProposal } from '@/types/scheduling.types'

interface Props {
  cycleId: string
  attendees: CycleAttendee[]
  onSlotsFound: (slots: SlotProposal[]) => void
  defaultDuration?: number
}

function isoDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)
}

export default function FindSlotsControl({ cycleId, attendees, onSlotsFound, defaultDuration = 60 }: Props) {
  const [fromDate, setFromDate] = useState(isoDate(0))
  const [toDate, setToDate] = useState(isoDate(14))
  const [duration, setDuration] = useState<number>(defaultDuration)

  const shellCount = attendees.filter((a) => (a.email || '').toLowerCase().endsWith('@shell.com')).length
  const externalCount = attendees.length - shellCount
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFind() {
    setError(null)
    if (!isSchedulingAvailable()) {
      setError("You can't schedule — you're not signed in with Shell (SSO). Sign in with your Shell account to check calendars and send invites.")
      return
    }
    if (attendees.length === 0) {
      setError('Add at least one attendee before finding slots.')
      return
    }
    if (toDate < fromDate) {
      setError('The "to" date must be on or after the "from" date.')
      return
    }
    setLoading(true)
    try {
      const slots = await findMeetingSlots(cycleId, attendees, fromDate, toDate, duration)
      onSlotsFound(slots)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to find slots.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <CalendarSearch size={16} className="text-indigo-600 dark:text-indigo-400" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Find meeting slots</h3>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        Checks the <strong>{shellCount}</strong> Shell calendar{shellCount === 1 ? '' : 's'} over the chosen window and returns ranked free slots.
        {externalCount > 0 && (
          <> {externalCount} external invitee{externalCount === 1 ? '' : 's'} (non-Shell) will be invited at the time you pick — their calendars aren't checked.</>
        )}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-slate-600 dark:text-slate-400">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-600 dark:text-slate-400">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-600 dark:text-slate-400">Duration</label>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value={30}>30 minutes</option>
            <option value={60}>60 minutes</option>
            <option value={90}>90 minutes</option>
            <option value={120}>120 minutes</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <button
        onClick={handleFind}
        disabled={loading}
        className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <CalendarSearch size={14} />}
        {loading ? 'Checking calendars…' : 'Find Slots'}
      </button>
    </div>
  )
}
