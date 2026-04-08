import { CheckCircle2, XCircle, Users, Trophy, CalendarCheck } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { SlotProposal } from '@/types/scheduling.types'

interface SlotCardProps {
  slot: SlotProposal
  rank: number
  onApprove: (slotId: string) => void
  isProcessing?: boolean
  timeZoneView?: 'IST' | 'UTC' | 'GMT'
}

const RANK_CONFIG = [
  {
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800/60',
    ring: 'ring-2 ring-amber-300/50 dark:ring-amber-800/50',
    label: 'Top Recommendation',
    icon: <Trophy size={12} />,
  },
  {
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    border: 'border-slate-200 dark:border-slate-800',
    ring: '',
    label: '2nd Choice',
    icon: null,
  },
  {
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    border: 'border-slate-200 dark:border-slate-800',
    ring: '',
    label: '3rd Choice',
    icon: null,
  },
]

export default function SlotCard({
  slot,
  rank,
  onApprove,
  isProcessing = false,
  timeZoneView = 'IST',
}: SlotCardProps) {
  const cfg = RANK_CONFIG[rank - 1] ?? RANK_CONFIG[2]
  const dateObj = new Date(slot.proposed_time)
  const durationMinutes = Number((slot as unknown as { duration_minutes?: number }).duration_minutes ?? 60)
  const durationMs = durationMinutes * 60 * 1000
  const endObj = new Date(dateObj.getTime() + durationMs)

  const timeZoneMap: Record<'IST' | 'UTC' | 'GMT', string> = {
    IST: 'Asia/Kolkata',
    UTC: 'UTC',
    GMT: 'Etc/GMT',
  }

  const zone = timeZoneMap[timeZoneView]

  function formatDateInZone(date: Date): string {
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: zone,
    })
  }

  function formatTimeInZone(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: zone,
    })
  }

  const attendancePct = Math.round(
    (slot.attendance_count / slot.total_attendees) * 100
  )

  return (
    <div
      className={cn(
        'bg-white dark:bg-slate-900 border rounded-xl p-5 transition-all',
        cfg.border,
        cfg.ring
      )}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex flex-col items-center justify-center shrink-0">
            <CalendarCheck size={18} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">
              {formatDateInZone(dateObj)}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {formatTimeInZone(dateObj)} - {formatTimeInZone(endObj)} {timeZoneView}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
              cfg.badge
            )}
          >
            {cfg.icon}
            #{rank} - {cfg.label}
          </span>
        </div>
      </div>

      {/* Score bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Rank score
          </span>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {slot.rank_score}
            <span className="text-xs font-normal text-slate-400">/100</span>
          </span>
        </div>
        <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full',
              slot.rank_score >= 85
                ? 'bg-emerald-500'
                : slot.rank_score >= 70
                  ? 'bg-indigo-500'
                  : 'bg-amber-500'
            )}
            style={{ width: `${slot.rank_score}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5 text-center">
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {slot.attendance_count}
            <span className="text-xs text-slate-400">/{slot.total_attendees}</span>
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Attending</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5 text-center">
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {attendancePct}%
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Coverage</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5 text-center">
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {slot.conflict_count}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Conflicts</p>
        </div>
      </div>

      {/* Key attendees */}
      <div className="flex items-center gap-3 mb-4 text-xs">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 size={13} className="text-emerald-500" />
          <span className="text-slate-600 dark:text-slate-400">Organiser available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 size={13} className="text-emerald-500" />
          <span className="text-slate-600 dark:text-slate-400">Exec Sponsor available</span>
        </div>
      </div>

      {/* Attending + conflicts */}
      <div className="space-y-2 mb-4">
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Users size={12} className="text-slate-400" />
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Attending
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {slot.attending.map((name) => (
              <span
                key={name}
                className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded text-xs"
              >
                {name}
              </span>
            ))}
          </div>
        </div>

        {slot.conflicts.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <XCircle size={12} className="text-slate-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Conflicts
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {slot.conflicts.map((name) => (
                <span
                  key={name}
                  className="px-2 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded text-xs"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Approve button */}
      <button
        onClick={() => onApprove(slot.slot_id)}
        disabled={isProcessing}
        className={cn(
          'w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors',
          isProcessing && 'opacity-60 cursor-not-allowed'
        )}
      >
        <CalendarCheck size={14} />
        Approve This Slot
      </button>
    </div>
  )
}
