import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  CalendarPlus, Users, ExternalLink, CheckCircle2, RotateCcw, Building2, Link2Off, UserPlus, X, CalendarCheck, Trash2, Ban,
} from 'lucide-react'
import {
  scheduleVendorPrepMeetingManual, getVendorPrepMeeting, deleteVendorPrepMeeting,
  getVendorPrepAttendees, addVendorPrepAttendee, removeVendorPrepAttendee, resetVendorPrepAttendees,
} from '@/lib/vendorPrepApi'
import { cancelTeamsMeeting } from '@/lib/meetingCancel'
import { canChangeMeeting, isMeetingScheduler, onlySchedulerNote, useCurrentUser } from '@/lib/auth/currentUser'
import { SearchAddAttendeeForm } from '@/components/modules/scheduling/AttendeeRefreshPanel'
import SendAddedInvitePanel from '@/components/modules/scheduling/SendAddedInvitePanel'
import DelegatedScheduler from '@/components/modules/scheduling/DelegatedScheduler'
import MeetingReferenceBanner, { type ReferenceDate } from '@/components/modules/scheduling/MeetingReferenceBanner'
import { listAlignmentMeetings, type AlignmentMeeting } from '@/lib/alignmentApi'
import { formatMeetingTime } from '@/utils/formatMeetingTime'
import { sprTitle, vendorPrepInviteBody } from '@/lib/standardText'

import TranscriptInput from '@/components/modules/meeting/TranscriptInput'
import MeetingMinutesViewer from '@/components/modules/meeting/MeetingMinutesViewer'
import { getMeetingArtifact } from '@/lib/meetingApi'
import type { CycleAttendee } from '@/types/scheduling.types'
import type { MeetingNote, MeetingMinutes } from '@/types/meeting.types'
import type { ExtractedAction } from '@/types/alignment.types'
import { cn } from '@/utils/cn'

interface Props {
  cycleId: string
  vendorName: string
  quarter: string
  year: number
  /** Bubble action items parsed from this meeting's transcript to the shared log. */
  onActionsExtracted?: (actions: ExtractedAction[]) => void
  alreadyExtracted?: boolean
  /** Final QBR/SPR date — vendor-prep slots end the day before it. */
  qbrMeetingDate?: string | null
  /** Timezone the SPR meeting was scheduled in (for the reference banner). */
  qbrTimeZone?: string | null
  /** The vendor-pushback section — rendered here once the transcript is parsed, i.e.
   *  after the prep meeting (when the vendor's actual objections are known). */
  pushbackSlot?: ReactNode
}

interface MeetingResult {
  teamsUrl: string | null
  webLink: string | null
  attendeeCount: number
  /** Who the invite actually went to (organiser + participants). */
  invitedEmails?: string[]
  /** UTC ISO instant of the scheduled start — used to display date/time. */
  startISO?: string | null
  timeZone?: string | null
  durationMinutes?: number | null
  /** Outlook id of the Teams meeting — lets it be moved / cancelled reliably. */
  graphEventId?: string | null
  /** Who scheduled it (SSO email) — only they may reschedule or cancel it. */
  scheduledBy?: string | null
}

/**
 * The single Vendor Prep meeting for a cycle: pick when the prep call is scheduled
 * and who is invited (internal team + vendor), then attach its transcript and
 * generate AI minutes + action items.
 *
 * Persisted server-side in the SHARED meetings store as meetingType=VENDOR_PREP
 * (see docs/GRAPH_SCHEDULING_HANDOVER.md) — no separate meetings table. Scheduling
 * is manual (no Microsoft Graph / calendar access required).
 */
