import { useState, useEffect } from 'react'
import { ClipboardList, Send, Bell, Clock, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Link2, Check, Loader2, Trash2, Plus, CalendarClock, RotateCcw } from 'lucide-react'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import DraftReviewDialog from '@/components/shared/DraftReviewDialog'
import type { AgentStatus } from '@/types/agent.types'
import { WEIGHTED_SCORECARD_STRUCTURE } from '@/types/scorecard.types'
import type { WeightedCategoryDef } from '@/types/scorecard.types'
import { dispatchInAppScorecard, buildScorecardLink, redoScorecard, getScorecardDispatchPreview } from '@/lib/scorecardApi'
import type { DispatchResponse } from '@/lib/scorecardApi'
import type { CycleAttendee } from '@/types/scheduling.types'
import { apiFetch } from '@/lib/api'
import { cn } from '@/utils/cn'

interface Props {
  vendorName: string
  cycleId: string
  quarter: string
  year: number
  attendees: CycleAttendee[]
  onDispatched: () => void
  onAttendeesChanged?: (updated: CycleAttendee[]) => void
  alreadyDispatched?: boolean
  /** The configured scorecard structure for this cycle (falls back to default). */
  structure?: WeightedCategoryDef[]
  /** Reopen the scorecard config (unlock) after a redo so it can be reconfigured. */
  onRedo?: () => void
}

interface ReminderTier {
  offset: number
  fire_date: string | null
  status: 'sent' | 'due' | 'scheduled'
}
interface ReminderStatus {
  cycle_id: string
  deadline: string | null
  offsets: number[]
  pending: number
  pending_names: string[]
  tiers: ReminderTier[]
}

