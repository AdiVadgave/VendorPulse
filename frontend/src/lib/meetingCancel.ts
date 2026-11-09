/**
 * Cancelling a scheduled meeting (SPR, internal alignment, vendor prep) from VendorPulse.
 *
 * The Teams meeting is cancelled in Outlook first, in the browser, with the scheduler's
 * own delegated Graph session — nobody else can cancel it (it lives in their mailbox),
 * and the backend holds no calendar token. Only once Outlook has cancelled it (or it was
 * already gone) does the caller remove the meeting from VendorPulse; otherwise the
 * attendees would keep a live invite for a meeting the app no longer knows about.
 */
import { cancelMeetingEvent } from '@/lib/graphScheduling'

export interface CancelAttempt {
  /** True when VendorPulse may now forget the meeting. */
  cleared: boolean
  /** What to tell the coordinator (empty when there was nothing in Outlook to cancel). */
  message: string
  /** Offer "Remove from VendorPulse only" — never for someone else's Teams meeting. */
  allowRecordOnly: boolean
}

export async function cancelTeamsMeeting(meeting: {
  eventId?: string | null
  joinUrl?: string | null
  startISO?: string | null
  /** Recorded as scheduled by the signed-in user: if it is not on their calendar any
   *  more, they (the organiser) already cancelled it. */
  scheduledByMe: boolean
}): Promise<CancelAttempt> {
  if (!meeting.eventId && !meeting.joinUrl) {
    // A time with no Teams meeting attached — nothing in Outlook to cancel.
    return { cleared: true, message: '', allowRecordOnly: false }
  }
  const outcome = await cancelMeetingEvent({
    eventId: meeting.eventId,
    joinUrl: meeting.joinUrl,
    startISO: meeting.startISO,
    comment: 'This meeting has been cancelled.',
  })
  switch (outcome.kind) {
    case 'cancelled':
      return { cleared: true, message: 'Its Teams meeting was cancelled and the attendees have been notified.', allowRecordOnly: false }
    case 'already_gone':
      return { cleared: true, message: 'Its Teams meeting had already been cancelled in Outlook.', allowRecordOnly: false }
    case 'not_organizer':
      return {
        cleared: false,
        message: `Only ${outcome.organizer ?? 'the person who scheduled it'} can cancel this Teams meeting — you are an attendee, not its organiser.`,
        allowRecordOnly: false,
      }
    case 'not_found':
      return meeting.scheduledByMe
        ? { cleared: true, message: 'Its Teams meeting was no longer on your calendar (already cancelled).', allowRecordOnly: false }
        : {
            cleared: false,
            message: "This Teams meeting isn't on your Outlook calendar, so it can't be cancelled from here. If it is still scheduled, its organiser needs to cancel it in Outlook.",
            allowRecordOnly: true,
          }
    case 'failed':
      return { cleared: false, message: `${outcome.message} The Teams meeting has not been cancelled.`, allowRecordOnly: true }
  }
}
