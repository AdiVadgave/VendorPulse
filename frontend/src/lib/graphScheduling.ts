/**
 * Delegated Microsoft Graph scheduling — runs as the signed-in coordinator.
 *
 * This is the DELEGATED replacement for the old backend GRAPH_ACCESS_TOKEN flow:
 * the coordinator's SSO session provides a Calendars.ReadWrite token (via MSAL),
 * and all Graph calendar calls happen here in the browser. No token is ever sent
 * to the backend; the backend only persists the resulting meeting.
 *
 *   findMeetingSlots()  → POST /me/findMeetingTimes  (compares all attendees' calendars)
 *   createMeetingEvent()→ POST /me/events            (Teams meeting + invites)
 *
 * AuthProvider registers the token getter after login. When SSO is off (dev), the
 * getter is null and these functions throw a clear error (scheduling needs a login).
 */
import type { CycleAttendee, SlotProposal } from '@/types/scheduling.types'

const GRAPH = 'https://graph.microsoft.com/v1.0'

type TokenGetter = () => Promise<string | null>
let calendarTokenGetter: TokenGetter | null = null

export function setCalendarTokenGetter(getter: TokenGetter | null): void {
  calendarTokenGetter = getter
}

export function isSchedulingAvailable(): boolean {
  return calendarTokenGetter !== null
}

// The scheduler only offers three fixed-offset display zones (no DST): IST +05:30,
// UTC/GMT +00:00. A datetime-local input yields a bare wall-clock with NO offset, so
// `new Date(wallClock)` would parse it in the BROWSER's zone (wrong when the chosen
// zone differs). Convert the wall-clock + chosen zone to a real UTC instant.
const ZONE_OFFSET: Record<'IST' | 'UTC' | 'GMT', string> = { IST: '+05:30', UTC: '+00:00', GMT: '+00:00' }

export function wallClockToUtcIso(wallClock: string, tz: 'IST' | 'UTC' | 'GMT'): string {
  if (!wallClock) return wallClock
  const withSeconds = wallClock.length === 16 ? `${wallClock}:00` : wallClock // add :SS if datetime-local omitted it
  const d = new Date(`${withSeconds}${ZONE_OFFSET[tz]}`)
  return Number.isNaN(d.getTime()) ? wallClock : d.toISOString()
}

async function token(): Promise<string> {
  if (!calendarTokenGetter) {
    throw new Error('Scheduling needs an active Shell sign-in (SSO). Please sign in and retry.')
  }
  const t = await calendarTokenGetter()
  if (!t) throw new Error('Could not acquire a calendar token — please sign in again.')
  return t
}

// ── Ranking ───────────────────────────────────────────────────────────────────
// The score is driven by WHO can attend, not just how many. Each searched
// attendee carries an importance weight so a slot where the key stakeholders and
// leadership (LT) are free ranks far above one where only optional/non-key people
// are free — even if the raw head-count is the same.
//
//   weight = base(1)  + key(+3)  + LT(+2)  + exec/EGB chair(+3),  then ×0.4 if Optional
//
// Scoring model: an AVAILABILITY CORE dominates, so a slot where everyone (weighted
// by importance) is free scores in the 90s–100. A light PREFERENCE top-up (time of
// day, weekday, recency) nudges and separates otherwise-equal slots but can never
// pull a fully-available slot below ~90.
const W_CORE = 0.85               // importance-weighted availability (the headline)
const W_PREF = 0.15               // day/time/recency top-up (also breaks same-day ties)
// Within the availability core (both are 100 when every weighted attendee is free):
const CORE_COVERAGE = 0.65        // share of importance-weight that is free
const CORE_KEY = 0.35             // share of KEY stakeholders that are free
// Within the preference top-up:
const PREF_TIME = 0.50            // time-of-day
const PREF_DAY = 0.30             // weekday
const PREF_REC = 0.20             // sooner is better
// Exec sponsor is a hard constraint — a real penalty when their calendar shows busy.
// (Key/LT availability is already captured by the core, so no separate head-count
// penalty is applied — that keeps fully-available slots at the top of the range.)
const EXEC_BUSY_PENALTY = 8

/** Importance weight for a searched attendee (higher = matters more to the slot). */
function attendeeWeight(a: CycleAttendee): number {
  let w = 1
  if (a.is_key) w += 3
  if (a.lt_status === 'LT') w += 2
  if (a.role === 'EGB_CHAIR') w += 3
  if (a.attendance_requirement === 'Optional') w *= 0.4
  return w
}

