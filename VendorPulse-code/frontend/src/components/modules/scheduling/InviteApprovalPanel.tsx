import { useState } from 'react'
import { format } from 'date-fns'
import {
  CalendarCheck,
  Send,
  Clock,
  Users,
  MapPin,
  FileText,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import type { SlotProposal, CycleAttendee } from '@/types/scheduling.types'
import type { AgentStatus } from '@/types/agent.types'

// Maps VendorPulse attendee emails to Teams backend userIds
const EMAIL_TO_TEAMS_ID: Record<string, string> = {
  'alex.thompson@zensar.com':  'u1',
  'sarah.chen@zensar.com':     'u2',
  'priya.sharma@zensar.com':   'u3',
  'marcus.williams@zensar.com':'u4',
  'james.obrien@zensar.com':   'u5',
  'emma.davies@zensar.com':    'u6',
  'raj.patel@novatech.com':    'u7',
  'lisa.wang@novatech.com':    'u8',
  'david.kim@novatech.com':    'u9',
}

const TEAMS_API = 'http://localhost:3001/api'
const ORGANIZER_ID = 'u1' // Alex Thompson / VMO Coordinator

interface InviteApprovalPanelProps {
  slot: SlotProposal
  attendees: CycleAttendee[]
  vendorName: string
  quarter: string
  year: number
  onInviteSent: (teamsMeetingId: string | null) => void
}

export default function InviteApprovalPanel({
  slot,
  attendees,
  vendorName,
  quarter,
  year,
  onInviteSent,
}: InviteApprovalPanelProps) {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('awaiting_approval')
  const [isProcessing, setIsProcessing] = useState(false)
  const [teamsError, setTeamsError] = useState<string | null>(null)

  const dateObj = new Date(slot.proposed_time)
  const endTime = new Date(dateObj.getTime() + 2 * 60 * 60 * 1000)

  async function handleSend() {
    setIsProcessing(true)
    setAgentStatus('running')
    setTeamsError(null)

    // Build participant list from attendees (excluding organizer)
    const participantIds = attendees
      .map((a) => EMAIL_TO_TEAMS_ID[a.email])
      .filter((id): id is string => !!id && id !== ORGANIZER_ID)

    // Remove duplicates
    const uniqueParticipantIds = [...new Set(participantIds)]

    let teamsMeetingId: string | null = null

    try {
      const res = await fetch(`${TEAMS_API}/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `EGB/QBR Governance Review — ${vendorName} ${quarter} ${year}`,
          description: `Quarterly Business Review governance meeting for ${vendorName}.`,
          agenda:
            '1) Q Performance Review & Scorecard Discussion\n2) Key Issues, Concerns and Pushback Responses\n3) Commitments and Action Items Review\n4) Forward Planning & AOB',
          organizerId: ORGANIZER_ID,
          participantIds: uniqueParticipantIds.length > 0 ? uniqueParticipantIds : ['u2'],
          timeSlot: {
            date: format(dateObj, 'yyyy-MM-dd'),
            startTime: format(dateObj, 'HH:mm'),
            endTime: format(endTime, 'HH:mm'),
          },
        }),
      })

      if (res.ok) {
        const data = await res.json()
        teamsMeetingId = data.meeting?.meetingId ?? null
      } else {
        const err = await res.json().catch(() => ({}))
        setTeamsError(`Teams invite failed: ${err.error ?? res.statusText}`)
      }
    } catch {
      // Teams backend offline — continue without it
      setTeamsError('Teams backend unavailable — invite sent locally only.')
    }

    setAgentStatus('complete')
    setIsProcessing(false)
    onInviteSent(teamsMeetingId)
  }

  return (
    <div className="space-y-4 fade-in">
      {/* Header card */}
      <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/60 rounded-xl p-5 ring-1 ring-amber-100 dark:ring-amber-900/20">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-50 dark:bg-amber-900/30 rounded-lg flex items-center justify-center shrink-0">
              <CalendarCheck size={18} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                Invite Approval
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Review and approve the calendar invite — it will be sent via Teams
              </p>
            </div>
          </div>
          <AgentStatusBadge status={agentStatus} />
        </div>

        {teamsError && (
          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            {teamsError}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Meeting details */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Meeting Details
          </h4>

          <div className="flex items-start gap-3">
            <CalendarCheck size={15} className="text-indigo-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Date</p>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {format(dateObj, 'EEEE, d MMMM yyyy')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Clock size={15} className="text-indigo-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Time</p>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {format(dateObj, 'h:mm a')} – {format(endTime, 'h:mm a')} GMT
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPin size={15} className="text-indigo-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Location</p>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Conference Room B / Teams
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Users size={15} className="text-indigo-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Recipients
              </p>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {attendees.length} attendees
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap gap-1">
              {attendees.map((a) => (
                <span
                  key={a.attendee_id}
                  className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded text-xs"
                >
                  {a.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Email preview */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <FileText size={14} className="text-slate-400" />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Teams Invite Preview
            </span>
            <span className="ml-auto text-xs text-amber-600 dark:text-amber-400 font-medium">
              Pending approval
            </span>
          </div>

          <div className="p-5 space-y-3 text-sm">
            <div className="space-y-1.5 pb-3 border-b border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex gap-3">
                <span className="text-slate-500 dark:text-slate-400 w-14 shrink-0">To:</span>
                <span className="text-slate-700 dark:text-slate-300">
                  {attendees
                    .slice(0, 3)
                    .map((a) => a.email)
                    .join(', ')}
                  {attendees.length > 3 && ` and ${attendees.length - 3} more`}
                </span>
              </div>
              <div className="flex gap-3">
                <span className="text-slate-500 dark:text-slate-400 w-14 shrink-0">Subject:</span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">
                  EGB/QBR Meeting Invitation — {vendorName} {quarter} {year}
                </span>
              </div>
            </div>

            <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <p>Dear Team,</p>
              <p>
                You are invited to the{' '}
                <strong>EGB/QBR governance review</strong> for{' '}
                <strong>
                  {vendorName} — {quarter} {year}
                </strong>
                .
              </p>
              <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 rounded-lg p-3 space-y-1 text-xs">
                <p>
                  📅 <strong>Date:</strong>{' '}
                  {format(dateObj, 'EEEE, d MMMM yyyy')}
                </p>
                <p>
                  🕙 <strong>Time:</strong> {format(dateObj, 'h:mm a')} –{' '}
                  {format(endTime, 'h:mm a')} GMT
                </p>
                <p>📍 <strong>Location:</strong> Conference Room B / Microsoft Teams</p>
              </div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Agenda:
              </p>
              <ol className="list-decimal list-inside space-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                <li>Q1 Performance Review &amp; Scorecard Discussion</li>
                <li>Key Issues, Concerns and Pushback Responses</li>
                <li>Commitments and Action Items Review</li>
                <li>Forward Planning &amp; AOB</li>
              </ol>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Please accept or decline this invitation via Microsoft Teams at your earliest convenience.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                — VendorPulse Scheduling Agent
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between gap-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          By approving, this invite will be sent to{' '}
          <strong className="text-slate-800 dark:text-slate-200">
            {attendees.length} attendees
          </strong>{' '}
          via <strong className="text-slate-800 dark:text-slate-200">Microsoft Teams</strong>.
          RSVPs will be tracked automatically.
        </p>
        <button
          onClick={handleSend}
          disabled={isProcessing}
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0',
            isProcessing && 'opacity-60 cursor-not-allowed'
          )}
        >
          <Send size={14} />
          {isProcessing ? 'Sending via Teams...' : 'Approve & Send Invite'}
        </button>
      </div>
    </div>
  )
}
