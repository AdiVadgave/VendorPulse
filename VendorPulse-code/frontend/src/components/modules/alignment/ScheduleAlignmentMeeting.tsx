import { useState, useEffect, useCallback } from 'react'
import { CalendarPlus, Users, Clock, CheckCircle2, ExternalLink, Search, Plus, X, UserPlus, Trash2 } from 'lucide-react'
import { findAlignmentTimes, scheduleAlignmentMeeting, getAlignmentMeeting, getAlignmentAttendees, addAlignmentAttendee, removeAlignmentAttendee } from '@/lib/alignmentApi'
import { getTokenOwnerOrganizerEmail } from '@/lib/schedulingApi'
import SlotCard from '@/components/modules/scheduling/SlotCard'
import type { SlotProposal } from '@/types/scheduling.types'
import type { CycleAttendee } from '@/types/scheduling.types'

export interface AlignmentMeetingResult {
  teamsUrl: string | null
  webLink: string | null
  attendeeCount: number
}

interface Props {
  cycleId: string
  slots: SlotProposal[]
  meetingResult: AlignmentMeetingResult | null
  onSlotsFound: (slots: SlotProposal[]) => void
  onMeetingScheduled: (result: AlignmentMeetingResult) => void
}

export default function ScheduleAlignmentMeeting({ cycleId, slots, meetingResult, onSlotsFound, onMeetingScheduled }: Props) {
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [findLoading, setFindLoading] = useState(false)
  const [scheduleLoading, setScheduleLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [timeZone, setTimeZone] = useState<'IST' | 'UTC' | 'GMT'>('IST')
  const [durationMinutes, setDurationMinutes] = useState(30)

  // Internal attendees state
  const [internalAttendees, setInternalAttendees] = useState<CycleAttendee[]>([])
  const [attendeesLoading, setAttendeesLoading] = useState(false)

  // Add attendee form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('VMO_COORDINATOR')
  const [newOrg, setNewOrg] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [removeLoading, setRemoveLoading] = useState<string | null>(null)

  // Reschedule + manual-time (mirrors the Scheduling module)
  const [rescheduling, setRescheduling] = useState(false)
  const [manualStart, setManualStart] = useState('')
  const [manualLoading, setManualLoading] = useState(false)

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
        const res = await getAlignmentMeeting(cycleId)
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
  }, [cycleId, meetingResult, onMeetingScheduled, persistenceChecked])

  // Fetch attendees on mount
  useEffect(() => {
    fetchAttendees()
  }, [fetchAttendees])

  async function handleFindTimes() {
    if (!dateStart || !dateEnd) return
    setFindLoading(true)
    setError(null)
    try {
      const organiserEmail = await getTokenOwnerOrganizerEmail()
      if (!organiserEmail) {
        setError('Could not determine organiser email from Graph token. Check GRAPH_ACCESS_TOKEN in backend .env.')
        setFindLoading(false)
        return
      }
      const response = await findAlignmentTimes(cycleId, organiserEmail, dateStart, dateEnd, durationMinutes / 60, timeZone)
      onSlotsFound(response.slot_proposals)
      if (response.slot_proposals.length === 0) {
        setError(response.message || 'No available slots found in the selected range.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to find available times')
    } finally {
      setFindLoading(false)
    }
  }

  async function handleApproveSlot(slotId: string) {
    const slot = slots.find(s => s.slot_id === slotId)
    if (!slot) return
    setScheduleLoading(slotId)
    setError(null)
    try {
      const organiserEmail = await getTokenOwnerOrganizerEmail()
      if (!organiserEmail) {
        setError('Could not determine organiser email from Graph token.')
        setScheduleLoading(null)
        return
      }
      const response = await scheduleAlignmentMeeting(
        cycleId,
        organiserEmail,
        slotId,
        slot.proposed_time,
        slot.duration_minutes ?? durationMinutes,
        timeZone
      )
      onMeetingScheduled({
        teamsUrl: response.teams_meeting_url,
        webLink: response.web_link,
        attendeeCount: response.attendee_count,
      })
      setRescheduling(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to schedule meeting')
    } finally {
      setScheduleLoading(null)
    }
  }

  async function handleManualSchedule() {
    if (!manualStart) return
    setManualLoading(true)
    setError(null)
    try {
      const organiserEmail = await getTokenOwnerOrganizerEmail()
      if (!organiserEmail) {
        setError('Could not determine organiser email from Graph token.')
        return
      }
      const startTime = manualStart.length === 16 ? `${manualStart}:00` : manualStart
      const response = await scheduleAlignmentMeeting(
        cycleId,
        organiserEmail,
        `align_manual_${Date.now()}`,
        startTime,
        durationMinutes,
        timeZone
      )
      onMeetingScheduled({
        teamsUrl: response.teams_meeting_url,
        webLink: response.web_link,
        attendeeCount: response.attendee_count,
      })
      setRescheduling(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to schedule meeting')
    } finally {
      setManualLoading(false)
    }
  }

  async function handleAddAttendee() {
    if (!newName.trim() || !newEmail.trim()) return
    setAddLoading(true)
    try {
      const res = await addAlignmentAttendee(cycleId, {
        name: newName.trim(),
        email: newEmail.trim(),
        role: newRole,
        organisation: newOrg.trim(),
      })
      setInternalAttendees(prev => [...prev, res.attendee])
      setNewName('')
      setNewEmail('')
      setNewOrg('')
      setShowAddForm(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add attendee')
    } finally {
      setAddLoading(false)
    }
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
            {!meetingResult && (
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 font-medium"
              >
                {showAddForm ? <X size={12} /> : <UserPlus size={12} />}
                {showAddForm ? 'Cancel' : 'Add'}
              </button>
            )}
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
                  {!meetingResult && (
                    <button
                      onClick={() => handleRemoveAttendee(a.attendee_id)}
                      disabled={removeLoading === a.attendee_id}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500 disabled:opacity-30"
                      title="Remove attendee"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
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

          {/* Add attendee form */}
          {showAddForm && (
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                  <option value="VMO_COORDINATOR">VMO Coordinator</option>
                  <option value="EGB_CHAIR">EGB Chair</option>
                  <option value="INTERNAL_LEAD">Internal Lead</option>
                  <option value="TECHNICAL_LEAD">Technical Lead</option>
                  <option value="COMMERCIAL_LEAD">Commercial Lead</option>
                  <option value="VENDOR_MANAGER">Vendor Manager</option>
                </select>
                <input
                  type="text"
                  placeholder="Organisation (optional)"
                  value={newOrg}
                  onChange={(e) => setNewOrg(e.target.value)}
                  className="text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <button
                onClick={handleAddAttendee}
                disabled={!newName.trim() || !newEmail.trim() || addLoading}
                className="flex items-center gap-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed rounded px-3 py-1.5 transition-colors"
              >
                <Plus size={12} />
                {addLoading ? 'Adding...' : 'Add Attendee'}
              </button>
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
          {meetingResult ? (
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
              {meetingResult.teamsUrl && (
                <a
                  href={meetingResult.teamsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 hover:underline font-medium"
                >
                  <ExternalLink size={11} />
                  Open Teams Meeting
                </a>
              )}
              <button
                onClick={() => { setRescheduling(true); setError(null) }}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 font-medium"
              >
                <CalendarPlus size={11} />
                Reschedule
              </button>
            </div>
          </div>
        ) : (
          /* Slot finding & selection flow */
          <div className="space-y-4">
            {rescheduling && (
              <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                <span className="text-xs text-amber-700 dark:text-amber-400">Rescheduling — pick a new slot or set your own time.</span>
                <button onClick={() => setRescheduling(false)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 font-medium">
                  Cancel
                </button>
              </div>
            )}
            {/* Date range picker + timezone */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                  From
                </label>
                <input
                  type="date"
                  value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                  className="w-full text-sm text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                  To
                </label>
                <input
                  type="date"
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                  className="w-full text-sm text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                  Timezone
                </label>
                <select
                  value={timeZone}
                  onChange={(e) => setTimeZone(e.target.value as 'IST' | 'UTC' | 'GMT')}
                  className="w-full text-sm text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="IST">IST</option>
                  <option value="UTC">UTC</option>
                  <option value="GMT">GMT</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleFindTimes}
              disabled={!dateStart || !dateEnd || findLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Search size={14} />
              {findLoading ? 'Finding available times...' : 'Find Available Times'}
            </button>

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Or pick your own time (manual) */}
            <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Or pick your own time</p>
              <div className="flex flex-wrap items-end gap-2">
                <input
                  type="datetime-local"
                  value={manualStart}
                  onChange={(e) => setManualStart(e.target.value)}
                  className="text-sm text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <button
                  onClick={handleManualSchedule}
                  disabled={!manualStart || manualLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <CalendarPlus size={13} />
                  {manualLoading ? 'Scheduling…' : 'Schedule at this time'}
                </button>
              </div>
              <p className="text-[10px] text-slate-400">Uses the duration &amp; timezone selected above.</p>
            </div>

            {/* Slot proposals grid */}
            {slots.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Available Slots ({slots.length}) — select one to schedule
                </p>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {slots.slice(0, 6).map((slot, idx) => (
                    <SlotCard
                      key={slot.slot_id}
                      slot={slot}
                      rank={idx + 1}
                      onApprove={handleApproveSlot}
                      isProcessing={scheduleLoading === slot.slot_id}
                      timeZoneView={timeZone}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
