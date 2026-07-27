import { Fragment, useEffect, useMemo, useState } from 'react'
import { SlidersHorizontal, ChevronDown, ChevronRight, Save, RotateCcw, Loader2, CheckCircle2, AlertTriangle, Info, Lock, Users } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { ScorecardCatalogTheme, ScorecardConfig } from '@/types/scorecard.types'
import type { CycleAttendee } from '@/types/scheduling.types'
import { getScorecardCatalog, getScorecardConfig, saveScorecardConfig } from '@/lib/scorecardApi'

interface Props {
  cycleId: string
  /** Called after a successful save with the new effective config. */
  onSaved?: (config: ScorecardConfig) => void
  /** Once dispatched the config is locked (read-only) — reviewers are filling it. */
  dispatched?: boolean
  /** Cycle attendees — internal stakeholders define the teams a measure can target. */
  attendees?: CycleAttendee[]
}

/** A team is identified the same way the backend derives a submission's team. */
function teamOf(a: CycleAttendee): string {
  return a.shell_department || a.name
}

// Shell-red accented checkboxes (accent-color paints the tick/fill red).
const CB = 'w-4 h-4 rounded border-slate-300 accent-[#dd1d21] focus:ring-2 focus:ring-red-400/50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
const CB_LG = 'w-5 h-5 rounded border-slate-300 accent-[#dd1d21] focus:ring-2 focus:ring-red-400/50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer'

/**
 * VMO configuration step (before dispatch): choose which measures to include in
 * this SPR's scorecard and set the per-theme weightage. Fully catalog-driven —
 * no hardcoded structure. RAG measures are tagged and carry no weight.
 */