function toneFor(offset: number) {
  if (offset <= 0) return { label: 'Escalation to organiser', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' }
  if (offset <= 2) return { label: 'Deadline notice', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' }
  return { label: 'Informational', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' }
}

/**
 * Live automated-reminder controls: a coordinator-chosen deadline, editable
 * T-minus offsets, per-tier status, and a manual "send now". Reminders fire
 * automatically via the backend daily scheduler (Mail.Send); escalation to the
 * VMO Coordinator goes out on the deadline day (offset 0).
 */
function ReminderScheduleCard({ cycleId }: { cycleId: string }) {
  const [deadline, setDeadline] = useState('')
  const [offsets, setOffsets] = useState<number[]>([5, 2, 0])
  const [status, setStatus] = useState<ReminderStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draftOpen, setDraftOpen] = useState(false)
  const [draft, setDraft] = useState<{ subject: string; body: string }>({ subject: '', body: '' })

  async function load() {
    try {
      const s = await apiFetch<ReminderStatus>(`/api/scorecard/reminders/${cycleId}`)
      setStatus(s)
      setDeadline(s.deadline ?? '')
      setOffsets(s.offsets?.length ? s.offsets : [5, 2, 0])
    } catch {
      /* leave defaults */
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cycleId])

  async function save() {
    if (!deadline) { setError('Pick a deadline date first.'); return }
    setSaving(true); setError(null); setMsg(null)
    try {
      const s = await apiFetch<ReminderStatus>(`/api/scorecard/reminders/${cycleId}`, {
        method: 'PUT',
        body: JSON.stringify({ deadline, offsets, form_base_url: window.location.origin }),
      })
      setStatus(s)
      setMsg('Reminder schedule saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save the schedule.')
    } finally {
      setSaving(false)
    }
  }

  // Open the draft editor seeded with the default reminder email.
  async function sendNow() {
    setError(null); setMsg(null)
    try {
      const p = await apiFetch<{ subject: string; html_body: string; text_body: string }>(
        `/api/scorecard/reminders/preview/${cycleId}`,
      )
      setDraft({ subject: p.subject, body: p.html_body })
      setDraftOpen(true)
    } catch {
      setError('Could not load the reminder draft.')
    }
  }

  async function doSendNow(edited: { subject: string; body: string }) {
    setSending(true); setError(null); setMsg(null)
    try {
      const r = await apiFetch<{ pending: number; sent: number; failed: number; escalated: number }>(
        `/api/scorecard/reminders/send-now/${cycleId}`,
        { method: 'POST', body: JSON.stringify({
          form_base_url: window.location.origin,
          subject_override: edited.subject,
          html_body_override: edited.body,
        }) },
      )
      setMsg(
        r.pending === 0
          ? 'Everyone has already submitted — no reminders sent.'
          : `Reminder sent to ${r.sent} pending reviewer${r.sent === 1 ? '' : 's'}${r.failed ? `, ${r.failed} failed` : ''}.`,
      )
      setDraftOpen(false)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send reminders.')
    } finally {
      setSending(false)
    }
  }

  const STATUS_BADGE = {
    sent: { label: 'Sent', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' },
    due: { label: 'Due now', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' },
    scheduled: { label: 'Scheduled', cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
  } as const

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Bell size={15} className="text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Automated Reminder Schedule</h3>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-2"><Loader2 size={13} className="animate-spin" /> Loading…</div>
      ) : (
        <>
          {/* Deadline */}
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-1"><CalendarClock size={12} /> Submission deadline</span>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white transition-colors"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Save schedule
            </button>
          </div>

          {/* Editable offsets */}
          <div className="space-y-2">
            {offsets.map((o, i) => {
              const tone = toneFor(o)
              const tier = status?.tiers.find((t) => t.offset === o)
              return (
                <div key={i} className={`flex items-center justify-between gap-2 p-2.5 rounded-lg ${tone.bg}`}>
                  <div className="flex items-center gap-2">
                    <Clock size={13} className={tone.color} />
                    <span className="text-xs text-slate-500 dark:text-slate-400">T−</span>
                    <input
                      type="number"
                      min={0}
                      value={o}
                      onChange={(e) => setOffsets((prev) => prev.map((x, j) => (j === i ? Math.max(0, Number(e.target.value)) : x)))}
                      className="w-14 px-1.5 py-1 text-xs text-center border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400">days</span>
                    <span className={`text-xs font-medium ${tone.color}`}>· {tone.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {tier && (
                      <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium', STATUS_BADGE[tier.status].cls)}>
                        {STATUS_BADGE[tier.status].label}
                        {tier.fire_date ? ` · ${tier.fire_date}` : ''}
                      </span>
                    )}
                    <button
                      onClick={() => setOffsets((prev) => prev.filter((_, j) => j !== i))}
                      className="p-1 text-slate-400 hover:text-red-500"
                      title="Remove reminder"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
            <button
              onClick={() => setOffsets((prev) => [...prev, 1])}
              className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              <Plus size={12} /> Add reminder
            </button>
          </div>

          {/* Pending + send now */}
          <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {status ? (
                status.pending === 0
                  ? 'All key reviewers have submitted.'
                  : `${status.pending} reviewer${status.pending === 1 ? '' : 's'} still pending.`
              ) : ''}
            </p>
            <button
              onClick={sendNow}
              disabled={sending}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-60 transition-colors"
            >
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Send reminder now
            </button>
          </div>

          {(msg || error) && (
            <p className={cn('text-xs mt-2', error ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>
              {error ?? msg}
            </p>
          )}
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            Reminders run automatically each day via the service mailbox. Escalation on the deadline day (T−0) alerts the VMO Coordinator.
          </p>
        </>
      )}

      <DraftReviewDialog
        open={draftOpen}
        kind="email"
        title="Review reminder email"
        subject={draft.subject}
        body={draft.body}
        recipients={status?.pending_names ?? []}
        requiredTokens={['{{link}}']}
        note="{{name}} and {{link}} are replaced with each pending reviewer's name and personal form link."
        sendLabel="Send reminder"
        busy={sending}
        onSend={doSendNow}
        onCancel={() => { if (!sending) setDraftOpen(false) }}
      />
    </div>
  )
}

function CategoriesDropdown({ structure }: { structure: WeightedCategoryDef[] }) {
  const [open, setOpen] = useState(false)
  const totalMeasures = structure.reduce((sum, c) => sum + c.measures.length, 0)
  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Scorecard Themes &amp; Measures
        </span>
        <span className="text-[10px] font-normal normal-case">{structure.length} themes &middot; {totalMeasures} measures</span>
      </button>
      {open && (
        <div className="space-y-2">
          {structure.map((cat) => (
            <div key={cat.key} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{cat.label}</span>
                <span className="text-xs text-slate-400">Weight {cat.weight}% &middot; {cat.measures.length} measures</span>
              </div>
              <div className="space-y-0.5">
                {cat.measures.map((m) => (
                  <div key={m.key} className="flex items-center justify-between text-xs py-0.5 px-2">
                    <span className="text-slate-600 dark:text-slate-400">{m.label}</span>
                    <span className="text-slate-400 dark:text-slate-500">{m.measure_type === 'rag' ? 'RAG' : '1–5'}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ScorecardDispatchPanel({ vendorName, cycleId, quarter, year, attendees, onDispatched, onAttendeesChanged, alreadyDispatched = false, structure, onRedo }: Props) {
  const effectiveStructure = structure && structure.length > 0 ? structure : WEIGHTED_SCORECARD_STRUCTURE
  const totalMeasures = effectiveStructure.reduce((sum, c) => sum + c.measures.length, 0)
  const [agentStatus, setAgentStatus] = useState<AgentStatus>(alreadyDispatched ? 'complete' : 'idle')
  const [showApproval, setShowApproval] = useState(false)
  const [dispatched, setDispatched] = useState(alreadyDispatched)
  const [dispatchResult, setDispatchResult] = useState<DispatchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)
  // Set after a redo — the next send uses the formal "corrected scorecard" email.
  const [reissue, setReissue] = useState(false)
  const [redoing, setRedoing] = useState(false)
  const [confirmRedo, setConfirmRedo] = useState(false)
  const [dispatchDraft, setDispatchDraft] = useState<{ subject: string; body: string }>({ subject: '', body: '' })

  // Teams the config assigns to ≥1 measure. A measure with a `teams` list is
  // team-restricted; if ANY measure is restricted we only invite people whose
  // team is assigned somewhere. If no measure carries a `teams` list (legacy /
  // unrestricted config) everyone key + internal is invited, as before.
  const teamOf = (a: CycleAttendee) => a.shell_department || a.name
  const assignedTeams = new Set<string>()
  let hasTeamConfig = false
  for (const cat of effectiveStructure) {
    for (const m of cat.measures) {
      if (Array.isArray(m.teams)) {
        hasTeamConfig = true
        m.teams.forEach((t) => assignedTeams.add(t))
      }
    }
  }

  // Recipients ARE the key internal stakeholders (one scorecard per team), further
  // narrowed to teams the config actually asks something of.
  // Anything not explicitly a Vendor counts as internal — robust to legacy/missing
  // `type` values so a key stakeholder never silently drops from the recipient list.
  const keyInternal = attendees.filter((a) => a.is_key && a.type !== 'Vendor')
  const recipients = hasTeamConfig
    ? keyInternal.filter((a) => assignedTeams.has(teamOf(a)))
    : keyInternal
  // Key internal stakeholders excluded because their team isn't assigned any measure.
  const excludedByTeam = hasTeamConfig ? keyInternal.filter((a) => !assignedTeams.has(teamOf(a))) : []
  // Internal stakeholders that could be added as recipients (not yet key).
  const addable = attendees.filter((a) => a.type !== 'Vendor' && !a.is_key)

  async function markKey(attendeeId: string) {
    setAddingId(attendeeId)
    setError(null)
    try {
      await apiFetch(`/api/cycles/${cycleId}/attendees/${attendeeId}`, {
        method: 'PUT',
        body: JSON.stringify({ is_key: true }),
      })
      // Only reflect the change locally once the backend has persisted it.
      onAttendeesChanged?.(attendees.map((a) => (a.attendee_id === attendeeId ? { ...a, is_key: true } : a)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that stakeholder as a recipient — please try again.')
    } finally {
      setAddingId(null)
    }
  }

  async function copyLink(attendeeId: string) {
    try {
      await navigator.clipboard.writeText(buildScorecardLink(cycleId, attendeeId))
      setCopiedId(attendeeId)
      setTimeout(() => setCopiedId((c) => (c === attendeeId ? null : c)), 1500)
    } catch { /* clipboard blocked */ }
  }

  // Open the editable draft, seeded with the real server-side template.
  async function handleGenerate() {
    setError(null)
    try {
      const p = await getScorecardDispatchPreview(cycleId, reissue)
      setDispatchDraft({ subject: p.subject, body: p.html_body })
      setAgentStatus('awaiting_approval')
      setShowApproval(true)
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : 'Could not load the email draft')
    }
  }

  async function handleApprove(edited: { subject: string; body: string }) {
    setAgentStatus('running')
    setShowApproval(false)
    setError(null)
    try {
      const result = await dispatchInAppScorecard({
        cycle_id: cycleId,
        vendor_name: vendorName,
        quarter,
        year,
        form_base_url: window.location.origin,
        recipients: recipients.map((a) => ({
          attendee_id: a.attendee_id,
          name: a.name,
          email: a.email,
          team: a.shell_department || a.name,
        })),
        reissue,
        subject_override: edited.subject,
        html_body_override: edited.body,
      })
      setDispatchResult(result)
      setAgentStatus('complete')
      setDispatched(true)
      onDispatched()
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : 'Failed to send emails')
      setAgentStatus('idle')
    }
  }

  // Redo: discard collected submissions + reopen the config so the scorecard can
  // be corrected and re-sent. Only the freshly-collected scorecard then counts.
  // Confirmed via the in-app ConfirmDialog (see `confirmRedo`).
  async function runRedo() {
    setRedoing(true)
    setError(null)
    try {
      await redoScorecard(cycleId)
      // Reopen the panel + config for a fresh send, flagged as a re-issue.
      setDispatched(false)
      setDispatchResult(null)
      setReissue(true)
      setAgentStatus('idle')
      onRedo?.()
      setConfirmRedo(false)
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : 'Failed to reopen the scorecard')
    } finally {
      setRedoing(false)
    }
  }

  const inputCls = 'px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500'

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-violet-50 dark:bg-violet-900/30 rounded-lg flex items-center justify-center">
              <ClipboardList size={18} className="text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Scorecard Request Dispatch</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {vendorName} &middot; {effectiveStructure.length} themes &middot; {totalMeasures} measures &middot; in-app form
              </p>
            </div>
          </div>
          <AgentStatusBadge status={agentStatus} />
        </div>

        <CategoriesDropdown structure={effectiveStructure} />

        {/* Recipients — key internal stakeholders (read-only) */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Recipients — key internal stakeholders ({recipients.length})
            </p>
            {addable.length > 0 && (
              <select
                value=""
                onChange={(e) => { if (e.target.value) { void markKey(e.target.value); e.currentTarget.value = '' } }}
                disabled={addingId !== null}
                className={cn(inputCls, 'max-w-52')}
                title="Add an internal stakeholder as a scorecard recipient"
              >
                <option value="">+ Add from attendees…</option>
                {addable.map((a) => (
                  <option key={a.attendee_id} value={a.attendee_id}>{a.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-1.5">
            {recipients.map((a) => (
              <div key={a.attendee_id} className="flex items-center gap-2 py-1.5 px-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-slate-700 dark:text-slate-300">{a.name}</span>
                  {(a.shell_department) && <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">{a.shell_department}</span>}
                  <span className="ml-2 text-xs text-slate-400">{a.email}</span>
                </div>
                <button
                  onClick={() => copyLink(a.attendee_id)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-violet-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg shrink-0"
                  title="Copy the scorecard form link (for testing without email)"
                >
                  {copiedId === a.attendee_id ? <Check size={12} className="text-emerald-500" /> : <Link2 size={12} />}
                  {copiedId === a.attendee_id ? 'Copied' : 'Copy link'}
                </button>
              </div>
            ))}
            {recipients.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 py-2">
                {hasTeamConfig && keyInternal.length > 0
                  ? 'No recipients — none of the key stakeholders’ teams are assigned to any measure. Assign teams in the scorecard config above.'
                  : 'No key internal stakeholders yet. Mark attendees as “Key” in the attendee step, or add one above.'}
              </p>
            )}
          </div>
          {excludedByTeam.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
              {excludedByTeam.length} key stakeholder{excludedByTeam.length !== 1 ? 's' : ''} not shown — their team isn&apos;t assigned to any measure in the config.
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
            Each recipient gets a unique in-app form link tied to their identity — with only the measures assigned to their team. Use <strong>Copy link</strong> to test without sending email.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-400 flex items-center gap-1.5"><AlertTriangle size={14} />{error}</p>
          </div>
        )}

        {dispatchResult && (
          <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 mb-2">
              <CheckCircle2 size={14} />{dispatchResult.sent} of {dispatchResult.total} emails sent
            </p>
            <div className="space-y-1">
              {dispatchResult.results.map((r) => (
                <div key={r.email} className="flex items-center gap-2 text-xs">
                  {r.status === 'sent' ? <CheckCircle2 size={11} className="text-emerald-600" /> : <AlertTriangle size={11} className="text-red-600" />}
                  <span className="text-slate-600 dark:text-slate-400">{r.attendee} ({r.email}) — {r.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {reissue && !dispatched && (
          <div className="mb-3 flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
            <RotateCcw size={14} className="mt-0.5 shrink-0" />
            <span>Previous scorecard reopened. Correct the configuration above if needed, then re-send — reviewers will get a formal notice to disregard the earlier scorecard and complete the corrected one.</span>
          </div>
        )}
        {!dispatched ? (
          <button
            onClick={handleGenerate}
            disabled={agentStatus === 'running' || agentStatus === 'awaiting_approval' || recipients.length === 0}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {agentStatus === 'running' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {agentStatus === 'running'
              ? 'Preparing dispatch…'
              : `${reissue ? 'Re-send Corrected Scorecard' : 'Send Scorecard Link'} to ${recipients.length} Recipient${recipients.length !== 1 ? 's' : ''}`}
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-700 dark:text-emerald-400 text-sm font-medium">
              <Send size={14} /> Scorecard links dispatched via Outlook
            </div>
            {/* Redo — mistake on the scorecard? Reopen config + re-send. */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between px-1">
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Something wrong with the scorecard? Reopen the configuration and send a corrected one.
              </p>
              <button
                onClick={() => { setError(null); setConfirmRedo(true) }}
                disabled={redoing}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-60 shrink-0"
              >
                {redoing ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                Redo scorecard
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reminder schedule — live, configurable, sent via the service mailbox */}
      <ReminderScheduleCard cycleId={cycleId} />

      <ConfirmDialog
        open={confirmRedo}
        tone="danger"
        title="Redo the scorecard?"
        confirmLabel="Yes, redo scorecard"
        cancelLabel="Cancel"
        busy={redoing}
        onConfirm={runRedo}
        onCancel={() => setConfirmRedo(false)}
        message={
          <>
            This will discard <strong>all scorecard submissions</strong> collected so far and reopen the
            configuration so you can correct it and send again. Reviewers will receive a formal notice to
            disregard the previous scorecard and complete the corrected one.
          </>
        }
      />

      <DraftReviewDialog
        open={showApproval}
        kind="email"
        title={reissue ? 'Review corrected scorecard email' : 'Review scorecard request email'}
        subject={dispatchDraft.subject}
        body={dispatchDraft.body}
        recipients={recipients.map((a) => `${a.name} (${a.email})`)}
        requiredTokens={['{{link}}']}
        note="{{name}} and {{link}} are replaced with each recipient's name and personal scorecard link. Sent from the Mobility Vendor Pulse service mailbox (Outlook)."
        sendLabel={reissue ? 'Re-send via Outlook' : 'Send via Outlook'}
        busy={agentStatus === 'running'}
        onSend={handleApprove}
        onCancel={() => { setShowApproval(false); setAgentStatus('idle') }}
      />
    </div>
  )
}
