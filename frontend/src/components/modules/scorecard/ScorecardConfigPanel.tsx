import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { SlidersHorizontal, ChevronDown, ChevronRight, Save, RotateCcw, Loader2, CheckCircle2, AlertTriangle, Info, Lock, Users } from 'lucide-react'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { cn } from '@/utils/cn'
import type { ScorecardCatalogTheme, ScorecardConfig } from '@/types/scorecard.types'
import type { CycleAttendee } from '@/types/scheduling.types'
import { getScorecardCatalog, getScorecardConfig, saveScorecardConfig, reopenScorecardTeam, setTeamMeasures } from '@/lib/scorecardApi'

interface Props {
  cycleId: string
  /** Called after a successful save with the new effective config. */
  onSaved?: (config: ScorecardConfig) => void
  /** Once dispatched the config is locked (read-only) — reviewers are filling it.
   *  Individual teams can still be reopened (see dispatchedEmails). */
  dispatched?: boolean
  /** Cycle attendees — internal stakeholders define the teams a measure can target. */
  attendees?: CycleAttendee[]
  /** Emails the scorecard has already been sent to. A team with NO reviewer here is
   *  still "open" (new or reopened) — its column stays editable even after dispatch. */
  dispatchedEmails?: string[]
  /** Fired after a team is reopened, so the parent can refresh the cycle (dispatch set). */
  onReopened?: () => void
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
export default function ScorecardConfigPanel({ cycleId, onSaved, dispatched = false, attendees = [], dispatchedEmails = [], onReopened }: Props) {
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

  // Teams available to assign = distinct teams among KEY internal (non-vendor)
  // attendees. Only key internal stakeholders are ever sent a scorecard, so a team
  // without one could never appear in the dispatched set — it would stay "open"
  // (and editable) forever and be written into every measure's team list.
  const teams = useMemo(() => {
    const set = new Set<string>()
    for (const a of attendees) if (a.type !== 'Vendor' && a.is_key) set.add(teamOf(a))
    return [...set].sort((x, y) => x.localeCompare(y))
  }, [attendees])

  // Per-team "settled" state: a team whose reviewer was already sent the scorecard.
  // Its column is locked (they're filling the sent config); other teams (new, or
  // reopened) stay editable even after dispatch. Teams reopened in this session are
  // treated as editable immediately, without waiting for the parent to refetch.
  const [reopenedTeams, setReopenedTeams] = useState<Set<string>>(new Set())
  const [reopeningTeam, setReopeningTeam] = useState<string | null>(null)
  // Reopen discards that team's submitted scores irreversibly, and its trigger sits in a
  // dense column header next to a checkbox — confirm before acting on a stray click.
  const [confirmReopen, setConfirmReopen] = useState<string | null>(null)
  const dispatchedSet = useMemo(
    () => new Set(dispatchedEmails.map((e) => (e || '').trim().toLowerCase())),
    [dispatchedEmails]
  )
  const sentTeams = useMemo(() => {
    const set = new Set<string>()
    for (const a of attendees) {
      if (a.type === 'Vendor') continue
      const email = (a.email || '').trim().toLowerCase()
      if (email && dispatchedSet.has(email)) set.add(teamOf(a))
    }
    return set
  }, [attendees, dispatchedSet])
  // Editable pre-dispatch (everything), or post-dispatch for teams not yet sent /
  // freshly reopened.
  const isTeamEditable = (t: string) => !dispatched || !sentTeams.has(t) || reopenedTeams.has(t)
  const isTeamSettled = (t: string) => dispatched && sentTeams.has(t) && !reopenedTeams.has(t)
  const editableTeams = useMemo(() => teams.filter(isTeamEditable), [teams, sentTeams, reopenedTeams, dispatched])
  // Columns to RENDER. A team that was already sent the scorecard keeps its column even
  // if its key attendee has since been un-keyed (so it drops out of `teams`) — otherwise
  // its Reopen button disappears and its submissions can never be discarded. Save logic
  // still uses `teams`/`editableTeams`; this is presentation only.
  const columnTeams = useMemo(
    () => [...new Set([...teams, ...sentTeams])].sort((x, y) => x.localeCompare(y)),
    [teams, sentTeams]
  )

  // The optimistic reopen flag only has to cover the parent's refetch window. Once a
  // refreshed dispatch set shows a reopened team was sent again, drop the flag so its
  // column locks again and it leaves editableTeams — saving it would 409 and abort.
  const prevSentTeams = useRef(sentTeams)
  useEffect(() => {
    const prev = prevSentTeams.current
    prevSentTeams.current = sentTeams
    setReopenedTeams((cur) => {
      if (cur.size === 0) return cur
      // Keep a team while it is still unsent, or while it was already sent before this
      // change (the refetch has not landed yet) — drop it on an unsent → sent flip.
      const next = new Set([...cur].filter((t) => !sentTeams.has(t) || prev.has(t)))
      return next.size === cur.size ? cur : next
    })
  }, [sentTeams])

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
  // Deliberately NOT unioning off-roster teams in here. That would tick a newcomer onto
  // a measure the VMO scoped to one team, and the next save would persist it — silently
  // widening a restriction. A newcomer asked nothing is instead surfaced by
  // `emptyEditableTeams` (which blocks the save) and rescued server-side only when the
  // strict rule would leave them with no measures at all.
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
  // A theme whose SELECTED measures are all RAG is status-only: RAG is never averaged, so
  // the server coerces its weight to 0 and excludes it from the 100% rule. The panel must
  // apply the same rule — otherwise it shows a satisfied 100% that the server rejects with
  // a 400 the VMO cannot reconcile with what is on screen.
  const isScoredTheme = (t: ScorecardCatalogTheme) =>
    t.measures.some((m) => selected.has(m.key) && m.measure_type !== 'rag')
  const scoredThemes = useMemo(() => included.filter(isScoredTheme), [included, selected])
  const statusOnlyThemes = useMemo(() => included.filter((t) => !isScoredTheme(t)), [included, selected])
  const totalWeight = scoredThemes.reduce((sum, t) => sum + (weights[t.key] ?? 0), 0)
  const numericCount = useMemo(
    () => included.reduce((n, t) => n + t.measures.filter((m) => selected.has(m.key) && m.measure_type !== 'rag').length, 0),
    [included, selected]
  )

  const weightOk =
    scoredThemes.length > 0 && totalWeight === 100 && scoredThemes.every((t) => (weights[t.key] ?? 0) > 0)
  const hasSelection = selected.size > 0
  // Selected numeric/RAG measures that currently target no team → nobody is asked them.
  const emptyTeamMeasures = useMemo(
    () => [...selected].filter((k) => teamsForMeasure(k).size === 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, measureTeams, teams]
  )
  // Open teams asked nothing — they drop out of the dispatch recipient list, so their
  // reviewer would silently never be sent a scorecard.
  const emptyEditableTeams = useMemo(
    () => editableTeams.filter((t) => ![...selected].some((k) => teamsForMeasure(k).has(t))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editableTeams, selected, measureTeams, teams]
  )
  // Pre-dispatch: normal full save (needs valid weights). Post-dispatch: save is
  // team-scoped — only the open/reopened teams' columns, so it's allowed as long as
  // there's at least one editable team.
  const canSave =
    hasSelection && !saving && !loading &&
    (locked ? editableTeams.length > 0 : weightOk && emptyEditableTeams.length === 0)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      if (locked) {
        // Post-dispatch: persist ONLY each open team's measure set (backend leaves
        // every settled team, the measure list and the weights untouched). One team
        // failing (e.g. a 409 because it was sent meanwhile) must not drop the rest.
        let last: ScorecardConfig | null = null
        const failed: string[] = []
        let firstError = ''
        for (const t of editableTeams) {
          const keys = [...selected].filter((k) => teamsForMeasure(k).has(t))
          try {
            const r = await setTeamMeasures(cycleId, t, keys)
            last = r.config
          } catch (e) {
            failed.push(t)
            if (!firstError) firstError = e instanceof Error ? e.message : ''
          }
        }
        if (last) onSaved?.(last)
        if (failed.length) setError(`Could not save ${failed.join(', ')}${firstError ? ` — ${firstError}` : ''}`)
        else setSavedAt(new Date().toISOString())
        return
      }
      const w: Record<string, number> = {}
      for (const t of included) w[t.key] = isScoredTheme(t) ? (weights[t.key] ?? 0) : 0
      // Persist an explicit team list for every selected measure ([] = nobody).
      // With no key stakeholders yet there are no teams to assign, and writing []
      // everywhere would mean "nobody is asked" — a state that survives marking people
      // Key later and permanently empties the dispatch list. Omit instead, which leaves
      // every measure unrestricted (= everyone).
      const mt = teams.length === 0
        ? undefined
        : Object.fromEntries([...selected].map((key) => [key, Array.from(teamsForMeasure(key))]))
      const cfg = await saveScorecardConfig(cycleId, {
        selected_measure_keys: Array.from(selected),
        weights: w,
        measure_teams: mt,
        // Record which teams these choices were made against, so a stakeholder marked
        // Key later is recognisable as new rather than as deliberately excluded.
        teams,
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

  // Reopen a single settled team: discards its submissions + removes it from the
  // dispatched set (server-side) so its column unlocks and it can be re-sent alone.
  async function handleReopenTeam(t: string) {
    setError(null)
    setReopeningTeam(t)
    try {
      const r = await reopenScorecardTeam(cycleId, t)
      setReopenedTeams((prev) => new Set(prev).add(t))
      // Reflect the returned config for the reopened team ONLY — a wholesale rebuild
      // would silently revert unsaved ticks made for the other open teams.
      const fromServer: Record<string, Set<string>> = {}
      for (const theme of r.config.categories) {
        for (const m of theme.measures) if (Array.isArray(m.teams)) fromServer[m.key] = new Set(m.teams)
      }
      setMeasureTeams((prev) => {
        const next = { ...prev }
        for (const [key, assigned] of Object.entries(fromServer)) {
          const cur = new Set(prev[key] ?? teams)
          if (assigned.has(t)) cur.add(t)
          else cur.delete(t)
          next[key] = cur
        }
        return next
      })
      setSavedAt(null)
      onReopened?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reopen the team')
    } finally {
      setReopeningTeam(null)
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
                  <span>
                    <strong>Dispatched.</strong> The measure set and weights are locked. A team already sent the scorecard is locked too —
                    use <strong>Reopen</strong> on that team&apos;s column to redo just that team, or tick a newly added team&apos;s column to
                    configure it. Then send the scorecard to that team only from the dispatch step below.
                  </span>
                </div>
              )}

              {teams.length === 0 && (
                <div className="mb-3 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  <Users size={13} className="shrink-0" />
                  Mark internal stakeholders as “Key” in the Attendees step to assign measures to teams — only key stakeholders receive a scorecard.
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
                      {columnTeams.map((t) => {
                        const sel = [...selected]
                        const on = sel.length > 0 && sel.every((k) => teamsForMeasure(k).has(t))
                        const some = sel.some((k) => teamsForMeasure(k).has(t))
                        const editable = isTeamEditable(t)
                        const settled = isTeamSettled(t)
                        return (
                          <th key={t} className={cn('px-4 py-3 text-center whitespace-nowrap border-l border-slate-200 dark:border-slate-700', dispatched && editable && 'bg-emerald-50/60 dark:bg-emerald-900/10')}>
                            <label className={cn('flex flex-col items-center gap-1.5', !editable || sel.length === 0 ? 'cursor-not-allowed' : 'cursor-pointer')} title={settled ? `${t} has been sent the scorecard — reopen the team to change it` : `Toggle ${t} for every selected measure`}>
                              <span className="text-sm font-semibold flex items-center gap-1">
                                {t}
                                {dispatched && editable && <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">open</span>}
                              </span>
                              {/* A settled column shows a padlock, not a dead checkbox: the
                                  disabled tick read as "unticked" and sat flush against the
                                  Reopen button, so the two looked like one control. */}
                              {settled ? (
                                <span className="flex items-center gap-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                                  <Lock size={11} /> sent
                                </span>
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={on}
                                  ref={(el) => { if (el) el.indeterminate = some && !on }}
                                  disabled={!editable || sel.length === 0}
                                  onChange={() => toggleTeamColumn(t)}
                                  className={CB}
                                />
                              )}
                            </label>
                            {settled && (
                              <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                                <button
                                  type="button"
                                  onClick={() => setConfirmReopen(t)}
                                  disabled={reopeningTeam !== null}
                                  title={`Reopen ${t} — discards their submitted scores so they can re-submit, and lets you resend to ${t} only`}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-300 dark:border-amber-800 text-[10px] font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  {reopeningTeam === t ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
                                  Reopen
                                </button>
                              </div>
                            )}
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
                            <td colSpan={1 + columnTeams.length} className="px-4 py-2.5">
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
                                {/* One checkbox per team — a team's column stays editable
                                    post-dispatch only while it's open (new or reopened). */}
                                {columnTeams.map((t) => {
                                  const editable = isTeamEditable(t)
                                  return (
                                  <td key={t} className={cn('px-4 py-2.5 text-center border-l border-slate-100 dark:border-slate-800', dispatched && editable && 'bg-emerald-50/40 dark:bg-emerald-900/5')}>
                                    <input
                                      type="checkbox"
                                      checked={isSel && mTeams.has(t)}
                                      disabled={!isSel || !editable}
                                      onChange={() => toggleMeasureTeam(m.key, t)}
                                      title={isSel ? `${t}: ${mTeams.has(t) ? 'asked' : 'not asked'} this measure` : 'Include the measure first'}
                                      className={CB_LG}
                                    />
                                  </td>
                                  )
                                })}
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
                {statusOnlyThemes.length > 0 && (
                  <span className="text-slate-400 dark:text-slate-500">
                    · {statusOnlyThemes.map((t) => t.label).join(', ')} {statusOnlyThemes.length !== 1 ? 'are' : 'is'} status-only (RAG), so {statusOnlyThemes.length !== 1 ? 'they carry' : 'it carries'} no weight
                  </span>
                )}
              </div>

              {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}
              {!hasSelection && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Select at least one measure.</p>}
              {emptyTeamMeasures.length > 0 && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  {emptyTeamMeasures.length} selected measure{emptyTeamMeasures.length !== 1 ? 's have' : ' has'} no team assigned — no one will be asked to score {emptyTeamMeasures.length !== 1 ? 'them' : 'it'}.
                </p>
              )}
              {emptyEditableTeams.length > 0 && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  {emptyEditableTeams.join(', ')} {emptyEditableTeams.length !== 1 ? 'have' : 'has'} no measure ticked — no scorecard will be sent to {emptyEditableTeams.length !== 1 ? 'those teams' : 'that team'}.
                </p>
              )}

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
                {locked && editableTeams.length === 0 ? (
                  <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">No open team to configure — use “Reopen” on a team, or add a new team.</span>
                ) : (
                  <button
                    onClick={handleSave}
                    disabled={!canSave}
                    className={cn(
                      'ml-auto flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg text-white',
                      canSave ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed'
                    )}
                  >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    {locked ? `Save ${editableTeams.length === 1 ? editableTeams[0] : 'open teams'} config` : 'Save Configuration'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Reopen is destructive and its trigger lives in a dense column header, so it is
          always confirmed. Named explicitly ("Reopen IDTM") because the dialog is the
          last chance to notice the wrong column was clicked. */}
      <ConfirmDialog
        open={confirmReopen !== null}
        tone="danger"
        title={`Reopen ${confirmReopen ?? ''}?`}
        confirmLabel={`Yes, reopen ${confirmReopen ?? ''}`}
        cancelLabel="Cancel"
        busy={reopeningTeam !== null}
        message={
          <>
            <p>
              This <strong>permanently discards the scorecard {confirmReopen} has already
              submitted</strong>. Their scores disappear from the consolidated scorecard and
              cannot be recovered — they will have to fill it in again.
            </p>
            <p className="mt-2">
              {confirmReopen}&apos;s column unlocks so you can change their measures, and the
              dispatch step will then send the scorecard to <strong>{confirmReopen} only</strong>.
              Every other team keeps its configuration and its submitted scores.
            </p>
          </>
        }
        onConfirm={() => {
          const t = confirmReopen
          if (!t || reopeningTeam !== null) return
          // Stay open (and busy) until the server answers, so the dialog itself blocks a
          // second click and the VMO sees the action is running. Any failure is surfaced
          // by handleReopenTeam's own error state in the panel below.
          void handleReopenTeam(t).finally(() => setConfirmReopen(null))
        }}
        onCancel={() => { if (reopeningTeam === null) setConfirmReopen(null) }}
      />
    </div>
  )
}
