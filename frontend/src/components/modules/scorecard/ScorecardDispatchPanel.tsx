import { useState, useEffect } from 'react'
import { ClipboardList, Send, Bell, Clock, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Link2, Check, Loader2, Trash2, Plus, CalendarClock, RotateCcw } from 'lucide-react'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import DraftReviewDialog from '@/components/shared/DraftReviewDialog'
import type { AgentStatus } from '@/types/agent.types'
import { WEIGHTED_SCORECARD_STRUCTURE } from '@/types/scorecard.types'
import type { WeightedCategoryDef } from '@/types/scorecard.types'
import { dispatchInAppScorecard, buildScorecardLink, redoScorecard, reopenScorecardTeam, getScorecardDispatchPreview } from '@/lib/scorecardApi'
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
  /** Teams the config was authored against. A key reviewer outside this roster was
   *  marked Key afterwards, so no measure can name them — they are asked everything
   *  rather than being filtered out of the recipient list. */
  configTeams?: string[]
  /** Reopen the scorecard config (unlock) after a FULL redo so it can be reconfigured. */
  onRedo?: () => void
  /** Fired after a reopen of any scope. `teams` is empty for a full redo (everyone).
   *  `openConfig` is the VMO's answer to "change the configuration first?" — the parent
   *  either expands the Configure Scorecard panel or scrolls to the dispatch step. */
  onReopened?: (teams: string[], openConfig: boolean) => void
  /** Emails already sent the scorecard. After dispatch, only reviewers NOT here (new
   *  or reopened teams) are offered a (re)send — so a resend never re-emails everyone. */
  dispatchedEmails?: string[]
  /** True while reviewers still hold a WITHDRAWN scorecard (raised by the parent on
   *  redo). It lives in the parent because this panel unmounts on every Scorecard
   *  sub-tab switch — as local state the "corrected scorecard" wording was lost the
   *  first time the VMO looked at Comparison & Finalize after a redo. */
  reissue?: boolean
  /** Called once every holder of the withdrawn scorecard has been re-sent. */
  onReissueHandled?: () => void
  /** Non-null → the scorecard configuration is unavailable, so the team filter cannot
   *  be trusted and sending is blocked. The rest of the panel (attendee controls, form
   *  links, Redo, reminders) stays usable. */
  dispatchBlockedReason?: string | null
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
  coordinator_email?: string | null
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
  // Where the deadline-day (T-0) escalation goes. The backend has always accepted this,
  // but nothing could set it — so the escalation fell through to "reviewers who are not
  // late" (handing peers the late reviewers' names and addresses) or to the unattended
  // service mailbox, which nobody reads.
  const [coordinatorEmail, setCoordinatorEmail] = useState('')
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
      setCoordinatorEmail(s.coordinator_email ?? '')
    } catch {
      /* leave defaults */
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cycleId])

  async function save() {
    if (!deadline) { setError('Pick a deadline date first.'); return }
    const coord = coordinatorEmail.trim()
    if (coord && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(coord)) {
      setError('Enter a valid escalation email address, or leave it blank.'); return
    }
    setSaving(true); setError(null); setMsg(null)
    try {
      const s = await apiFetch<ReminderStatus>(`/api/scorecard/reminders/${cycleId}`, {
        method: 'PUT',
        body: JSON.stringify({ deadline, offsets, form_base_url: window.location.origin, coordinator_email: coord || null }),
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
          // Not "everyone has already submitted": pre-dispatch, and right after a
          // reopen, pending is 0 because nobody is currently AWAITING a scorecard.
          ? 'No reviewer is currently awaiting a scorecard — no reminders sent.'
          : `Reminder sent to ${r.sent} pending reviewer${r.sent === 1 ? '' : 's'}${r.failed ? `, ${r.failed} failed` : ''}${r.escalated ? `, ${r.escalated} escalated to the VMO Coordinator` : ''}.`,
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
            <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-1"><Bell size={12} /> Escalation email (T−0)</span>
              <input
                type="email"
                value={coordinatorEmail}
                onChange={(e) => setCoordinatorEmail(e.target.value)}
                placeholder="vmo.coordinator@shell.com"
                className="px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[15rem]"
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
            Reminders run automatically each day via the service mailbox; the scheduled deadline-day tier (T−0) also alerts the VMO Coordinator. “Send reminder now” emails the pending reviewers only.
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

export default function ScorecardDispatchPanel({ vendorName, cycleId, quarter, year, attendees, onDispatched, onAttendeesChanged, alreadyDispatched = false, structure, configTeams, onRedo, dispatchedEmails = [], reissue = false, onReissueHandled, dispatchBlockedReason = null }: Props) {
  const effectiveStructure = structure && structure.length > 0 ? structure : WEIGHTED_SCORECARD_STRUCTURE
  const totalMeasures = effectiveStructure.reduce((sum, c) => sum + c.measures.length, 0)
  const [agentStatus, setAgentStatus] = useState<AgentStatus>(alreadyDispatched ? 'complete' : 'idle')
  const [showApproval, setShowApproval] = useState(false)
  const [dispatched, setDispatched] = useState(alreadyDispatched)
  const [dispatchResult, setDispatchResult] = useState<DispatchResponse | null>(null)
  // Addresses confirmed sent in this session. The parent's refetch is async (and
  // silently no-ops when the backend is unreachable), so without these the pending
  // block would offer a re-send to reviewers who were just emailed.
  const [sentEmails, setSentEmails] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)
  // `reissue` (the formal "corrected scorecard" email) is a PROP, not local state:
  // this panel unmounts on every Scorecard sub-tab switch, which used to discard it.
  const [redoing, setRedoing] = useState(false)
  const [confirmRedo, setConfirmRedo] = useState(false)
  // Reopen dialog: scope (everyone vs named teams) and whether to edit the config first.
  // Both the full redo and the per-team reopen now start here — the per-team buttons used
  // to live in the config panel's column headers, where they sat against a checkbox and
  // were easy to hit by accident.
  const [reopenScope, setReopenScope] = useState<'all' | 'teams'>('all')
  const [reopenTeams, setReopenTeams] = useState<Set<string>>(new Set())
  const [reopenEditConfig, setReopenEditConfig] = useState(true)
  const [dispatchDraft, setDispatchDraft] = useState<{ subject: string; body: string }>({ subject: '', body: '' })

  // Mirrors the backend's `_measure_asks_team` exactly — the reviewer's form and this
  // recipient list MUST agree, or someone is emailed a scorecard with no measures on it
  // (or, worse, is left out of a scorecard they are supposed to fill).
  const teamOf = (a: CycleAttendee) => a.shell_department || a.name
  const roster = new Set(configTeams ?? [])
  const allMeasures = effectiveStructure.flatMap((cat) => cat.measures)
  // Unrestricted measure => everyone; a restricted one => only the teams it names.
  const strictAsks = (m: { teams?: string[] }, team: string) =>
    !Array.isArray(m.teams) || m.teams.includes(team)
  // A reviewer is invited when ANY measure asks their team. Testing measure-by-measure
  // (rather than against a flattened union of every `teams` list) is what makes a MIXED
  // config work: a team included only implicitly, via an unrestricted measure, is no
  // longer dropped just because some OTHER measure carries an explicit `teams` list.
  //
  // The off-roster rescue is applied ONLY when the strict rule leaves the reviewer with
  // nothing AND their team predates nothing in the config (they were marked Key after it
  // was saved, so no measure could name them). Applying it per measure instead would
  // override every deliberate restriction. Mirrors the backend's `_asks_predicate`.
  const isAsked = (a: CycleAttendee) => {
    const team = teamOf(a)
    if (allMeasures.some((m) => strictAsks(m, team))) return true
    return !!team && !roster.has(team) && allMeasures.length > 0
  }

  // Recipients ARE the key internal stakeholders (one scorecard per team).
  // Anything not explicitly a Vendor counts as internal — robust to legacy/missing
  // `type` values so a key stakeholder never silently drops from the recipient list.
  const keyInternal = attendees.filter((a) => a.is_key && a.type !== 'Vendor')
  // The backend refuses a batch containing a DECLINED attendee (400, nothing sent), so
  // they must be held out here rather than killing the send for everyone else.
  const declinedKey = keyInternal.filter((a) => a.confirmation_status === 'DECLINED')
  const eligible = keyInternal.filter((a) => a.confirmation_status !== 'DECLINED')
  const recipients = eligible.filter(isAsked)
  // Key internal stakeholders excluded because their team isn't assigned any measure.
  const excludedByTeam = eligible.filter((a) => !isAsked(a))
  // Internal stakeholders that could be added as recipients (not yet key). A DECLINED
  // attendee is not offered: marking them Key would only park them in the declined
  // callout below, because the send holds declined reviewers out.
  const addable = attendees.filter((a) => a.type !== 'Vendor' && !a.is_key && a.confirmation_status !== 'DECLINED')

  // Server truth wins once it lands: drop any locally-remembered address the refreshed
  // prop no longer lists. Without this a per-team reopen (which removes that team from
  // scorecard_dispatched_to) stays masked by `sentEmails`, permanently hiding the
  // team-scoped resend. Keyed on CONTENTS, not array identity — the parent rebuilds the
  // array each render — so it can't fire before the refetch and wipe the stop-gap.
  const dispatchedKey = (dispatchedEmails ?? []).map((e) => (e || '').trim().toLowerCase()).sort().join('|')
  useEffect(() => {
    const propSet = new Set(dispatchedKey ? dispatchedKey.split('|') : [])
    setSentEmails((prev) => {
      const next = prev.filter((e) => propSet.has((e || '').trim().toLowerCase()))
      return next.length === prev.length ? prev : next
    })
  }, [dispatchedKey])

  // `alreadyDispatched` can flip AFTER mount: reopening the last dispatched team empties
  // scorecard_dispatched_to, which nulls scorecard_dispatched_at server-side and unlocks
  // the config panel above. Follow the prop here too, or the two adjacent panels report
  // opposite states for the same cycle. An in-flight send is never clobbered, and
  // `reissue` is owned by the parent, so a redo keeps its corrected-scorecard notice.
  useEffect(() => {
    setDispatched(alreadyDispatched)
    // Drop the stale "N of M emails sent" list, or it keeps reporting the reopened
    // team's reviewers as sent directly above the now-enabled send button.
    if (!alreadyDispatched) setDispatchResult(null)
    setAgentStatus((s) => (s === 'running' || s === 'awaiting_approval' ? s : alreadyDispatched ? 'complete' : 'idle'))
  }, [alreadyDispatched])

  // Only reviewers NOT already sent the scorecard are (re)sent — so after a per-team
  // reopen or a new team is added, the send goes ONLY to that team, never everyone.
  // Before the first dispatch, dispatchedEmails is empty → this equals `recipients`.
  const dispatchedSet = new Set([...(dispatchedEmails ?? []), ...sentEmails].map((e) => (e || '').trim().toLowerCase()))
  const pendingRecipients = recipients.filter((a) => !dispatchedSet.has((a.email || '').trim().toLowerCase()))
  // Teams with at least one reviewer already sent the scorecard — the only ones there is
  // anything to reopen. A team still pending is already open; offering it would be a no-op.
  const settledTeams = [...new Set(
    keyInternal
      .filter((a) => dispatchedSet.has((a.email || '').trim().toLowerCase()))
      .map((a) => teamOf(a))
      .filter(Boolean)
  )].sort((x, y) => x.localeCompare(y))

  // `isKey` is a parameter so the declined-attendance callout can also REMOVE someone:
  // once the meeting is scheduled, un-keying is the only way to clear a declined
  // reviewer out of the recipient count.
  async function markKey(attendeeId: string, isKey = true) {
    setAddingId(attendeeId)
    setError(null)
    try {
      await apiFetch(`/api/cycles/${cycleId}/attendees/${attendeeId}`, {
        method: 'PUT',
        body: JSON.stringify({ is_key: isKey }),
      })
      // Only reflect the change locally once the backend has persisted it.
      onAttendeesChanged?.(attendees.map((a) => (a.attendee_id === attendeeId ? { ...a, is_key: isKey } : a)))
    } catch (e) {
      setError(e instanceof Error ? e.message : isKey
        ? 'Could not add that stakeholder as a recipient — please try again.'
        : 'Could not remove that stakeholder as a reviewer — please try again.')
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
    // Belt and braces behind the disabled buttons: never open the send draft while the
    // configuration is missing — the recipient list would not be filtered by team.
    if (dispatchBlockedReason) {
      setError('The scorecard configuration could not be loaded, so dispatch is blocked. Retry the configuration above, then send.')
      return
    }
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
    // Never post an empty recipient list: the backend would report 0 of 0 sent and the
    // cycle would be marked dispatched without a single reviewer being emailed.
    if (pendingRecipients.length === 0) {
      setShowApproval(false)
      setAgentStatus('idle')
      setError('Nothing was sent — no reviewers are pending. If you just redid the scorecard, wait for the recipient list to refresh and try again.')
      return
    }
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
        recipients: pendingRecipients.map((a) => ({
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
      setSentEmails((prev) => [...prev, ...result.results.filter((r) => r.status === 'sent').map((r) => r.email)])
      // Nothing left the mailbox (service mailbox down / credential expired): the backend
      // returns 200 but deliberately does NOT set scorecard_dispatched_at. Treating that
      // as a dispatch would lock the config panel against a scorecard nobody received.
      if (result.sent === 0) {
        const firstError = result.results.find((r) => r.status === 'failed')?.error
        setError(
          `No scorecard emails could be sent${firstError ? ` — ${firstError}` : ''}. `
          + 'The scorecard is still unsent — fix the mail connection and try again.',
        )
        setAgentStatus('idle')
        return
      }
      setAgentStatus('complete')
      setDispatched(true)
      // The "corrected scorecard" notice belongs to the reviewers who hold the withdrawn
      // one. Once every one of them has been re-sent, later per-team sends (a new or
      // reopened team) are ordinary first-time requests again. `every`, not `sent > 0`:
      // on a partial failure the un-emailed reviewers still hold the withdrawn scorecard,
      // so the retry must keep the notice.
      // The length check matters in the window between the redo and the parent's
      // refetch: pendingRecipients is then a strict SUBSET of recipients, so a clean
      // send to that subset would clear the notice while the rest of the list still
      // holds the withdrawn scorecard and would be re-sent as a first-time request.
      if (reissue && result.results.length === recipients.length && result.results.every((r) => r.status === 'sent')) onReissueHandled?.()
      onDispatched()
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : 'Failed to send emails')
      setAgentStatus('idle')
    }
  }

  // Redo: discard collected submissions + reopen the config so the scorecard can
  // be corrected and re-sent. Only the freshly-collected scorecard then counts.
  // Confirmed via the in-app ConfirmDialog (see `confirmRedo`).
  async function runReopen() {
    const scopedTeams = reopenScope === 'teams' ? [...reopenTeams] : []
    if (reopenScope === 'teams' && scopedTeams.length === 0) return
    setRedoing(true)
    setError(null)
    try {
      if (reopenScope === 'all') {
        await redoScorecard(cycleId)
        setDispatched(false)
        setDispatchResult(null)
        setSentEmails([])  // the redo cleared the dispatched set server-side
        setAgentStatus('idle')
        // The re-issue flag is raised by the parent inside onRedo (see the `reissue`
        // prop), so it survives this panel unmounting on a sub-tab switch.
        onRedo?.()
      } else {
        // One call per team. Keep going if one fails: a partial reopen is recoverable
        // (retry the rest), but aborting midway would leave the VMO unsure which teams
        // were actually discarded.
        const failed: string[] = []
        const done: string[] = []
        for (const t of scopedTeams) {
          try {
            await reopenScorecardTeam(cycleId, t)
            done.push(t)
          } catch {
            failed.push(t)
          }
        }
        if (done.length) {
          // Drop the locally-remembered addresses for the teams that reopened, so their
          // reviewers reappear as pending without waiting for the parent's refetch.
          const reopenedEmails = new Set(
            keyInternal
              .filter((a) => done.includes(teamOf(a)))
              .map((a) => (a.email || '').trim().toLowerCase())
          )
          setSentEmails((prev) => prev.filter((e) => !reopenedEmails.has((e || '').trim().toLowerCase())))
          setDispatchResult(null)
        }
        if (failed.length) {
          setError(`Could not reopen ${failed.join(', ')}. The other teams were reopened — retry these.`)
          if (!done.length) return   // nothing changed; leave the dialog open to retry
        }
        onReopened?.(done, reopenEditConfig)
        setConfirmRedo(false)
        return
      }
      onReopened?.([], reopenEditConfig)
      setConfirmRedo(false)
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : 'Failed to reopen the scorecard')
    } finally {
      setRedoing(false)
    }
  }

  const inputCls = 'px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500'

  // Colour the dispatch summary by outcome: "0 of 3 emails sent" (mailbox down) and a
  // partial send must not be rendered in the green success box — nobody / not everybody
  // actually received the scorecard.
  const dispatchTone = !dispatchResult
    ? null
    : dispatchResult.sent === dispatchResult.total
      ? { ok: true, box: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800', text: 'text-emerald-800 dark:text-emerald-300' }
      : dispatchResult.sent === 0
        ? { ok: false, box: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800', text: 'text-red-800 dark:text-red-300' }
        : { ok: false, box: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800', text: 'text-amber-800 dark:text-amber-300' }

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
                {/* Three distinct empty states — say which one it is, so the VMO knows
                    whether to fix the config, the attendance, or the attendee list. */}
                {eligible.length > 0
                  ? 'No recipients — none of the key stakeholders’ teams are asked any measure. Assign teams in the scorecard config above.'
                  : keyInternal.length > 0
                    ? 'No recipients — every key internal stakeholder is marked “Not attending”.'
                    : 'No key internal stakeholders yet. Mark attendees as “Key” in the attendee step, or add one above.'}
              </p>
            )}
          </div>
          {excludedByTeam.length > 0 && (
            <div className="mt-2 flex items-start gap-1.5 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle size={13} className="mt-px shrink-0" />
              <span>
                <strong>{excludedByTeam.length} key stakeholder{excludedByTeam.length !== 1 ? 's' : ''} will NOT be sent a scorecard</strong>
                {' '}({excludedByTeam.map((a) => `${a.name} (${teamOf(a)})`).join(', ')}) — the configuration asks their team no measures.
                {' '}Open <strong>Configure Scorecard</strong> above and tick their team&apos;s column, then save.
              </span>
            </div>
          )}
          {declinedKey.length > 0 && (
            /* Amber callout, not an 11px grey footnote: these people are absent from the
               recipient list entirely, so this is their only signal. */
            <div className="mt-2 flex items-start gap-1.5 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle size={13} className="mt-px shrink-0" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <span className="block">
                  <strong>{declinedKey.length} key stakeholder{declinedKey.length !== 1 ? 's' : ''} declined the meeting</strong>
                  {' '}and {declinedKey.length !== 1 ? 'are' : 'is'} held out of the send — a batch naming a declined
                  reviewer is rejected outright, so nobody would be emailed. Change their attendance
                  response to include them, or remove them as a reviewer.
                </span>
                {declinedKey.map((a) => (
                  <div key={a.attendee_id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{a.name} <span className="text-amber-600/70 dark:text-amber-400/70">{a.email}</span></span>
                    <button
                      onClick={() => void markKey(a.attendee_id, false)}
                      disabled={addingId !== null}
                      className="shrink-0 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-60"
                      title="Stop treating this attendee as a scorecard reviewer"
                    >
                      Remove as reviewer
                    </button>
                  </div>
                ))}
              </div>
            </div>
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

        {dispatchResult && dispatchTone && (
          <div className={cn('mb-4 p-3 border rounded-lg', dispatchTone.box)}>
            <p className={cn('text-sm font-medium flex items-center gap-1.5 mb-2', dispatchTone.text)}>
              {dispatchTone.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {dispatchResult.sent} of {dispatchResult.total} emails sent
            </p>
            <div className="space-y-1">
              {/* Keyed by index as well: nothing dedupes the posted recipients, so the
                  same address twice (skipped + sent) would collide on `r.email` alone.
                  `items-start` + `mt-0.5` keeps the icon on the first line of a wrapped
                  error string instead of dragging it to the vertical middle. */}
              {dispatchResult.results.map((r, i) => (
                <div key={`${r.email}-${i}`} className="flex items-start gap-2 text-xs">
                  {r.status === 'sent'
                    ? <CheckCircle2 size={11} className="text-emerald-600 shrink-0 mt-0.5" />
                    : <AlertTriangle size={11} className={cn('shrink-0 mt-0.5', r.status === 'skipped' ? 'text-amber-600' : 'text-red-600')} />}
                  <span className="text-slate-600 dark:text-slate-400">
                    {r.name || r.email} ({r.email}) — {r.status}
                    {/* Without the reason a failed or skipped row is unactionable: the VMO
                        cannot tell a declined attendee from a rejected mailbox. */}
                    {r.status !== 'sent' && r.error ? `: ${r.error}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {dispatchBlockedReason && (
          /* The panel stays mounted on a config fault so the attendee controls, the form
             links and Redo survive it — only the two send entry points are gated. */
          <div className="mb-3 flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-300">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              <strong>Sending is blocked until the scorecard configuration loads.</strong> Without it the
              measure-to-team assignment is unknown, so the recipient list above is not filtered by team
              and a send would email stakeholders the configuration excludes. Attendee changes, form
              links, Redo and the reminder schedule all still work. ({dispatchBlockedReason})
            </span>
          </div>
        )}
        {reissue && !dispatched && (
          <div className="mb-3 flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
            <RotateCcw size={14} className="mt-0.5 shrink-0" />
            <span>Previous scorecard reopened. Correct the configuration above if needed, then re-send — reviewers will get a formal notice to disregard the earlier scorecard and complete the corrected one.</span>
          </div>
        )}
        {!dispatched ? (
          /* Label and enablement follow `pendingRecipients` — what is actually sent. */
          <>
            <button
              onClick={handleGenerate}
              disabled={agentStatus === 'running' || agentStatus === 'awaiting_approval' || pendingRecipients.length === 0 || !!dispatchBlockedReason}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {agentStatus === 'running' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {agentStatus === 'running'
                ? 'Preparing dispatch…'
                : `${reissue ? 'Re-send Corrected Scorecard' : 'Send Scorecard Link'} to ${pendingRecipients.length} Recipient${pendingRecipients.length !== 1 ? 's' : ''}`}
            </button>
            {recipients.length > 0 && pendingRecipients.length === 0 && (
              <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                Waiting for the recipient list to refresh after the reopen — reload the page if this persists.
              </p>
            )}
          </>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-700 dark:text-emerald-400 text-sm font-medium">
              <Send size={14} /> Scorecard links dispatched via Outlook
            </div>
            {/* Open teams (newly added or reopened) that haven't been sent yet — send
                the scorecard to ONLY those reviewers, never the whole list again. */}
            {pendingRecipients.length > 0 && (
              <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 p-3 space-y-2">
                <p className="text-xs text-violet-800 dark:text-violet-300">
                  {pendingRecipients.length} reviewer{pendingRecipients.length !== 1 ? 's have' : ' has'} not been sent the scorecard yet
                  ({pendingRecipients.map((a) => a.shell_department || a.name).join(', ')}) — a new or reopened team. Send to them only.
                </p>
                <button
                  onClick={handleGenerate}
                  disabled={agentStatus === 'running' || agentStatus === 'awaiting_approval' || !!dispatchBlockedReason}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {agentStatus === 'running' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Send Scorecard to {pendingRecipients.length} Reviewer{pendingRecipients.length !== 1 ? 's' : ''}
                </button>
              </div>
            )}
            {/* The single entry point for redoing a scorecard, at any scope. The per-team
                "Reopen" links used to sit in the Configure Scorecard column headers, flush
                against each column's checkbox — easy to hit by accident, and split the same
                decision across two panels. Scope is now chosen inside the dialog. */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between px-1">
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Something wrong with the scorecard? Reopen it for everyone, or for individual teams, and send a corrected one.
              </p>
              <button
                onClick={() => { setError(null); setConfirmRedo(true) }}
                disabled={redoing}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-60 shrink-0"
              >
                {redoing ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                Reopen scorecard
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
        title="Reopen the scorecard"
        confirmLabel={
          reopenScope === 'all'
            ? 'Reopen for all teams'
            : reopenTeams.size === 0
              ? 'Select a team'
              : `Reopen ${[...reopenTeams].join(', ')}`
        }
        cancelLabel="Cancel"
        busy={redoing}
        confirmDisabled={reopenScope === 'teams' && reopenTeams.size === 0}
        onConfirm={runReopen}
        onCancel={() => { if (!redoing) setConfirmRedo(false) }}
        message={
          <div className="space-y-4">
            <div>
              <p className="font-medium text-slate-700 dark:text-slate-200 mb-1.5">Who should redo the scorecard?</p>
              <label className="flex items-start gap-2 py-1 cursor-pointer">
                <input type="radio" name="reopen-scope" className="mt-0.5 accent-[#dd1d21]"
                  checked={reopenScope === 'all'} onChange={() => setReopenScope('all')} disabled={redoing} />
                <span>
                  <strong>All teams.</strong> Discards <strong>every</strong> submission collected so far.
                  Reviewers get a formal notice to disregard the previous scorecard.
                </span>
              </label>
              <label className={cn('flex items-start gap-2 py-1', settledTeams.length === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer')}>
                <input type="radio" name="reopen-scope" className="mt-0.5 accent-[#dd1d21]"
                  checked={reopenScope === 'teams'} onChange={() => setReopenScope('teams')}
                  disabled={redoing || settledTeams.length === 0} />
                <span>
                  <strong>Selected teams only.</strong> Discards just those teams' submissions; every other
                  team keeps its scores and its configuration.
                  {settledTeams.length === 0 && <em className="block text-xs mt-0.5">No team has been sent the scorecard yet.</em>}
                </span>
              </label>
              {reopenScope === 'teams' && settledTeams.length > 0 && (
                <div className="mt-2 ml-6 space-y-1 border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                  {settledTeams.map((t) => (
                    <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-[#dd1d21]"
                        checked={reopenTeams.has(t)}
                        disabled={redoing}
                        onChange={() => setReopenTeams((prev) => {
                          const next = new Set(prev)
                          if (next.has(t)) next.delete(t)
                          else next.add(t)
                          return next
                        })}
                      />
                      {t}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
              <p className="font-medium text-slate-700 dark:text-slate-200 mb-1.5">Change the scorecard configuration first?</p>
              <label className="flex items-start gap-2 py-1 cursor-pointer">
                <input type="radio" name="reopen-cfg" className="mt-0.5 accent-[#dd1d21]"
                  checked={reopenEditConfig} onChange={() => setReopenEditConfig(true)} disabled={redoing} />
                <span><strong>Yes</strong> — open Configure Scorecard so I can change which measures they are asked.</span>
              </label>
              <label className="flex items-start gap-2 py-1 cursor-pointer">
                <input type="radio" name="reopen-cfg" className="mt-0.5 accent-[#dd1d21]"
                  checked={!reopenEditConfig} onChange={() => setReopenEditConfig(false)} disabled={redoing} />
                <span><strong>No</strong> — the configuration is fine, take me straight to sending it again.</span>
              </label>
            </div>

            <p className="text-xs text-red-600 dark:text-red-400">
              Discarded scores cannot be recovered — those reviewers must fill the scorecard in again.
            </p>
          </div>
        }
      />

      <DraftReviewDialog
        open={showApproval}
        kind="email"
        title={reissue ? 'Review corrected scorecard email' : 'Review scorecard request email'}
        subject={dispatchDraft.subject}
        body={dispatchDraft.body}
        recipients={pendingRecipients.map((a) => `${a.name} (${a.email})`)}
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
