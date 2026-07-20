import { useEffect, useState } from 'react'
import {
  CalendarPlus, Users, ExternalLink, CheckCircle2, Loader2, RotateCcw, Building2, Link2Off, UserPlus, X,
} from 'lucide-react'
import {
  scheduleVendorPrepMeetingManual, getVendorPrepMeeting,
} from '@/lib/vendorPrepApi'
import { fetchAttendees } from '@/lib/schedulingApi'
import { SearchAddAttendeeForm } from '@/components/modules/scheduling/AttendeeRefreshPanel'
import TranscriptInput from '@/components/modules/meeting/TranscriptInput'
import type { CycleAttendee } from '@/types/scheduling.types'
import type { MeetingNote } from '@/types/meeting.types'
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
}

interface MeetingResult {
  teamsUrl: string | null
  webLink: string | null
  attendeeCount: number
}

type TZ = 'IST' | 'UTC' | 'GMT'

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
  cycleId, onActionsExtracted, alreadyExtracted,
}: Props) {
  const [attendees, setAttendees] = useState<CycleAttendee[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [meetingResult, setMeetingResult] = useState<MeetingResult | null>(null)

  const [timeZone, setTimeZone] = useState<TZ>('IST')
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [manualStart, setManualStart] = useState('')
  const [meetingLink, setMeetingLink] = useState('')

  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)
  const [addingInvitee, setAddingInvitee] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [persistenceChecked, setPersistenceChecked] = useState(false)

  // Load cycle attendees (internal + vendor); default-select everyone.
  useEffect(() => {
    let cancelled = false
    fetchAttendees(cycleId)
      .then((list) => {
        if (cancelled) return
        setAttendees(list)
        setSelected(new Set(list.map((a) => (a.email || '').toLowerCase()).filter(Boolean)))
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
          })
        }
      })
      .catch(() => { /* no meeting / offline */ })
      .finally(() => { if (!cancelled) setPersistenceChecked(true) })
    return () => { cancelled = true }
  }, [cycleId, persistenceChecked])

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

  const addInviteeForm = addingInvitee && (
    <SearchAddAttendeeForm
      cycleId={cycleId}
      existingAttendeeIds={attendees.map((a) => a.user_id ?? a.attendee_id)}
      onAdded={handleInviteeAdded}
      onCancel={() => setAddingInvitee(false)}
    />
  )

  async function handleManualSchedule() {
    if (!manualStart) return
    if (selectedEmails.length === 0) { setError('Select at least one attendee to invite.'); return }
    setScheduleLoading(true)
    setError(null)
    try {
      const startTime = manualStart.length === 16 ? `${manualStart}:00` : manualStart
      const res = await scheduleVendorPrepMeetingManual(cycleId, {
        startTime,
        durationMinutes,
        timeZone,
        attendeeEmails: selectedEmails,
        meetingUrl: meetingLink.trim() || null,
      })
      setMeetingResult({ teamsUrl: res.teams_meeting_url, webLink: res.web_link, attendeeCount: res.attendee_count })
      setRescheduling(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to schedule meeting')
    } finally {
      setScheduleLoading(false)
    }
  }

  function handleParsed(parsed: MeetingNote[]) {
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
                  onClick={() => { setRescheduling(true); setManualStart(''); setMeetingLink(meetingResult.teamsUrl ?? '') }}
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

              {/* Manual date/time + timezone + duration */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                  When is the meeting scheduled?
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Date &amp; time
                    <input type="datetime-local" value={manualStart} onChange={(e) => setManualStart(e.target.value)}
                      className="mt-1 w-full text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </label>
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Timezone
                    <select value={timeZone} onChange={(e) => setTimeZone(e.target.value as TZ)}
                      className="mt-1 w-full text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500">
                      <option value="IST">IST</option>
                      <option value="UTC">UTC</option>
                      <option value="GMT">GMT</option>
                    </select>
                  </label>
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Duration
                    <select value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}
                      className="mt-1 w-full text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500">
                      <option value={30}>30 min</option>
                      <option value={60}>1 hour</option>
                      <option value={90}>1.5 hours</option>
                      <option value={120}>2 hours</option>
                    </select>
                  </label>
                </div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Meeting link (optional)
                  <input type="url" placeholder="https://… (Teams, Meet, Zoom — paste if you have one)"
                    value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)}
                    className="mt-1 w-full text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleManualSchedule}
                    disabled={scheduleLoading || !manualStart}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {scheduleLoading ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
                    {scheduleLoading ? 'Scheduling…' : 'Schedule at this time'}
                  </button>
                  {rescheduling && (
                    <button
                      onClick={() => setRescheduling(false)}
                      className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>
      </div>

      {/* Transcript → action items only. Meeting minutes are generated in the
          final Meeting section, not here. */}
      <TranscriptInput
        cycleId={cycleId}
        meetingId={`vprep-${cycleId}`}
        onParsed={handleParsed}
        alreadyExtracted={alreadyExtracted}
      />
    </div>
  )
}
