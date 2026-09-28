/**
 * Timezones: the full IANA list, and the signed-in VMO member's default.
 *
 * Replaces the old `'IST' | 'UTC' | 'GMT'` union that was repeated across seven
 * scheduling components. A zone is now an IANA identifier string ("Asia/Kolkata"), so
 * anywhere that needs to convert can hand it straight to `Intl` without a lookup table.
 *
 * The member's default is stored against their user record and applies to every cycle
 * they schedule. A cycle can still override it — the default only pre-fills the choice.
 */
import { useSyncExternalStore } from 'react'

import { apiFetch } from '@/lib/api'

/** An IANA timezone identifier, e.g. "Asia/Kolkata". */
export type TimeZoneId = string

/** Used until the member has chosen one and their preference has loaded. */
export const FALLBACK_TIME_ZONE: TimeZoneId = 'Asia/Kolkata'

/**
 * The three labels the app used before this existed. Cycles scheduled earlier still have
 * them stored in `meeting_time_zone`, so every read has to map them forward. GMT and UTC
 * are the same instant — the old list carried both, and both resolve to UTC here.
 */
const LEGACY_ALIASES: Record<string, TimeZoneId> = {
  IST: 'Asia/Kolkata',
  UTC: 'UTC',
  GMT: 'Europe/London',
}

/** Normalise anything stored or passed around into a usable IANA id. */
export function toTimeZoneId(value: string | null | undefined): TimeZoneId {
  const v = (value ?? '').trim()
  if (!v) return FALLBACK_TIME_ZONE
  return LEGACY_ALIASES[v.toUpperCase()] ?? v
}

/**
 * Every timezone the browser knows. `Intl.supportedValuesOf` is the authoritative list
 * (~400 zones) and is present in every browser this app targets; the small fallback
 * keeps the picker usable on an engine that lacks it rather than rendering empty.
 */
export function allTimeZones(): TimeZoneId[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
  try {
    const list = intl.supportedValuesOf?.('timeZone')
    if (list && list.length) return list
  } catch {
    /* fall through */
  }
  return [
    'UTC', 'Europe/London', 'Europe/Amsterdam', 'Europe/Berlin', 'Europe/Paris',
    'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Dubai',
    'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney',
  ]
}

/** The viewer's own zone, used as the initial suggestion before a default is saved. */
export function browserTimeZone(): TimeZoneId {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIME_ZONE
  } catch {
    return FALLBACK_TIME_ZONE
  }
}

/**
 * Current UTC offset of a zone, as "+05:30". Computed rather than tabulated so it stays
 * correct across DST — the old three-zone list never had to handle a zone that shifts.
 */
export function utcOffsetLabel(zone: TimeZoneId, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'longOffset',
    }).formatToParts(at)
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
    return name.replace('GMT', '').trim() || '+00:00'
  } catch {
    return ''
  }
}

/** "Asia/Kolkata (+05:30)" — what the picker and any zone label should show. */
export function timeZoneLabel(zone: TimeZoneId): string {
  const off = utcOffsetLabel(zone)
  return off ? `${zone} (${off})` : zone
}

/** The wall-clock hour (0-23.99) that a UTC instant falls on in `zone`. */
export function hourInZone(date: Date, zone: TimeZoneId): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(date)
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
    return (h % 24) + m / 60
  } catch {
    return date.getUTCHours() + date.getUTCMinutes() / 60
  }
}

// ── The signed-in member's default ───────────────────────────────────────────
// A tiny external store rather than context: the scheduling helpers in lib/ need to read
// the zone outside React, and every consumer must see the same value the moment it changes.

let currentDefault: TimeZoneId = FALLBACK_TIME_ZONE
let loaded = false
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

/** Read the default outside React (used by the slot-ranking helpers). */
export function getDefaultTimeZone(): TimeZoneId {
  return currentDefault
}

export function setDefaultTimeZoneLocal(zone: TimeZoneId): void {
  const next = toTimeZoneId(zone)
  if (next === currentDefault) return
  currentDefault = next
  emit()
}

/** Load the member's saved default. Falls back to their browser zone when unset. */
export async function loadDefaultTimeZone(email: string | null | undefined): Promise<void> {
  const addr = (email ?? '').trim()
  if (!addr) {
    setDefaultTimeZoneLocal(browserTimeZone())
    loaded = true
    return
  }
  try {
    const res = await apiFetch<{ default_time_zone: string | null }>(
      `/api/users/preferences/${encodeURIComponent(addr)}`,
    )
    setDefaultTimeZoneLocal(res.default_time_zone || browserTimeZone())
  } catch {
    // Never block scheduling on a preference lookup — fall back to the browser zone.
    setDefaultTimeZoneLocal(browserTimeZone())
  } finally {
    loaded = true
  }
}

/** Persist the member's default. Applied locally first so the UI responds immediately. */
export async function saveDefaultTimeZone(email: string | null | undefined, zone: TimeZoneId): Promise<void> {
  setDefaultTimeZoneLocal(zone)
  const addr = (email ?? '').trim()
  if (!addr) return
  await apiFetch(`/api/users/preferences/${encodeURIComponent(addr)}`, {
    method: 'PUT',
    body: JSON.stringify({ default_time_zone: zone }),
  })
}

export function hasLoadedDefaultTimeZone(): boolean {
  return loaded
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** React hook — re-renders when the member changes their default. */
export function useDefaultTimeZone(): TimeZoneId {
  return useSyncExternalStore(subscribe, getDefaultTimeZone, getDefaultTimeZone)
}

/**
 * A zone's UTC offset in minutes at a given instant (+330 for Asia/Kolkata).
 *
 * Computed from `Intl` rather than a lookup table because it must be correct across DST
 * — the old three-zone list (IST/UTC/GMT) never shifted, so a constant table worked;
 * with the full IANA list, half of Europe and North America do.
 */
export function zoneOffsetMinutes(zone: TimeZoneId, at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(at)
    const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0')
    const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'), n('second'))
    return Math.round((asUtc - at.getTime()) / 60000)
  } catch {
    return 0
  }
}

/**
 * A wall-clock string ("2026-03-04T10:00") entered in `zone` -> the real UTC instant.
 *
 * `new Date(wallClock)` would read it in the BROWSER's zone, which is wrong whenever the
 * chosen zone differs. Resolved in two passes: the first offset is looked up at an
 * approximate instant, the second at the corrected one, so a time that falls near a DST
 * transition lands on the right side of it.
 */
export function wallClockToUtc(wallClock: string, zone: TimeZoneId): Date | null {
  if (!wallClock) return null
  const withSeconds = wallClock.length === 16 ? `${wallClock}:00` : wallClock
  const naive = Date.parse(`${withSeconds}Z`)
  if (Number.isNaN(naive)) return null
  let guess = naive - zoneOffsetMinutes(zone, new Date(naive)) * 60000
  guess = naive - zoneOffsetMinutes(zone, new Date(guess)) * 60000
  return new Date(guess)
}
