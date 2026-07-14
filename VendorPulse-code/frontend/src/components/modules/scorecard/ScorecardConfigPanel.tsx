import { useEffect, useMemo, useState } from 'react'
import { SlidersHorizontal, ChevronDown, ChevronRight, Save, RotateCcw, Loader2, CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { ScorecardCatalogTheme, ScorecardConfig } from '@/types/scorecard.types'
import { getScorecardCatalog, getScorecardConfig, saveScorecardConfig } from '@/lib/scorecardApi'

interface Props {
  cycleId: string
  /** Called after a successful save with the new effective config. */
  onSaved?: (config: ScorecardConfig) => void
  /** Warn (non-blocking) that the scorecard has already been dispatched. */
  dispatched?: boolean
}

/**
 * VMO configuration step (before dispatch): choose which measures to include in
 * this SPR's scorecard and set the per-theme weightage. Fully catalog-driven —
 * no hardcoded structure. RAG measures are tagged and carry no weight.
 */
export default function ScorecardConfigPanel({ cycleId, onSaved, dispatched = false }: Props) {
  const [open, setOpen] = useState(false)
  const [catalog, setCatalog] = useState<ScorecardCatalogTheme[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [configured, setConfigured] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load the catalog + the cycle's current effective config.
  useEffect(() => {
    let mounted = true
    Promise.all([getScorecardCatalog(), getScorecardConfig(cycleId)])
      .then(([cat, cfg]) => {
        if (!mounted) return
        setCatalog(cat)
        const sel = new Set<string>()
        const w: Record<string, number> = {}
        for (const theme of cfg.categories) {
          w[theme.key] = theme.weight
          for (const m of theme.measures) sel.add(m.key)
        }
        // Pre-fill weights for themes not in the config with catalog defaults.
        for (const theme of cat) if (!(theme.key in w)) w[theme.key] = theme.default_weight
        setSelected(sel)
        setWeights(w)
        setConfigured(cfg.configured)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the scorecard catalog'))
      .finally(() => mounted && setLoading(false))
    return () => { mounted = false }
  }, [cycleId])

  function toggleMeasure(key: string) {
    setSavedAt(null)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleTheme(theme: ScorecardCatalogTheme, include: boolean) {
    setSavedAt(null)
    setSelected((prev) => {
      const next = new Set(prev)
      theme.measures.forEach((m) => (include ? next.add(m.key) : next.delete(m.key)))
      return next
    })
  }

  function setWeight(themeKey: string, raw: string) {
    setSavedAt(null)
    const n = raw.trim() === '' ? 0 : Number(raw)
    if (Number.isNaN(n)) return
    setWeights((w) => ({ ...w, [themeKey]: Math.max(0, Math.min(100, Math.round(n))) }))
  }

  // Included themes = catalog themes with ≥1 selected measure.
  const included = useMemo(
    () => catalog.filter((t) => t.measures.some((m) => selected.has(m.key))),
    [catalog, selected]
  )
  const totalWeight = included.reduce((sum, t) => sum + (weights[t.key] ?? 0), 0)
  const numericCount = useMemo(
    () => included.reduce((n, t) => n + t.measures.filter((m) => selected.has(m.key) && m.measure_type !== 'rag').length, 0),
    [included, selected]
  )

  const weightOk = totalWeight === 100 && included.every((t) => (weights[t.key] ?? 0) > 0)
  const hasSelection = selected.size > 0
  const canSave = hasSelection && weightOk && !saving && !loading

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const w: Record<string, number> = {}
      for (const t of included) w[t.key] = weights[t.key] ?? 0
      const cfg = await saveScorecardConfig(cycleId, {
        selected_measure_keys: Array.from(selected),
        weights: w,
      })
      setConfigured(true)
      setSavedAt(new Date().toISOString())
      onSaved?.(cfg)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save the scorecard configuration')
    } finally {
      setSaving(false)
    }
  }

  function resetToCurrent() {
    // Re-load from the server (discards unsaved edits).
    setLoading(true)
    setSavedAt(null)
    setError(null)
    getScorecardConfig(cycleId)
      .then((cfg) => {
        const sel = new Set<string>()
        const w: Record<string, number> = { ...weights }
        for (const theme of cfg.categories) {
          w[theme.key] = theme.weight
          for (const m of theme.measures) sel.add(m.key)
        }
        setSelected(sel)
        setWeights(w)
      })
      .finally(() => setLoading(false))
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center shrink-0">
            <SlidersHorizontal size={18} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="min-w-0 text-left">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              Configure Scorecard
              {configured
                ? <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Configured</span>
                : <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">Default</span>}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {included.length} theme{included.length !== 1 ? 's' : ''} · {selected.size} measure{selected.size !== 1 ? 's' : ''} · choose measures &amp; per-theme weightage before dispatch
            </p>
          </div>
        </div>
        {open ? <ChevronDown size={16} className="text-slate-400 shrink-0" /> : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-slate-100 dark:border-slate-800 pt-4">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="animate-spin text-indigo-500" size={20} /></div>
          ) : (
            <>
              {dispatched && (
                <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  Scorecards have already been dispatched. Changing the configuration now affects reviewers who haven&apos;t submitted yet — avoid changes unless necessary.
                </div>
              )}

              <div className="space-y-3">
                {catalog.map((theme) => {
                  const themeMeasures = theme.measures
                  const themeSelected = themeMeasures.filter((m) => selected.has(m.key))
                  const isIncluded = themeSelected.length > 0
                  const allOn = themeSelected.length === themeMeasures.length
                  return (
                    <div key={theme.key} className={cn('rounded-lg border p-3', isIncluded ? 'border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-900/10' : 'border-slate-200 dark:border-slate-800')}>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allOn}
                            ref={(el) => { if (el) el.indeterminate = isIncluded && !allOn }}
                            onChange={(e) => toggleTheme(theme, e.target.checked)}
                            className="rounded border-slate-300"
                          />
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{theme.label}</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-400">Weight</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={isIncluded ? (weights[theme.key] ?? 0) : ''}
                            disabled={!isIncluded}
                            onChange={(e) => setWeight(theme.key, e.target.value)}
                            placeholder="—"
                            className="w-16 px-2 py-1 text-center text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <span className="text-[11px] text-slate-400">%</span>
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 pl-6">
                        {themeMeasures.map((m) => (
                          <label key={m.key} className="flex items-center gap-2 py-0.5 cursor-pointer">
                            <input type="checkbox" checked={selected.has(m.key)} onChange={() => toggleMeasure(m.key)} className="rounded border-slate-300" />
                            <span className="text-xs text-slate-600 dark:text-slate-400">{m.label}</span>
                            {m.measure_type === 'rag' && (
                              <span className="text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" title="Colour-coded Red/Amber/Green — not included in the score">
                                RAG
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Weight summary */}
              <div className="mt-3 flex items-center gap-2 text-xs">
                <Info size={13} className="text-slate-400" />
                <span className="text-slate-500 dark:text-slate-400">
                  {numericCount} scored measure{numericCount !== 1 ? 's' : ''} · included theme weights total
                </span>
                <span className={cn('font-semibold', totalWeight === 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                  {totalWeight}%
                </span>
                {totalWeight !== 100 && <span className="text-red-500">(must be 100%)</span>}
              </div>

              {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}
              {!hasSelection && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Select at least one measure.</p>}

              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={resetToCurrent}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
                >
                  <RotateCcw size={13} /> Discard changes
                </button>
                {savedAt && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={13} /> Saved
                  </span>
                )}
                <button
                  onClick={handleSave}
                  disabled={!canSave}
                  className={cn(
                    'ml-auto flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg text-white',
                    canSave ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed'
                  )}
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  Save Configuration
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
