import { useState } from 'react'
import { ClipboardList, Send, Bell, Clock, AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import ApprovalPanel from '@/components/shared/ApprovalPanel'
import type { AgentStatus } from '@/types/agent.types'
import { SCORECARD_STRUCTURE } from '@/types/scorecard.types'
import type { ScorecardAttendee } from '@/mock/scorecard.mock'
import { checkGoogleAuth, dispatchScorecardEmails } from '@/lib/scorecardApi'
import type { DispatchResponse } from '@/lib/scorecardApi'
import { MOCK_SYSTEM_USERS } from '@/mock/scheduling.mock'

interface Props {
  vendorName: string
  cycleId: string
  quarter: string
  year: number
  attendees: ScorecardAttendee[]
  onDispatched: () => void
}

const REMINDER_SCHEDULE = [
  { label: 'T\u22125 days', tone: 'Informational', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  { label: 'T\u22122 days', tone: 'Deadline notice', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  { label: 'T\u22120 days', tone: 'Escalation to organiser', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
]

const TOTAL_PARAMETERS = SCORECARD_STRUCTURE.reduce((sum, c) => sum + c.parameters.length, 0)

const GOOGLE_AUTH_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/auth/google`

export default function ScorecardDispatchPanel({ vendorName, cycleId, quarter, year, attendees, onDispatched }: Props) {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle')
  const [showApproval, setShowApproval] = useState(false)
  const [dispatched, setDispatched] = useState(false)
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null)
  const [dispatchResult, setDispatchResult] = useState<DispatchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setError(null)
    setAgentStatus('running')

    // Check Google auth status first
    const authStatus = await checkGoogleAuth()
    setGoogleConnected(authStatus.authenticated)

    if (!authStatus.authenticated) {
      setAgentStatus('idle')
      return
    }

    // Show approval panel with email preview
    setTimeout(() => {
      setAgentStatus('awaiting_approval')
      setShowApproval(true)
    }, 600)
  }

  async function handleApprove() {
    setAgentStatus('running')
    setShowApproval(false)
    setError(null)

    try {
      // Build attendee list with Gmail addresses
      const emailAttendees = attendees.map((a) => {
        // Try to find their Gmail from the system users list
        const systemUser = MOCK_SYSTEM_USERS.find(
          (u) => u.name === a.stakeholder_name || u.email === a.stakeholder_name
        )
        return {
          name: a.stakeholder_name,
          email: systemUser?.gmail || systemUser?.email || `${a.stakeholder_name.toLowerCase().replace(/\s+/g, '.')}@gmail.com`,
        }
      })

      const result = await dispatchScorecardEmails({
        cycle_id: cycleId,
        vendor_name: vendorName,
        quarter,
        year,
        attendees: emailAttendees,
      })

      setDispatchResult(result)
      setAgentStatus('complete')
      setDispatched(true)
      onDispatched()
    } catch (exc) {
      const msg = exc instanceof Error ? exc.message : 'Failed to send emails'
      setError(msg)
      setAgentStatus('idle')
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-violet-50 dark:bg-violet-900/30 rounded-lg flex items-center justify-center">
              <ClipboardList size={18} className="text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                Scorecard Request Dispatch
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {vendorName} &middot; {SCORECARD_STRUCTURE.length} categories &middot; {TOTAL_PARAMETERS} parameters &middot; 1&ndash;5 scale
              </p>
            </div>
          </div>
          <AgentStatusBadge status={agentStatus} />
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Recipients', value: attendees.length, icon: <Send size={14} /> },
            { label: 'Categories', value: SCORECARD_STRUCTURE.length, icon: <ClipboardList size={14} /> },
            { label: 'Reminder Tiers', value: 3, icon: <Bell size={14} /> },
          ].map((s) => (
            <div key={s.label} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-center">
              <div className="flex items-center justify-center gap-1 text-slate-400 dark:text-slate-500 mb-1">
                {s.icon}
              </div>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{s.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Scorecard categories with parameters */}
        <div className="mb-4">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
            Scorecard Categories &amp; Parameters
          </p>
          <div className="space-y-2">
            {SCORECARD_STRUCTURE.map((cat) => (
              <div key={cat.key} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  {cat.label}
                </p>
                <div className="space-y-0.5">
                  {cat.parameters.map((param) => (
                    <div key={param.key} className="flex items-center justify-between text-xs py-0.5 px-2">
                      <span className="text-slate-600 dark:text-slate-400">{param.label}</span>
                      <span className="text-slate-400 dark:text-slate-500">1&ndash;5</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Key Attendees */}
        <div className="mb-4">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
            Key Attendees
          </p>
          <div className="space-y-1.5">
            {attendees.map((r) => (
              <div key={r.stakeholder_id} className="flex items-center justify-between text-sm py-1.5 px-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <span className="text-slate-700 dark:text-slate-300">{r.stakeholder_name}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">{r.organisation} &middot; {r.role.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Google Auth Warning */}
        {googleConnected === false && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Google Account Not Connected
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  To send scorecard emails via Gmail, you need to connect your Google account first.
                </p>
                <a
                  href={GOOGLE_AUTH_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <ExternalLink size={12} />
                  Connect Google Account
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-400 flex items-center gap-1.5">
              <AlertTriangle size={14} />
              {error}
            </p>
          </div>
        )}

        {/* Dispatch Result Summary */}
        {dispatchResult && (
          <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 mb-2">
              <CheckCircle2 size={14} />
              {dispatchResult.sent} of {dispatchResult.total} emails sent successfully
            </p>
            <div className="space-y-1">
              {dispatchResult.results.map((r) => (
                <div key={r.email} className="flex items-center gap-2 text-xs">
                  {r.status === 'sent' ? (
                    <CheckCircle2 size={11} className="text-emerald-600" />
                  ) : (
                    <AlertTriangle size={11} className="text-red-600" />
                  )}
                  <span className="text-slate-600 dark:text-slate-400">
                    {r.attendee} ({r.email}) — {r.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!dispatched ? (
          <button
            onClick={handleGenerate}
            disabled={agentStatus === 'running' || agentStatus === 'awaiting_approval'}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Send size={14} />
            {agentStatus === 'running' ? 'Preparing dispatch...' : 'Generate & Review Scorecard Request'}
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-700 dark:text-emerald-400 text-sm font-medium">
            <Send size={14} />
            Scorecard requests dispatched to {attendees.length} attendees via Gmail
          </div>
        )}
      </div>

      {/* Reminder schedule */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Bell size={15} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Automated Reminder Schedule
          </h3>
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
          summary={`Send scorecard request email to ${attendees.length} key attendees for ${vendorName} QBR cycle. Emails will be sent from your connected Gmail account.`}
          recipients={attendees.map((r) => r.stakeholder_name)}
          warnings={[
            'Emails will be sent via your personal Gmail account',
            'Each email includes the Google Form link with Cycle ID',
            'Reminder schedule will auto-activate once dispatch is approved',
          ]}
          previewContent={
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Subject: {vendorName} &mdash; QBR Scorecard Input Request ({quarter} {year})
              </p>
              <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                <p>Dear [Attendee Name],</p>
                <p>
                  You have been identified as a key reviewer for the {vendorName} QBR
                  governance cycle ({quarter} {year}).
                </p>
                <p>
                  Please complete your scorecard input by rating each parameter on a 1–5 scale.
                </p>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded p-2 my-2">
                  <p className="text-xs text-slate-500 font-medium mb-1">Google Form Link:</p>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 break-all">
                    https://forms.gle/zeMdJ8uvFkryFDTr6
                  </p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded p-2">
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    <strong>Important:</strong> Enter Cycle ID <code className="bg-white dark:bg-slate-800 px-1 rounded">{cycleId}</code> in the form.
                  </p>
                </div>
                <div className="space-y-1 mt-2">
                  {SCORECARD_STRUCTURE.map((cat) => (
                    <div key={cat.key}>
                      <p className="font-medium text-slate-700 dark:text-slate-300">{cat.label}</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {cat.parameters.map((p) => (
                          <li key={p.key}>{p.label}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
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
