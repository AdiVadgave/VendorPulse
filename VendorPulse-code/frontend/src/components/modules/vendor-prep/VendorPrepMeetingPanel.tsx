import { useEffect, useState } from 'react'
import {
  CalendarPlus, Users, ExternalLink, CheckCircle2, Loader2, RotateCcw, Building2,
} from 'lucide-react'
import {
  findVendorPrepTimes, scheduleVendorPrepMeeting, getVendorPrepMeeting,
} from '@/lib/vendorPrepApi'
import { getTokenOwnerOrganizerEmail, fetchAttendees } from '@/lib/schedulingApi'
import SlotCard from '@/components/modules/scheduling/SlotCard'
import TranscriptInput from '@/components/modules/meeting/TranscriptInput'
import MeetingMinutesViewer from '@/components/modules/meeting/MeetingMinutesViewer'
import type { SlotProposal, CycleAttendee } from '@/types/scheduling.types'
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
 * The single Vendor Prep meeting for a cycle: schedule the prep call (Teams via
 * Graph) with the internal team + vendor (attendees editable), then attach its
 * transcript and generate AI minutes + action items.
 *
 * Persisted server-side in the SHARED meetings store as meetingType=VENDOR_PREP
 * (see docs/GRAPH_SCHEDULING_HANDOVER.md) — no separate meetings table.
 */
