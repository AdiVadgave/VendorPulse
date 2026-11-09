import { useState } from 'react'
import { UserPlus, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { addAttendeesToEvent, findEventIdByJoinUrl, isSchedulingAvailable } from '@/lib/graphScheduling'
import DraftReviewDialog from '@/components/shared/DraftReviewDialog'
import type { CycleAttendee } from '@/types/scheduling.types'

interface Props {
  /**
   * This meeting's OWN roster. It is synced (in full) onto the already-scheduled
   * Teams event; Graph diffs against the event's current attendees and emails only
   * the newly-added people, leaving the time/join link unchanged.
   */
  attendees: CycleAttendee[]
  /** Teams join link of the already-scheduled meeting — used to locate the Graph event. */
  meetingUrl: string | null
  /** Stored Outlook id of the meeting (preferred over the join-link lookup). */
  eventId?: string | null
  /** The meeting's start — narrows the join-link lookup to that day's calendar. */
  startISO?: string | null
  /** Set when the signed-in user may not change this meeting (they did not schedule it):
   *  the button is disabled and this explains why. */
  disabledReason?: string | null
  /** Default invite subject (editable in the review dialog). */
  subject: string
  /** Default invite HTML body (editable in the review dialog). */
  body: string
  /** Fired after a successful invite so the parent can mark the roster as invited. */
  onSent?: () => void
}

/**
 * "Send invite to added attendees" for the alignment / vendor-prep meetings — the
 * same flow the QBR scheduling tab uses (see AddAttendeesToMeetingPanel). Uses the
 * stored Outlook event id (meetings saved before ids were stored are found by their
 * Teams join link) and PATCHes the attendee list so new invitees receive the
 * Outlook/Teams invite. Delegated Calendars.ReadWrite, as the signed-in coordinator —
 * which only works for the meeting's organiser, hence `disabledReason`.
 */
export default function SendAddedInvitePanel({ attendees, meetingUrl, eventId: storedEventId, startISO, disabledReason, subject, body, onSent }: Props) {
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [draftOpen, setDraftOpen] = useState(false)

  function openDraft() {
    if (!isSchedulingAvailable()) {
      setError("You can't send invites — you're not signed in with Shell (SSO). Sign in with your Shell account and try again.")
      setStatus('error')
      return
    }
    setError(null)
    setDraftOpen(true)
  }

  // `edited` is true only when the coordinator actually changed the text — so an
  // untouched draft leaves the event body alone and Graph notifies just the new people.
  async function doInvite(draft: { subject: string; body: string }, edited: boolean) {
    setStatus('working')
    setError(null)
    try {
      const eventId = storedEventId || (meetingUrl ? await findEventIdByJoinUrl(meetingUrl, startISO) : null)
      if (!eventId) {
        throw new Error(
          "Couldn't find this Teams meeting on your calendar. Try Reschedule to re-sync the invitee list."
        )
      }
      await addAttendeesToEvent({
        eventId,
        attendees,
        ...(edited ? { subject: draft.subject, bodyHtml: draft.body } : {}),
      })
      setStatus('done')
      setDraftOpen(false)
      onSent?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to invite the added attendees.')
      setStatus('error')
    }
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {disabledReason
            ? `${disabledReason} Ask them to send the invite.`
            : <>Newly added people join the same Teams meeting — same time &amp; link. Existing attendees aren&rsquo;t re-invited.</>}
        </p>
        <button
          type="button"
          onClick={openDraft}
          disabled={status === 'working' || attendees.length === 0 || !!disabledReason}
          title={disabledReason ?? undefined}
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
        <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
          <CheckCircle2 size={12} /> Newly added attendees have been invited to the scheduled meeting.
        </p>
      )}

      <DraftReviewDialog
        open={draftOpen}
        kind="invite"
        title="Review invite for added attendees"
        subject={subject}
        body={body}
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