const clamp = (n: number) => Math.max(0, Math.min(100, n))

// Prefer mid-week; mild penalty for Mon/Fri, strong for weekends.
function dayOfWeekScore(d: Date): number {
  const dow = d.getUTCDay() // 0 Sun … 6 Sat
  if (dow >= 2 && dow <= 4) return 100 // Tue–Thu
  if (dow === 1 || dow === 5) return 85 // Mon / Fri
  return 55 // weekend (shouldn't occur with work-hours domain)
}

// Sooner is better — decay ~4 points/day from now, floored at 40.
function recencyScore(d: Date, now: number): number {
  const days = Math.max(0, (d.getTime() - now) / 86_400_000)
  return Math.max(40, 100 - days * 4)
}

// Time-of-day preference in IST (the team's primary zone). This also breaks ties
// between slots that are otherwise identical (same people free, same day) — e.g.
// a 10:00 slot outranks a 12:30 lunch slot — so the ranking never collapses to one
// flat score. Slots are UTC instants; convert to an IST wall-clock hour first.
function timeOfDayScore(d: Date): number {
  const istMinutes = (d.getUTCHours() * 60 + d.getUTCMinutes() + 330) % 1440
  const h = istMinutes / 60
  if (h >= 9 && h < 12) return 100    // prime late-morning
  if (h >= 14 && h < 16) return 90    // mid-afternoon
  if (h >= 16 && h < 17.5) return 78  // late afternoon
  if (h >= 8 && h < 9) return 74      // early
  if (h >= 12 && h < 14) return 62    // lunch dip
  return 48                            // very early / evening
}

// ── Graph payload types (trimmed to what we use) ─────────────────────────────
interface GraphAvailability {
  availability?: string // free | tentative | busy | oof | workingElsewhere | unknown
  attendee?: { emailAddress?: { address?: string } }
}
interface GraphSuggestion {
  confidenceLevel?: string | number
  meetingTimeSlot?: {
    start?: { dateTime?: string; timeZone?: string }
    end?: { dateTime?: string; timeZone?: string }
  }
  attendeeAvailability?: GraphAvailability[]
}

function isFree(s?: string) { return (s ?? '').toLowerCase() === 'free' }
function isTentative(s?: string) { return (s ?? '').toLowerCase() === 'tentative' }

/**
 * Find ranked meeting slots across the selected attendees' calendars.
 *
 * @param attendees  the cycle attendees to invite (emails + roles drive ranking)
 * @param startDate  'YYYY-MM-DD' inclusive
 * @param endDate    'YYYY-MM-DD' inclusive
 * @param durationMinutes  meeting length
 */
