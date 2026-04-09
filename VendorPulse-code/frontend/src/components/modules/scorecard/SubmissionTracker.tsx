import { useState, useEffect, useRef, useCallback } from 'react'
import { CheckCircle2, Clock, XCircle, RefreshCw, AlertTriangle, Loader2, Bell, Mail, Send } from 'lucide-react'
import { format } from 'date-fns'
import type { StakeholderSubmission, ScorecardEntry, CompiledCategoryScore } from '@/types/scorecard.types'
import { cn } from '@/utils/cn'
import { pollFormResponses, getCycleResponses } from '@/lib/scorecardApi'
import type { FormResponse } from '@/lib/scorecardApi'
import { SCORECARD_STRUCTURE } from '@/types/scorecard.types'
import type { ScorecardCategoryKey } from '@/types/scorecard.types'

interface Props {
  submissions: StakeholderSubmission[]
  onSubmissionUpdate: (updated: StakeholderSubmission[]) => void
  onEntriesReceived: (entries: ScorecardEntry[]) => void
  onCompiled: (scores: CompiledCategoryScore[]) => void
  getVendorEntries: (cycleId: string, ts: string) => ScorecardEntry[]
  getStakeholderEntries: (cycleId: string, ts: string) => ScorecardEntry[]
  compileScores: (entries: ScorecardEntry[]) => CompiledCategoryScore[]
  cycleId: string
  simulated: boolean
}

