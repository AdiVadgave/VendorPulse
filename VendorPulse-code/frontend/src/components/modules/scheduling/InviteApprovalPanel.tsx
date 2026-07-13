import { useState } from 'react'
import {
  CalendarCheck,
  Send,
  Clock,
  Users,
  MapPin,
  FileText,
  AlertCircle,
  Globe,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import { apiFetch } from '@/lib/api'
import { getPreferredOrganizerEmail, getTokenOwnerOrganizerEmail } from '@/lib/schedulingApi'
import type { SlotProposal, CycleAttendee } from '@/types/scheduling.types'
import type { AgentStatus } from '@/types/agent.types'

interface InviteApprovalPanelProps {
  cycleId: string
  slot: SlotProposal
  attendees: CycleAttendee[]
  vendorName: string
  quarter: string
  year: number
  timeZoneOverride?: 'IST' | 'UTC' | 'GMT'
  onInviteSent: (teamsMeetingId: string | null) => void
  onBack?: () => void
  isLocked?: boolean
}

export default function InviteApprovalPanel({
  cycleId,
  slot,
  attendees,
  vendorName,
  quarter,
  year,
  timeZoneOverride,
  onInviteSent,
  onBack,
  isLocked,
}: InviteApprovalPanelProps) {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('awaiting_approval')
  const [isProcessing, setIsProcessing] = useState(false)
  const [graphError, setGraphError] = useState<string | null>(null)
  const [hasSentInvite, setHasSentInvite] = useState(false)

  const dateObj = new Date(slot.proposed_time)
  const durationMinutes = Number((slot as unknown as { duration_minutes?: number }).duration_minutes ?? 60)
  const endTime = new Date(dateObj.getTime() + durationMinutes * 60 * 1000)
  const slotTimeZone = timeZoneOverride ?? slot.proposed_time_zone ?? 'UTC'

  function toDisplayZone(zone: string): string {
    const normalized = zone.toUpperCase()
    if (normalized === 'IST' || normalized.includes('INDIA')) return 'IST'
    if (normalized === 'GMT' || normalized.includes('GMT')) return 'GMT'
    return 'UTC'
  }

  function toIanaZone(zone: string): string {
    const normalized = zone.toUpperCase()
    if (normalized === 'IST' || normalized.includes('INDIA')) return 'Asia/Kolkata'
    if (normalized === 'GMT' || normalized.includes('GMT')) return 'Europe/London'
    return 'UTC'
  }

  const displayZone = toDisplayZone(slotTimeZone)
  const ianaZone = toIanaZone(slotTimeZone)

  const defaultSubject = `SPR Meeting Invitation — ${vendorName} ${quarter} ${year}`
  const defaultBody = [
    'Dear Team,',
    '',
    `You are invited to the SPR (Supplier Performance Review) governance meeting for ${vendorName} — ${quarter} ${year}.`,
    '',
    `Date: ${formatDateInZone(dateObj)}`,
    `Time: ${formatTimeInZone(dateObj)} - ${formatTimeInZone(endTime)} ${displayZone}`,
    'Location: Microsoft Teams',
    '',
    'Agenda:',
    `1. ${quarter} Performance Review & Scorecard Discussion`,
    '2. Key Issues, Concerns and Pushback Responses',
    '3. Commitments and Action Items Review',
    '4. Forward Planning & AOB',
    '',
    'Please accept or decline this invitation via Microsoft Teams.',
    '',
    '— VendorPulse Scheduling Agent',
  ].join('\n')

  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState(defaultBody)

  function formatDateInZone(date: Date): string {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: ianaZone,
    })
  }

  function formatTimeInZone(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: ianaZone,
    })
  }

  async function handleSend() {
    if (Boolean(isLocked) || hasSentInvite || isProcessing) return
    setIsProcessing(true)
    setAgentStatus('running')
    setGraphError(null)

    let teamsMeetingUrl: string | null = null

    try {
      const organiserEmail = await getTokenOwnerOrganizerEmail()
      const fallbackOrganizer = getPreferredOrganizerEmail(attendees)
      if (!organiserEmail) {
        if (fallbackOrganizer) {
          throw new Error('Could not resolve token owner organizer from Graph token. Refresh GRAPH_ACCESS_TOKEN and retry.')
        }
        throw new Error('No organiser email found. Add a valid coordinator attendee email.')
      }
      const res = await apiFetch<{
        event_id: string
        teams_meeting_url: string
        web_link: string
      }>(`/api/cycles/${cycleId}/scheduling/graph/send-invite`, {
        method: 'POST',
        body: JSON.stringify({
          slot_id: slot.slot_id,
          organiser_email: organiserEmail,
          subject,
          body,
        }),
      })

      if (res) {
        teamsMeetingUrl = res.teams_meeting_url ?? null
      }

      setAgentStatus('complete')
      setIsProcessing(false)
      onInviteSent(teamsMeetingUrl)
      return
    } catch (err) {
      setGraphError(err instanceof Error ? err.message : 'Failed to create Teams meeting')
      setAgentStatus('failed')
      setIsProcessing(false)
      return
    }

    setAgentStatus('complete')
    setIsProcessing(false)
    setHasSentInvite(true)
    onInviteSent(teamsMeetingUrl)
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
                Review and approve the calendar invite — it will be sent via Microsoft Teams
              </p>
            </div>
          </div>
          <AgentStatusBadge status={agentStatus} />
        </div>

        {graphError && (
          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            {graphError}
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
                {formatDateInZone(dateObj)}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Clock size={15} className="text-indigo-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Time</p>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {formatTimeInZone(dateObj)} – {formatTimeInZone(endTime)} {displayZone}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                Displayed in {displayZone} (converted from Graph UTC values)
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

        {/* Editable invite */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <FileText size={14} className="text-slate-400" />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Teams Invite — Editable
            </span>
            <button
              type="button"
              onClick={() => { setSubject(defaultSubject); setBody(defaultBody) }}
              disabled={isProcessing || hasSentInvite}
              className="ml-auto text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50 disabled:no-underline"
            >
              Reset to default
            </button>
          </div>

          <div className="p-5 space-y-3 text-sm">
            <div className="space-y-1.5 pb-3 border-b border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex gap-3">
                <span className="text-slate-500 dark:text-slate-400 w-16 shrink-0 pt-1">To:</span>
                <span className="text-slate-700 dark:text-slate-300 pt-1">
                  {attendees
                    .slice(0, 3)
                    .map((a) => a.email)
                    .join(', ')}
                  {attendees.length > 3 && ` and ${attendees.length - 3} more`}
                </span>
              </div>
              <div className="flex gap-3 items-center">
                <label className="text-slate-500 dark:text-slate-400 w-16 shrink-0">Subject:</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={isProcessing || hasSentInvite}
                  className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Invite body (editable)
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={isProcessing || hasSentInvite}
                rows={14}
                className="w-full px-3 py-2 text-xs leading-relaxed font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y disabled:opacity-60"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                This text is sent as the meeting invite body via Microsoft Graph. Edit freely before approving.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            By approving, this invite will be sent to{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              {attendees.length} attendees
            </strong>{' '}
            via <strong className="text-slate-800 dark:text-slate-200">Microsoft Teams</strong>.
            RSVPs will be tracked automatically.
          </p>
          {graphError && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
              <AlertCircle size={12} />
              {graphError}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              disabled={Boolean(isLocked) || isProcessing || hasSentInvite}
              className={cn(
                'px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700',
                'text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors',
                (Boolean(isLocked) || isProcessing || hasSentInvite) && 'opacity-60 cursor-not-allowed'
              )}
            >
              Back
            </button>
          )}
          <button
            onClick={handleSend}
            disabled={Boolean(isLocked) || isProcessing || hasSentInvite}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors',
              (Boolean(isLocked) || isProcessing || hasSentInvite) && 'opacity-60 cursor-not-allowed'
            )}
          >
            {isProcessing ? (
              <>
                <Send size={14} className="animate-pulse" />
                Sending via Graph…
              </>
            ) : hasSentInvite ? (
              <>
                <Send size={14} />
                Invite Sent
              </>
            ) : (
              <>
                <Globe size={14} />
                Approve & Send Invite
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
