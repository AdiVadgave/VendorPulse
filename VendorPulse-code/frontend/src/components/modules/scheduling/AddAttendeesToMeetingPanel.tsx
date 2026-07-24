import { useState } from 'react'
import { UserPlus, Loader2, CheckCircle2, AlertCircle, CalendarCheck } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { addAttendeesToEvent, createMeetingEvent } from '@/lib/graphScheduling'
import type { CycleAttendee, SlotProposal } from '@/types/scheduling.types'

interface Props {
  cycleId: string
  attendees: CycleAttendee[]
  slot: SlotProposal
  /** Graph event id of the already-scheduled meeting (null for meetings created before it was persisted). */
  eventId: string | null
  vendorName: string
  quarter: string
  year: number
  timeZone: 'IST' | 'UTC' | 'GMT'
  /** Called after a successful update so the parent can refresh the stored event id / join link. */
  onUpdated: (eventId: string | null, meetingUrl: string | null) => void
}

/**
 * Shown on the Attendees step when a meeting is ALREADY scheduled. Lets the
 * coordinator invite attendees they just added to the existing Teams meeting —
 * same time, same join link — via the delegated Calendars.ReadWrite path.
 *
 * With a stored event id we PATCH the event (Graph invites only the new people).
 * Without one (meeting scheduled before event ids were persisted) we re-create the
 * event for the full attendee list at the same time and persist the new id + link.
 */
export default function AddAttendeesToMeetingPanel({
  cycleId,
  attendees,
  slot,
  eventId,
  vendorName,
  quarter,
  year,
  timeZone,
  onUpdated,
}: Props) {
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleInvite() {
    setStatus('working')
    setError(null)
    try {
      if (eventId) {
        // Existing event → PATCH the attendee list. Graph invites the new ones and
        // leaves the time/join link untouched.
        await addAttendeesToEvent({ eventId, attendees })
        setStatus('done')
        onUpdated(eventId, null)
        return
      }

      // No stored event id → re-create the meeting for everyone at the same time.
      const subject = `EGB/QBR Meeting Invitation — ${vendorName} ${quarter} ${year}`
      const bodyHtml =
        `<p>Dear Team,</p>` +
        `<p>You are invited to the <strong>EGB/QBR governance review</strong> for ` +
        `<strong>${vendorName} — ${quarter} ${year}</strong>.</p>` +
        `<p>Please accept or decline via Microsoft Teams.</p><p>— Mobility Vendor Pulse</p>`
      const created = await createMeetingEvent({ slot, attendees, subject, bodyText: bodyHtml })
      await apiFetch(`/api/cycles/${cycleId}/scheduling/manual-meeting`, {
        method: 'POST',
        body: JSON.stringify({
          start_time: slot.proposed_time,
          time_zone: timeZone,
          duration_minutes: slot.duration_minutes ?? 60,
          meeting_url: created.teams_meeting_url,
          event_id: created.event_id,
        }),
      })
      setStatus('done')
      onUpdated(created.event_id, created.teams_meeting_url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update the meeting invite.')
      setStatus('error')
    }
  }

  return (
    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg flex items-center justify-center shrink-0">
          <CalendarCheck size={18} className="text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-emerald-800 dark:text-emerald-300 text-sm">
            A meeting is already scheduled for this cycle
          </h3>
          <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
            Add or remove people in the list above, then send the invite so anyone newly added
            joins the same Teams meeting. Existing attendees aren&rsquo;t re-invited.
          </p>

          {error && (
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleInvite}
            disabled={status === 'working' || attendees.length === 0}
            className="mt-3 flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {status === 'working' ? (
              <><Loader2 size={14} className="animate-spin" /> Sending invite…</>
            ) : status === 'done' ? (
              <><CheckCircle2 size={14} /> Invite sent</>
            ) : (
              <><UserPlus size={14} /> Send invite to added attendees</>
            )}
          </button>
          {status === 'done' && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-2 flex items-center gap-1.5">
              <CheckCircle2 size={12} /> Newly added attendees have been invited to the scheduled meeting.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
