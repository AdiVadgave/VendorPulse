import { useState } from 'react'
import { CalendarPlus, Users, Clock, CheckCircle2, ExternalLink, Search } from 'lucide-react'
import { findAlignmentTimes, scheduleAlignmentMeeting } from '@/lib/alignmentApi'
import { getTokenOwnerOrganizerEmail } from '@/lib/schedulingApi'
import SlotCard from '@/components/modules/scheduling/SlotCard'
import type { SlotProposal } from '@/types/scheduling.types'

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
      const response = await findAlignmentTimes(cycleId, organiserEmail, dateStart, dateEnd, 0.5, timeZone)
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
        slot.duration_minutes ?? 30,
        timeZone
      )
      onMeetingScheduled({
        teamsUrl: response.teams_meeting_url,
        webLink: response.web_link,
        attendeeCount: response.attendee_count,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to schedule meeting')
    } finally {
      setScheduleLoading(null)
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
          Schedule a meeting for stakeholders to discuss score differences and alignment points before the vendor call.
        </p>

        {/* Meeting details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Users size={13} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Attendees
              </span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300">All internal stakeholders</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Clock size={13} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Duration
              </span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300">30 minutes (recommended)</p>
          </div>
        </div>

        {/* Agenda preview */}
        <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg px-4 py-3">
          <p className="text-xs font-semibold text-violet-600 dark:text-violet-400 mb-2">Suggested Agenda</p>
          <ul className="space-y-1 text-xs text-violet-800 dark:text-violet-300">
            <li>1. Review score comparison — Internal Stakeholder vs Vendor gaps</li>
            <li>2. Discuss flagged categories and agree on final internal position</li>
            <li>3. Align on face-off model roles before vendor meeting</li>
            <li>4. Capture action items and assign owners</li>
          </ul>
        </div>

        {meetingResult ? (
          /* Meeting already scheduled — show confirmation */
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Meeting scheduled</p>
            </div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              {meetingResult.attendeeCount} internal stakeholders invited
            </p>
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
          </div>
        ) : (
          /* Slot finding & selection flow */
          <div className="space-y-4">
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
