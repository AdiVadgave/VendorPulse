/**
 * The Shell-approved standard texts for invites drafted in the UI.
 *
 * SINGLE SOURCE OF TRUTH for the frontend, and a deliberate mirror of the backend's
 * `app/services/standard_text.py`. Any wording change must be made in BOTH — they are
 * the same approved sentences, and the two sides send the same invites.
 *
 * Sign-offs are not interchangeable:
 *   meeting invites  -> "Mobility Vendor Pulse Scheduling Agent"
 *   scorecard email  -> "Mobility Vendor Pulse Agent"  (backend only)
 *
 * The separator after "SPR" is an EN DASH (–); between the months it is a hyphen (-).
 */

const QUARTER_MONTHS: Record<string, [string, string]> = {
  Q1: ['Jan', 'Mar'],
  Q2: ['Apr', 'Jun'],
  Q3: ['Jul', 'Sep'],
  Q4: ['Oct', 'Dec'],
}

/** The {from} / {to} labels for a cycle, e.g. ["Jan 2026", "Mar 2026"]. */
export function cyclePeriod(quarter: string, year: number | string): [string, string] {
  const q = (quarter || '').trim().toUpperCase()
  const y = String(year ?? '').trim()
  const m = QUARTER_MONTHS[q]
  if (!m) return [y, y]
  return [`${m[0]} ${y}`.trim(), `${m[1]} ${y}`.trim()]
}

/** "Shell/{vendor} SPR – {from} - {to}" — the tail every title shares. */
export function sprLabel(vendorName: string, quarter: string, year: number | string): string {
  const [from, to] = cyclePeriod(quarter, year)
  return `Shell/${(vendorName || '').trim()} SPR – ${from} - ${to}`
}

/** A full title. `prefix` is the part before the pipe, e.g. "Prep Call"; omit for the SPR. */
export function sprTitle(vendorName: string, quarter: string, year: number | string, prefix = ''): string {
  const tail = sprLabel(vendorName, quarter, year)
  const p = (prefix || '').trim()
  return p ? `${p} | ${tail}` : tail
}

const SIGN_SCHEDULING = 'Thank you.<br>Mobility Vendor Pulse Scheduling Agent'

function p(text: string): string {
  return `<p style="font-size:14px;line-height:1.6;margin:0 0 16px 0;">${text}</p>`
}

/**
 * The approved SPR invite body, as HTML.
 *
 * `extraHtml` is appended after the approved paragraphs and before the sign-off — used
 * for the date/time/Teams-link block, which is per-meeting detail rather than approved
 * copy. The approved sentences themselves are never altered by a caller.
 */
export function sprInviteBody(
  attendeeName: string,
  vendorName: string,
  quarter: string,
  year: number | string,
  extraHtml = '',
): string {
  const [from, to] = cyclePeriod(quarter, year)
  return (
    p(`Dear ${attendeeName},`) +
    p(`You are invited to the Shell/${vendorName} SPR, covering the ${from} - ${to} period.`) +
    p(
      'The preceding preparation sessions will be scheduled shortly, and any additional ' +
      'details relevant to this call will be shared by the meeting organiser through a ' +
      'separate email.',
    ) +
    (extraHtml || '') +
    p(SIGN_SCHEDULING)
  )
}
