/**
 * Free SPR period helpers. A cycle's period is a month range stored as two
 * "YYYY-MM" strings (period_start / period_end), replacing the rigid Q1–Q4 model.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const YM = /^\d{4}-(0[1-9]|1[0-2])$/

export function isValidYm(v?: string | null): v is string {
  return !!v && YM.test(v)
}

/** "2026-03" → "Mar 2026". */
export function ymLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return `${MONTHS[Number(m) - 1]} ${y}`
}

interface PeriodLike {
  period_start?: string | null
  period_end?: string | null
  quarter?: string | null
  year?: number | null
}

/**
 * Human label: "Mar 2026 – Sep 2026" (or "Mar 2026" for a single month). Falls back
 * to the legacy "Q1 2026" for cycles that still only have quarter/year.
 */
export function formatPeriod(cycle: PeriodLike | null | undefined): string {
  if (!cycle) return ''
  const { period_start, period_end } = cycle
  if (isValidYm(period_start) && isValidYm(period_end)) {
    const a = ymLabel(period_start)
    const b = ymLabel(period_end)
    return a === b ? a : `${a} – ${b}`
  }
  return `${cycle.quarter ?? ''} ${cycle.year ?? ''}`.trim()
}
