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
import { createMeetingEvent } from '@/lib/graphScheduling'
import type { CycleAttendee, SlotProposal } from '@/types/scheduling.types'

type TZ = 'IST' | 'UTC' | 'GMT'

interface Props {
  cycleId: string
  findAttendees: CycleAttendee[]
  inviteAttendees: CycleAttendee[]
  subject: string
  bodyHtml: string
  defaultDuration?: number
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
  onScheduled,
  onCancel,
}: Props) {
  const [phase, setPhase] = useState<'find' | 'rank'>('find')
  const [slots, setSlots] = useState<SlotProposal[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Shared path — creates the Teams meeting via delegated Graph and persists.
  async function scheduleSlot(slot: SlotProposal, tz: TZ) {
    setCreating(true)
    setError(null)
    try {
      const created = await createMeetingEvent({ slot, attendees: inviteAttendees, subject, bodyText: bodyHtml })
      await onScheduled({
        startTime: slot.proposed_time,
        timeZone: tz,
        durationMinutes: slot.duration_minutes ?? defaultDuration,
        teamsUrl: created.teams_meeting_url,
        attendeeCount: inviteAttendees.length,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create the meeting.')
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
