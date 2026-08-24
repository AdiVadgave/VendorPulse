import { useState, useEffect, useCallback } from 'react'
import { CalendarPlus, Users, CheckCircle2, ExternalLink, X, UserPlus, Trash2, Link2Off, CalendarClock, CalendarCheck } from 'lucide-react'
import { scheduleAlignmentMeetingManual, getAlignmentMeeting, getAlignmentAttendees, addAlignmentAttendee, removeAlignmentAttendee } from '@/lib/alignmentApi'
import { SearchAddAttendeeForm } from '@/components/modules/scheduling/AttendeeRefreshPanel'
import DelegatedScheduler from '@/components/modules/scheduling/DelegatedScheduler'
import { formatMeetingTime } from '@/utils/formatMeetingTime'
import type { CycleAttendee } from '@/types/scheduling.types'

const ALIGNMENT_BODY_HTML =
  '<p>Internal alignment meeting to reconcile scores and agree our position before the vendor call.</p>' +
  '<p><strong>Agenda</strong></p>' +
  '<ol><li>Review the consolidated internal scores and low-scoring measures</li>' +
  '<li>Reconcile cross-team divergence into one agreed internal position</li>' +
  '<li>Confirm the points and evidence to raise with the vendor</li>' +
  '<li>Capture action items and assign owners</li></ol>'

export interface AlignmentMeetingResult {
  teamsUrl: string | null
  webLink: string | null
  attendeeCount: number
  /** UTC ISO instant of the scheduled start — used to display date/time. */
  startISO?: string | null
  timeZone?: string | null
  durationMinutes?: number | null
}

interface Props {
  cycleId: string
  meetingResult: AlignmentMeetingResult | null
  onMeetingScheduled: (result: AlignmentMeetingResult) => void
  /** Which alignment meeting (1-based) — a cycle may have several. */
  meetingIndex?: number
  /** Final QBR date — alignment must be before it, so slots end the day before. */
  qbrMeetingDate?: string | null
}

