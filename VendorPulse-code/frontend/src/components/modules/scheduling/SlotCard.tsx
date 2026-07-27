import { CheckCircle2, XCircle, Users, Trophy, CalendarCheck, Clock, Key, Star } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { SlotProposal } from '@/types/scheduling.types'
import { SCHEDULING_CONFIG } from '@/config/scheduling.config'

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
    label: '1st Choice',
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

const ORDINAL_SUFFIXES = ['th', 'st', 'nd', 'rd']
function ordinalLabel(n: number): string {
  const v = n % 100
  const suffix =
    v >= 11 && v <= 13
      ? 'th'
      : ORDINAL_SUFFIXES[n % 10] ?? 'th'
  return `${n}${suffix} Choice`
}

const FALLBACK_RANK_CFG = {
  badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  border: 'border-slate-200 dark:border-slate-800',
  ring: '',
  icon: null,
}

export default function SlotCard({
  slot,
  rank,
  onApprove,
  isProcessing = false,
  timeZoneView = 'IST',
}: SlotCardProps) {
  const baseCfg = RANK_CONFIG[rank - 1] ?? FALLBACK_RANK_CFG
  const cfg = {
    ...baseCfg,
    label: RANK_CONFIG[rank - 1] ? baseCfg.label : ordinalLabel(rank),
  }
  const dateObj = new Date(slot.proposed_time)
  const durationMinutes = Number((slot as unknown as { duration_minutes?: number }).duration_minutes ?? SCHEDULING_CONFIG.DEFAULT_DURATION_MINUTES)
  const durationMs = durationMinutes * 60 * 1000
  const endObj = new Date(dateObj.getTime() + durationMs)

  const timeZoneMap: Record<'IST' | 'UTC' | 'GMT', string> = {
    IST: 'Asia/Kolkata',
    UTC: 'UTC',
    GMT: 'Europe/London',
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

  const freeCount = slot.attending.length
  const tentativeCount = slot.tentative?.length ?? 0

  return (
    <div
      className={cn(
        'bg-white dark:bg-slate-900 border rounded-xl p-5 transition-all h-full flex flex-col',
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
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Displayed in {timeZoneView} (converted from Graph UTC values)
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
              slot.rank_score >= SCHEDULING_CONFIG.SCORE_HIGH_THRESHOLD
                ? 'bg-emerald-500'
                : slot.rank_score >= SCHEDULING_CONFIG.SCORE_MEDIUM_THRESHOLD
                  ? 'bg-indigo-500'
                  : 'bg-amber-500'
            )}
            style={{ width: `${slot.rank_score}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5 text-center">
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {freeCount}
            <span className="text-xs font-normal text-slate-400">/{slot.total_attendees}</span>
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Free</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5 text-center">
          <p
            className={cn(
              'text-lg font-bold',
              tentativeCount > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-900 dark:text-white'
            )}
          >
            {tentativeCount}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Tentative</p>
        </div>
      </div>

      {/* Key attendees */}
      <div className="flex items-center gap-3 mb-3 text-xs">
        <div className="flex items-center gap-1.5">
          {slot.organiser_available
            ? <CheckCircle2 size={13} className="text-emerald-500" />
            : <XCircle size={13} className="text-red-500" />}
          <span className="text-slate-600 dark:text-slate-400">Organiser available</span>
        </div>
        <div className="flex items-center gap-1.5">
          {slot.exec_sponsor_available
            ? <CheckCircle2 size={13} className="text-emerald-500" />
            : <XCircle size={13} className="text-red-500" />}
          <span className="text-slate-600 dark:text-slate-400">Exec Sponsor available</span>
        </div>
      </div>

      {/* Key-stakeholder & leadership coverage (what the ranking weights most) */}
      {((slot.key_total ?? 0) > 0 || (slot.lt_total ?? 0) > 0) && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {(slot.key_total ?? 0) > 0 && (
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                (slot.key_free ?? 0) === slot.key_total
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
              )}
              title="Key stakeholders free at this time"
            >
              <Key size={11} /> Key {slot.key_free ?? 0}/{slot.key_total} free
            </span>
          )}
          {(slot.lt_total ?? 0) > 0 && (
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                (slot.lt_free ?? 0) === slot.lt_total
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
              )}
              title="Leadership (LT) members free at this time"
            >
              <Star size={11} /> LT {slot.lt_free ?? 0}/{slot.lt_total} free
            </span>
          )}
        </div>
      )}

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

        {(slot.tentative?.length ?? 0) > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Clock size={12} className="text-slate-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Tentative
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {slot.tentative!.map((name) => (
                <span
                  key={name}
                  className="px-2 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded text-xs"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

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
          'mt-auto w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors',
          isProcessing && 'opacity-60 cursor-not-allowed'
        )}
      >
        <CalendarCheck size={14} />
        Approve This Slot
      </button>
    </div>
  )
}