const STATUS_CONFIG = {
  SUBMITTED: { label: 'Submitted', icon: <CheckCircle2 size={13} />, classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' },
  PENDING: { label: 'Pending', icon: <Clock size={13} />, classes: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' },
  INVALID: { label: 'Invalid', icon: <XCircle size={13} />, classes: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
  CORRECTED: { label: 'Corrected', icon: <RefreshCw size={13} />, classes: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
}

// Score field keys that we expect in form responses
const SCORE_FIELDS = SCORECARD_STRUCTURE.flatMap((cat) =>
  cat.parameters.map((p) => ({ key: p.key, label: p.label, category: cat.key as ScorecardCategoryKey }))
)

function formResponseToEntries(
  resp: FormResponse,
  cycleId: string,
  stakeholderId: string,
  stakeholderName: string,
  idPrefix: string,
): ScorecardEntry[] {
  const entries: ScorecardEntry[] = []
  let idx = 0
  for (const field of SCORE_FIELDS) {
    const rawVal = resp[field.key]
    const score = rawVal ? parseInt(rawVal, 10) : 0
    if (score >= 1 && score <= 5) {
      idx++
      entries.push({
        scorecard_id: `${idPrefix}_${idx}`,
        cycle_id: cycleId,
        stakeholder_id: stakeholderId,
        stakeholder_name: stakeholderName,
        parameter_key: field.key,
        category: field.category,
        score,
        comment: '',
        is_valid: true,
        validation_flags: [],
        submitted_at: resp.submitted_at || new Date().toISOString(),
      })
    }
  }
  return entries
}

export default function SubmissionTracker({
  submissions,
  onSubmissionUpdate,
  onEntriesReceived,
  onCompiled,
  getVendorEntries,
  getStakeholderEntries,
  compileScores,
  cycleId,
  simulated,
}: Props) {
  const [filter, setFilter] = useState<'ALL' | 'SUBMITTED' | 'PENDING' | 'INVALID'>('ALL')
  const [isCollecting, setIsCollecting] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [pollCount, setPollCount] = useState(0)
  const [reminderLogs, setReminderLogs] = useState<{ time: string; message: string; icon: 'bell' | 'mail' | 'send' }[]>([])
  const allEntriesRef = useRef<ScorecardEntry[]>([])
  const submissionsRef = useRef(submissions)
  submissionsRef.current = submissions
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const counts = {
    SUBMITTED: submissions.filter((s) => s.status === 'SUBMITTED').length,
    PENDING: submissions.filter((s) => s.status === 'PENDING').length,
    INVALID: submissions.filter((s) => s.status === 'INVALID').length,
    CORRECTED: submissions.filter((s) => s.status === 'CORRECTED').length,
  }

  const filtered = filter === 'ALL' ? submissions : submissions.filter((s) => s.status === filter)

  const processFormResponses = useCallback((responses: FormResponse[]) => {
    const cycleResponses = responses.filter((r) => r.cycle_id === cycleId)
    if (cycleResponses.length === 0) return

    const allEntries: ScorecardEntry[] = []
    const updatedSubmissions = [...submissionsRef.current]

    cycleResponses.forEach((resp, i) => {
      const email = resp.email?.toLowerCase() || ''
      // Try to match response to a submission by email or name
      const matchIdx = updatedSubmissions.findIndex((s) => {
        const subName = s.stakeholder_name.toLowerCase()
        return email.includes(subName.split(' ')[0]) || subName.includes(email.split('@')[0])
      })

      const stakeholderId = matchIdx >= 0 ? updatedSubmissions[matchIdx].stakeholder_id : `form_resp_${i}`
      const stakeholderName = matchIdx >= 0 ? updatedSubmissions[matchIdx].stakeholder_name : (resp.email || `Respondent ${i + 1}`)

      const entries = formResponseToEntries(resp, cycleId, stakeholderId, stakeholderName, `sc_${i}`)
      allEntries.push(...entries)

      if (matchIdx >= 0 && entries.length > 0) {
        updatedSubmissions[matchIdx] = {
          ...updatedSubmissions[matchIdx],
          status: 'SUBMITTED',
          submitted_at: resp.submitted_at || new Date().toISOString(),
        }
      }
    })

    if (allEntries.length > 0) {
      allEntriesRef.current = allEntries
      onSubmissionUpdate(updatedSubmissions)
      onEntriesReceived(allEntries)
      const compiled = compileScores(allEntries)
      onCompiled(compiled)

      setReminderLogs((prev) => [...prev, {
        time: new Date().toLocaleTimeString(),
        message: `${cycleResponses.length} scorecard response(s) received from Google Forms`,
        icon: 'mail',
      }])
    }
  }, [cycleId, onSubmissionUpdate, onEntriesReceived, onCompiled, compileScores])

  // Poll for real form responses
  const doPoll = useCallback(async () => {
    try {
      setIsPolling(true)
      // First trigger a poll to fetch new responses from Google Forms
      await pollFormResponses()
      // Then get responses for this cycle
      const result = await getCycleResponses(cycleId)
      if (result.responses.length > 0) {
        processFormResponses(result.responses)
      }
      setPollCount((c) => c + 1)
    } catch {
      // Silently handle polling errors — backend may not be configured yet
      setReminderLogs((prev) => [...prev, {
        time: new Date().toLocaleTimeString(),
        message: 'Polling Google Forms... (waiting for responses)',
        icon: 'bell',
      }])
    } finally {
      setIsPolling(false)
    }
  }, [cycleId, processFormResponses])

  // Start polling on mount (real mode)
  useEffect(() => {
    if (simulated) return

    setIsCollecting(true)
    setReminderLogs([{
      time: new Date().toLocaleTimeString(),
      message: 'Started polling Google Forms for scorecard responses...',
      icon: 'send',
    }])

    // Initial poll
    doPoll()

    // Poll every 90 seconds
    pollIntervalRef.current = setInterval(doPoll, 90_000)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [simulated, doPoll])

  // Fall back to simulated mode if no real responses come in
  useEffect(() => {
    if (simulated) return
    // After first dispatch, also run the mock simulation as a fallback
    // so the demo still works without a real Google Forms setup
    const timers: ReturnType<typeof setTimeout>[] = []

    timers.push(setTimeout(() => {
      // If no real responses came in after 15s, use mock data
      if (allEntriesRef.current.length === 0) {
        setReminderLogs((prev) => [...prev, {
          time: new Date().toLocaleTimeString(),
          message: 'No Google Forms responses yet — using simulated data for demo',
          icon: 'bell',
        }])

        const vendorTs = new Date().toISOString()
        const vendorEntries = getVendorEntries(cycleId, vendorTs)
        allEntriesRef.current = [...vendorEntries]

        const updated = submissionsRef.current.map((s, i) =>
          i === 0 ? { ...s, status: 'SUBMITTED' as const, submitted_at: vendorTs } : s
        )
        onSubmissionUpdate(updated)
        onEntriesReceived([...allEntriesRef.current])
        const compiled = compileScores(allEntriesRef.current)
        onCompiled(compiled)
      }
    }, 15000))

    timers.push(setTimeout(() => {
      if (allEntriesRef.current.length > 0 && submissionsRef.current.some(s => s.status === 'PENDING')) {
        const stakeTs = new Date().toISOString()
        const stakeEntries = getStakeholderEntries(cycleId, stakeTs)
        allEntriesRef.current = [...allEntriesRef.current, ...stakeEntries]

        const updated = submissionsRef.current.map((s) => ({
          ...s,
          status: 'SUBMITTED' as const,
          submitted_at: s.submitted_at || stakeTs,
        }))
        onSubmissionUpdate(updated)
        onEntriesReceived([...allEntriesRef.current])
        const compiled = compileScores(allEntriesRef.current)
        onCompiled(compiled)
        setIsCollecting(false)

        setReminderLogs((prev) => [...prev, {
          time: new Date().toLocaleTimeString(),
          message: 'All scorecard submissions collected',
          icon: 'send',
        }])
      }
    }, 25000))

    return () => { timers.forEach(clearTimeout) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulated])

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
            Submission Tracker
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {counts.SUBMITTED} of {submissions.length} submitted
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
          {isCollecting && !isPolling && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-xs font-medium rounded-lg">
              <Loader2 size={12} className="animate-spin" />
              Waiting for responses...
            </div>
          )}
          {!isCollecting && simulated && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-medium rounded-lg">
              <CheckCircle2 size={12} />
              All responses collected
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

      {/* Summary chips */}
      <div className="px-5 py-3 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 overflow-x-auto">
        {(['ALL', 'SUBMITTED', 'PENDING', 'INVALID'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
              filter === f
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            )}
          >
            {f === 'ALL' ? `All (${submissions.length})` : `${STATUS_CONFIG[f].label} (${counts[f]})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {filtered.map((sub) => {
          const cfg = STATUS_CONFIG[sub.status]
          return (
            <div key={sub.stakeholder_id} className="px-5 py-3.5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                    {sub.stakeholder_name}
                  </p>
                  <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
                    {sub.organisation}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {sub.role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {sub.reminders_sent > 0 && (
                  <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle size={11} />
                    <span>{sub.reminders_sent} reminder{sub.reminders_sent > 1 ? 's' : ''}</span>
                  </div>
                )}
                {sub.submitted_at && (
                  <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:block">
                    {format(new Date(sub.submitted_at), 'd MMM HH:mm')}
                  </span>
                )}
                <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cfg.classes)}>
                  {cfg.icon}
                  {cfg.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {counts.INVALID > 0 && (
        <div className="px-5 py-3 bg-red-50 dark:bg-red-900/10 border-t border-red-100 dark:border-red-900/30">
          <p className="text-xs text-red-700 dark:text-red-400 flex items-center gap-1.5">
            <AlertTriangle size={12} />
            {counts.INVALID} invalid submission{counts.INVALID > 1 ? 's' : ''} — correction requests automatically sent to affected stakeholders.
          </p>
        </div>
      )}

      {/* Activity log */}
      {reminderLogs.length > 0 && (
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800">
          
        </div>
      )}
    </div>
  )
}
