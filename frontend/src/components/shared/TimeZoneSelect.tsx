import { useMemo } from 'react'

import { allTimeZones, utcOffsetLabel, type TimeZoneId } from '@/lib/timeZone'

interface Props {
  value: TimeZoneId
  onChange: (zone: TimeZoneId) => void
  disabled?: boolean
  className?: string
  id?: string
}

/**
 * Per-cycle timezone override — the full IANA list, grouped by region.
 *
 * The member's default (top bar) decides what this starts on; changing it here affects
 * only this cycle. A native <select> rather than the searchable popover used in the top
 * bar: this sits inline in dense scheduling forms, and typing in a native select already
 * jumps to a match, which is enough for a value that is usually already correct.
 *
 * The current value is added to the option list even if the browser does not report it,
 * so a zone stored by another machine (or a legacy "IST") never renders as blank.
 */
export default function TimeZoneSelect({ value, onChange, disabled, className, id }: Props) {
  const grouped = useMemo(() => {
    const zones = new Set(allTimeZones())
    if (value) zones.add(value)
    const byRegion = new Map<string, TimeZoneId[]>()
    for (const z of [...zones].sort((a, b) => a.localeCompare(b))) {
      const region = z.includes('/') ? z.slice(0, z.indexOf('/')) : 'Other'
      const list = byRegion.get(region)
      if (list) list.push(z)
      else byRegion.set(region, [z])
    }
    return [...byRegion.entries()]
  }, [value])

  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      title={`Timezone: ${value}`}
    >
      {grouped.map(([region, zones]) => (
        <optgroup key={region} label={region}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z} {utcOffsetLabel(z)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
