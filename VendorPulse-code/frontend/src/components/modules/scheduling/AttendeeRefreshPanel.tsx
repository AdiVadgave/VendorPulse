import { useState } from 'react'
import {
  Users,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertCircle,
  Key,
  ArrowRight,
  Mail,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import ApprovalPanel from '@/components/shared/ApprovalPanel'
import type { CycleAttendee } from '@/types/scheduling.types'
import type { AgentStatus } from '@/types/agent.types'
import { ROLE_LABELS } from '@/types/cycle.types'

interface AttendeeRefreshPanelProps {
  attendees: CycleAttendee[]
  onDispatchComplete: () => void
  onResponsesSimulated: (updated: CycleAttendee[]) => void
  simulatedAttendees: CycleAttendee[]
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  ACCEPTED: <CheckCircle2 size={14} className="text-emerald-500" />,
  DECLINED: <AlertCircle size={14} className="text-red-500" />,
  PENDING: <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 dark:border-slate-600" />,
}

export default function AttendeeRefreshPanel({
  attendees,
  onDispatchComplete,
  onResponsesSimulated,
  simulatedAttendees,
}: AttendeeRefreshPanelProps) {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle')
  const [phase, setPhase] = useState<
    'initial' | 'form_ready' | 'dispatched' | 'responses_in'
  >('initial')
  const [showApproval, setShowApproval] = useState(false)
  const [currentAttendees, setCurrentAttendees] = useState(attendees)

  function runAgent(duration: number, callback: () => void) {
    setAgentStatus('running')
    setTimeout(() => {
      setAgentStatus('complete')
      callback()
    }, duration)
  }

  function handleGenerateForm() {
    runAgent(1500, () => {
      setPhase('form_ready')
      setAgentStatus('awaiting_approval')
      setShowApproval(true)
    })
  }

  function handleApproveDispatch() {
    setShowApproval(false)
    setAgentStatus('running')
    setTimeout(() => {
      setAgentStatus('complete')
      setPhase('dispatched')
      onDispatchComplete()
    }, 1000)
  }

  function handleSimulateResponses() {
    runAgent(1800, () => {
      setCurrentAttendees(simulatedAttendees)
      setPhase('responses_in')
    })
  }

  const emailPreview = (
    <div className="space-y-3 text-sm">
      <div className="flex gap-3">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 w-16 shrink-0 pt-0.5">To:</span>
        <div className="flex flex-wrap gap-1">
          {attendees.slice(0, 4).map((a) => (
            <span key={a.attendee_id} className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded text-xs">
              {a.name}
            </span>
          ))}
          {attendees.length > 4 && (
            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded text-xs">
              +{attendees.length - 4} more
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-3">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 w-16 shrink-0">Subject:</span>
        <p className="text-slate-700 dark:text-slate-300 text-xs">EGB/QBR Q1 2026 — Attendance Confirmation & Availability Request</p>
      </div>
      <div className="border-t border-slate-200 dark:border-slate-700 pt-3 text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
        <p>Dear Stakeholder,</p>
        <p>
          We are scheduling the EGB/QBR governance review for <strong className="text-slate-800 dark:text-slate-200">NovaTech Services — Q1 2026</strong>.
          Please confirm your attendance or nominate a replacement by{' '}
          <strong className="text-slate-800 dark:text-slate-200">20 March 2026</strong>.
        </p>
        <p>Please also provide your availability for the week of 28 March – 4 April 2026.</p>
        <p className="text-slate-500">— VendorPulse Scheduling Agent</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-4 fade-in">
      {/* Header card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center shrink-0">
              <Users size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                Attendee Refresh
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Confirm attendance and collect availability for all{' '}
                {attendees.length} stakeholders
              </p>
            </div>
          </div>
          <AgentStatusBadge status={agentStatus} />
        </div>

        {/* Phase-based notice */}
        {phase === 'initial' && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-400 flex items-start gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>
              These attendees are carried over from the previous cycle.
              Generate and dispatch a refresh form to confirm who is still
              attending and collect updated availability.
            </span>
          </div>
        )}

        {phase === 'dispatched' && (
          <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-2">
            <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
            <span>
              Refresh form dispatched to {attendees.length} stakeholders. Waiting
              for responses. Use <strong>Simulate Responses</strong> to populate
              mock data for the demo.
            </span>
          </div>
        )}

        {phase === 'responses_in' && (
          <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-2">
            <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
            <span>
              Responses collected. 1 replacement noted (Tom Baker replacing
              Marcus Williams). Availability data ready for slot ranking.
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          {phase === 'initial' && (
            <button
              onClick={handleGenerateForm}
              disabled={agentStatus === 'running'}
              className={cn(
                'flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors',
                agentStatus === 'running' && 'opacity-60 cursor-not-allowed'
              )}
            >
              <RefreshCw
                size={14}
                className={cn(agentStatus === 'running' && 'animate-spin')}
              />
              {agentStatus === 'running'
                ? 'Generating form...'
                : 'Generate Refresh Form'}
            </button>
          )}

          {phase === 'dispatched' && (
            <button
              onClick={handleSimulateResponses}
              disabled={agentStatus === 'running'}
              className={cn(
                'flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors',
                agentStatus === 'running' && 'opacity-60 cursor-not-allowed'
              )}
            >
              <Play
                size={14}
                className={cn(agentStatus === 'running' && 'agent-pulse')}
              />
              {agentStatus === 'running'
                ? 'Simulating...'
                : 'Simulate Responses'}
            </button>
          )}

          {phase === 'responses_in' && (
            <button
              onClick={onResponsesSimulated.bind(null, currentAttendees)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Proceed to Slot Ranking
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Attendee table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail size={14} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Attendee List
            </span>
            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-xs">
              {currentAttendees.length}
            </span>
          </div>
          {phase === 'responses_in' && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {currentAttendees.filter((a) => a.availability_submitted).length}/
              {currentAttendees.length} responded
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
                <th className="text-left px-5 py-2.5 font-medium">Name</th>
                <th className="text-left px-4 py-2.5 font-medium">Role</th>
                <th className="text-left px-4 py-2.5 font-medium">Organisation</th>
                <th className="text-left px-4 py-2.5 font-medium">Availability</th>
                {phase === 'responses_in' && (
                  <th className="text-left px-4 py-2.5 font-medium">Notes</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {currentAttendees.map((a) => (
                <tr
                  key={a.attendee_id}
                  className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {a.is_key && (
                        <Key
                          size={12}
                          className="text-amber-500 shrink-0"
                        />
                      )}
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {a.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                    {ROLE_LABELS[a.role]}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                    {a.organisation}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {STATUS_ICON[a.availability_submitted ? 'ACCEPTED' : 'PENDING']}
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        {a.availability_submitted ? 'Submitted' : 'Pending'}
                      </span>
                    </div>
                  </td>
                  {phase === 'responses_in' && (
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 italic">
                      {a.replacement_note ?? '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <Key size={11} className="text-amber-500" />
            <span>Key attendee — hard constraint for scheduling</span>
          </div>
        </div>
      </div>

      {/* Approval modal */}
      {showApproval && (
        <ApprovalPanel
          title="Dispatch Attendee Refresh Form"
          summary="Review the email below and approve sending to all stakeholders."
          previewContent={emailPreview}
          recipients={attendees.map((a) => a.name)}
          warnings={['3 stakeholders have not attended a previous cycle']}
          onApprove={handleApproveDispatch}
          onCancel={() => {
            setShowApproval(false)
            setAgentStatus('idle')
            setPhase('initial')
          }}
          approveLabel="Approve & Dispatch"
        />
      )}
    </div>
  )
}
