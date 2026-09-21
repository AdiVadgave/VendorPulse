import { useEffect, useState } from 'react'
import { FileText, Sparkles, Copy, CheckCircle2, Send, Users, Pencil, Plus, Trash2, X, Check, RefreshCw, AlertTriangle } from 'lucide-react'
import type { MeetingMinutes } from '@/types/meeting.types'
import type { MeetingNote } from '@/types/meeting.types'
import { generateMeetingMinutes, approveMinutes, sendMeetingMinutes, getMinutesRecipients } from '@/lib/meetingApi'
import type { SendMinutesRecipient, MinutesRecipient, SendMinutesResult } from '@/lib/meetingApi'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import ApprovalPanel from '@/components/shared/ApprovalPanel'
import type { AgentStatus } from '@/types/agent.types'

/** A recipient the mail provider rejected. The send endpoint answers 200 with a
 *  populated `failed` list when only SOME recipients bounce (503 only if all do). */
interface FailedRecipient {
  name?: string
  email: string
  error?: string
}

interface Props {
  cycleId: string
  notes: MeetingNote[]
  /** Previously-generated minutes, restored on load so the MoM isn't regenerated. */
  initialMinutes?: MeetingMinutes | null
  vendorName: string
  quarter: string
  year: number
  onApproved: () => void
  /** Persistence key for this meeting's MoM. Defaults to the first note's meeting_id.
   *  Pass explicitly for alignment / vendor-prep meetings so each MoM stores separately. */
  meetingId?: string
  /** Card heading — defaults to "Meeting Minutes". */
  heading?: string
}