export async function findMeetingSlots(
  cycleId: string,
  attendees: CycleAttendee[],
  startDate: string,
  endDate: string,
  durationMinutes: number,
  maxCandidates = 12,
): Promise<SlotProposal[]> {
  // Free/busy is only readable for Shell mailboxes. Search ONLY Shell (@shell.com)
  // attendees; non-Shell people (vendors, external partners) are invited
  // later at the chosen time but must NOT constrain the slot search — otherwise
  // their unreadable availability makes every slot "not free" and none are found.
  const SHELL_DOMAIN = '@shell.com'
  const searchable = attendees.filter((a) => (a.email || '').toLowerCase().endsWith(SHELL_DOMAIN))
  if (searchable.length === 0) {
    throw new Error(
      'Availability can only be checked for Shell (@shell.com) calendars — add at least one Shell attendee. ' +
        'External invitees are still invited at the time you choose.',
    )
  }
  // Window in UTC; activityDomain "work" restricts to each attendee's working hours.
  // Never search into the past: if the from-date is today (or earlier), start the
  // window at the current moment so already-passed times (e.g. 9 AM when it's noon)
  // are not suggested.
  const windowStart = new Date(`${startDate}T00:00:00Z`)
  const nowDate = new Date()
  const effectiveStart = windowStart.getTime() < nowDate.getTime() ? nowDate : windowStart
  const startIso = effectiveStart.toISOString().slice(0, 19)
  const endIso = `${endDate}T23:59:59`

  const body = {
    attendees: searchable.map((a) => ({
      emailAddress: { address: a.email },
      type: a.attendance_requirement === 'Optional' ? 'optional' : 'required',
    })),
    isOrganizerOptional: false,
    timeConstraint: {
      activityDomain: 'work',
      timeSlots: [
        { start: { dateTime: startIso, timeZone: 'UTC' }, end: { dateTime: endIso, timeZone: 'UTC' } },
      ],
    },
    meetingDuration: `PT${durationMinutes}M`,
    returnSuggestionReasons: true,
    // Allow partial-attendance candidates (default 50%) so we still get options
    // when someone is busy all window; the ranking floats full-attendance slots to
    // the top and penalises conflicts, so the best options surface first.
    minimumAttendeePercentage: 50,
    maxCandidates,
  }

  const res = await fetch(`${GRAPH}/me/findMeetingTimes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Graph findMeetingTimes ${res.status}: ${t.slice(0, 300)}`)
  }
  const data = (await res.json()) as { meetingTimeSuggestions?: GraphSuggestion[] }
  const suggestions = data.meetingTimeSuggestions ?? []

  // Which attendee is the exec sponsor (hard-constraint role)? Only treat them as a
  // constraint when their calendar is actually searchable (a Shell mailbox) — an
  // external EGB chair has unreadable free/busy, so we must NOT mark every slot
  // "exec busy" or penalise it for availability we can't see.
  const execEmail = searchable.find((a) => a.role === 'EGB_CHAIR')?.email?.toLowerCase() ?? null
  // Per-searched-attendee importance metadata, keyed by lowercased email.
  const META = new Map(
    searchable.map((a) => [
      a.email.toLowerCase(),
      { w: attendeeWeight(a), key: !!a.is_key, lt: a.lt_status === 'LT', name: a.name },
    ]),
  )
  const nameFor = (email: string) => META.get(email.toLowerCase())?.name ?? email
  const totalSearched = searchable.length
  const totalWeight = [...META.values()].reduce((s, m) => s + m.w, 0) || 1
  const keyTotal = [...META.values()].filter((m) => m.key).length
  const ltTotal = [...META.values()].filter((m) => m.lt).length
  const now = Date.now()

  const scored = suggestions.map((s): SlotProposal => {
    const avail = s.attendeeAvailability ?? []
    const attending: string[] = []
    const tentative: string[] = []
    const conflicts: string[] = []
    let execAvailable = execEmail === null // no exec sponsor → treat as satisfied

    // Importance-weighted tallies (drive the score) + key/LT breakdown (shown on the card).
    let freeW = 0, tentW = 0
    let keyFree = 0, keyTent = 0
    let ltFree = 0

    for (const a of avail) {
      const email = (a.attendee?.emailAddress?.address ?? '').toLowerCase()
      if (!email) continue
      const meta = META.get(email) ?? { w: 1, key: false, lt: false, name: nameFor(email) }
      const free = isFree(a.availability)
      const tent = isTentative(a.availability)
      if (free) { attending.push(meta.name); freeW += meta.w; if (meta.key) keyFree++; if (meta.lt) ltFree++ }
      else if (tent) { tentative.push(meta.name); tentW += meta.w; if (meta.key) keyTent++ }
      else { conflicts.push(meta.name) }
      if (execEmail && email === execEmail && (free || tent)) execAvailable = true
    }

    // findMeetingTimes only returns slots where the organiser (us) is free.
    const startDt = s.meetingTimeSlot?.start?.dateTime ?? ''
    const proposedUtc = startDt ? `${startDt.replace(/(\.\d+)?$/, '')}Z` : ''
    const startDate = proposedUtc ? new Date(proposedUtc) : new Date(now)

    // Importance-weighted coverage (tentative counts half) is the main driver, then
    // how many KEY stakeholders are free, then day-of-week and recency nudges. Hard
    // penalties for key/LT/exec conflicts widen the spread between otherwise-similar slots.
    const weightedCoverage = ((freeW + 0.5 * tentW) / totalWeight) * 100
    const keyCoverage = keyTotal > 0 ? ((keyFree + 0.5 * keyTent) / keyTotal) * 100 : 100
    // Availability core (100 = everyone important is free) dominates; a light
    // day/time/recency top-up separates otherwise-equal slots into a clean gradient.
    const core = CORE_COVERAGE * weightedCoverage + CORE_KEY * keyCoverage
    const pref =
      PREF_TIME * timeOfDayScore(startDate) +
      PREF_DAY * dayOfWeekScore(startDate) +
      PREF_REC * recencyScore(startDate, now)
    let score = W_CORE * core + W_PREF * pref
    if (execEmail && !execAvailable) score -= EXEC_BUSY_PENALTY
    score = clamp(Math.round(score))

    const bits: string[] = [`${attending.length}/${totalSearched} free`]
    if (keyTotal) bits.push(`reviewers ${keyFree}/${keyTotal}`)
    if (ltTotal) bits.push(`LT ${ltFree}/${ltTotal}`)
    if (tentative.length) bits.push(`${tentative.length} tentative`)
    if (conflicts.length) bits.push(`${conflicts.length} conflict`)
    if (execEmail) bits.push(execAvailable ? 'exec sponsor free' : 'exec sponsor busy')

    return {
      slot_id: '',
      cycle_id: cycleId,
      proposed_time: proposedUtc,
      proposed_time_zone: 'UTC',
      duration_minutes: durationMinutes,
      organiser_available: true,
      exec_sponsor_available: execAvailable,
      rank_score: score,
      is_approved: false,
      attendance_count: attending.length,
      total_attendees: totalSearched,
      conflict_count: conflicts.length,
      attending,
      tentative,
      conflicts,
      key_free: keyFree,
      key_total: keyTotal,
      lt_free: ltFree,
      lt_total: ltTotal,
      ranking_rationale: bits.join(' · '),
    }
  })

  // Drop any slot that starts in the past (belt-and-braces with the window clamp
  // above — guards against Graph anchoring a suggestion to the window start).
  const future = scored.filter((s) => {
    const t = new Date(s.proposed_time).getTime()
    return Number.isFinite(t) && t >= now
  })

  // Rank best-first, then assign stable rank ids (slot-1 = top).
  future.sort((a, b) => b.rank_score - a.rank_score)
  return future.map((slot, idx) => ({ ...slot, slot_id: `slot-${idx + 1}` }))
}

