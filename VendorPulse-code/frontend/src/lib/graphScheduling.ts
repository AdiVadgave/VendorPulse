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
const TENTATIVE_PENALTY = 15

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
  const emails = attendees.map((a) => a.email).filter(Boolean)
  if (emails.length === 0) throw new Error('No attendee emails to check.')

  // Window in UTC; activityDomain "work" restricts to each attendee's working hours.
  const startIso = `${startDate}T00:00:00`
  const endIso = `${endDate}T23:59:59`

  const body = {
    attendees: attendees
      .filter((a) => a.email)
      .map((a) => ({
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
    minimumAttendeePercentage: 100,
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

  return suggestions.map((s, idx): SlotProposal => {
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

    const score = clamp(baseScore(s.confidenceLevel) - TENTATIVE_PENALTY * tentative.length)
    // findMeetingTimes only returns slots where the organiser (us) is free.
    const startDt = s.meetingTimeSlot?.start?.dateTime ?? ''
    const proposedUtc = startDt ? `${startDt.replace(/(\.\d+)?$/, '')}Z` : ''

    return {
      slot_id: `slot-${idx + 1}`,
      cycle_id: cycleId,
      proposed_time: proposedUtc,
      proposed_time_zone: 'UTC',
      duration_minutes: durationMinutes,
      organiser_available: true,
      exec_sponsor_available: execAvailable,
      rank_score: score,
      is_approved: false,
      attendance_count: attending.length,
      total_attendees: emails.length,
      conflict_count: conflicts.length,
      attending,
      tentative,
      conflicts,
    }
  })
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
