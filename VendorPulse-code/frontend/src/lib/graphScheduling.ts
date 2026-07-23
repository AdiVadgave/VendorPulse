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

async function token(): Promise<string> {
  if (!calendarTokenGetter) {
    throw new Error('Scheduling needs an active Shell sign-in (SSO). Please sign in and retry.')
  }
  const t = await calendarTokenGetter()
  if (!t) throw new Error('Could not acquire a calendar token — please sign in again.')
  return t
}

// ── Ranking (ported from the old backend graph_scheduling.py, §8 of the handover) ─
const HIGH_SCORE = 100
const MEDIUM_SCORE = 80
const LOW_SCORE = 60
const TENTATIVE_PENALTY = 8    // per tentative attendee
const CONFLICT_PENALTY = 25    // per hard conflict (rare with a 100%-attendance search)
const EXEC_BONUS = 4           // exec sponsor (EGB_CHAIR) is available

// Composite weights (positive components sum to 1.0).
const W_COVERAGE = 0.35        // how many searched attendees are free
const W_CONFIDENCE = 0.25      // Graph's own confidence
const W_RECENCY = 0.25         // sooner is better
const W_DAY = 0.15             // mid-week preference

function baseScore(confidence: unknown): number {
  if (typeof confidence === 'string') {
    const c = confidence.toLowerCase()
    if (c === 'high') return HIGH_SCORE
    if (c === 'medium') return MEDIUM_SCORE
    return LOW_SCORE
  }
  if (typeof confidence === 'number') {
    const n = confidence <= 1 ? confidence * 100 : confidence
    if (n >= 90) return HIGH_SCORE
    if (n >= 70) return MEDIUM_SCORE
    return LOW_SCORE
  }
  return LOW_SCORE
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
  // attendees; non-Shell people (vendors, partners like @zensar.com) are invited
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
  const startIso = `${startDate}T00:00:00`
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

  // Which attendee is the exec sponsor (hard-constraint role)?
  const execEmail = attendees.find((a) => a.role === 'EGB_CHAIR')?.email?.toLowerCase() ?? null
  const byEmailName = new Map(attendees.map((a) => [a.email.toLowerCase(), a.name]))
  const nameFor = (email: string) => byEmailName.get(email.toLowerCase()) ?? email
  const totalSearched = searchable.length
  const now = Date.now()

  const scored = suggestions.map((s): SlotProposal => {
    const avail = s.attendeeAvailability ?? []
    const attending: string[] = []
    const tentative: string[] = []
    const conflicts: string[] = []
    let execAvailable = execEmail === null // no exec sponsor → treat as satisfied

    for (const a of avail) {
      const email = a.attendee?.emailAddress?.address ?? ''
      if (!email) continue
      const name = nameFor(email)
      if (isFree(a.availability)) attending.push(name)
      else if (isTentative(a.availability)) tentative.push(name)
      else conflicts.push(name)
      if (execEmail && email.toLowerCase() === execEmail && (isFree(a.availability) || isTentative(a.availability))) {
        execAvailable = true
      }
    }

    // findMeetingTimes only returns slots where the organiser (us) is free.
    const startDt = s.meetingTimeSlot?.start?.dateTime ?? ''
    const proposedUtc = startDt ? `${startDt.replace(/(\.\d+)?$/, '')}Z` : ''
    const startDate = proposedUtc ? new Date(proposedUtc) : new Date(now)

    // Composite score: attendance coverage (tentative counts half), Graph
    // confidence, how soon the slot is, and the day of week — minus penalties for
    // tentative/conflicts, plus a small bonus when the exec sponsor is free.
    const coverage = totalSearched > 0
      ? ((attending.length + 0.5 * tentative.length) / totalSearched) * 100
      : 100
    let score =
      W_COVERAGE * coverage +
      W_CONFIDENCE * baseScore(s.confidenceLevel) +
      W_RECENCY * recencyScore(startDate, now) +
      W_DAY * dayOfWeekScore(startDate)
    score -= TENTATIVE_PENALTY * tentative.length + CONFLICT_PENALTY * conflicts.length
    if (execEmail && execAvailable) score += EXEC_BONUS
    score = clamp(Math.round(score))

    const bits: string[] = [`${attending.length}/${totalSearched} Shell free`]
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
      ranking_rationale: bits.join(' · '),
    }
  })

  // Rank best-first, then assign stable rank ids (slot-1 = top).
  scored.sort((a, b) => b.rank_score - a.rank_score)
  return scored.map((slot, idx) => ({ ...slot, slot_id: `slot-${idx + 1}` }))
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
