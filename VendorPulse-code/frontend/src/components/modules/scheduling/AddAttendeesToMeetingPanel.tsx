import { useState } from 'react'
import { UserPlus, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { addAttendeesToEvent, createMeetingEvent, isSchedulingAvailable } from '@/lib/graphScheduling'
import { SearchAddAttendeeForm } from './AttendeeRefreshPanel'
import DraftReviewDialog from '@/components/shared/DraftReviewDialog'
import type { CycleAttendee, SlotProposal } from '@/types/scheduling.types'

interface Props {
  cycleId: string
  attendees: CycleAttendee[]
  /** Append a newly-added attendee to the cycle list. */
  onAttendeesChanged: (updated: CycleAttendee[]) => void
  slot: SlotProposal
  /** Graph event id of the already-scheduled meeting (null for meetings created before it was persisted). */
  eventId: string | null
  vendorName: string
  quarter: string
  year: number
  timeZone: 'IST' | 'UTC' | 'GMT'
  /** Called after a successful invite so the parent can refresh the stored event id / join link. */
  onUpdated: (eventId: string | null, meetingUrl: string | null) => void
  /** Close the add-attendee section. */
  onClose: () => void
}

/**
 * Single self-contained block for the Confirmation tab: search + add a person, then
 * invite the newly-added attendees to the ALREADY-scheduled Teams meeting (same time
 * + join link) via delegated Calendars.ReadWrite.
 *
 * With a stored event id we PATCH the event (Graph invites only the new people).
 * Without one (meeting scheduled before event ids were persisted) we re-create the
 * event for the full attendee list at the same time and persist the new id + link.
 */
export default function AddAttendeesToMeetingPanel({
  cycleId,
  attendees,
  onAttendeesChanged,
  slot,
  eventId,
  vendorName,
  quarter,
  year,
  timeZone,
  onUpdated,
  onClose,
}: Props) {
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [draftOpen, setDraftOpen] = useState(false)

  // Default invite text (editable in the draft dialog before sending).
  const defaultSubject = `EGB/QBR Meeting Invitation — ${vendorName} ${quarter} ${year}`
  const defaultBody =
    `<p>Dear Team,</p>` +
    `<p>You have been added to the <strong>EGB/QBR governance review</strong> for ` +
    `<strong>${vendorName} — ${quarter} ${year}</strong>.</p>` +
    `<p>Please accept or decline via Microsoft Teams.</p><p>— Mobility Vendor Pulse</p>`

  function handleAdded(added: CycleAttendee) {
    onAttendeesChanged([...attendees, added])
    // A new person was added — the previous "invite sent" state no longer covers them.
    setStatus('idle')
  }

  function openDraft() {
    if (!isSchedulingAvailable()) {
      setError("You can't send invites — you're not signed in with Shell (SSO). Sign in with your Shell account and try again.")
      setStatus('error')
      return
    }
    setError(null)
    setDraftOpen(true)
  }

  async function doInvite(draft: { subject: string; body: string }) {
    setStatus('working')
    setError(null)
    // Only push the invite text onto the existing event when the coordinator actually
    // edited it — otherwise leave it untouched so Graph notifies just the new people.
    const edited = draft.subject !== defaultSubject || draft.body !== defaultBody
    try {
      if (eventId) {
        // Existing event → PATCH the attendee list (+ optionally the edited text).
        await addAttendeesToEvent({
          eventId,
          attendees,
          ...(edited ? { subject: draft.subject, bodyHtml: draft.body } : {}),
        })
        setStatus('done')
        setDraftOpen(false)
        onUpdated(eventId, null)
        return
      }

      // No stored event id → re-create the meeting for everyone at the same time.
      const created = await createMeetingEvent({ slot, attendees, subject: draft.subject, bodyText: draft.body })
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
      setDraftOpen(false)
      onUpdated(created.event_id, created.teams_meeting_url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to invite the added attendees.')
      setStatus('error')
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 fade-in">
      {/* Search + add a person (same form used in the Attendees step). */}
      <SearchAddAttendeeForm
        cycleId={cycleId}
        existingAttendeeIds={attendees.map((a) => a.user_id ?? a.attendee_id)}
        onAdded={handleAdded}
        onCancel={onClose}
      />

      {/* Invite the newly-added attendees to the scheduled meeting. */}
      <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
        {error && (
          <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Added people join the same Teams meeting — same time &amp; link. Existing attendees aren&rsquo;t re-invited.
          </p>
          <button
            type="button"
            onClick={openDraft}
            disabled={status === 'working' || attendees.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors shrink-0"
          >
            {status === 'working' ? (
              <><Loader2 size={14} className="animate-spin" /> Sending invite…</>
            ) : status === 'done' ? (
              <><CheckCircle2 size={14} /> Invite sent</>
            ) : (
              <><UserPlus size={14} /> Send invite to added attendees</>
            )}
          </button>
        </div>
        {status === 'done' && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-2 flex items-center gap-1.5">
            <CheckCircle2 size={12} /> Newly added attendees have been invited to the scheduled meeting.
          </p>
        )}
      </div>

      <DraftReviewDialog
        open={draftOpen}
        kind="invite"
        title="Review invite for added attendees"
        subject={defaultSubject}
        body={defaultBody}
        recipients={attendees.filter((a) => a.email).map((a) => `${a.name} (${a.email})`)}
        note="Leave the message unchanged to notify only the newly-added people; editing it re-notifies all attendees with the updated text."
        sendLabel="Send invite"
        busy={status === 'working'}
        onSend={doInvite}
        onCancel={() => { if (status !== 'working') setDraftOpen(false) }}
      />
    </div>
  )
}
