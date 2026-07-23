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
import { createMeetingEvent } from '@/lib/graphScheduling'
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

    try {
      // Build the invite subject + HTML body from the approved details.
      const subject = `EGB/QBR Meeting Invitation — ${vendorName} ${quarter} ${year}`
      const bodyHtml =
        `<p>Dear Team,</p>` +
        `<p>You are invited to the <strong>EGB/QBR governance review</strong> for ` +
        `<strong>${vendorName} — ${quarter} ${year}</strong>.</p>` +
        `<p>📅 <strong>Date:</strong> ${formatDateInZone(dateObj)}<br/>` +
        `🕙 <strong>Time:</strong> ${formatTimeInZone(dateObj)} – ${formatTimeInZone(endTime)} ${displayZone}<br/>` +
        `📍 <strong>Location:</strong> Microsoft Teams</p>` +
        `<p><strong>Agenda</strong></p>` +
        `<ol><li>${quarter} Performance Review &amp; Scorecard Discussion</li>` +
        `<li>Key Issues, Concerns and Pushback Responses</li>` +
        `<li>Commitments and Action Items Review</li>` +
        `<li>Forward Planning &amp; AOB</li></ol>` +
        `<p>Please accept or decline via Microsoft Teams.</p><p>— VendorPulse</p>`

      // 1. Create the Teams meeting + send invites AS the signed-in coordinator
      //    (delegated Graph — no backend token). 2. Persist to the backend.
      const created = await createMeetingEvent({ slot, attendees, subject, bodyText: bodyHtml })

      await apiFetch(`/api/cycles/${cycleId}/scheduling/manual-meeting`, {
        method: 'POST',
        body: JSON.stringify({
          start_time: slot.proposed_time,
          time_zone: displayZone,
          duration_minutes: durationMinutes,
          meeting_url: created.teams_meeting_url,
        }),
      })

      setAgentStatus('complete')
      setHasSentInvite(true)
      setIsProcessing(false)
      onInviteSent(created.teams_meeting_url)
    } catch (err) {
      setGraphError(err instanceof Error ? err.message : 'Failed to create Teams meeting')
      setAgentStatus('failed')
      setIsProcessing(false)
    }
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
                  {formatDateInZone(dateObj)}
                </p>
                <p>
                  🕙 <strong>Time:</strong> {formatTimeInZone(dateObj)} –{' '}
                  {formatTimeInZone(endTime)} {displayZone}
                </p>
                <p>📍 <strong>Location:</strong> Conference Room B / Microsoft Teams</p>
              </div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Agenda:
              </p>
              <ol className="list-decimal list-inside space-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                <li>{quarter} Performance Review &amp; Scorecard Discussion</li>
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