// ── Create the Teams meeting + send invites (as the coordinator) ─────────────
export interface CreatedMeeting {
  event_id: string
  web_link: string
  teams_meeting_url: string | null
}

export async function createMeetingEvent(params: {
  slot: SlotProposal
  attendees: CycleAttendee[]
  subject: string
  bodyText: string
}): Promise<CreatedMeeting> {
  const { slot, attendees, subject, bodyText } = params
  const start = new Date(slot.proposed_time)
  const end = new Date(start.getTime() + (slot.duration_minutes ?? 60) * 60 * 1000)

  const body = {
    subject,
    start: { dateTime: start.toISOString().replace('Z', ''), timeZone: 'UTC' },
    end: { dateTime: end.toISOString().replace('Z', ''), timeZone: 'UTC' },
    attendees: attendees
      .filter((a) => a.email)
      .map((a) => ({
        emailAddress: { address: a.email, name: a.name },
        type: a.attendance_requirement === 'Optional' ? 'optional' : 'required',
      })),
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
    isReminderOn: true,
    reminderMinutesBeforeStart: 15,
    responseRequested: true,
    body: { contentType: 'HTML', content: bodyText },
  }

  const res = await fetch(`${GRAPH}/me/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Graph create event ${res.status}: ${t.slice(0, 300)}`)
  }
  const ev = (await res.json()) as {
    id: string
    webLink?: string
    onlineMeeting?: { joinUrl?: string }
  }
  return {
    event_id: ev.id,
    web_link: ev.webLink ?? '',
    teams_meeting_url: ev.onlineMeeting?.joinUrl ?? null,
  }
}

// ── Add attendees to an already-created meeting ──────────────────────────────
// PATCHes the existing calendar event with the full attendee list. Graph sends a
// meeting invite to any newly-added attendees while leaving the event (time, join
// link) unchanged — so everyone shares the same Teams meeting. Delegated, as the
// signed-in coordinator (Calendars.ReadWrite). Graph requires the COMPLETE
// attendee collection on PATCH (it replaces, not appends), so pass every attendee.
export async function addAttendeesToEvent(params: {
  eventId: string
  attendees: CycleAttendee[]
  /** Optionally update the invite subject/body so Graph re-notifies with fresh text. */
  subject?: string
  bodyHtml?: string
}): Promise<void> {
  const { eventId, attendees, subject, bodyHtml } = params
  const body: Record<string, unknown> = {
    attendees: attendees
      .filter((a) => a.email)
      .map((a) => ({
        emailAddress: { address: a.email, name: a.name },
        type: a.attendance_requirement === 'Optional' ? 'optional' : 'required',
      })),
  }
  if (subject) body.subject = subject
  if (bodyHtml) body.body = { contentType: 'HTML', content: bodyHtml }
  const res = await fetch(`${GRAPH}/me/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Graph update event ${res.status}: ${t.slice(0, 300)}`)
  }
}

