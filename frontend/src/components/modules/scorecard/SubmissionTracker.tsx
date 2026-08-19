import { useState, useEffect, useRef, useCallback } from 'react'
import { CheckCircle2, Clock, RefreshCw, Loader2, ChevronDown, ChevronRight, Send, Trash2, Link2, Check, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import type { TeamSubmissionsData, TeamSubmissionEntry } from '@/types/scorecard.types'
import type { CycleAttendee } from '@/types/scheduling.types'
import { cn } from '@/utils/cn'
import { POLLING_INTERVALS } from '@/utils/constants'
import { getTeamSubmissions, dispatchInAppScorecard, deleteScorecardSubmission, buildScorecardLink } from '@/lib/scorecardApi'

interface Props {
  cycleId: string
  vendorName: string
  quarter: string
  year: number
  /** Full attendee list — used to resolve the delivery email address for a resend. */
  attendees: CycleAttendee[]
  onSubmissionsUpdated?: ((data: TeamSubmissionsData) => void) | (() => void) | (() => Promise<void>)
}

export default function SubmissionTracker({ cycleId, vendorName, quarter, year, attendees, onSubmissionsUpdated }: Props) {
  const [open, setOpen] = useState(false)
  const [tracker, setTracker] = useState<TeamSubmissionsData | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [lastPollTime, setLastPollTime] = useState<string | null>(null)
  const [allCollected, setAllCollected] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [sentId, setSentId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const callbackRef = useRef(onSubmissionsUpdated)
  callbackRef.current = onSubmissionsUpdated

  const doPoll = useCallback(async () => {
    try {
      setIsPolling(true)
      const data = await getTeamSubmissions(cycleId)
      setTracker(data)
      callbackRef.current?.(data)
      setLastPollTime(new Date().toLocaleTimeString())
      setAllCollected(data.total > 0 && data.pending === 0)
    } catch {
      /* backend may not be ready */
    } finally {
      setIsPolling(false)
    }
  }, [cycleId])

  // Poll on mount / cycle change.
  useEffect(() => { doPoll() }, [doPoll])

  // Keep the interval running while anything is still pending; stop once everything
  // is collected. If a delete re-opens a submission (allCollected → false) the
  // interval is recreated automatically, so the tracker keeps updating.
  useEffect(() => {
    if (allCollected) return
    const id = setInterval(doPoll, POLLING_INTERVALS.SUBMISSION_TRACKER_MS)
    return () => clearInterval(id)
  }, [allCollected, doPoll])

  // Ask one attendee to fill (email the form link via Outlook) — usable at any time.
  const requestFill = useCallback(async (entry: TeamSubmissionEntry) => {
    setBusyId(entry.attendee_id)
    setRowError(null)
    try {
      const att = attendees.find((a) => a.attendee_id === entry.attendee_id)
      await dispatchInAppScorecard({
        cycle_id: cycleId,
        vendor_name: vendorName,
        quarter,
        year,
        form_base_url: window.location.origin,
        recipients: [{
          attendee_id: entry.attendee_id,
          name: entry.name,
          email: att?.email || entry.email,
          team: entry.team,
        }],
      })
      setSentId(entry.attendee_id)
      setTimeout(() => setSentId((s) => (s === entry.attendee_id ? null : s)), 2000)
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Failed to send — check the service mailbox config, or use Copy link.')
    } finally {
      setBusyId(null)
    }
  }, [attendees, cycleId, vendorName, quarter, year])

  const copyLink = useCallback(async (attendeeId: string) => {
    try {
      await navigator.clipboard.writeText(buildScorecardLink(cycleId, attendeeId))
      setCopiedId(attendeeId)
      setTimeout(() => setCopiedId((c) => (c === attendeeId ? null : c)), 1500)
    } catch { /* clipboard blocked */ }
  }, [cycleId])

  // Delete an attendee's submission — re-opens their scorecard so they can refill.
  const deleteSubmission = useCallback(async (entry: TeamSubmissionEntry) => {
    setBusyId(entry.attendee_id)
    setRowError(null)
    try {
      await deleteScorecardSubmission(cycleId, entry.attendee_id)
      setAllCollected(false)
      await doPoll()
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Failed to delete submission')
    } finally {
      setBusyId(null)
      setConfirmDeleteId(null)
    }
  }, [cycleId, doPoll])

  if (!tracker) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" />
          Loading submission tracker…
        </div>
      </div>
    )
  }

  const { total, submitted, pending, tracker: entries } = tracker

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o) } }}
        className="px-5 py-4 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-start gap-2">
          <span className="text-slate-400 dark:text-slate-500 mt-0.5">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
          <div>
          <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
            Submission Tracker
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              submitted === total && total > 0
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
            )}>
              {submitted}/{total} submitted
            </span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {submitted} of {total} key internal-stakeholder teams submitted
            {lastPollTime && <span className="ml-2 text-slate-400">· Last checked {lastPollTime}</span>}
          </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isPolling && pending === 0 && total > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-medium rounded-lg">
              <CheckCircle2 size={12} /> All responses collected
            </div>
          )}
          {!isPolling && pending > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-xs font-medium rounded-lg">
              <Clock size={12} /> {pending} pending
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); doPoll() }}
            disabled={isPolling}
            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={11} className={isPolling ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {open && <>
      <div className="px-5 py-2 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: total > 0 ? `${(submitted / total) * 100}%` : '0%' }} />
          </div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">
            {total > 0 ? Math.round((submitted / total) * 100) : 0}%
          </span>
        </div>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {entries.length === 0 && (
          <div className="px-5 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            No key internal-stakeholder attendees yet. Add them in the attendee step, then dispatch the scorecard.
          </div>
        )}
        {entries.map((entry: TeamSubmissionEntry) => (
          <div key={entry.attendee_id} className="px-5 py-3.5 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{entry.name}</p>
                {entry.team && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 shrink-0">
                    {entry.team}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{entry.email}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {entry.submitted_at && (
                <span className="text-xs text-slate-400 dark:text-slate-500 hidden lg:block">
                  {format(new Date(entry.submitted_at), 'd MMM HH:mm')}
                </span>
              )}
              {entry.submitted ? (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                  <CheckCircle2 size={13} /> Submitted
                </span>
              ) : (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                  <Clock size={13} /> Pending
                </span>
              )}

              {/* Ask this attendee to (re)fill the scorecard. */}
              {!entry.submitted && (
                <>
                  <button
                    onClick={() => requestFill(entry)}
                    disabled={busyId === entry.attendee_id}
                    title="Email this attendee the scorecard form link (Outlook)"
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-50"
                  >
                    {busyId === entry.attendee_id ? <Loader2 size={12} className="animate-spin" />
                      : sentId === entry.attendee_id ? <Check size={12} className="text-emerald-500" /> : <Send size={12} />}
                    {sentId === entry.attendee_id ? 'Sent' : 'Request fill'}
                  </button>
                  <button
                    onClick={() => copyLink(entry.attendee_id)}
                    title="Copy the form link (test without email)"
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-violet-600"
                  >
                    {copiedId === entry.attendee_id ? <Check size={12} className="text-emerald-500" /> : <Link2 size={12} />}
                    {copiedId === entry.attendee_id ? 'Copied' : 'Copy link'}
                  </button>
                </>
              )}

              {/* Delete this attendee's submission (re-opens it). */}
              {entry.submitted && (
                confirmDeleteId === entry.attendee_id ? (
                  <span className="flex items-center gap-1">
                    <button
                      onClick={() => deleteSubmission(entry)}
                      disabled={busyId === entry.attendee_id}
                      className="px-2 py-1 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      {busyId === entry.attendee_id ? 'Deleting…' : 'Delete'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(entry.attendee_id)}
                    title="Delete this submission (re-opens the scorecard for this attendee)"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Trash2 size={13} />
                  </button>
                )
              )}
            </div>
          </div>
        ))}
      </div>
      {rowError && (
        <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5"><AlertTriangle size={12} />{rowError}</p>
        </div>
      )}
      </>}
    </div>
  )
}
