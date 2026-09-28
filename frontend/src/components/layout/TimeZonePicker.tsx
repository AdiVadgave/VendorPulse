import { useEffect, useMemo, useRef, useState } from 'react'
import { Globe, Check, Search, Loader2 } from 'lucide-react'

import { useCurrentUser } from '@/lib/auth/currentUser'
import {
  allTimeZones,
  browserTimeZone,
  saveDefaultTimeZone,
  timeZoneLabel,
  useDefaultTimeZone,
  utcOffsetLabel,
} from '@/lib/timeZone'
import { cn } from '@/utils/cn'

/**
 * The VMO member's default timezone, in the top bar so it is reachable from anywhere.
 *
 * Saved against the signed-in member and applied to every cycle they schedule — both the
 * times shown and how candidate slots are ranked. A cycle can still override it; this
 * only decides what that per-cycle choice starts on.
 *
 * The list is every zone the browser knows (~400), so it is searchable rather than a
 * plain <select> — scrolling 400 options to find one is not usable.
 */
export default function TimeZonePicker() {
  const user = useCurrentUser()
  const zone = useDefaultTimeZone()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const zones = useMemo(() => allTimeZones(), [])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    // Match on the offset too, so "+05:30" finds every zone on that offset.
    if (!q) return zones
    return zones.filter(
      (z) => z.toLowerCase().includes(q) || utcOffsetLabel(z).toLowerCase().includes(q),
    )
  }, [zones, query])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  async function choose(z: string) {
    setSaving(true)
    setError(null)
    try {
      await saveDefaultTimeZone(user.subtitle, z)
      setOpen(false)
      setQuery('')
    } catch (e) {
      // The local value already changed, so scheduling still uses the new zone this
      // session — say plainly that it will not survive a reload.
      setError(e instanceof Error ? e.message : 'Could not save your default timezone.')
    } finally {
      setSaving(false)
    }
  }

  const offset = utcOffsetLabel(zone)

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={`Your default timezone: ${timeZoneLabel(zone)} — used for every cycle you schedule`}
        aria-label={`Default timezone ${zone}. Click to change.`}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <Globe size={16} />
        <span className="hidden lg:inline text-xs font-medium">{zone}</span>
        {offset && <span className="hidden xl:inline text-[11px] text-slate-400">{offset}</span>}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-80 max-h-96 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
              Default timezone
            </p>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search — city, region or +05:30"
                className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-400/50"
              />
            </div>
            <button
              onClick={() => void choose(browserTimeZone())}
              className="mt-2 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Use this computer&apos;s timezone ({browserTimeZone()})
            </button>
          </div>

          <div className="overflow-y-auto flex-1 py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-xs text-slate-400 text-center">No timezone matches that.</p>
            )}
            {filtered.map((z) => (
              <button
                key={z}
                onClick={() => void choose(z)}
                disabled={saving}
                className={cn(
                  'w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-left hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60',
                  z === zone && 'bg-slate-50 dark:bg-slate-800',
                )}
              >
                <span className="text-slate-700 dark:text-slate-200 truncate">{z}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] text-slate-400">{utcOffsetLabel(z)}</span>
                  {z === zone && <Check size={13} className="text-emerald-600" />}
                </span>
              </button>
            ))}
          </div>

          <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800">
            {error ? (
              <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>
            ) : (
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                {saving && <Loader2 size={11} className="animate-spin" />}
                Applies to every cycle you schedule. Each cycle can still be changed.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