export default function ScheduleAlignmentMeeting({ cycleId, meetingResult, onMeetingScheduled, meetingIndex = 1, qbrMeetingDate }: Props) {
  const [error, setError] = useState<string | null>(null)

  // Internal attendees state
  const [internalAttendees, setInternalAttendees] = useState<CycleAttendee[]>([])
  const [attendeesLoading, setAttendeesLoading] = useState(false)

  // Add attendee form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [removeLoading, setRemoveLoading] = useState<string | null>(null)

  // Reschedule toggle
  const [rescheduling, setRescheduling] = useState(false)

  // State persistence check
  const [persistenceChecked, setPersistenceChecked] = useState(false)

  // Fetch internal attendees on mount
  const fetchAttendees = useCallback(async () => {
    setAttendeesLoading(true)
    try {
      const res = await getAlignmentAttendees(cycleId, meetingIndex)
      // Exclude anyone marked "Not attending" in attendance confirmation (DECLINED).
      setInternalAttendees(res.attendees.filter((a) => a.confirmation_status !== 'DECLINED'))
    } catch {
      // Fallback: attendees endpoint may not be available
    } finally {
      setAttendeesLoading(false)
    }
  }, [cycleId, meetingIndex])

  // Check for existing meeting on mount (state persistence)
  useEffect(() => {
    if (persistenceChecked) return
    if (meetingResult) {
      setPersistenceChecked(true)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await getAlignmentMeeting(cycleId, meetingIndex)
        if (!cancelled && res.meeting) {
          onMeetingScheduled({
            teamsUrl: res.meeting.teams_meeting_url,
            webLink: res.meeting.web_link,
            attendeeCount: res.meeting.attendee_count,
            startISO: res.meeting.start_time,
            timeZone: res.meeting.time_zone,
            durationMinutes: res.meeting.duration_minutes,
          })
        }
      } catch {
        // Backend offline or no meeting — that's fine
      } finally {
        if (!cancelled) setPersistenceChecked(true)
      }
    })()
    return () => { cancelled = true }
  }, [cycleId, meetingResult, onMeetingScheduled, persistenceChecked, meetingIndex])

  // Fetch attendees on mount
  useEffect(() => {
    fetchAttendees()
  }, [fetchAttendees])

  // A directory-searched attendee was added to the cycle. It's added as a cycle
  // attendee (Internal Stakeholder); refetch so the alignment list reflects the
  // authoritative internal-stakeholder set. Vendors are excluded server-side.
  async function handleAttendeeAdded() {
    setShowAddForm(false)
    await fetchAttendees()
  }

  async function handleRemoveAttendee(attendeeId: string) {
    setRemoveLoading(attendeeId)
    try {
      await removeAlignmentAttendee(cycleId, attendeeId, meetingIndex)
      setInternalAttendees(prev => prev.filter(a => a.attendee_id !== attendeeId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove attendee')
    } finally {
      setRemoveLoading(null)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
        <CalendarPlus size={15} className="text-violet-500" />
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Schedule Internal Alignment Meeting
        </h3>
      </div>

      <div className="p-5 space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Schedule a meeting for internal stakeholders to discuss score differences and alignment points before the vendor call.
        </p>

        {/* Internal Attendees list with management */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Users size={13} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Internal Stakeholder Attendees ({internalAttendees.length})
              </span>
            </div>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 font-medium"
            >
              {showAddForm ? <X size={12} /> : <UserPlus size={12} />}
              {showAddForm ? 'Cancel' : 'Add'}
            </button>
          </div>

          {attendeesLoading ? (
            <p className="text-xs text-slate-400">Loading attendees...</p>
          ) : internalAttendees.length > 0 ? (
            <div className="space-y-1.5">
              {internalAttendees.map(a => (
                <div key={a.attendee_id} className="flex items-center justify-between group">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-[10px] font-semibold text-violet-600 dark:text-violet-400">
                      {a.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{a.name}</span>
                      <span className="text-[10px] text-slate-400 ml-1.5">{a.role}</span>
                      {a.is_key && (
                        <span className="ml-1.5 text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1 py-0.5 rounded font-semibold">
                          KEY
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveAttendee(a.attendee_id)}
                    disabled={removeLoading === a.attendee_id}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500 disabled:opacity-30"
                    title="Remove attendee"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No internal stakeholders found for this cycle.</p>
          )}

          {/* Vendor exclusion note */}
          <p className="text-[10px] text-slate-400 mt-2 italic">
            Only internal stakeholders are included. Vendor attendees are excluded from alignment meetings.
          </p>

          {/* Add attendee — search the people directory (same as vendor prep). */}
          {showAddForm && (
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
              <SearchAddAttendeeForm
                cycleId={cycleId}
                existingAttendeeIds={internalAttendees.map((a) => a.user_id ?? a.attendee_id)}
                onAdded={handleAttendeeAdded}
                onCancel={() => setShowAddForm(false)}
                // Save into THIS alignment meeting's own roster — never the cycle attendees.
                submitOverride={async (data) => {
                  const res = await addAlignmentAttendee(cycleId, {
                    name: data.name, email: data.email, role: data.role,
                    organisation: data.organisation, is_key: data.is_key, type: data.type,
                    attendance_requirement: data.attendance_requirement, lt_status: data.lt_status,
                    shell_department: data.shell_department, user_id: data.user_id,
                    stakeholder_id: data.stakeholder_id,
                  }, meetingIndex)
                  return res.attendee
                }}
                hideKey
                hideType
              />
            </div>
          )}
        </div>

        {/* Agenda preview */}
        <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg px-4 py-3">
          <p className="text-xs font-semibold text-violet-600 dark:text-violet-400 mb-2">Suggested Agenda</p>
          <ul className="space-y-1 text-xs text-violet-800 dark:text-violet-300">
            <li>1. Review the consolidated internal scores and low-scoring measures</li>
            <li>2. Reconcile cross-team divergence into one agreed internal position</li>
            <li>3. Confirm the points and evidence to raise with the vendor</li>
            <li>4. Capture action items and assign owners</li>
          </ul>
        </div>

        {meetingResult && !rescheduling ? (
          /* Meeting already scheduled — show confirmation */
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Meeting scheduled</p>
            </div>
            {formatMeetingTime(meetingResult.startISO, meetingResult.timeZone ?? 'IST', meetingResult.durationMinutes) && (
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                <CalendarCheck size={13} className="shrink-0" />
                {formatMeetingTime(meetingResult.startISO, meetingResult.timeZone ?? 'IST', meetingResult.durationMinutes)}
              </p>
            )}
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              {meetingResult.attendeeCount} internal stakeholders invited
            </p>
            <div className="flex items-center gap-3">
              {meetingResult.teamsUrl ? (
                <a
                  href={meetingResult.teamsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 hover:underline font-medium"
                >
                  <ExternalLink size={11} />
                  Join meeting link
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <Link2Off size={11} />
                  No meeting link added
                </span>
              )}
              <button
                onClick={() => { setRescheduling(true); setError(null) }}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 font-medium"
              >
                <CalendarClock size={11} />
                Reschedule
              </button>
            </div>
          </div>
        ) : (
          /* Delegated Graph scheduling: find free slots across internal calendars,
             rank them, then create the Teams meeting + invites as the coordinator. */
          <DelegatedScheduler
            cycleId={cycleId}
            findAttendees={internalAttendees}
            inviteAttendees={internalAttendees}
            defaultDuration={30}
            qbrMeetingDate={qbrMeetingDate}
            existingMeetingUrl={rescheduling ? (meetingResult?.teamsUrl ?? null) : null}
            subject="Mobility Vendor Pulse — Internal Alignment Meeting"
            bodyHtml={ALIGNMENT_BODY_HTML}
            onCancel={rescheduling ? () => setRescheduling(false) : undefined}
            onScheduled={async ({ startTime, timeZone, durationMinutes, teamsUrl, attendeeCount }) => {
              await scheduleAlignmentMeetingManual(cycleId, {
                startTime, durationMinutes, timeZone, meetingUrl: teamsUrl, meetingIndex,
              })
              onMeetingScheduled({
                teamsUrl, webLink: null, attendeeCount,
                startISO: startTime, timeZone, durationMinutes,
              })
              setRescheduling(false)
            }}
          />
        )}

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