// ── Find an existing event by its Teams join link ────────────────────────────
// Used when we don't have the stored event id (e.g. a meeting scheduled before ids
// were persisted) so reschedule can MOVE that event instead of creating a duplicate.
export async function findEventIdByJoinUrl(joinUrl: string): Promise<string | null> {
  if (!joinUrl) return null
  const res = await fetch(`${GRAPH}/me/events?$select=id,onlineMeeting&$top=250`, {
    headers: { Authorization: `Bearer ${await token()}` },
  })
  if (!res.ok) return null
  const data = (await res.json()) as { value?: Array<{ id: string; onlineMeeting?: { joinUrl?: string } }> }
  const match = (data.value ?? []).find((e) => !!e.onlineMeeting?.joinUrl && e.onlineMeeting.joinUrl === joinUrl)
  return match?.id ?? null
}

// ── Read live RSVP responses from the meeting event ──────────────────────────
// GET /me/events/{id}?$select=attendees → each attendee's status.response is one of
// none | organizer | tentativelyAccepted | accepted | declined | notResponded.
// Returned as a map of lowercased email → normalized status so the confirmation
// tracker can show who actually accepted/declined in Outlook. Delegated, as the
// signed-in coordinator (Calendars.ReadWrite / Read).
export type RsvpResponse = 'accepted' | 'declined' | 'tentative' | 'organizer' | 'none'

export async function getEventAttendeeResponses(eventId: string): Promise<Record<string, RsvpResponse>> {
  if (!eventId) return {}
  const res = await fetch(`${GRAPH}/me/events/${encodeURIComponent(eventId)}?$select=attendees`, {
    headers: { Authorization: `Bearer ${await token()}` },
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Graph read RSVPs ${res.status}: ${t.slice(0, 200)}`)
  }
  const data = (await res.json()) as {
    attendees?: Array<{ emailAddress?: { address?: string }; status?: { response?: string } }>
  }
  const out: Record<string, RsvpResponse> = {}
  for (const a of data.attendees ?? []) {
    const email = (a.emailAddress?.address ?? '').toLowerCase()
    if (!email) continue
    const r = (a.status?.response ?? '').toLowerCase()
    out[email] =
      r === 'accepted' ? 'accepted'
        : r === 'declined' ? 'declined'
          : r === 'tentativelyaccepted' ? 'tentative'
            : r === 'organizer' ? 'organizer'
              : 'none'
  }
  return out
}

// ── Reschedule: change an existing meeting's start/end time ───────────────────
// PATCHes the event's start/end. Graph sends the updated invite to all attendees
// automatically. Delegated, as the signed-in coordinator (Calendars.ReadWrite).
export async function updateMeetingTime(params: {
  eventId: string
  startISO: string
  durationMinutes: number
  /** Optionally update the invite subject/body alongside the new time. */
  subject?: string
  bodyHtml?: string
}): Promise<{ teams_meeting_url: string | null }> {
  const { eventId, startISO, durationMinutes, subject, bodyHtml } = params
  const start = new Date(startISO)
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000)
  const body: Record<string, unknown> = {
    start: { dateTime: start.toISOString().replace('Z', ''), timeZone: 'UTC' },
    end: { dateTime: end.toISOString().replace('Z', ''), timeZone: 'UTC' },
  }
  if (subject) body.subject = subject
  if (bodyHtml) body.body = { contentType: 'HTML', content: bodyHtml }
  const res = await fetch(`${GRAPH}/me/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Graph reschedule ${res.status}: ${t.slice(0, 300)}`)
  }
  const ev = (await res.json()) as { onlineMeeting?: { joinUrl?: string } }
  return { teams_meeting_url: ev.onlineMeeting?.joinUrl ?? null }
}
