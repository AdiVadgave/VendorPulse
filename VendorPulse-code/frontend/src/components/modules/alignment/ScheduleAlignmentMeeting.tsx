import { useState, useEffect, useCallback } from 'react'
import { CalendarPlus, Users, Clock, CheckCircle2, ExternalLink, X, UserPlus, Trash2, Link2Off, CalendarClock } from 'lucide-react'
import { scheduleAlignmentMeetingManual, getAlignmentMeeting, getAlignmentAttendees, removeAlignmentAttendee } from '@/lib/alignmentApi'
import { SearchAddAttendeeForm } from '@/components/modules/scheduling/AttendeeRefreshPanel'
import type { CycleAttendee } from '@/types/scheduling.types'

export interface AlignmentMeetingResult {
  teamsUrl: string | null
  webLink: string | null
  attendeeCount: number
}

interface Props {
  cycleId: string
  meetingResult: AlignmentMeetingResult | null
  onMeetingScheduled: (result: AlignmentMeetingResult) => void
  /** Which alignment meeting (1-based) — a cycle may have several. */
  meetingIndex?: number
}

export default function ScheduleAlignmentMeeting({ cycleId, meetingResult, onMeetingScheduled, meetingIndex = 1 }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [timeZone, setTimeZone] = useState<'IST' | 'UTC' | 'GMT'>('IST')
  const [durationMinutes, setDurationMinutes] = useState(30)

  // Internal attendees state
  const [internalAttendees, setInternalAttendees] = useState<CycleAttendee[]>([])
  const [attendeesLoading, setAttendeesLoading] = useState(false)

  // Add attendee form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [removeLoading, setRemoveLoading] = useState<string | null>(null)

  // Manual time + reschedule
  const [rescheduling, setRescheduling] = useState(false)
  const [manualStart, setManualStart] = useState('')
  const [meetingLink, setMeetingLink] = useState('')
  const [scheduleLoading, setScheduleLoading] = useState(false)

  // State persistence check
  const [persistenceChecked, setPersistenceChecked] = useState(false)

  // Fetch internal attendees on mount
  const fetchAttendees = useCallback(async () => {
    setAttendeesLoading(true)
    try {
      const res = await getAlignmentAttendees(cycleId)
      setInternalAttendees(res.attendees)
    } catch {
      // Fallback: attendees endpoint may not be available
    } finally {
      setAttendeesLoading(false)
    }
  }, [cycleId])

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

  async function handleManualSchedule() {
    if (!manualStart) return
    setScheduleLoading(true)
    setError(null)
    try {
      const startTime = manualStart.length === 16 ? `${manualStart}:00` : manualStart
      const response = await scheduleAlignmentMeetingManual(cycleId, {
        startTime,
        durationMinutes,
        timeZone,
        meetingUrl: meetingLink.trim() || null,
        meetingIndex,
      })
      onMeetingScheduled({
        teamsUrl: response.teams_meeting_url,
        webLink: response.web_link,
        attendeeCount: response.attendee_count,
      })
      setRescheduling(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to schedule meeting')
    } finally {
      setScheduleLoading(false)
    }
  }

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
      await removeAlignmentAttendee(cycleId, attendeeId)
      setInternalAttendees(prev => prev.filter(a => a.attendee_id !== attendeeId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove attendee')
    } finally {
      setRemoveLoading(null)
    }
  }

  const showScheduler = !meetingResult || rescheduling

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
              />
            </div>
          )}
        </div>

        {/* Duration selector */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Clock size={13} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Duration
            </span>
          </div>
          {meetingResult && !rescheduling ? (
            <p className="text-sm text-slate-700 dark:text-slate-300">{durationMinutes} minutes</p>
          ) : (
            <select
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="w-full text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes (recommended)</option>
              <option value={45}>45 minutes</option>
              <option value={60}>60 minutes</option>
              <option value={90}>90 minutes</option>
              <option value={120}>120 minutes</option>
            </select>
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
                onClick={() => { setRescheduling(true); setError(null); setManualStart(''); setMeetingLink(meetingResult.teamsUrl ?? '') }}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 font-medium"
              >
                <CalendarClock size={11} />
                Reschedule
              </button>
            </div>
          </div>
        ) : (
          /* Manual date/time picker */
          <div className="space-y-4">
            {rescheduling && (
              <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                <span className="text-xs text-amber-700 dark:text-amber-400">Rescheduling — pick a new date &amp; time.</span>
                <button onClick={() => setRescheduling(false)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 font-medium">
                  Cancel
                </button>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                When is the meeting scheduled?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Date &amp; time</label>
                  <input
                    type="datetime-local"
                    value={manualStart}
                    onChange={(e) => setManualStart(e.target.value)}
                    className="w-full text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Timezone</label>
                  <select
                    value={timeZone}
                    onChange={(e) => setTimeZone(e.target.value as 'IST' | 'UTC' | 'GMT')}
                    className="w-full text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="IST">IST</option>
                    <option value="UTC">UTC</option>
                    <option value="GMT">GMT</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Meeting link (optional)</label>
                <input
                  type="url"
                  placeholder="https://… (Teams, Meet, Zoom — paste if you have one)"
                  value={meetingLink}
                  onChange={(e) => setMeetingLink(e.target.value)}
                  className="w-full text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <button
                onClick={handleManualSchedule}
                disabled={!manualStart || scheduleLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                <CalendarPlus size={14} />
                {scheduleLoading ? 'Scheduling…' : 'Schedule at this time'}
              </button>
              <p className="text-[10px] text-slate-400">All internal stakeholders above are invited.</p>
            </div>

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
