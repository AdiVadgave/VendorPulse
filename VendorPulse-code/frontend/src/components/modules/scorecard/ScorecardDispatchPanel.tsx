import { useState } from 'react'
import { ClipboardList, Send, Bell, Clock, AlertTriangle, CheckCircle2, ExternalLink, ChevronDown, ChevronRight, Link2, Check, Loader2 } from 'lucide-react'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import ApprovalPanel from '@/components/shared/ApprovalPanel'
import type { AgentStatus } from '@/types/agent.types'
import { WEIGHTED_SCORECARD_STRUCTURE } from '@/types/scorecard.types'
import type { WeightedCategoryDef } from '@/types/scorecard.types'
import { checkGoogleAuth, dispatchInAppScorecard, buildScorecardLink } from '@/lib/scorecardApi'
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
}

const REMINDER_SCHEDULE = [
  { label: 'T−5 days', tone: 'Informational', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  { label: 'T−2 days', tone: 'Deadline notice', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  { label: 'T−0 days', tone: 'Escalation to organiser', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
]

const GOOGLE_AUTH_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/auth/google`

function CategoriesDropdown({ structure }: { structure: WeightedCategoryDef[] }) {
  const [open, setOpen] = useState(false)
  const totalMeasures = structure.reduce((sum, c) => sum + c.measures.length, 0)
  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
      >
        <span>Scorecard Themes &amp; Measures</span>
        <span className="flex items-center gap-1">
          <span className="text-[10px] font-normal normal-case">{structure.length} themes &middot; {totalMeasures} measures</span>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
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

export default function ScorecardDispatchPanel({ vendorName, cycleId, quarter, year, attendees, onDispatched, onAttendeesChanged, alreadyDispatched = false, structure }: Props) {
  const effectiveStructure = structure && structure.length > 0 ? structure : WEIGHTED_SCORECARD_STRUCTURE
  const totalMeasures = effectiveStructure.reduce((sum, c) => sum + c.measures.length, 0)
  const [agentStatus, setAgentStatus] = useState<AgentStatus>(alreadyDispatched ? 'complete' : 'idle')
  const [showApproval, setShowApproval] = useState(false)
  const [dispatched, setDispatched] = useState(alreadyDispatched)
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null)
  const [dispatchResult, setDispatchResult] = useState<DispatchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)

  // Recipients ARE the key internal stakeholders (one scorecard per team).
  const recipients = attendees.filter((a) => a.is_key && a.type === 'Internal Stakeholder')
  // Internal stakeholders that could be added as recipients (not yet key).
  const addable = attendees.filter((a) => a.type === 'Internal Stakeholder' && !a.is_key)

  async function markKey(attendeeId: string) {
    setAddingId(attendeeId)
    try {
      await apiFetch(`/api/cycles/${cycleId}/attendees/${attendeeId}`, {
        method: 'PUT',
        body: JSON.stringify({ is_key: true }),
      })
      onAttendeesChanged?.(attendees.map((a) => (a.attendee_id === attendeeId ? { ...a, is_key: true } : a)))
    } catch {
      onAttendeesChanged?.(attendees.map((a) => (a.attendee_id === attendeeId ? { ...a, is_key: true } : a)))
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

  async function handleGenerate() {
    setError(null)
    setAgentStatus('running')
    const authStatus = await checkGoogleAuth()
    setGoogleConnected(authStatus.authenticated)
    if (!authStatus.authenticated) {
      setAgentStatus('idle')
      return
    }
    setAgentStatus('awaiting_approval')
    setShowApproval(true)
  }

  async function handleApprove() {
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
          email: a.gmail || a.email,
          team: a.shell_department || a.name,
        })),
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
                  <span className="ml-2 text-xs text-slate-400">{a.gmail || a.email}</span>
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
                No key internal stakeholders yet. Mark attendees as &quot;Key&quot; in the attendee step, or add one above.
              </p>
            )}
          </div>
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
            Each recipient gets a unique in-app form link tied to their identity. Use <strong>Copy link</strong> to test without sending email.
          </p>
        </div>

        {googleConnected === false && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Google Account Not Connected</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">Scorecard emails are sent via Gmail — connect your Google account, or use <strong>Copy link</strong> to test.</p>
                <a href={GOOGLE_AUTH_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors">
                  <ExternalLink size={12} /> Connect Google Account
                </a>
              </div>
            </div>
          </div>
        )}

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

        {!dispatched ? (
          <button
            onClick={handleGenerate}
            disabled={agentStatus === 'running' || agentStatus === 'awaiting_approval' || recipients.length === 0}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {agentStatus === 'running' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {agentStatus === 'running' ? 'Preparing dispatch…' : `Send Scorecard Link to ${recipients.length} Recipient${recipients.length !== 1 ? 's' : ''}`}
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-700 dark:text-emerald-400 text-sm font-medium">
            <Send size={14} /> Scorecard links dispatched via Gmail
          </div>
        )}
      </div>

      {/* Reminder schedule */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Bell size={15} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Automated Reminder Schedule</h3>
        </div>
        <div className="space-y-2">
          {REMINDER_SCHEDULE.map((r) => (
            <div key={r.label} className={`flex items-center justify-between p-3 rounded-lg ${r.bg}`}>
              <div className="flex items-center gap-2">
                <Clock size={13} className={r.color} />
                <span className={`text-sm font-medium ${r.color}`}>{r.label}</span>
              </div>
              <span className={`text-xs ${r.color}`}>{r.tone}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          Reminders run automatically. Escalation on deadline day alerts the VMO Coordinator.
        </p>
      </div>

      {showApproval && (
        <ApprovalPanel
          title="Dispatch Scorecard Request via Gmail"
          summary={`Email the in-app scorecard form link to ${recipients.length} key internal stakeholder(s) for ${vendorName} (${quarter} ${year}).`}
          recipients={recipients.map((a) => `${a.name} (${a.gmail || a.email})`)}
          warnings={[
            'Emails are sent via your connected Gmail account',
            'Each email links to the in-app scorecard form (not Google Forms)',
            'Each link is tied to the reviewer; responses are stored directly',
          ]}
          previewContent={
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Subject: {vendorName} &mdash; Scorecard Input Request ({quarter} {year})
              </p>
              <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                <p>Dear [Reviewer],</p>
                <p>You have been identified as a key reviewer for the {vendorName} governance cycle ({quarter} {year}).</p>
                <p>Please open the secure link and complete your scorecard (1–5 per measure, with comments).</p>
              </div>
            </div>
          }
          approveLabel="Send via Gmail"
          onApprove={handleApprove}
          onCancel={() => { setShowApproval(false); setAgentStatus('idle') }}
        />
      )}
    </div>
  )
}
