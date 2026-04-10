import { useState, useEffect, useRef, useCallback } from 'react'
import { CheckCircle2, Clock, RefreshCw, Loader2, Mail } from 'lucide-react'
import { format } from 'date-fns'
import type { SubmissionTrackerData, SubmissionTrackerEntry } from '@/types/scorecard.types'
import { cn } from '@/utils/cn'
import { POLLING_INTERVALS } from '@/utils/constants'
import { getSubmissionTracker, pollFormResponses } from '@/lib/scorecardApi'

interface Props {
  cycleId: string
  onSubmissionsUpdated?: ((data: SubmissionTrackerData) => void) | (() => void) | (() => Promise<void>)
}

export default function SubmissionTracker({ cycleId, onSubmissionsUpdated }: Props) {
  const [tracker, setTracker] = useState<SubmissionTrackerData | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [pollCount, setPollCount] = useState(0)
  const [lastPollTime, setLastPollTime] = useState<string | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const doPoll = useCallback(async () => {
    try {
      setIsPolling(true)
      // First trigger a poll to fetch new responses from Google Forms
      try { await pollFormResponses() } catch { /* auth may not be ready */ }
      // Then get the submission tracker
      const data = await getSubmissionTracker(cycleId)
      setTracker(data)
      onSubmissionsUpdated?.(data)
      setPollCount((c) => c + 1)
      setLastPollTime(new Date().toLocaleTimeString())
    } catch {
      // Backend may not be ready
    } finally {
      setIsPolling(false)
    }
  }, [cycleId, onSubmissionsUpdated])

  // Poll on mount and then on the configured interval
  useEffect(() => {
    doPoll()
    pollIntervalRef.current = setInterval(doPoll, POLLING_INTERVALS.SUBMISSION_TRACKER_MS)
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [doPoll])

  if (!tracker) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" />
          Loading submission tracker...
        </div>
      </div>
    )
  }

  const { total_key_attendees, submitted, pending, tracker: entries } = tracker

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
            Submission Tracker
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {submitted} of {total_key_attendees} key attendees submitted
            {pollCount > 0 && <span className="ml-2 text-indigo-500">(polled {pollCount}x)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isPolling && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs font-medium rounded-lg">
              <Loader2 size={11} className="animate-spin" />
              Polling...
            </div>
          )}
          {!isPolling && pending === 0 && total_key_attendees > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-medium rounded-lg">
              <CheckCircle2 size={12} />
              All responses collected
            </div>
          )}
          {!isPolling && pending > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-xs font-medium rounded-lg">
              <Clock size={12} />
              {pending} pending
            </div>
          )}
          <button
            onClick={doPoll}
            disabled={isPolling}
            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
            title="Poll Google Forms now"
          >
            <RefreshCw size={11} className={isPolling ? 'animate-spin' : ''} />
            Poll
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-5 py-2 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: total_key_attendees > 0 ? `${(submitted / total_key_attendees) * 100}%` : '0%' }}
            />
          </div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">
            {total_key_attendees > 0 ? Math.round((submitted / total_key_attendees) * 100) : 0}%
          </span>
        </div>
      </div>

      {/* Attendee list */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {entries.map((entry: SubmissionTrackerEntry) => (
          <div key={entry.attendee_id} className="px-5 py-3.5 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                  {entry.name}
                </p>
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0',
                  entry.type === 'Vendor'
                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                )}>
                  {entry.type}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {entry.gmail || entry.email} &middot; {entry.role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {entry.submitted_at && (
                <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:block">
                  {format(new Date(entry.submitted_at), 'd MMM HH:mm')}
                </span>
              )}
              {entry.submitted ? (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                  <CheckCircle2 size={13} />
                  Submitted
                </span>
              ) : (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                  <Clock size={13} />
                  Pending
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      {lastPollTime && (
        <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <Mail size={11} />
          Last polled at {lastPollTime}
        </div>
      )}
    </div>
  )
}