export default function MeetingMinutesViewer({ cycleId, notes, initialMinutes = null, vendorName, quarter, year, onApproved, meetingId: meetingIdProp, heading = 'Meeting Minutes' }: Props) {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>(initialMinutes ? 'complete' : 'idle')
  const [minutes, setMinutes] = useState<MeetingMinutes | null>(initialMinutes)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<MeetingMinutes | null>(null)
  const [showApproval, setShowApproval] = useState(false)
  const [approved, setApproved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [isApproving, setIsApproving] = useState(false)
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [sentRecipients, setSentRecipients] = useState<SendMinutesRecipient[]>([])
  const [failedRecipients, setFailedRecipients] = useState<FailedRecipient[]>([])
  const [sendError, setSendError] = useState<string | null>(null)
  // Recipient selection: who receives the minutes. Fetched once the minutes are
  // approved. Internal stakeholders are pre-selected; external (vendor) recipients
  // are opt-in and only offered for Vendor Prep / SPR (not the Alignment call).
  const [recipients, setRecipients] = useState<MinutesRecipient[] | null>(null)
  // null until the backend has reported the policy — the banner must not assert one before then.
  const [allowExternal, setAllowExternal] = useState<boolean | null>(null)
  const [recipientsError, setRecipientsError] = useState<string | null>(null)
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set())
  const [recipientsReloadKey, setRecipientsReloadKey] = useState(0)

  // Hydrate persisted minutes when they arrive from the async load (after mount).
  // Only fills an empty viewer — never clobbers a freshly-generated set.
  useEffect(() => {
    if (initialMinutes) {
      setMinutes((prev) => prev ?? initialMinutes)
      setAgentStatus((prev) => (prev === 'idle' ? 'complete' : prev))
    }
  }, [initialMinutes])

  // Load the candidate recipients once the minutes are approved, so the coordinator
  // can pick who receives them. Internal stakeholders are pre-selected; external
  // (vendor) recipients start unchecked and must be chosen deliberately.
  // Re-runs when the meeting identity changes or the coordinator hits Refresh, so an
  // edited roster can't leave the picker showing people who are no longer invited.
  useEffect(() => {
    if (!approved) return
    let cancelled = false
    setRecipients(null)
    setAllowExternal(null)
    setSelectedEmails(new Set())
    setRecipientsError(null)
    ;(async () => {
      try {
        const meetingId = meetingIdProp ?? `mtg-${cycleId}`
        const res = await getMinutesRecipients(cycleId, meetingId)
        if (cancelled) return
        setRecipients(res.recipients)
        setAllowExternal(res.allow_external)
        setSelectedEmails(new Set(res.recipients.filter((r) => !r.external).map((r) => r.email)))
      } catch (e) {
        if (!cancelled) setRecipientsError(e instanceof Error ? e.message : 'Failed to load recipients')
      }
    })()
    return () => { cancelled = true }
  }, [approved, cycleId, meetingIdProp, recipientsReloadKey])

  function toggleRecipient(email: string) {
    setSelectedEmails((prev) => {
      const next = new Set(prev)
      if (next.has(email)) next.delete(email)
      else next.add(email)
      return next
    })
  }

  function setGroupSelected(emails: string[], on: boolean) {
    setSelectedEmails((prev) => {
      const next = new Set(prev)
      for (const e of emails) {
        if (on) next.add(e)
        else next.delete(e)
      }
      return next
    })
  }

  async function handleGenerate() {
    setAgentStatus('running')
    setError(null)
    try {
      const meetingId = meetingIdProp ?? notes[0]?.meeting_id ?? `mtg-${cycleId}`
      const attendees = [...new Set(notes.map((n) => n.raised_by))]
      const response = await generateMeetingMinutes(cycleId, meetingId, notes, attendees)
      if (response.status === 'success' && response.data) {
        setMinutes(response.data.minutes)
        setRunId(response.run_id ?? null)
        setAgentStatus('awaiting_approval')
        setShowApproval(true)
      } else {
        setError(response.summary || 'Failed to generate minutes')
        setAgentStatus('idle')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reach backend')
      setAgentStatus('idle')
    }
  }

  async function handleApprove() {
    setIsApproving(true)
    try {
      if (runId) {
        await approveMinutes(cycleId, runId)
      }
    } catch {
      // Approval persisting failed — still approve locally so UI isn't stuck
    }
    setShowApproval(false)
    setAgentStatus('complete')
    setApproved(true)
    setIsApproving(false)
    onApproved()
  }

  function handleCopy() {
    if (!minutes) return
    const text = [
      `${heading} — ${vendorName} ${quarter} ${year}`,
      `Date: ${minutes.meeting_date}`,
      `Attendees: ${minutes.attendees.join(', ')}`,
      '',
      'EXECUTIVE SUMMARY',
      minutes.executive_summary,
      '',
      'KEY DECISIONS',
      ...minutes.key_decisions.map((d, i) => `${i + 1}. ${d}`),
      '',
      'ACTION ITEMS',
      ...minutes.action_items.map((a, i) => `${i + 1}. ${a.description} — ${a.owner} (by ${a.due_date})`),
    ].join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function startEdit() {
    if (!minutes) return
    // Deep-ish copy so edits don't mutate the live minutes until Save.
    setDraft({
      ...minutes,
      key_decisions: [...minutes.key_decisions],
      agenda_summaries: minutes.agenda_summaries.map((a) => ({ ...a })),
      action_items: minutes.action_items.map((a) => ({ ...a })),
    })
    setEditing(true)
  }

  function saveEdit() {
    if (!draft) return
    setMinutes({
      ...draft,
      key_decisions: draft.key_decisions.map((d) => d.trim()).filter(Boolean),
      agenda_summaries: draft.agenda_summaries.filter((a) => a.topic.trim() || a.summary.trim()),
      action_items: draft.action_items.filter((a) => a.description.trim()),
    })
    setEditing(false)
    setDraft(null)
  }

  async function handleSend() {
    // Never bail silently — the coordinator must see why the click did nothing.
    if (!minutes) {
      setSendError('Generate the minutes before sending them.')
      setSendStatus('failed')
      return
    }
    if (selectedEmails.size === 0) {
      setSendError('Select at least one recipient.')
      setSendStatus('failed')
      return
    }
    setSendStatus('sending')
    setSendError(null)
    try {
      // Send to THIS meeting's own roster (alignment/vendor-prep); the QBR falls
      // back to mtg-… which the backend maps to the cycle attendee list. Only the
      // recipients the coordinator selected receive the minutes.
      const meetingId = meetingIdProp ?? `mtg-${cycleId}`
      // Minutes restored from the persisted artifact carry no run id; run_id is
      // optional on the send endpoint, so send without one instead of no-opping.
      const result = await sendMeetingMinutes(
        cycleId, runId, minutes, vendorName, quarter, year, meetingId, Array.from(selectedEmails),
      )
      setSentRecipients(result.sent_to)
      setFailedRecipients((result as SendMinutesResult & { failed?: FailedRecipient[] }).failed ?? [])
      setSendStatus('sent')
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Failed to send minutes')
      setSendStatus('failed')
    }
  }

  const internalRecipients = (recipients ?? []).filter((r) => !r.external)
  const externalRecipients = (recipients ?? []).filter((r) => r.external)
  const selectedCount = selectedEmails.size

  function renderRecipientGroup(title: string, list: MinutesRecipient[]) {
    if (list.length === 0) return null
    const emails = list.map((r) => r.email)
    const allOn = emails.every((e) => selectedEmails.has(e))
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{title}</span>
          <button
            onClick={() => setGroupSelected(emails, !allOn)}
            className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            {allOn ? 'Deselect all' : 'Select all'}
          </button>
        </div>
        <div className="space-y-1">
          {list.map((r) => (
            <label
              key={r.email}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedEmails.has(r.email)}
                onChange={() => toggleRecipient(r.email)}
                className="rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{r.name}</span>
                <span className="block text-xs text-slate-400 dark:text-slate-500 truncate">{r.email}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
              <FileText size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{heading}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{vendorName} {quarter} {year}</p>
            </div>
          </div>
          <AgentStatusBadge status={agentStatus} />
        </div>

        {!minutes ? (
          <div className="space-y-2">
            <button
              onClick={handleGenerate}
              disabled={notes.length === 0 || agentStatus === 'running'}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Sparkles size={14} />
              {notes.length === 0
                ? 'Add meeting notes first'
                : agentStatus === 'running'
                  ? 'Generating minutes...'
                  : 'Generate Meeting Minutes'}
            </button>
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>
        ) : editing && draft ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">Editing minutes</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setEditing(false); setDraft(null) }}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <X size={12} /> Cancel
                </button>
                <button
                  onClick={saveEdit}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                >
                  <Check size={12} /> Save changes
                </button>
              </div>
            </div>

            {/* Executive summary */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Executive Summary</label>
              <textarea
                value={draft.executive_summary}
                onChange={(e) => setDraft((d) => d && ({ ...d, executive_summary: e.target.value }))}
                rows={4}
                className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Key decisions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Key Decisions</label>
                <button
                  onClick={() => setDraft((d) => d && ({ ...d, key_decisions: [...d.key_decisions, ''] }))}
                  className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
              <div className="space-y-1.5">
                {draft.key_decisions.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={d}
                      onChange={(e) => setDraft((prev) => prev && ({ ...prev, key_decisions: prev.key_decisions.map((x, j) => (j === i ? e.target.value : x)) }))}
                      className="flex-1 text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      onClick={() => setDraft((prev) => prev && ({ ...prev, key_decisions: prev.key_decisions.filter((_, j) => j !== i) }))}
                      className="p-1 text-slate-400 hover:text-red-500"
                      title="Remove"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Agenda summaries */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Agenda Summaries</label>
                <button
                  onClick={() => setDraft((d) => d && ({ ...d, agenda_summaries: [...d.agenda_summaries, { topic: '', summary: '' }] }))}
                  className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
              <div className="space-y-2">
                {draft.agenda_summaries.map((a, i) => (
                  <div key={i} className="space-y-1.5 p-2.5 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <div className="flex items-center gap-2">
                      <input
                        value={a.topic}
                        placeholder="Topic"
                        onChange={(e) => setDraft((prev) => prev && ({ ...prev, agenda_summaries: prev.agenda_summaries.map((x, j) => (j === i ? { ...x, topic: e.target.value } : x)) }))}
                        className="flex-1 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        onClick={() => setDraft((prev) => prev && ({ ...prev, agenda_summaries: prev.agenda_summaries.filter((_, j) => j !== i) }))}
                        className="p-1 text-slate-400 hover:text-red-500"
                        title="Remove"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <textarea
                      value={a.summary}
                      placeholder="Summary"
                      rows={2}
                      onChange={(e) => setDraft((prev) => prev && ({ ...prev, agenda_summaries: prev.agenda_summaries.map((x, j) => (j === i ? { ...x, summary: e.target.value } : x)) }))}
                      className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Action items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Action Items</label>
                <button
                  onClick={() => setDraft((d) => d && ({ ...d, action_items: [...d.action_items, { description: '', owner: '', due_date: '' }] }))}
                  className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
              <div className="space-y-2">
                {draft.action_items.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <div className="flex-1 space-y-1.5">
                      <input
                        value={a.description}
                        placeholder="Description"
                        onChange={(e) => setDraft((prev) => prev && ({ ...prev, action_items: prev.action_items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) }))}
                        className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <div className="flex gap-2">
                        <input
                          value={a.owner}
                          placeholder="Owner"
                          onChange={(e) => setDraft((prev) => prev && ({ ...prev, action_items: prev.action_items.map((x, j) => (j === i ? { ...x, owner: e.target.value } : x)) }))}
                          className="flex-1 text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <input
                          value={a.due_date}
                          placeholder="Due date"
                          onChange={(e) => setDraft((prev) => prev && ({ ...prev, action_items: prev.action_items.map((x, j) => (j === i ? { ...x, due_date: e.target.value } : x)) }))}
                          className="flex-1 text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => setDraft((prev) => prev && ({ ...prev, action_items: prev.action_items.filter((_, j) => j !== i) }))}
                      className="p-1 text-slate-400 hover:text-red-500 mt-0.5"
                      title="Remove"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {!approved && (
              <div className="flex justify-end">
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors"
                >
                  <Pencil size={12} /> Edit minutes
                </button>
              </div>
            )}
            {approved && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 size={15} />
                    Minutes approved &amp; finalised
                  </span>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors"
                  >
                    {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                    {copied ? 'Copied!' : 'Copy to Clipboard'}
                  </button>
                </div>

                {/* Send to stakeholders — pick who receives the minutes */}
                {sendStatus === 'idle' || sendStatus === 'failed' ? (
                  <div className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        Choose who receives these minutes.
                        {allowExternal === true && ' External (vendor) recipients are opt-in.'}
                        {allowExternal === false && ' Alignment minutes go to internal stakeholders only.'}
                      </p>
                      <button
                        onClick={() => setRecipientsReloadKey((k) => k + 1)}
                        disabled={recipients === null && !recipientsError}
                        title="Reload this meeting's roster"
                        className="shrink-0 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RefreshCw size={11} /> Refresh
                      </button>
                    </div>

                    {recipientsError ? (
                      <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                        {recipientsError}
                      </p>
                    ) : recipients === null ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500">Loading recipients…</p>
                    ) : recipients.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">No stakeholders with an email address on this meeting's roster.</p>
                    ) : (
                      <>
                        {renderRecipientGroup('Internal stakeholders', internalRecipients)}
                        {allowExternal && renderRecipientGroup('External (vendor) stakeholders', externalRecipients)}
                      </>
                    )}

                    <button
                      onClick={handleSend}
                      disabled={selectedCount === 0}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <Send size={14} />
                      {selectedCount === 0
                        ? 'Select recipients to send'
                        : `Send Minutes to ${selectedCount} recipient${selectedCount !== 1 ? 's' : ''}`}
                    </button>
                    {sendStatus === 'failed' && sendError && (
                      <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                        {sendError}
                      </p>
                    )}
                  </div>
                ) : sendStatus === 'sending' ? (
                  <div className="flex items-center justify-center gap-2 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                    <div className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-emerald-700 dark:text-emerald-400">Sending minutes...</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-4 py-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                        <CheckCircle2 size={15} />
                        Sent to {sentRecipients.length} recipient{sentRecipients.length !== 1 ? 's' : ''}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {sentRecipients.map((r) => (
                          <span
                            key={r.email}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-xs rounded-full"
                          >
                            <Users size={10} />
                            {r.name || r.email}
                          </span>
                        ))}
                      </div>
                    </div>
                    {failedRecipients.length > 0 && (
                      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-3 space-y-2">
                        <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400 font-medium">
                          <AlertTriangle size={15} />
                          Not delivered to {failedRecipients.length} recipient{failedRecipients.length !== 1 ? 's' : ''}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {failedRecipients.map((r) => (
                            <span
                              key={r.email}
                              title={r.error}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 text-xs rounded-full"
                            >
                              <Users size={10} />
                              {r.name || r.email}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-red-600 dark:text-red-400">The service mailbox could not deliver to these addresses — follow up directly.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Executive summary */}
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                Executive Summary
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                {minutes.executive_summary}
              </p>
            </div>

            {/* Key decisions */}
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                Key Decisions
              </p>
              <ul className="space-y-1.5">
                {minutes.key_decisions.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {d}
                  </li>
                ))}
              </ul>
            </div>

            {/* Agenda summaries */}
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                Agenda Summaries
              </p>
              <div className="space-y-2">
                {minutes.agenda_summaries.map((a, i) => (
                  <div key={i} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{a.topic}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{a.summary}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Action items */}
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                Action Items ({minutes.action_items.length})
              </p>
              <div className="space-y-1.5">
                {minutes.action_items.map((a, i) => (
                  <div key={i} className="flex items-start gap-3 p-2.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 shrink-0">{i + 1}</span>
                    <div className="flex-1">
                      <p className="text-xs text-indigo-800 dark:text-indigo-300">{a.description}</p>
                      <p className="text-xs text-indigo-500 dark:text-indigo-500 mt-0.5">
                        {a.owner} · {a.due_date}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {!approved && (
              <button
                onClick={() => setShowApproval(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <CheckCircle2 size={14} />
                Approve Minutes
              </button>
            )}
          </div>
        )}
      </div>

      {showApproval && minutes && (
        <ApprovalPanel
          title="Approve Meeting Minutes"
          summary={`Approve and finalise the ${vendorName} ${quarter} ${year} EGB/QBR minutes.`}
          previewContent={
            <div className="space-y-2 text-sm">
              <p className="font-medium text-slate-800 dark:text-slate-200">{vendorName} {quarter} {year} EGB/QBR Meeting Minutes</p>
              <p className="text-slate-600 dark:text-slate-400">{minutes.executive_summary}</p>
              <p className="text-xs text-slate-400">{minutes.action_items.length} action items will be merged into the unified Action Log.</p>
            </div>
          }
          approveLabel="Approve & Finalise"
          isProcessing={isApproving}
          onApprove={handleApprove}
          onCancel={() => { setShowApproval(false); if (agentStatus === 'awaiting_approval') setAgentStatus('idle') }}
        />
      )}
    </div>
  )
}