export default function VendorPrepMeetingPanel({
  cycleId, vendorName, quarter, year, onActionsExtracted, alreadyExtracted,
}: Props) {
  const [attendees, setAttendees] = useState<CycleAttendee[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [slots, setSlots] = useState<SlotProposal[]>([])
  const [meetingResult, setMeetingResult] = useState<MeetingResult | null>(null)
  const [notes, setNotes] = useState<MeetingNote[]>([])

  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [timeZone, setTimeZone] = useState<TZ>('IST')
  const [durationMinutes, setDurationMinutes] = useState(30)

  const [findLoading, setFindLoading] = useState(false)
  const [scheduleLoading, setScheduleLoading] = useState<string | null>(null)
  const [manualStart, setManualStart] = useState('')
  const [rescheduling, setRescheduling] = useState(false)
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

  async function resolveOrganiser(): Promise<string | null> {
    const organiser = await getTokenOwnerOrganizerEmail()
    if (!organiser) {
      setError('Could not determine the organiser from the Graph token. Refresh GRAPH_ACCESS_TOKEN in backend .env and retry.')
    }
    return organiser
  }

  async function handleFindTimes() {
    if (!dateStart || !dateEnd) return
    if (selectedEmails.length === 0) { setError('Select at least one attendee to invite.'); return }
    setFindLoading(true)
    setError(null)
    try {
      const organiser = await resolveOrganiser()
      if (!organiser) return
      const res = await findVendorPrepTimes(cycleId, organiser, dateStart, dateEnd, durationMinutes / 60, timeZone, selectedEmails)
      setSlots(res.slot_proposals)
      if (res.slot_proposals.length === 0) setError(res.message || 'No available slots found in the selected range.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to find available times')
    } finally {
      setFindLoading(false)
    }
  }

  async function handleApproveSlot(slotId: string) {
    const slot = slots.find((s) => s.slot_id === slotId)
    if (!slot) return
    setScheduleLoading(slotId)
    setError(null)
    try {
      const organiser = await resolveOrganiser()
      if (!organiser) return
      const res = await scheduleVendorPrepMeeting(
        cycleId, organiser, slotId, slot.proposed_time,
        slot.duration_minutes ?? durationMinutes, timeZone, selectedEmails,
      )
      setMeetingResult({ teamsUrl: res.teams_meeting_url, webLink: res.web_link, attendeeCount: res.attendee_count })
      setRescheduling(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to schedule meeting')
    } finally {
      setScheduleLoading(null)
    }
  }

  async function handleManualSchedule() {
    if (!manualStart) return
    setScheduleLoading('manual')
    setError(null)
    try {
      const organiser = await resolveOrganiser()
      if (!organiser) return
      const startTime = manualStart.length === 16 ? `${manualStart}:00` : manualStart
      const res = await scheduleVendorPrepMeeting(
        cycleId, organiser, `vprep_manual_${Date.now()}`, startTime, durationMinutes, timeZone, selectedEmails,
      )
      setMeetingResult({ teamsUrl: res.teams_meeting_url, webLink: res.web_link, attendeeCount: res.attendee_count })
      setRescheduling(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to schedule meeting')
    } finally {
      setScheduleLoading(null)
    }
  }

  function handleParsed(parsed: MeetingNote[]) {
    setNotes(parsed)
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
                <CheckCircle2 size={16} /> Vendor prep meeting scheduled — invites sent via Teams to {meetingResult.attendeeCount} attendee{meetingResult.attendeeCount === 1 ? '' : 's'}.
              </div>
              {meetingResult.teamsUrl && (
                <a
                  href={meetingResult.teamsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-orange-600 dark:text-orange-400 hover:underline"
                >
                  <ExternalLink size={14} /> Join Teams meeting
                </a>
              )}
              <div>
                <button
                  onClick={() => { setRescheduling(true); setSlots([]) }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <RotateCcw size={13} /> Reschedule
                </button>
              </div>
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
                <div className="flex items-center gap-2 mb-2">
                  <Users size={13} className="text-slate-400" />
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Invitees ({selectedEmails.length}/{attendees.length})
                  </span>
                </div>
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

              {/* Date range + timezone + duration */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label className="text-xs text-slate-500 dark:text-slate-400">
                  From
                  <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)}
                    className="mt-1 w-full text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500" />
                </label>
                <label className="text-xs text-slate-500 dark:text-slate-400">
                  To
                  <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)}
                    className="mt-1 w-full text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500" />
                </label>
                <label className="text-xs text-slate-500 dark:text-slate-400">
                  Timezone
                  <select value={timeZone} onChange={(e) => setTimeZone(e.target.value as TZ)}
                    className="mt-1 w-full text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500">
                    <option value="IST">IST</option>
                    <option value="UTC">UTC</option>
                    <option value="GMT">GMT</option>
                  </select>
                </label>
                <label className="text-xs text-slate-500 dark:text-slate-400">
                  Duration
                  <select value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="mt-1 w-full text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500">
                    <option value={30}>30 min</option>
                    <option value={60}>1 hour</option>
                    <option value={90}>1.5 hours</option>
                    <option value={120}>2 hours</option>
                  </select>
                </label>
              </div>

              <button
                onClick={handleFindTimes}
                disabled={findLoading || !dateStart || !dateEnd}
                className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {findLoading ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
                {findLoading ? 'Finding times…' : 'Find Slots (Graph)'}
              </button>

              {/* Ranked slots */}
              {slots.length > 0 && (
                <div className="space-y-2 pt-2">
                  {slots.slice(0, 6).map((slot, i) => (
                    <SlotCard
                      key={slot.slot_id}
                      slot={slot}
                      rank={i + 1}
                      onApprove={handleApproveSlot}
                      isProcessing={scheduleLoading === slot.slot_id}
                      timeZoneView={timeZone}
                    />
                  ))}
                </div>
              )}

              {/* Manual time fallback */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                  Or set the time manually
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="datetime-local"
                    value={manualStart}
                    onChange={(e) => setManualStart(e.target.value)}
                    className="text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                  <button
                    onClick={handleManualSchedule}
                    disabled={scheduleLoading === 'manual' || !manualStart}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-medium rounded-lg"
                  >
                    {scheduleLoading === 'manual' ? <Loader2 size={13} className="animate-spin" /> : <CalendarPlus size={13} />}
                    Schedule at this time
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

      {/* Transcript → AI minutes + action items (same wiring as the other meetings) */}
      <TranscriptInput
        cycleId={cycleId}
        meetingId={`vprep-${cycleId}`}
        onParsed={handleParsed}
        alreadyExtracted={alreadyExtracted}
      />
      {notes.length > 0 && (
        <MeetingMinutesViewer
          cycleId={cycleId}
          notes={notes}
          vendorName={vendorName}
          quarter={quarter}
          year={year}
          onApproved={() => { /* per-meeting minutes approved */ }}
        />
      )}
    </div>
  )
}
