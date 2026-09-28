/**
 * Format a scheduled meeting's date/time for display, matching the final QBR
 * "Meeting Scheduled" banner (ConfirmationTracker): e.g.
 *   "Monday, 4 August 2026 at 10:00 AM Asia/Kolkata · 30 min"
 *
 * `startISO` is a UTC instant (the value persisted for the meeting); the wall-clock
 * date + time are rendered in the meeting's own timezone so what the coordinator
 * picked is what they see back.
 *
 * A timezone is now an IANA id. `toTimeZoneId` maps the three legacy labels
 * (IST / UTC / GMT) that older cycles still have stored, so this keeps working on
 * meetings scheduled before the full zone list existed.
 */
import { toTimeZoneId, utcOffsetLabel, type TimeZoneId } from '@/lib/timeZone'

export type MeetingTZ = TimeZoneId

/** Returns null when the ISO string is missing/unparseable, so callers can hide the line. */
export function formatMeetingTime(
  startISO: string | null | undefined,
  timeZone?: MeetingTZ | null,
  durationMinutes?: number | null,
): string | null {
  if (!startISO) return null
  const d = new Date(startISO)
  if (Number.isNaN(d.getTime())) return null

  const zone = toTimeZoneId(timeZone)

  let date: string
  let time: string
  try {
    date = d.toLocaleDateString('en-US', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: zone,
    })
    time = d.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone,
    })
  } catch {
    // An unknown zone id must not blank the whole banner — fall back to UTC and say so.
    date = d.toLocaleDateString('en-US', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    })
    time = d.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC',
    })
    return `${date} at ${time} UTC${durationMinutes ? ` · ${durationMinutes} min` : ''}`
  }

  const dur = durationMinutes ? ` · ${durationMinutes} min` : ''
  return `${date} at ${time} ${zone}${dur}`
}

/** Short zone label for a banner or chip: "Asia/Kolkata (+05:30)". */
export function zoneLabel(timeZone: MeetingTZ | null | undefined): string {
  const zone = toTimeZoneId(timeZone)
  const off = utcOffsetLabel(zone)
  return off ? `${zone} (${off})` : zone
}
