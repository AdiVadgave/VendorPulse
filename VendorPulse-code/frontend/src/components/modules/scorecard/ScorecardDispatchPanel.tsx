import { useState } from 'react'
import { ClipboardList, Send, Bell, Clock, AlertTriangle } from 'lucide-react'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import ApprovalPanel from '@/components/shared/ApprovalPanel'
import type { AgentStatus } from '@/types/agent.types'

interface Props {
  vendorName: string
  recipientCount: number
  onDispatched: () => void
}

const REMINDER_SCHEDULE = [
  { label: 'T−5 days', tone: 'Informational', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  { label: 'T−2 days', tone: 'Deadline notice', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  { label: 'T−0 days', tone: 'Escalation to organiser', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
]

export default function ScorecardDispatchPanel({ vendorName, recipientCount, onDispatched }: Props) {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle')
  const [showApproval, setShowApproval] = useState(false)
  const [dispatched, setDispatched] = useState(false)

  function handleGenerate() {
    setAgentStatus('running')
    setTimeout(() => {
      setAgentStatus('awaiting_approval')
      setShowApproval(true)
    }, 1200)
  }

  function handleApprove() {
    setAgentStatus('running')
    setShowApproval(false)
    setTimeout(() => {
      setAgentStatus('complete')
      setDispatched(true)
      onDispatched()
    }, 900)
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
                {vendorName} · 5 categories · 1–5 scale
              </p>
            </div>
          </div>
          <AgentStatusBadge status={agentStatus} />
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Recipients', value: recipientCount, icon: <Send size={14} /> },
            { label: 'Categories', value: 5, icon: <ClipboardList size={14} /> },
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

        {/* Scorecard categories */}
        <div className="mb-4">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
            Scorecard Categories
          </p>
          <div className="space-y-1.5">
            {['Delivery Quality', 'SLA Compliance', 'Innovation', 'Communication', 'Value for Money'].map((cat) => (
              <div key={cat} className="flex items-center justify-between text-sm py-1.5 px-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <span className="text-slate-700 dark:text-slate-300">{cat}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">1–5 · Comment required at extremes</span>
              </div>
            ))}
          </div>
        </div>

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
            Scorecard requests dispatched to {recipientCount} stakeholders
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

      {/* Validation rules info */}
      {/* <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={15} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Validation Rules (Deterministic)
          </h3>
        </div>
        <div className="space-y-1.5">
          {[
            { rule: 'Score outside 1–5 range', action: 'Reject — out of range', type: 'ERROR' },
            { rule: 'Score = 1 or 5 with no comment', action: 'Reject — comment required', type: 'ERROR' },
            { rule: 'Score deviates > 1.5σ from group avg', action: 'Flag as outlier', type: 'WARNING' },
            { rule: 'Required category missing', action: 'Reject — required field', type: 'ERROR' },
          ].map((v) => (
            <div key={v.rule} className="flex items-center justify-between text-xs py-1.5 px-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <span className="text-slate-700 dark:text-slate-300">{v.rule}</span>
              <div className="flex items-center gap-2">
                <span
                  className={
                    v.type === 'ERROR'
                      ? 'px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-xs'
                      : 'px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-xs'
                  }
                >
                  {v.type}
                </span>
                <span className="text-slate-500 dark:text-slate-400">{v.action}</span>
              </div>
            </div>
          ))}
        </div>
      </div> */}

      {showApproval && (
        <ApprovalPanel
          title="Dispatch Scorecard Request"
          summary={`Send scorecard request to ${recipientCount} stakeholders for ${vendorName} Q1 2026 EGB/QBR.`}
          recipients={[
            'Alex Thompson', 'Sarah Chen', 'Priya Sharma', 'Tom Baker',
            "James O'Brien", 'Emma Davies', 'Raj Patel', 'Lisa Wang',
          ]}
          warnings={['Reminder schedule will auto-activate once dispatch is approved']}
          previewContent={
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Subject: {vendorName} Q1 2026 — Scorecard Input Request
              </p>
              <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                <p>Dear [Stakeholder Name],</p>
                <p>
                  Please complete your scorecard input for the {vendorName} Q1 2026 EGB/QBR cycle.
                  Rate each category from 1 (Poor) to 5 (Excellent). A comment is required for
                  scores of 1 or 5.
                </p>
                <p className="font-medium text-slate-700 dark:text-slate-300">
                  Deadline: 12 April 2026 (T−0 escalation applies)
                </p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {['Delivery Quality', 'SLA Compliance', 'Innovation', 'Communication', 'Value for Money'].map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            </div>
          }
          approveLabel="Send to Stakeholders"
          onApprove={handleApprove}
          onCancel={() => { setShowApproval(false); setAgentStatus('idle') }}
        />
      )}
    </div>
  )
}
