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
 * Escape a value interpolated into one of these HTML bodies.
 *
 * The result is rendered with dangerouslySetInnerHTML (DraftReviewDialog) and is sent
 * as the invite body, so a vendor or attendee name carrying `<`, `&` or a quote would
 * otherwise break the markup — or inject into it. Vendor names are free text typed by
 * a coordinator, so they are not trustworthy input.
 */
function esc(value: string | number): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
    p(`Dear ${esc(attendeeName)},`) +
    p(`You are invited to the Shell/${esc(vendorName)} SPR, covering the ${from} - ${to} period.`) +
    p(
      'The preceding preparation sessions will be scheduled shortly, and any additional ' +
      'details relevant to this call will be shared by the meeting organiser through a ' +
      'separate email.',
    ) +
    (extraHtml || '') +
    p(SIGN_SCHEDULING)
  )
}

const ORGANISER_NOTE =
  'Any additional details relevant to this call will be shared by the meeting ' +
  'organiser through a separate email.'

/**
 * Approved Internal Alignment invite body. Mirrors
 * `app/services/standard_text.py:alignment_invite_body` sentence for sentence.
 *
 * Session 1 carries the extra IMPORTANT line asking reviewers to submit their scores
 * before the meeting; later sessions do not, because by then the scorecard has been
 * collected. The `session === 1` test must match the backend's `n == 1` branch.
 */
export function alignmentInviteBody(
  attendeeName: string,
  vendorName: string,
  quarter: string,
  year: number | string,
  session = 1,
  extraHtml = '',
): string {
  const [from, to] = cyclePeriod(quarter, year)
  const n = Math.max(1, Math.trunc(Number(session) || 1))
  return (
    p(`Dear ${esc(attendeeName)},`) +
    p(
      `You are invited to the Internal Alignment Session ${n} for the Shell/${esc(vendorName)} ` +
      `SPR covering the ${from} - ${to} period.`,
    ) +
    p(ORGANISER_NOTE) +
    (n === 1
      ? p(
          'IMPORTANT: Kindly submit your scores and comments before this meeting by using ' +
          'the link previously shared, even if you cannot attend.',
        )
      : '') +
    (extraHtml || '') +
    p(SIGN_SCHEDULING)
  )
}

/**
 * Approved Vendor Prep ("Prep Call") invite body. Mirrors
 * `app/services/standard_text.py:vendor_prep_invite_body`.
 */
export function vendorPrepInviteBody(
  attendeeName: string,
  vendorName: string,
  quarter: string,
  year: number | string,
  extraHtml = '',
): string {
  const [from, to] = cyclePeriod(quarter, year)
  return (
    p(`Dear ${esc(attendeeName)},`) +
    p(
      `You are invited to the Prep Call for the Shell/${esc(vendorName)} SPR covering the ` +
      `${from} - ${to} period.`,
    ) +
    p('The main objective of this session is to present and discuss the SPR scorecard.') +
    p(ORGANISER_NOTE) +
    (extraHtml || '') +
    p(SIGN_SCHEDULING)
  )
}
