/**
 * Format a scheduled meeting's date/time for display, matching the final QBR
 * "Meeting Scheduled" banner (ConfirmationTracker): e.g.
 *   "Monday, 4 August 2026 at 10:00 AM IST · 30 min"
 *
 * `startISO` is a UTC instant (the value persisted for the meeting); the wall-clock
 * date + time are rendered in the meeting's own timezone so what the coordinator
 * picked is what they see back.
 */
export type MeetingTZ = 'IST' | 'UTC' | 'GMT' | string

function displayZoneOf(tz: MeetingTZ): 'IST' | 'GMT' | 'UTC' {
  const t = (tz || '').toUpperCase()
  if (t.includes('IST')) return 'IST'
  if (t.includes('GMT')) return 'GMT'
  return 'UTC'
}

function ianaOf(zone: 'IST' | 'GMT' | 'UTC'): string {
  return zone === 'IST' ? 'Asia/Kolkata' : zone === 'GMT' ? 'Etc/GMT' : 'UTC'
}

/** Returns null when the ISO string is missing/unparseable, so callers can hide the line. */
export function formatMeetingTime(
  startISO: string | null | undefined,
  timeZone: MeetingTZ = 'IST',
  durationMinutes?: number | null,
): string | null {
  if (!startISO) return null
  const d = new Date(startISO)
  if (Number.isNaN(d.getTime())) return null

  const zone = displayZoneOf(timeZone)
  const iana = ianaOf(zone)

  const date = d.toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: iana,
  })
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: iana,
  })

  const dur = durationMinutes ? ` · ${durationMinutes} min` : ''
  return `${date} at ${time} ${zone}${dur}`
}
