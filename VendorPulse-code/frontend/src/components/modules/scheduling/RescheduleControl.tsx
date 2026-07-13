import { useState } from 'react'
import {
  CalendarClock,
  Loader2,
  AlertCircle,
  Globe,
  RefreshCw,
  PencilLine,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import SlotCard from './SlotCard'
import type { SlotProposal, CycleAttendee } from '@/types/scheduling.types'
import { apiFetch } from '@/lib/api'
import { scheduleMeetingManual, getTokenOwnerOrganizerEmail } from '@/lib/schedulingApi'

type TZ = 'IST' | 'UTC' | 'GMT'

interface RescheduleControlProps {
  cycleId: string
  attendees: CycleAttendee[]
  defaultTimeZone?: TZ
  /** Called after the Teams meeting is re-booked via Graph. */
  onRescheduled: (slot: SlotProposal, timeZone: TZ, teamsUrl: string | null) => void
}

const DURATION_OPTIONS = [
  { value: 0.5, label: '30 minutes' },
  { value: 1, label: '60 minutes' },
  { value: 1.5, label: '90 minutes' },
  { value: 2, label: '120 minutes' },
]

export default function RescheduleControl({
  cycleId,
  attendees,
  defaultTimeZone = 'IST',
  onRescheduled,
}: RescheduleControlProps) {
  const today = new Date()
  const defaultStart = today.toISOString().split('T')[0]
  const defaultEnd = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [open, setOpen] = useState(false)
  const [timeZone, setTimeZone] = useState<TZ>(defaultTimeZone)
  const [durationHours, setDurationHours] = useState(0.5)

  // Option 1 — find Graph slots
  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(defaultEnd)
  const [slots, setSlots] = useState<SlotProposal[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [reschedulingId, setReschedulingId] = useState<string | null>(null)

  // Option 2 — manual time
  const [startLocal, setStartLocal] = useState('')
  const [isManualBusy, setIsManualBusy] = useState(false)

  const [error, setError] = useState<string | null>(null)

  async function findSlots() {
    setIsSearching(true)
    setError(null)
    try {
      const organiserEmail = await getTokenOwnerOrganizerEmail()
      if (!organiserEmail) {
        setError('Could not resolve the organiser from the Graph token. Refresh GRAPH_ACCESS_TOKEN and retry.')
        return
      }
      const attendeeEmails = attendees.map((a) => a.email)
      const result = await apiFetch<{
        slot_proposals: SlotProposal[]
        message?: string
        graph_summary?: { no_slots_reason?: string; empty_suggestions_reason?: string }
      }>(`/api/cycles/${cycleId}/scheduling/graph/find-times`, {
        method: 'POST',
        body: JSON.stringify({
          organiser_email: organiserEmail,
          date_range_start: startDate,
          date_range_end: endDate,
          duration_hours: durationHours,
          use_specific_attendees: attendeeEmails,
          time_zone: timeZone,
          debug: false,
        }),
      })
      const durationMinutes = Math.round(durationHours * 60)
      const found = (result.slot_proposals ?? []).map((slot) => {
        const s = slot as SlotProposal & { duration_minutes?: number; proposed_time_zone?: string }
        return {
          ...slot,
          duration_minutes: s.duration_minutes ?? durationMinutes,
          proposed_time_zone: s.proposed_time_zone ?? timeZone,
        }
      })
      setSlots(found)
      if (found.length === 0) {
        const reason =
          result.graph_summary?.no_slots_reason?.trim() ||
          result.graph_summary?.empty_suggestions_reason?.trim()
        setError(reason ? `No slots found. ${reason}` : result.message || 'No common slots found for the selected range.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Graph API error')
    } finally {
      setIsSearching(false)
    }
  }

  async function rescheduleToSlot(slotId: string) {
    const slot = slots.find((s) => s.slot_id === slotId)
    if (!slot) return
    setReschedulingId(slotId)
    setError(null)
    try {
      const organiserEmail = await getTokenOwnerOrganizerEmail()
      if (!organiserEmail) {
        setError('Could not resolve the organiser from the Graph token.')
        return
      }
      const tz = (slot.proposed_time_zone as TZ) ?? timeZone
      const durationHrs = (slot.duration_minutes ?? Math.round(durationHours * 60)) / 60
      const result = await scheduleMeetingManual(cycleId, {
        organiserEmail,
        startTime: slot.proposed_time, // UTC ISO — backend treats it as an absolute instant
        durationHours: durationHrs,
        timeZone: tz,
        reschedule: true,
      })
      if (result.slot) onRescheduled(result.slot, tz, result.teams_meeting_url ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reschedule to this slot')
    } finally {
      setReschedulingId(null)
    }
  }

  async function rescheduleManual() {
    if (!startLocal) {
      setError('Pick a date and time first.')
      return
    }
    setIsManualBusy(true)
    setError(null)
    try {
      const organiserEmail = await getTokenOwnerOrganizerEmail()
      if (!organiserEmail) {
        setError('Could not resolve the organiser from the Graph token.')
        return
      }
      const startTime = startLocal.length === 16 ? `${startLocal}:00` : startLocal
      const result = await scheduleMeetingManual(cycleId, {
        organiserEmail,
        startTime,
        durationHours,
        timeZone,
        reschedule: true,
      })
      if (result.slot) onRescheduled(result.slot, timeZone, result.teams_meeting_url ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reschedule the meeting')
    } finally {
      setIsManualBusy(false)
    }
  }

  const inputCls =
    'px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 text-left">
        <RefreshCw size={15} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Reschedule this meeting</span>
        <span className="ml-auto text-xs text-indigo-600 dark:text-indigo-400">{open ? 'Hide' : 'Change time'}</span>
      </button>

      {!open && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
          Need a different time? Find newly-available Graph slots to pick from, or set your own time — either way
          the existing Teams meeting is re-booked and attendees get an update.
        </p>
      )}

      {open && (
        <div className="mt-4 space-y-5">
          {/* Shared duration + timezone */}
          <div className="grid grid-cols-2 gap-2 max-w-sm">
            <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
              Duration
              <select value={durationHours} onChange={(e) => setDurationHours(Number(e.target.value))} className={inputCls}>
                {DURATION_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
              Timezone
              <select value={timeZone} onChange={(e) => setTimeZone(e.target.value as TZ)} className={inputCls}>
                <option value="IST">IST</option>
                <option value="UTC">UTC</option>
                <option value="GMT">GMT</option>
              </select>
            </label>
          </div>

          {/* Option 1 — find slots */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-3">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Option 1 — Find a new available slot
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                Start date
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                End date
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={findSlots}
                  disabled={isSearching || attendees.length === 0}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors w-full justify-center',
                    (isSearching || attendees.length === 0) && 'opacity-60 cursor-not-allowed'
                  )}
                >
                  {isSearching ? <Loader2 size={13} className="animate-spin" /> : <Globe size={13} />}
                  {isSearching ? 'Finding…' : 'Find Slots (Graph)'}
                </button>
              </div>
            </div>

            {slots.length > 0 && (
              <>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select a slot to reschedule the meeting to that time.
                </p>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                  {slots.map((slot, idx) => (
                    <SlotCard
                      key={slot.slot_id}
                      slot={slot}
                      rank={idx + 1}
                      onApprove={rescheduleToSlot}
                      isProcessing={reschedulingId === slot.slot_id}
                      timeZoneView={timeZone}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Option 2 — manual time */}
          <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-3 space-y-3">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <PencilLine size={13} /> Option 2 — Pick your own time
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                Date &amp; time
                <input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} className={inputCls} />
              </label>
              <button
                type="button"
                onClick={rescheduleManual}
                disabled={isManualBusy || !startLocal}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-colors',
                  isManualBusy || !startLocal
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                )}
              >
                {isManualBusy ? <Loader2 size={13} className="animate-spin" /> : <CalendarClock size={13} />}
                {isManualBusy ? 'Rescheduling…' : 'Reschedule to this time'}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertCircle size={12} />
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