export default function ScorecardConfigPanel({ cycleId, onSaved, dispatched = false, attendees = [] }: Props) {
  const [open, setOpen] = useState(false)
  const [catalog, setCatalog] = useState<ScorecardCatalogTheme[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [weights, setWeights] = useState<Record<string, number>>({})
  // measure_key -> teams asked to score it. No entry = all teams (everyone);
  // an explicit (possibly empty) Set = exactly those teams ([] = nobody).
  const [measureTeams, setMeasureTeams] = useState<Record<string, Set<string>>>({})
  const [configured, setConfigured] = useState(false)

  const locked = dispatched  // config is read-only once the scorecard is sent
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Teams available to assign = distinct teams among internal (non-vendor) attendees.
  const teams = useMemo(() => {
    const set = new Set<string>()
    for (const a of attendees) if (a.type !== 'Vendor') set.add(teamOf(a))
    return [...set].sort((x, y) => x.localeCompare(y))
  }, [attendees])

  // Load the catalog + the cycle's current effective config.
  useEffect(() => {
    let mounted = true
    Promise.all([getScorecardCatalog(), getScorecardConfig(cycleId)])
      .then(([cat, cfg]) => {
        if (!mounted) return
        setCatalog(cat)
        const sel = new Set<string>()
        const w: Record<string, number> = {}
        const mt: Record<string, Set<string>> = {}
        for (const theme of cfg.categories) {
          w[theme.key] = theme.weight
          for (const m of theme.measures) {
            sel.add(m.key)
            // Only hydrate explicit assignments; measures without a `teams` list
            // stay unrestricted (default all teams) until the VMO edits them.
            if (Array.isArray(m.teams)) mt[m.key] = new Set(m.teams)
          }
        }
        // Pre-fill weights for themes not in the config with catalog defaults.
        for (const theme of cat) if (!(theme.key in w)) w[theme.key] = theme.default_weight
        setSelected(sel)
        setWeights(w)
        setMeasureTeams(mt)
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
    // Drop stale team assignment when a measure is removed.
    setMeasureTeams((prev) => {
      if (!(key in prev) || selected.has(key) === false) return prev
      const next = { ...prev }
      delete next[key]
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
    if (!include) {
      setMeasureTeams((prev) => {
        const next = { ...prev }
        theme.measures.forEach((m) => delete next[m.key])
        return next
      })
    }
  }

  // Teams currently asked a measure: an explicit set, else all teams (default).
  function teamsForMeasure(key: string): Set<string> {
    return measureTeams[key] ?? new Set(teams)
  }

  function toggleMeasureTeam(measureKey: string, team: string) {
    setSavedAt(null)
    setMeasureTeams((prev) => {
      // First edit of an unrestricted measure starts from "all teams", then toggles.
      const current = prev[measureKey] ? new Set(prev[measureKey]) : new Set(teams)
      if (current.has(team)) current.delete(team)
      else current.add(team)
      return { ...prev, [measureKey]: current }
    })
  }

  // Column header toggle: add/remove one team across ALL selected measures at once.
  function toggleTeamColumn(team: string) {
    setSavedAt(null)
    const sel = [...selected]
    const allOn = sel.length > 0 && sel.every((k) => teamsForMeasure(k).has(team))
    setMeasureTeams((prev) => {
      const next = { ...prev }
      for (const k of sel) {
        const cur = new Set(prev[k] ?? teams)
        if (allOn) cur.delete(team)
        else cur.add(team)
        next[k] = cur
      }
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
  // Selected numeric/RAG measures that currently target no team → nobody is asked them.
  const emptyTeamMeasures = useMemo(
    () => [...selected].filter((k) => teamsForMeasure(k).size === 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, measureTeams, teams]
  )
  const canSave = hasSelection && weightOk && !saving && !loading && !locked

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const w: Record<string, number> = {}
      for (const t of included) w[t.key] = weights[t.key] ?? 0
      // Persist an explicit team list for every selected measure ([] = nobody).
      const mt: Record<string, string[]> = {}
      for (const key of selected) mt[key] = Array.from(teamsForMeasure(key))
      const cfg = await saveScorecardConfig(cycleId, {
        selected_measure_keys: Array.from(selected),
        weights: w,
        measure_teams: mt,
      })
      setConfigured(true)
      setSavedAt(new Date().toISOString())
      onSaved?.(cfg)
      setOpen(false)  // collapse the config panel once saved
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
        const mt: Record<string, Set<string>> = {}
        for (const theme of cfg.categories) {
          w[theme.key] = theme.weight
          for (const m of theme.measures) {
            sel.add(m.key)
            if (Array.isArray(m.teams)) mt[m.key] = new Set(m.teams)
          }
        }
        setSelected(sel)
        setWeights(w)
        setMeasureTeams(mt)
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
          <span className="text-slate-400 dark:text-slate-500 shrink-0">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
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
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-slate-100 dark:border-slate-800 pt-4">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="animate-spin text-indigo-500" size={20} /></div>
          ) : (
            <>
              {locked && (
                <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
                  <Lock size={14} className="mt-0.5 shrink-0" />
                  <span><strong>Configuration locked.</strong> The scorecard has been dispatched, so measures, weights and team assignments can no longer be changed.</span>
                </div>
              )}

              {teams.length === 0 && (
                <div className="mb-3 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  <Users size={13} className="shrink-0" />
                  Add internal stakeholders in the Attendees step to assign measures to teams.
                </div>
              )}

              {/* Matrix: measures (rows, grouped by theme) × teams (columns). Each cell
                  is a red checkbox — is this team asked to score this measure? */}
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                      <th className="text-left px-4 py-3 text-sm font-semibold sticky left-0 z-10 bg-slate-100 dark:bg-slate-800 min-w-[16rem]">
                        Theme / Measure
                      </th>
                      {teams.map((t) => {
                        const sel = [...selected]
                        const on = sel.length > 0 && sel.every((k) => teamsForMeasure(k).has(t))
                        const some = sel.some((k) => teamsForMeasure(k).has(t))
                        return (
                          <th key={t} className="px-4 py-3 text-center whitespace-nowrap border-l border-slate-200 dark:border-slate-700">
                            <label className={cn('flex flex-col items-center gap-1.5', locked || sel.length === 0 ? 'cursor-not-allowed' : 'cursor-pointer')} title={`Toggle ${t} for every selected measure`}>
                              <span className="text-sm font-semibold">{t}</span>
                              <input
                                type="checkbox"
                                checked={on}
                                ref={(el) => { if (el) el.indeterminate = some && !on }}
                                disabled={locked || sel.length === 0}
                                onChange={() => toggleTeamColumn(t)}
                                className={CB}
                              />
                            </label>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.map((theme) => {
                      const themeMeasures = theme.measures
                      const themeSelected = themeMeasures.filter((m) => selected.has(m.key))
                      const isIncluded = themeSelected.length > 0
                      const allOn = themeSelected.length === themeMeasures.length
                      return (
                        <Fragment key={theme.key}>
                          {/* Theme band: include-all toggle + per-theme weight */}
                          <tr className="bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
                            <td colSpan={1 + teams.length} className="px-4 py-2.5">
                              <div className="flex items-center justify-between gap-3">
                                <label className={cn('flex items-center gap-2.5', locked ? 'cursor-not-allowed' : 'cursor-pointer')}>
                                  <input
                                    type="checkbox"
                                    checked={allOn}
                                    disabled={locked}
                                    ref={(el) => { if (el) el.indeterminate = isIncluded && !allOn }}
                                    onChange={(e) => toggleTheme(theme, e.target.checked)}
                                    className={CB}
                                  />
                                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">{theme.label}</span>
                                </label>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-xs text-slate-500 dark:text-slate-400">Weight</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={isIncluded ? (weights[theme.key] ?? 0) : ''}
                                    disabled={!isIncluded || locked}
                                    onChange={(e) => setWeight(theme.key, e.target.value)}
                                    placeholder="—"
                                    className="w-16 px-2 py-1 text-center text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-red-400"
                                  />
                                  <span className="text-xs text-slate-500 dark:text-slate-400">%</span>
                                </div>
                              </div>
                            </td>
                          </tr>
                          {/* Measure rows */}
                          {themeMeasures.map((m) => {
                            const isSel = selected.has(m.key)
                            const mTeams = teamsForMeasure(m.key)
                            const noneAssigned = isSel && teams.length > 0 && mTeams.size === 0
                            return (
                              <tr key={m.key} className={cn('border-t border-slate-100 dark:border-slate-800 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/20', !isSel && 'opacity-50')}>
                                {/* Measure name + include checkbox (sticky first column) */}
                                <td className="px-4 py-2.5 sticky left-0 z-10 bg-white dark:bg-slate-900">
                                  <label className={cn('flex items-center gap-2.5 pl-6', locked ? 'cursor-not-allowed' : 'cursor-pointer')}>
                                    <input type="checkbox" checked={isSel} disabled={locked} onChange={() => toggleMeasure(m.key)} className={CB} />
                                    <span className="text-sm text-slate-700 dark:text-slate-300">{m.label}</span>
                                    {m.measure_type === 'rag' && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" title="Colour-coded Red/Amber/Green — not included in the score">
                                        RAG
                                      </span>
                                    )}
                                    {noneAssigned && (
                                      <span title="No team selected — no one will be asked this measure">
                                        <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                                      </span>
                                    )}
                                  </label>
                                </td>
                                {/* One checkbox per team */}
                                {teams.map((t) => (
                                  <td key={t} className="px-4 py-2.5 text-center border-l border-slate-100 dark:border-slate-800">
                                    <input
                                      type="checkbox"
                                      checked={isSel && mTeams.has(t)}
                                      disabled={!isSel || locked}
                                      onChange={() => toggleMeasureTeam(m.key, t)}
                                      title={isSel ? `${t}: ${mTeams.has(t) ? 'asked' : 'not asked'} this measure` : 'Include the measure first'}
                                      className={CB_LG}
                                    />
                                  </td>
                                ))}
                              </tr>
                            )
                          })}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2.5 text-xs text-slate-400 dark:text-slate-500">
                Tick a measure to include it — every team is asked by default. Untick a team's cell to exclude it, or use a column header to toggle that team across all measures. A selected measure with no team ticked is asked to no one.
              </p>

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
              {emptyTeamMeasures.length > 0 && !locked && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  {emptyTeamMeasures.length} selected measure{emptyTeamMeasures.length !== 1 ? 's have' : ' has'} no team assigned — no one will be asked to score {emptyTeamMeasures.length !== 1 ? 'them' : 'it'}.
                </p>
              )}

              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={resetToCurrent}
                  disabled={saving || locked}
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
