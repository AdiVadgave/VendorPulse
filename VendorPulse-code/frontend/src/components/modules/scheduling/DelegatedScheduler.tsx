/**
 * Reusable delegated meeting scheduler: Find Slots → ranked slots → create a Teams
 * meeting + send invites (as the signed-in coordinator, via Calendars.ReadWrite),
 * then hand the result to `onScheduled` for the caller to persist.
 *
 * Used by the alignment (Module C) and vendor-prep (Module D) panels so they share
 * the exact same algorithm as the main scheduling module — no manual date entry.
 *
 *  • findAttendees   — whose calendars to compare for free/busy (internal only;
 *                      external/vendor mailboxes have no readable free/busy).
 *  • inviteAttendees — everyone to invite on the event (may include the vendor).
 */
import { useState } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import FindSlotsControl from './FindSlotsControl'
import SlotRankingPanel from './SlotRankingPanel'
import { createMeetingEvent, updateMeetingTime, findEventIdByJoinUrl } from '@/lib/graphScheduling'
import type { CycleAttendee, SlotProposal } from '@/types/scheduling.types'

type TZ = 'IST' | 'UTC' | 'GMT'

interface Props {
  cycleId: string
  findAttendees: CycleAttendee[]
  inviteAttendees: CycleAttendee[]
  subject: string
  bodyHtml: string
  defaultDuration?: number
  /** The final QBR meeting date — this meeting must be held before it, so the slot
   *  search window ends the day before the QBR (From defaults to today). */
  qbrMeetingDate?: string | null
  /** Rescheduling an existing meeting: MOVE that event instead of creating a new one.
   *  Provide its join link (and/or Graph event id) so we can locate + patch it. */
  existingEventId?: string | null
  existingMeetingUrl?: string | null
  onScheduled: (r: {
    startTime: string
    timeZone: TZ
    durationMinutes: number
    teamsUrl: string | null
    attendeeCount: number
  }) => Promise<void> | void
  onCancel?: () => void
}

export default function DelegatedScheduler({
  cycleId,
  findAttendees,
  inviteAttendees,
  subject,
  bodyHtml,
  defaultDuration = 30,
  qbrMeetingDate,
  existingEventId,
  existingMeetingUrl,
  onScheduled,
  onCancel,
}: Props) {
  const [phase, setPhase] = useState<'find' | 'rank'>('find')

  function localISODate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  // From = today (when the coordinator opens this); To = day before the QBR.
  const todayStr = localISODate(new Date())
  let dayBeforeQbr: string | undefined
  if (qbrMeetingDate) {
    const q = new Date(qbrMeetingDate)
    if (!Number.isNaN(q.getTime())) {
      q.setDate(q.getDate() - 1)
      dayBeforeQbr = localISODate(q)
    }
  }
  const [slots, setSlots] = useState<SlotProposal[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Shared path — creates the Teams meeting via delegated Graph and persists. When
  // rescheduling an existing meeting, MOVE that event (patch its time) instead of
  // creating a duplicate — same behaviour as the main QBR reschedule.
  async function scheduleSlot(slot: SlotProposal, tz: TZ) {
    setCreating(true)
    setError(null)
    const durationMinutes = slot.duration_minutes ?? defaultDuration
    try {
      let teamsUrl: string | null = existingMeetingUrl ?? null
      // Resolve the existing event (stored id, else look it up by join link).
      let eventId: string | null = existingEventId ?? null
      if (!eventId && existingMeetingUrl) {
        eventId = await findEventIdByJoinUrl(existingMeetingUrl)
      }
      if (eventId) {
        const updated = await updateMeetingTime({ eventId, startISO: slot.proposed_time, durationMinutes })
        if (updated.teams_meeting_url) teamsUrl = updated.teams_meeting_url
      } else {
        const created = await createMeetingEvent({ slot, attendees: inviteAttendees, subject, bodyText: bodyHtml })
        teamsUrl = created.teams_meeting_url
      }
      await onScheduled({
        startTime: slot.proposed_time,
        timeZone: tz,
        durationMinutes,
        teamsUrl,
        attendeeCount: inviteAttendees.length,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to schedule the meeting.')
      setCreating(false)
    }
  }

  function handleApprove(slotId: string, tz: TZ) {
    const slot = slots.find((s) => s.slot_id === slotId)
    if (slot) scheduleSlot(slot, tz)
  }

  // Manual override: build a synthetic slot at the chosen time and schedule it
  // through the exact same delegated create-event path as a suggested slot.
  function handleManual(startISO: string, tz: TZ, dur: number) {
    scheduleSlot(
      {
        slot_id: 'manual-slot',
        cycle_id: cycleId,
        proposed_time: startISO,
        proposed_time_zone: tz,
        duration_minutes: dur,
        organiser_available: true,
        exec_sponsor_available: true,
        rank_score: 100,
        is_approved: false,
        attendance_count: inviteAttendees.length,
        total_attendees: inviteAttendees.length,
        conflict_count: 0,
        attending: inviteAttendees.map((a) => a.name),
        tentative: [],
        conflicts: [],
      },
      tz,
    )
  }

  if (creating) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3">
        <Loader2 size={15} className="animate-spin" />
        Creating the Teams meeting &amp; sending invites…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {onCancel && (
        <div className="flex justify-end">
          <button
            onClick={onCancel}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium"
          >
            Cancel
          </button>
        </div>
      )}

      {phase === 'find' && (
        <FindSlotsControl
          cycleId={cycleId}
          attendees={findAttendees}
          defaultDuration={defaultDuration}
          defaultFromDate={todayStr}
          minFromDate={todayStr}
          defaultToDate={dayBeforeQbr}
          maxToDate={dayBeforeQbr}
          onSlotsFound={(found) => {
            setSlots(found)
            setPhase('rank')
          }}
        />
      )}

      {phase === 'rank' && (
        <SlotRankingPanel
          slots={slots}
          onSlotApproved={handleApprove}
          onBackToAttendees={() => setPhase('find')}
          onScheduleManual={handleManual}
        />
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          {error}
        </p>
      )}
    </div>
  )
}