export default function VendorPrepMeetingPanel({
  cycleId, vendorName, quarter, year, onActionsExtracted, alreadyExtracted, qbrMeetingDate, qbrTimeZone, pushbackSlot,
}: Props) {
  // The Shell-approved Prep Call invite. Byte-identical to the backend builder (verified);
  // 'Colleague' matches it because one calendar invite serves the whole group.
  const inviteSubject = sprTitle(vendorName, quarter, year, 'Prep Call')
  const inviteBody = vendorPrepInviteBody('Colleague', vendorName, quarter, year)

  const [attendees, setAttendees] = useState<CycleAttendee[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [meetingResult, setMeetingResult] = useState<MeetingResult | null>(null)
  // Parsed transcript notes + any previously-generated MoM for this prep meeting.
  const meetingId = `vprep-${cycleId}`
  const [parsedNotes, setParsedNotes] = useState<MeetingNote[]>([])
  const [savedMinutes, setSavedMinutes] = useState<MeetingMinutes | null>(null)
  // Restored alongside the minutes so an already-approved MoM does not re-prompt.
  const [minutesApproved, setMinutesApproved] = useState(false)
  const [minutesSentTo, setMinutesSentTo] = useState<{ name: string; email: string }[]>([])

  const [rescheduling, setRescheduling] = useState(false)
  const [addingInvitee, setAddingInvitee] = useState(false)
  const [removeLoading, setRemoveLoading] = useState<string | null>(null)
  // Snapshot of emails already on the Teams invite (captured at schedule time). null =
  // not captured. Anyone in the roster but not here was added after scheduling — only
  // then do we offer "Send invite to added attendees".
  const [invitedBaseline, setInvitedBaseline] = useState<Set<string> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [persistenceChecked, setPersistenceChecked] = useState(false)
  // Scheduled internal-alignment meeting(s) — shown as reference dates so the prep
  // call can be scheduled between the alignment call(s) and the SPR.
  const [alignmentMeetings, setAlignmentMeetings] = useState<AlignmentMeeting[]>([])

  useEffect(() => {
    let cancelled = false
    listAlignmentMeetings(cycleId)
      .then((res) => { if (!cancelled) setAlignmentMeetings(res.meetings ?? []) })
      .catch(() => { /* backend offline / none scheduled */ })
    return () => { cancelled = true }
  }, [cycleId])

  // Reference dates for the banner: every scheduled alignment call, then the SPR.
  const referenceDates: ReferenceDate[] = (() => {
    const scheduled = alignmentMeetings
      .filter((m) => m.start_time)
      .sort((a, b) => new Date(a.start_time!).getTime() - new Date(b.start_time!).getTime())
    const alignmentRows: ReferenceDate[] = scheduled.map((m) => ({
      label: scheduled.length > 1 ? `Alignment meeting ${m.meeting_index}` : 'Internal Alignment meeting',
      iso: m.start_time,
      timeZone: m.time_zone,
      durationMinutes: m.duration_minutes,
    }))
    return [
      ...alignmentRows,
      { label: 'SPR meeting', iso: qbrMeetingDate, timeZone: qbrTimeZone },
    ]
  })()

  // The prep call must start AFTER the latest alignment call (and before the SPR).
  const latestAlignmentStart = alignmentMeetings
    .map((m) => m.start_time)
    .filter((s): s is string => !!s)
    // Same as ManualMeetingPanel: ISO-8601 UTC instants sort chronologically by code
    // unit. (Not reported by the scan - this file moved after it ran.)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .slice(-1)[0] ?? null

  // Load this vendor-prep meeting's OWN roster (separate from the cycle attendees);
  // default-tick everyone.
  const loadAttendees = useCallback(async () => {
    try {
      const res = await getVendorPrepAttendees(cycleId)
      const active = res.attendees.filter((a) => a.confirmation_status !== 'DECLINED')
      setAttendees(active)
      setSelected(new Set(active.map((a) => (a.email || '').toLowerCase()).filter(Boolean)))
    } catch { /* backend offline — leave empty */ }
  }, [cycleId])

  useEffect(() => { loadAttendees() }, [loadAttendees])

  // Recover an already-scheduled meeting on mount (state persistence).
  useEffect(() => {
    if (persistenceChecked) return
    let cancelled = false
    getVendorPrepMeeting(cycleId)
      .then((res) => {
        if (!cancelled && res.meeting) {
          setMeetingResult({
            teamsUrl: res.meeting.teams_meeting_url,
            webLink: res.meeting.web_link,
            attendeeCount: res.meeting.attendee_count,
            invitedEmails: res.meeting.attendee_emails,
            startISO: res.meeting.start_time,
            timeZone: res.meeting.time_zone,
            durationMinutes: res.meeting.duration_minutes,
            graphEventId: res.meeting.graph_event_id ?? null,
            scheduledBy: res.meeting.scheduled_by ?? null,
          })
        }
      })
      .catch(() => { /* no meeting / offline */ })
      .finally(() => { if (!cancelled) setPersistenceChecked(true) })
    return () => { cancelled = true }
  }, [cycleId, persistenceChecked])

  // Restore parsed notes + generated MoM for this prep meeting so it survives a refresh.
  useEffect(() => {
    let cancelled = false
    getMeetingArtifact(cycleId, meetingId)
      .then((a) => {
        if (cancelled) return
        if (a.notes?.length) setParsedNotes(a.notes)
        if (a.minutes) setSavedMinutes(a.minutes)
        if (a.minutes_approved_at) setMinutesApproved(true)
        if (a.minutes_sent_to?.length) setMinutesSentTo(a.minutes_sent_to)
      })
      .catch(() => { /* backend offline / never parsed */ })
    return () => { cancelled = true }
  }, [cycleId, meetingId])

  // Once a meeting is scheduled and the roster has loaded, snapshot the current
  // invitees as the baseline. Anyone added afterward is a "pending" invitee.
  useEffect(() => {
    if (invitedBaseline !== null) return
    if (!meetingResult) return
    // Prefer who the server says was invited. The fallback assumes the whole roster, so
    // anyone left off the invite (or restored by a reschedule that was then cancelled)
    // looked already-invited and was never offered one by "Send invite to added attendees".
    if (meetingResult.invitedEmails?.length) {
      setInvitedBaseline(new Set(meetingResult.invitedEmails.map((e) => (e || '').toLowerCase()).filter(Boolean)))
      return
    }
    if (attendees.length === 0) return
    setInvitedBaseline(new Set(attendees.map((a) => (a.email || '').toLowerCase()).filter(Boolean)))
  }, [meetingResult, attendees, invitedBaseline])

  // People added to the roster AFTER the meeting was scheduled (not yet on the invite).
  const pendingInvitees = invitedBaseline
    ? attendees.filter((a) => a.email && !invitedBaseline.has((a.email || '').toLowerCase()))
    : []

  const selectedEmails = attendees
    .map((a) => (a.email || '').toLowerCase())
    .filter((e) => e && selected.has(e))

  function toggle(email: string) {
    const e = email.toLowerCase()
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(e)) next.delete(e)
      else next.add(e)
      return next
    })
  }

  // Select-all / deselect-all across everyone who has an email.
  const selectableEmails = attendees
    .map((a) => (a.email || '').toLowerCase())
    .filter(Boolean)
  const allSelected = selectableEmails.length > 0 && selectableEmails.every((e) => selected.has(e))
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableEmails))
  }

  // A last-moment invitee added to the cycle roster — append it and auto-select
  // so it's included the next time the meeting is (re)scheduled.
  function handleInviteeAdded(attendee: CycleAttendee) {
    setAttendees((prev) =>
      prev.some((a) => a.attendee_id === attendee.attendee_id) ? prev : [...prev, attendee]
    )
    const email = (attendee.email || '').toLowerCase()
    if (email) setSelected((prev) => new Set(prev).add(email))
    setAddingInvitee(false)
  }

  async function handleRemoveAttendee(attendeeId: string) {
    const removed = attendees.find((a) => a.attendee_id === attendeeId)
    setRemoveLoading(attendeeId)
    try {
      await removeVendorPrepAttendee(cycleId, attendeeId)
      setAttendees((prev) => prev.filter((a) => a.attendee_id !== attendeeId))
      const email = (removed?.email || '').toLowerCase()
      if (email) setSelected((prev) => { const next = new Set(prev); next.delete(email); return next })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove attendee')
    } finally {
      setRemoveLoading(null)
    }
  }

  const addInviteeForm = addingInvitee && (
    <SearchAddAttendeeForm
      cycleId={cycleId}
      existingAttendeeIds={attendees.map((a) => a.user_id ?? a.attendee_id)}
      onAdded={handleInviteeAdded}
      onCancel={() => setAddingInvitee(false)}
      // Save into THIS vendor-prep meeting's own roster — never the cycle attendees.
      submitOverride={async (data) => {
        const res = await addVendorPrepAttendee(cycleId, {
          name: data.name, email: data.email, role: data.role,
          organisation: data.organisation, is_key: data.is_key, type: data.type,
          attendance_requirement: data.attendance_requirement, lt_status: data.lt_status,
          shell_department: data.shell_department, user_id: data.user_id,
          stakeholder_id: data.stakeholder_id,
        })
        return res.attendee
      }}
      hideKey
    />
  )

  const selectedInternal = attendees.filter(
    (a) => a.type !== 'Vendor' && !!a.email && selected.has(a.email.toLowerCase())
  )
  const selectedAttendees = attendees.filter(
    (a) => !!a.email && selected.has(a.email.toLowerCase())
  )

  function handleParsed(parsed: MeetingNote[]) {
    setParsedNotes(parsed)
    const actions: ExtractedAction[] = parsed
      .filter((n) => n.note_type === 'ACTION')
      .map((n, i) => ({
        action_id: n.note_id || `vprep-act-${i}`,
        description: n.content,
        // The assignee, never the speaker (usually the chair reading the actions out).
        owner: n.owner || 'TBD',
        due_date: n.due_date ?? null,
        source: 'vendor_prep',
        status: 'OPEN',
      }))
    if (actions.length && onActionsExtracted) onActionsExtracted(actions)
  }

  // Gated on persistenceChecked: until that fetch resolves we do not know whether this
  // prep call is already scheduled, and showing the scheduler meanwhile made the whole
  // slot picker and its tick list flash up on every refresh before being replaced.
  const showScheduler = persistenceChecked && (!meetingResult || rescheduling)
  // Unlike the alignment panel, the tick list here is only rendered while the scheduler
  // is up — once the meeting exists the roster below is read-only, so there is nothing
  // to lock. What WAS still live after sending is the per-row remove button.
  const inviteSent = Boolean(meetingResult) && !rescheduling
  const rosterLocked = inviteSent || !persistenceChecked

  // Only whoever scheduled the prep call can move it, cancel it or invite more people
  // to it — the Teams meeting lives in their mailbox. Everyone else sees it read-only.
  const me = useCurrentUser()
  const changeBlocked = meetingResult && !canChangeMeeting(meetingResult.scheduledBy, me)
    ? onlySchedulerNote(meetingResult.scheduledBy, 'change')
    : null
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelProblem, setCancelProblem] = useState<{ message: string; allowRecordOnly: boolean } | null>(null)
  const [cancelNotice, setCancelNotice] = useState<string | null>(null)

  // Cancel the Teams meeting in Outlook FIRST (as its scheduler), then forget it here.
  // `recordOnly` skips Outlook, when the coordinator chooses that after a cancellation
  // could not be done. The roster is kept for the next time the call is scheduled.
  async function handleCancelMeeting(recordOnly = false) {
    if (!meetingResult) return
    setCancelBusy(true)
    setCancelProblem(null)
    try {
      let outlookNote = ''
      if (!recordOnly) {
        const attempt = await cancelTeamsMeeting({
          eventId: meetingResult.graphEventId,
          joinUrl: meetingResult.teamsUrl,
          startISO: meetingResult.startISO,
          scheduledByMe: isMeetingScheduler(meetingResult.scheduledBy, me),
        })
        if (!attempt.cleared) {
          setCancelProblem({ message: attempt.message, allowRecordOnly: attempt.allowRecordOnly })
          return
        }
        outlookNote = attempt.message
      }
      try {
        await deleteVendorPrepMeeting(cycleId)
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'Could not cancel the meeting.'
        setCancelProblem({
          message: outlookNote ? `${outlookNote} But VendorPulse could not remove the meeting: ${reason}` : reason,
          allowRecordOnly: !!outlookNote,
        })
        return
      }
      setMeetingResult(null)
      setInvitedBaseline(null)
      setConfirmCancel(false)
      setCancelNotice(`Vendor prep meeting cancelled.${outlookNote ? ` ${outlookNote}` : ''}`)
      await loadAttendees()
    } finally {
      setCancelBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <CalendarPlus size={15} className="text-orange-500" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Schedule Vendor Prep Meeting</h3>
        </div>

        <div className="p-5 space-y-4">
          {/* Scheduled state */}
          {!persistenceChecked ? (
            <p className="text-xs text-slate-400">Checking for an existing meeting…</p>
          ) : meetingResult && !rescheduling ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 size={16} /> Vendor prep meeting scheduled — {meetingResult.attendeeCount} attendee{meetingResult.attendeeCount === 1 ? '' : 's'} invited.
              </div>
              {formatMeetingTime(meetingResult.startISO, meetingResult.timeZone ?? 'IST', meetingResult.durationMinutes) && (
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                  <CalendarCheck size={13} className="shrink-0" />
                  {formatMeetingTime(meetingResult.startISO, meetingResult.timeZone ?? 'IST', meetingResult.durationMinutes)}
                </p>
              )}
              {meetingResult.teamsUrl ? (
                <a
                  href={meetingResult.teamsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-orange-600 dark:text-orange-400 hover:underline"
                >
                  <ExternalLink size={14} /> Join meeting link
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm text-slate-400 dark:text-slate-500">
                  <Link2Off size={14} /> No meeting link added
                </span>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={async () => {
                    setError(null)
                    setRescheduling(true)
                    // Bring the full cycle attendee list back so the coordinator can re-pick.
                    try {
                      await resetVendorPrepAttendees(cycleId)
                      setInvitedBaseline(null)
                      await loadAttendees()
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Failed to reload attendees')
                    }
                  }}
                  disabled={!!changeBlocked}
                  title={changeBlocked ?? undefined}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RotateCcw size={13} /> Reschedule
                </button>
                <button
                  onClick={() => setAddingInvitee((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-orange-300 dark:border-orange-800 text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                >
                  {addingInvitee ? <X size={13} /> : <UserPlus size={13} />}
                  {addingInvitee ? 'Cancel' : 'Add invitee'}
                </button>
                <button
                  onClick={() => { setConfirmCancel(true); setCancelProblem(null); setCancelNotice(null) }}
                  disabled={!!changeBlocked || cancelBusy}
                  title={changeBlocked ?? 'Cancel the prep call in Outlook and notify the attendees'}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Ban size={13} /> Cancel meeting
                </button>
              </div>
              {changeBlocked && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{changeBlocked}</p>
              )}
              {confirmCancel && (
                <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30">
                  <span className="text-sm text-rose-700 dark:text-rose-300">
                    {cancelProblem
                      ? cancelProblem.message
                      : 'Cancel the vendor prep meeting? Its Teams meeting will be cancelled in Outlook and the attendees notified.'}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {cancelProblem ? (
                      cancelProblem.allowRecordOnly && (
                        <button
                          onClick={() => handleCancelMeeting(true)}
                          disabled={cancelBusy}
                          title="Remove it from VendorPulse without changing Outlook — cancel the Teams meeting there yourself"
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-300 text-rose-700 dark:text-rose-300 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-60"
                        >
                          {cancelBusy ? 'Removing…' : 'Remove from VendorPulse only'}
                        </button>
                      )
                    ) : (
                      <button
                        onClick={() => handleCancelMeeting()}
                        disabled={cancelBusy}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60"
                      >
                        {cancelBusy ? 'Cancelling…' : 'Cancel meeting'}
                      </button>
                    )}
                    <button
                      onClick={() => { setConfirmCancel(false); setCancelProblem(null) }}
                      disabled={cancelBusy}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
                    >
                      Keep meeting
                    </button>
                  </div>
                </div>
              )}
              {addInviteeForm}

              {/* Persistent invitee roster — visible after the meeting is scheduled. */}
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <Users size={13} className="text-slate-400" />
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Invitees ({attendees.length})
                  </span>
                </div>
                {attendees.length === 0 ? (
                  <p className="text-xs text-slate-400">No attendees found for this cycle.</p>
                ) : (
                  <div className="space-y-1.5">
                    {attendees.map((a) => {
                      const isVendor = a.type === 'Vendor'
                      return (
                        <div key={a.attendee_id} className="flex items-center justify-between group">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={cn(
                              'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0',
                              isVendor
                                ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400'
                                : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
                            )}>
                              {(a.name || '?').charAt(0).toUpperCase()}
                            </span>
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{a.name}</span>
                            <span className={cn(
                              'text-[9px] px-1 py-0.5 rounded font-semibold flex items-center gap-0.5 shrink-0',
                              isVendor
                                ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300'
                            )}>
                              {isVendor && <Building2 size={9} />}
                              {isVendor ? 'VENDOR' : 'INTERNAL'}
                            </span>
                            <span className="text-[10px] text-slate-400 truncate">{a.email}</span>
                          </div>
                          <button
                            onClick={() => handleRemoveAttendee(a.attendee_id)}
                            disabled={removeLoading === a.attendee_id || rosterLocked}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500 disabled:opacity-30 shrink-0 ml-2"
                            title="Remove attendee"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {meetingResult.teamsUrl && pendingInvitees.length > 0 && (
                <SendAddedInvitePanel
                  attendees={attendees}
                  meetingUrl={meetingResult.teamsUrl}
                  eventId={meetingResult.graphEventId}
                  startISO={meetingResult.startISO}
                  disabledReason={changeBlocked}
                  subject={inviteSubject}
                  body={inviteBody}
                  onSent={() => {
                    // Everyone on the roster is now on the invite — move the headline
                    // count with it, or it keeps reporting the original figure next to
                    // a roster that has grown.
                    const invited = [...new Set(attendees.map((a) => (a.email || '').toLowerCase()).filter(Boolean))]
                    setInvitedBaseline(new Set(invited))
                    setMeetingResult((prev) => prev && { ...prev, attendeeCount: invited.length, invitedEmails: invited })
                  }}
                />
              )}
            </div>
          ) : (
            <>
              {cancelNotice && (
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30">
                  <span className="text-sm text-emerald-700 dark:text-emerald-300">{cancelNotice}</span>
                  <button
                    onClick={() => setCancelNotice(null)}
                    aria-label="Dismiss"
                    className="p-1 rounded text-emerald-700 dark:text-emerald-300 hover:bg-white/70 dark:hover:bg-slate-800"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Schedule the prep call with the internal team and the vendor. Untick anyone who should not be invited.
              </p>
            </>
          )}

          {showScheduler && (
            <>
              {/* Alignment call + SPR dates for reference — schedule the prep between them. */}
              <MeetingReferenceBanner
                dates={referenceDates}
                note="Schedule the vendor prep call after the alignment meeting and before the SPR."
              />

              {/* Attendee selection (internal + vendor, editable) */}
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Users size={13} className="text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      Invitees ({selectedEmails.length}/{attendees.length})
                    </span>
                    {selectableEmails.length > 0 && (
                      <button
                        type="button"
                        onClick={toggleAll}
                        className="text-[11px] font-medium text-orange-600 dark:text-orange-400 hover:text-orange-700"
                      >
                        {allSelected ? 'Deselect all' : 'Select all'}
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setAddingInvitee((v) => !v)}
                    className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 font-medium"
                  >
                    {addingInvitee ? <X size={12} /> : <UserPlus size={12} />}
                    {addingInvitee ? 'Cancel' : 'Add invitee'}
                  </button>
                </div>
                {addingInvitee && <div className="mb-3">{addInviteeForm}</div>}
                {attendees.length === 0 ? (
                  <p className="text-xs text-slate-400">No attendees found for this cycle.</p>
                ) : (
                  <div className="space-y-1.5">
                    {attendees.map((a) => {
                      const email = (a.email || '').toLowerCase()
                      const isVendor = a.type === 'Vendor'
                      return (
                        <label key={a.attendee_id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selected.has(email)}
                            onChange={() => toggle(email)}
                            className="accent-orange-600"
                          />
                          <span className={cn(
                            'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold',
                            isVendor
                              ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400'
                              : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
                          )}>
                            {(a.name || '?').charAt(0).toUpperCase()}
                          </span>
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{a.name}</span>
                          <span className={cn(
                            'text-[9px] px-1 py-0.5 rounded font-semibold flex items-center gap-0.5',
                            isVendor
                              ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300'
                          )}>
                            {isVendor && <Building2 size={9} />}
                            {isVendor ? 'VENDOR' : 'INTERNAL'}
                          </span>
                          <span className="text-[10px] text-slate-400 truncate">{a.email}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Delegated Graph scheduling: find slots across the internal invitees'
                  calendars, rank them, then create the Teams meeting inviting everyone
                  selected (internal + vendor). Vendors have no readable free/busy, so
                  they're invited but not part of the availability search. */}
              <DelegatedScheduler
                cycleId={cycleId}
                findAttendees={selectedInternal}
                inviteAttendees={selectedAttendees}
                defaultDuration={30}
                qbrMeetingDate={qbrMeetingDate}
                earliestMeetingDate={latestAlignmentStart}
                beforeLabel="the SPR meeting"
                afterLabel="the Internal Alignment call"
                existingEventId={rescheduling ? (meetingResult?.graphEventId ?? null) : null}
                existingMeetingUrl={rescheduling ? (meetingResult?.teamsUrl ?? null) : null}
                existingStartISO={rescheduling ? (meetingResult?.startISO ?? null) : null}
                subject={inviteSubject}
                bodyHtml={inviteBody}
                onCancel={rescheduling ? () => setRescheduling(false) : undefined}
                onScheduled={async ({ startTime, timeZone, durationMinutes, teamsUrl, eventId }) => {
                  if (selectedEmails.length === 0) { setError('Select at least one attendee to invite.'); return }
                  const res = await scheduleVendorPrepMeetingManual(cycleId, {
                    startTime, durationMinutes, timeZone, attendeeEmails: selectedEmails, meetingUrl: teamsUrl,
                    graphEventId: eventId,
                  })
                  // Drop anyone left unticked from this meeting's roster so only the
                  // invited people remain (persists). Re-add later via "Add invitee".
                  const unticked = attendees.filter(
                    (a) => !(a.email && selected.has((a.email || '').toLowerCase()))
                  )
                  for (const u of unticked) {
                    try { await removeVendorPrepAttendee(cycleId, u.attendee_id) } catch { /* best effort */ }
                  }
                  // The invited set is now the baseline — only people added AFTER this
                  // surface the "Send invite to added attendees" button.
                  setInvitedBaseline(new Set(selectedAttendees.map((a) => (a.email || '').toLowerCase()).filter(Boolean)))
                  setMeetingResult({
                    teamsUrl: res.teams_meeting_url, webLink: res.web_link, attendeeCount: res.attendee_count,
                    invitedEmails: res.attendee_emails,
                    startISO: startTime, timeZone, durationMinutes,
                    graphEventId: res.graph_event_id ?? eventId,
                    scheduledBy: res.scheduled_by ?? null,
                  })
                  setRescheduling(false)
                  await loadAttendees()
                }}
              />
            </>
          )}

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>
      </div>

      {/* Transcript → action items, and (once parsed) the meeting minutes for this prep call. */}
      <TranscriptInput
        cycleId={cycleId}
        meetingId={meetingId}
        onParsed={handleParsed}
        alreadyExtracted={alreadyExtracted}
      />
      {/* Vendor pushback — only after the transcript is parsed (the vendor's actual
          objections are known), and above the minutes so they feed the MoM/QBR. */}
      {(parsedNotes.length > 0 || savedMinutes) && pushbackSlot}
      {(parsedNotes.length > 0 || savedMinutes) && (
        <MeetingMinutesViewer
          cycleId={cycleId}
          meetingId={meetingId}
          heading="Vendor Prep Meeting Minutes"
          notes={parsedNotes}
          initialMinutes={savedMinutes}
          initialApproved={minutesApproved}
          initialSentTo={minutesSentTo}
          vendorName={vendorName}
          quarter={quarter}
          year={year}
          onApproved={() => setMinutesApproved(true)}
        />
      )}
    </div>
  )
}
