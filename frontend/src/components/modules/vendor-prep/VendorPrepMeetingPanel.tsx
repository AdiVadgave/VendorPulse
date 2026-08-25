import { useEffect, useState } from 'react'
import {
  CalendarPlus, Users, ExternalLink, CheckCircle2, RotateCcw, Building2, Link2Off, UserPlus, X, CalendarCheck, Trash2,
} from 'lucide-react'
import {
  scheduleVendorPrepMeetingManual, getVendorPrepMeeting,
  getVendorPrepAttendees, addVendorPrepAttendee, removeVendorPrepAttendee,
} from '@/lib/vendorPrepApi'
import { SearchAddAttendeeForm } from '@/components/modules/scheduling/AttendeeRefreshPanel'
import SendAddedInvitePanel from '@/components/modules/scheduling/SendAddedInvitePanel'
import DelegatedScheduler from '@/components/modules/scheduling/DelegatedScheduler'
import { formatMeetingTime } from '@/utils/formatMeetingTime'

const VENDOR_PREP_BODY_HTML =
  '<p>Vendor prep call — align the internal team with the vendor ahead of the governance meeting.</p>' +
  '<p><strong>Agenda</strong></p>' +
  '<ol><li>Walk through the agreed internal position and key issues</li>' +
  '<li>Confirm the points, data and pushback responses to raise</li>' +
  '<li>Agree logistics and owners for the governance meeting</li></ol>'
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
  /** Final QBR date — vendor-prep slots end the day before it. */
  qbrMeetingDate?: string | null
}

interface MeetingResult {
  teamsUrl: string | null
  webLink: string | null
  attendeeCount: number
  /** UTC ISO instant of the scheduled start — used to display date/time. */
  startISO?: string | null
  timeZone?: string | null
  durationMinutes?: number | null
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
  cycleId, vendorName, quarter, year, onActionsExtracted, alreadyExtracted, qbrMeetingDate,
}: Props) {
  const [attendees, setAttendees] = useState<CycleAttendee[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [meetingResult, setMeetingResult] = useState<MeetingResult | null>(null)
  // Parsed transcript notes + any previously-generated MoM for this prep meeting.
  const meetingId = `vprep-${cycleId}`
  const [parsedNotes, setParsedNotes] = useState<MeetingNote[]>([])
  const [savedMinutes, setSavedMinutes] = useState<MeetingMinutes | null>(null)

  const [rescheduling, setRescheduling] = useState(false)
  const [addingInvitee, setAddingInvitee] = useState(false)
  const [removeLoading, setRemoveLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [persistenceChecked, setPersistenceChecked] = useState(false)

  // Load cycle attendees (internal + vendor); default-select everyone.
  useEffect(() => {
    let cancelled = false
    getVendorPrepAttendees(cycleId)
      .then((res) => {
        if (cancelled) return
        // This vendor-prep meeting's OWN roster (separate from the cycle attendees).
        const active = res.attendees.filter((a) => a.confirmation_status !== 'DECLINED')
        setAttendees(active)
        setSelected(new Set(active.map((a) => (a.email || '').toLowerCase()).filter(Boolean)))
      })
      .catch(() => { /* backend offline — leave empty */ })
    return () => { cancelled = true }
  }, [cycleId])

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
            startISO: res.meeting.start_time,
            timeZone: res.meeting.time_zone,
            durationMinutes: res.meeting.duration_minutes,
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
      })
      .catch(() => { /* backend offline / never parsed */ })
    return () => { cancelled = true }
  }, [cycleId, meetingId])

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
        owner: n.raised_by || 'TBD',
        due_date: null,
        source: 'vendor_prep',
        status: 'OPEN',
      }))
    if (actions.length && onActionsExtracted) onActionsExtracted(actions)
  }

  const showScheduler = !meetingResult || rescheduling

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <CalendarPlus size={15} className="text-orange-500" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Schedule Vendor Prep Meeting</h3>
        </div>

        <div className="p-5 space-y-4">
          {/* Scheduled state */}
          {meetingResult && !rescheduling ? (
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
                  onClick={() => setRescheduling(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
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
              </div>
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
                            disabled={removeLoading === a.attendee_id}
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

              {meetingResult.teamsUrl && (
                <SendAddedInvitePanel
                  attendees={attendees}
                  meetingUrl={meetingResult.teamsUrl}
                  subject="Mobility Vendor Pulse — Vendor Prep Meeting"
                  body={VENDOR_PREP_BODY_HTML}
                />
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Schedule the prep call with the internal team and the vendor. Untick anyone who should not be invited.
            </p>
          )}

          {showScheduler && (
            <>
              {/* Attendee selection (internal + vendor, editable) */}
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Users size={13} className="text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      Invitees ({selectedEmails.length}/{attendees.length})
                    </span>
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
                existingMeetingUrl={rescheduling ? (meetingResult?.teamsUrl ?? null) : null}
                subject="Mobility Vendor Pulse — Vendor Prep Meeting"
                bodyHtml={VENDOR_PREP_BODY_HTML}
                onCancel={rescheduling ? () => setRescheduling(false) : undefined}
                onScheduled={async ({ startTime, timeZone, durationMinutes, teamsUrl }) => {
                  if (selectedEmails.length === 0) { setError('Select at least one attendee to invite.'); return }
                  const res = await scheduleVendorPrepMeetingManual(cycleId, {
                    startTime, durationMinutes, timeZone, attendeeEmails: selectedEmails, meetingUrl: teamsUrl,
                  })
                  setMeetingResult({
                    teamsUrl: res.teams_meeting_url, webLink: res.web_link, attendeeCount: res.attendee_count,
                    startISO: startTime, timeZone, durationMinutes,
                  })
                  setRescheduling(false)
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
      {(parsedNotes.length > 0 || savedMinutes) && (
        <MeetingMinutesViewer
          cycleId={cycleId}
          meetingId={meetingId}
          heading="Vendor Prep Meeting Minutes"
          notes={parsedNotes}
          initialMinutes={savedMinutes}
          vendorName={vendorName}
          quarter={quarter}
          year={year}
          onApproved={() => { /* per-meeting MoM — no workflow gate */ }}
        />
      )}
    </div>
  )
}
