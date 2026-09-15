import { CalendarRange } from 'lucide-react'
import { formatMeetingTime } from '@/utils/formatMeetingTime'

export interface ReferenceDate {
  /** Short label for what this date is, e.g. "SPR meeting". */
  label: string
  iso?: string | null
  timeZone?: string | null
  durationMinutes?: number | null
}

/**
 * A compact "for reference" banner shown while scheduling a prep meeting, listing
 * the already-fixed dates the coordinator should schedule around (e.g. the SPR
 * date when picking the Alignment slot; the Alignment + SPR dates when picking the
 * Vendor Prep slot). Entries with no valid date are dropped; if none remain the
 * banner renders nothing.
 */
export default function MeetingReferenceBanner({
  dates,
  note,
}: {
  dates: ReferenceDate[]
  /** Optional hint line under the dates, e.g. "Schedule this call before the SPR." */
  note?: string
}) {
  const rows = dates
    .map((d) => ({ label: d.label, text: formatMeetingTime(d.iso, d.timeZone ?? 'IST', d.durationMinutes) }))
    .filter((r): r is { label: string; text: string } => !!r.text)

  if (rows.length === 0) return null

  return (
    <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <CalendarRange size={13} className="text-sky-600 dark:text-sky-400 shrink-0" />
        <span className="text-xs font-semibold text-sky-700 dark:text-sky-300 uppercase tracking-wide">
          For reference
        </span>
      </div>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="text-xs text-sky-800 dark:text-sky-200 flex flex-wrap gap-x-1.5">
            <span className="font-medium">{r.label}:</span>
            <span>{r.text}</span>
          </li>
        ))}
      </ul>
      {note && <p className="text-[11px] text-sky-600 dark:text-sky-400 mt-1.5 italic">{note}</p>}
    </div>
  )
}
