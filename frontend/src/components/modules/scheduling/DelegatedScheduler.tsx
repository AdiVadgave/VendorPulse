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
import ManualTimeCard from './ManualTimeCard'
import DraftReviewDialog from '@/components/shared/DraftReviewDialog'
import { createMeetingEvent, updateMeetingTime, findEventIdByJoinUrl, wallClockToUtcIso } from '@/lib/graphScheduling'
import { formatMeetingTime } from '@/utils/formatMeetingTime'
import type { CycleAttendee, SlotProposal } from '@/types/scheduling.types'

type TZ = 'IST' | 'UTC' | 'GMT'

interface Props {
  cycleId: string
  findAttendees: CycleAttendee[]
  inviteAttendees: CycleAttendee[]
  subject: string
  bodyHtml: string
  defaultDuration?: number
  /** The final QBR/SPR meeting date — this meeting must START BEFORE it. The slot
   *  window ends on the SPR day and any slot at/after the SPR start time is filtered
   *  out (same-day-but-earlier is allowed). */
  qbrMeetingDate?: string | null
  /** Earliest allowed start (ISO): this meeting must START AFTER it — e.g. the latest
   *  Internal Alignment call, when scheduling the Vendor Prep. */
  earliestMeetingDate?: string | null
  /** Label for the meeting this one must come BEFORE (default "the SPR meeting"). */
  beforeLabel?: string
  /** Label for the meeting this one must come AFTER (default "the earlier meeting"). */
  afterLabel?: string
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
  earliestMeetingDate,
  beforeLabel = 'the SPR meeting',
  afterLabel = 'the earlier meeting',
  existingEventId,
  existingMeetingUrl,
  onScheduled,
  onCancel,
}: Props) {
  const [phase, setPhase] = useState<'find' | 'rank'>('find')

  function localISODate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  // Precedence bounds (by exact start time): this meeting must start AFTER the
  // earlier meeting (min) and BEFORE the SPR (max). Same-day-but-earlier is allowed.
  const minMs = (() => { const d = earliestMeetingDate ? new Date(earliestMeetingDate) : null; return d && !Number.isNaN(d.getTime()) ? d.getTime() : null })()
  const maxMs = (() => { const d = qbrMeetingDate ? new Date(qbrMeetingDate) : null; return d && !Number.isNaN(d.getTime()) ? d.getTime() : null })()

  /** null when the instant is inside the allowed window, else a reason to reject it. */
  function boundsError(iso: string): string | null {
    const t = new Date(iso).getTime()
    if (Number.isNaN(t)) return null
    if (minMs !== null && t <= minMs) return `This time is not after ${afterLabel} (${formatMeetingTime(earliestMeetingDate)}). Pick a later time.`
    if (maxMs !== null && t >= maxMs) return `This time is not before ${beforeLabel} (${formatMeetingTime(qbrMeetingDate)}). Pick an earlier time.`
    return null
  }

  // From = later of today and the earlier meeting's day; To = the SPR day (inclusive —
  // same-day slots that start before the SPR survive the time filter below).
  let fromStr = localISODate(new Date())
  if (earliestMeetingDate) {
    const e = new Date(earliestMeetingDate)
    if (!Number.isNaN(e.getTime())) { const s = localISODate(e); if (s > fromStr) fromStr = s }
  }
  let sprDayStr: string | undefined
  if (qbrMeetingDate) {
    const q = new Date(qbrMeetingDate)
    if (!Number.isNaN(q.getTime())) sprDayStr = localISODate(q)
  }
  const [slots, setSlots] = useState<SlotProposal[]>([])
  const [hiddenCount, setHiddenCount] = useState(0)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A slot chosen and awaiting draft review before the invite is created/updated.
  const [pending, setPending] = useState<{ slot: SlotProposal; tz: TZ } | null>(null)

  // Shared path — creates the Teams meeting via delegated Graph and persists. When
  // rescheduling an existing meeting, MOVE that event (patch its time) instead of
  // creating a duplicate — same behaviour as the main QBR reschedule. The reviewed
  // subject/body come from the draft dialog.
  async function scheduleSlot(slot: SlotProposal, tz: TZ, draftSubject: string, draftBody: string) {
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
        const updated = await updateMeetingTime({ eventId, startISO: slot.proposed_time, durationMinutes, subject: draftSubject, bodyHtml: draftBody })
        if (updated.teams_meeting_url) teamsUrl = updated.teams_meeting_url
      } else {
        const created = await createMeetingEvent({ slot, attendees: inviteAttendees, subject: draftSubject, bodyText: draftBody })
        teamsUrl = created.teams_meeting_url
      }
      setPending(null)
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
      setPending(null)
    }
  }

  // Selecting a slot opens the draft review dialog; the invite is only sent when
  // the coordinator confirms (with any edits) in that dialog.
  function handleApprove(slotId: string, tz: TZ) {
    const slot = slots.find((s) => s.slot_id === slotId)
    if (slot) setPending({ slot, tz })
  }

  // Manual override: build a synthetic slot at the chosen time and route it
  // through the same draft-review + delegated create-event path as a suggested slot.
  function handleManual(startISO: string, tz: TZ, dur: number) {
    const utcIso = wallClockToUtcIso(startISO, tz)
    // Enforce precedence before opening the invite draft (backend also rejects it).
    const err = boundsError(utcIso)
    if (err) { setError(err); return }
    setError(null)
    setPending({
      tz,
      slot: {
        slot_id: 'manual-slot',
        cycle_id: cycleId,
        // Wall-clock entry in the chosen zone → real UTC instant.
        proposed_time: utcIso,
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
    })
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

      {/* No internal calendars to check (e.g. a vendor-only invite list) → free/busy
          slot suggestions aren't possible, so go straight to picking a specific time. */}
      {findAttendees.length === 0 ? (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
            No internal stakeholders are on this invite, so their calendars can't be checked for free slots — choose a specific time instead.
          </p>
          <ManualTimeCard defaultDuration={defaultDuration} onSchedule={handleManual} />
        </>
      ) : (
        <>
      {phase === 'find' && (
        <FindSlotsControl
          cycleId={cycleId}
          attendees={findAttendees}
          defaultDuration={defaultDuration}
          defaultFromDate={fromStr}
          minFromDate={fromStr}
          defaultToDate={sprDayStr}
          maxToDate={sprDayStr}
          onSlotsFound={(found) => {
            // Drop any suggested slot that breaks precedence (e.g. a slot at/after the
            // SPR start, or before the alignment call) so only valid times are offered.
            const ok = found.filter((s) => !boundsError(s.proposed_time))
            setHiddenCount(found.length - ok.length)
            setSlots(ok)
            setPhase('rank')
          }}
        />
      )}

      {phase === 'rank' && (
        <>
          {hiddenCount > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              {hiddenCount} suggested slot{hiddenCount === 1 ? ' was' : 's were'} hidden because {hiddenCount === 1 ? 'it falls' : 'they fall'} outside the allowed window
              {minMs !== null && maxMs !== null
                ? ` (after ${afterLabel} and before ${beforeLabel})`
                : maxMs !== null
                  ? ` (must be before ${beforeLabel})`
                  : minMs !== null
                    ? ` (must be after ${afterLabel})`
                    : ''}.
            </p>
          )}
          <SlotRankingPanel
            slots={slots}
            onSlotApproved={handleApprove}
            onBackToAttendees={() => setPhase('find')}
            onScheduleManual={handleManual}
          />
        </>
      )}
        </>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          {error}
        </p>
      )}

      <DraftReviewDialog
        open={pending !== null}
        kind="invite"
        title={existingMeetingUrl ? 'Review updated invite' : 'Review meeting invite'}
        subject={subject}
        body={bodyHtml}
        recipients={inviteAttendees.filter((a) => a.email).map((a) => `${a.name} (${a.email})`)}
        sendLabel={existingMeetingUrl ? 'Update & send' : 'Send invite'}
        busy={creating}
        onSend={(draft) => { if (pending) void scheduleSlot(pending.slot, pending.tz, draft.subject, draft.body) }}
        onCancel={() => { if (!creating) setPending(null) }}
      />
    </div>
  )
}
