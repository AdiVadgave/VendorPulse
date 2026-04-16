import { useState } from 'react'
import { FileText, Sparkles, Copy, CheckCircle2, Send, Users } from 'lucide-react'
import type { MeetingMinutes } from '@/types/meeting.types'
import type { MeetingNote } from '@/types/meeting.types'
import { generateMeetingMinutes, approveMinutes, sendMeetingMinutes } from '@/lib/meetingApi'
import type { SendMinutesRecipient } from '@/lib/meetingApi'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import ApprovalPanel from '@/components/shared/ApprovalPanel'
import type { AgentStatus } from '@/types/agent.types'

interface Props {
  cycleId: string
  notes: MeetingNote[]
  vendorName: string
  quarter: string
  year: number
  onApproved: () => void
}

export default function MeetingMinutesViewer({ cycleId, notes, vendorName, quarter, year, onApproved }: Props) {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle')
  const [minutes, setMinutes] = useState<MeetingMinutes | null>(null)
  const [showApproval, setShowApproval] = useState(false)
  const [approved, setApproved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [isApproving, setIsApproving] = useState(false)
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [sentRecipients, setSentRecipients] = useState<SendMinutesRecipient[]>([])
  const [sendError, setSendError] = useState<string | null>(null)

  async function handleGenerate() {
    setAgentStatus('running')
    setError(null)
    try {
      const meetingId = notes[0]?.meeting_id ?? `mtg-${cycleId}`
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
      `Meeting Minutes — ${vendorName} ${quarter} ${year} EGB/QBR`,
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

  async function handleSend() {
    if (!minutes || !runId) return
    setSendStatus('sending')
    setSendError(null)
    try {
      const result = await sendMeetingMinutes(cycleId, runId, minutes, vendorName, quarter, year)
      setSentRecipients(result.sent_to)
      setSendStatus('sent')
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Failed to send minutes')
      setSendStatus('failed')
    }
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
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Meeting Minutes</h3>
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
        ) : (
          <div className="space-y-4">
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

                {/* Send to stakeholders */}
                {sendStatus === 'idle' || sendStatus === 'failed' ? (
                  <div className="space-y-1.5">
                    <button
                      onClick={handleSend}
                      disabled={sendStatus === 'sending'}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <Send size={14} />
                      Send Minutes to Internal Stakeholders
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
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-4 py-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                      <CheckCircle2 size={15} />
                      Sent to {sentRecipients.length} internal stakeholder{sentRecipients.length !== 1 ? 's' : ''}
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
                Review & Approve Minutes
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
