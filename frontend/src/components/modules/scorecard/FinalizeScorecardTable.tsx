import { useEffect, useMemo, useState } from 'react'
import { Save, RotateCcw, Loader2, CheckCircle2, PencilLine, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { WeightedScorecard } from '@/types/scorecard.types'
import { getFinalScorecard, saveFinalScorecard, resetFinalScorecard } from '@/lib/scorecardApi'
import { RagChip } from './rag'

interface Props {
  cycleId: string
  consolidated: WeightedScorecard
}

// measure_key -> attendee_id -> score (null = not applicable / blank)
type ScoreMatrix = Record<string, Record<string, number | null>>

function scoreColor(v: number | null): string {
  if (v == null) return 'text-slate-400'
  if (v >= 4) return 'text-emerald-600 dark:text-emerald-400'
  if (v >= 3) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function mean(vals: number[]): number | null {
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null
}

export default function FinalizeScorecardTable({ cycleId, consolidated }: Props) {
  const [open, setOpen] = useState(false)
  const [scores, setScores] = useState<ScoreMatrix>({})
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A failed GET /final must NOT look like "never adjusted" — see the effect below.
  const [loadFailed, setLoadFailed] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  // GET /final reports whether a team submitted AFTER the snapshot was frozen. The
  // route never auto-deletes a stale snapshot (that would silently bin the VMO's
  // adjustments), so this flag is the only warning the VMO gets that the numbers
  // on screen were adjusted against scores that have since changed.
  const [stale, setStale] = useState(false)

  const teams = consolidated.teams

  // Only an attendee who is still a rendered column may contribute to an average.
  // A saved snapshot keeps whatever aids were frozen into it, and a submission can
  // be deleted, un-keyed or the attendee removed afterwards — those aids have no
  // cell in the grid, so averaging them yields an Overall nobody can reproduce.
  const liveIds = useMemo(() => new Set(teams.map((t) => t.attendee_id)), [teams])

  // Build the editable matrix from the consolidated team scores, optionally
  // overlaying previously-saved final values (keyed measure_key -> aid).
  function buildMatrix(saved?: Record<string, Record<string, number | null>>): ScoreMatrix {
    const m: ScoreMatrix = {}
    for (const cat of consolidated.categories) {
      for (const meas of cat.measures) {
        const savedRow = saved?.[meas.key]
        m[meas.key] = Object.fromEntries(
          Object.entries({ ...(meas.team_scores ?? {}), ...(savedRow ?? {}) }).filter(([aid]) => liveIds.has(aid)),
        )
      }
    }
    return m
  }

  function initFromConsolidated() {
    setScores(buildMatrix())
    setNote('')
  }

  useEffect(() => {
    let mounted = true
    // Also on the RETRY path (reloadNonce), not just on mount: the reconcile effect
    // below bails out while `loading`, and without this the retry's in-flight GET was
    // unguarded — a `consolidated` change landing in that window got merged and then
    // overwritten wholesale by the retry's full-replace `.then`.
    setLoading(true)
    setLoadFailed(false)
    setStale(false)
    setError(null)
    getFinalScorecard(cycleId)
      .then(({ final, stale: isStale }) => {
        if (!mounted) return
        if (final) {
          const saved: Record<string, Record<string, number | null>> = {}
          for (const cat of final.categories) {
            for (const meas of cat.measures) saved[meas.key] = { ...(meas.team_scores ?? {}) }
          }
          setScores(buildMatrix(saved))
          setNote(final.note ?? '')
          setSavedAt(final.updated_at ?? null)
          setStale(isStale)
        } else {
          initFromConsolidated()
        }
      })
      .catch(() => {
        if (!mounted) return
        // The route returns 200 + { final: null } when nothing is stored, so a
        // rejection is always a real failure. Falling back silently would render
        // the raw submitted values as if the cycle had never been adjusted, and the
        // next Save is a full row replace — it would wipe the stored snapshot and
        // note with no history to recover from. Show the failure and block writes.
        setLoadFailed(true)
        setError('Could not load the saved final scorecard — retry before editing.')
        initFromConsolidated()
      })
      .finally(() => mounted && setLoading(false))
    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId, reloadNonce])

  // `consolidated` is a prop that can change after mount — the Comparison & Finalize
  // tab fires a weighted refresh in the same click that mounts this panel, so a
  // late submission arrives as a new column while the matrix (built once, above)
  // still has no row entry for it: the column renders blank and the reviewer is
  // silently absent from every average and from the saved snapshot. Fold new
  // columns in, without touching a cell the VMO has already edited.
  useEffect(() => {
    if (loading) return // the in-flight load owns the matrix until it settles
    let changed = false
    const next: ScoreMatrix = { ...scores }
    for (const cat of consolidated.categories) {
      for (const meas of cat.measures) {
        const row = { ...(next[meas.key] ?? {}) }
        let rowChanged = !(meas.key in next)
        for (const [aid, v] of Object.entries(meas.team_scores ?? {})) {
          // Key PRESENCE, not null-ness: a blanked cell is a deliberate
          // "not applicable" edit and must survive the next refresh.
          if (liveIds.has(aid) && !(aid in row)) {
            row[aid] = v
            rowChanged = true
          }
        }
        if (rowChanged) {
          next[meas.key] = row
          changed = true
        }
      }
    }
    if (!changed) return // consolidated is a fresh object on every poll — stay stable
    setScores(next)
    setSavedAt(null) // the matrix no longer matches what was persisted
  }, [consolidated, liveIds, loading, scores])

  // Recompute measure averages, category averages and the weighted overall from
  // the edited team scores (RAG measures are excluded from every average).
  const computed = useMemo(() => {
    const measureAvg: Record<string, number | null> = {}
    const catAvg: Record<string, number | null> = {}
    let num = 0
    let den = 0
    for (const cat of consolidated.categories) {
      const measureAvgs: number[] = []
      for (const meas of cat.measures) {
        if (meas.measure_type === 'rag') { measureAvg[meas.key] = null; continue }
        const vals = Object.entries(scores[meas.key] ?? {})
          .filter((e): e is [string, number] => liveIds.has(e[0]) && e[1] != null)
          .map(([, x]) => x)
        const avg = mean(vals)
        measureAvg[meas.key] = avg
        if (avg != null) measureAvgs.push(avg)
      }
      const cAvg = mean(measureAvgs)
      catAvg[cat.key] = cAvg
      if (cAvg != null) { num += cAvg * cat.weight; den += cat.weight }
    }
    const overall = den ? Math.round((num / den) * 100) / 100 : null
    return { measureAvg, catAvg, overall }
  }, [scores, consolidated, liveIds])

  function setScore(measureKey: string, aid: string, raw: string) {
    setSavedAt(null)
    setScores((prev) => {
      const row = { ...(prev[measureKey] ?? {}) }
      if (raw.trim() === '') row[aid] = null
      else {
        const n = Number(raw)
        if (Number.isNaN(n)) return prev
        row[aid] = Math.max(0, Math.min(5, n))
      }
      return { ...prev, [measureKey]: row }
    })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const categories = consolidated.categories.map((cat) => ({
        key: cat.key,
        label: cat.label,
        weight: cat.weight,
        category_average: computed.catAvg[cat.key] ?? null,
        measures: cat.measures.map((m) => ({
          key: m.key,
          label: m.label,
          description: m.description,
          measure_type: m.measure_type,
          // Same live-column filter as the averages, so a ghost aid is not written back.
          team_scores: Object.fromEntries(
            Object.entries(scores[m.key] ?? {}).filter(([aid]) => liveIds.has(aid)),
          ),
          team_rag: m.team_rag ?? {},
          rag_consensus: m.rag_consensus ?? null,
          comments: {},
          average: computed.measureAvg[m.key] ?? null,
        })),
      }))
      const final = await saveFinalScorecard(cycleId, {
        categories,
        overall_score: computed.overall,
        note,
      })
      setSavedAt(final.updated_at ?? new Date().toISOString())
      setStale(false) // just re-frozen against the scores on screen
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    setSaving(true)
    setError(null)
    try {
      await resetFinalScorecard(cycleId)
      initFromConsolidated()
      setSavedAt(null)
      setStale(false) // the snapshot the warning referred to no longer exists
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex justify-center">
        <Loader2 className="animate-spin text-indigo-500" size={20} />
      </div>
    )
  }

  // `label` first: one column per SUBMITTING REVIEWER, not per team, so two people in
  // the same department would otherwise render two identical headers. The backend
  // qualifies only the ambiguous ones ("IDTM — Alice"); `team` remains the fallback
  // for cached payloads that predate the field.
  const teamLabel = (t: WeightedScorecard['teams'][number]) => t.label || t.team || t.name || t.email

  return (
    <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/60 rounded-xl overflow-hidden">
      <div
        onClick={() => setOpen((o) => !o)}
        className="px-5 py-3 flex items-center justify-between cursor-pointer select-none hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-slate-400 dark:text-slate-500">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
          <PencilLine size={13} className="text-amber-500" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Final (Adjusted) Scorecard</span>
          <span className="text-xs text-slate-400">· edit each team’s score — averages recompute automatically</span>
          {loadFailed && (
            <span className="text-xs font-medium text-red-600 dark:text-red-400">· saved version unavailable</span>
          )}
          {/* The panel starts collapsed, so the staleness has to be visible on the header
              too — otherwise the Overall shown here is an adjusted figure the VMO has no
              reason to distrust. */}
          {stale && !loadFailed && (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">· adjustments out of date</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-xs text-slate-500 dark:text-slate-400 mr-2">Overall</span>
            <span className={cn('text-lg font-bold', scoreColor(computed.overall))}>
              {computed.overall != null ? computed.overall.toFixed(1) : '—'}
            </span>
          </div>
        </div>
      </div>

      {open && <>
      {stale && !loadFailed && (
        <div className="flex items-start gap-2 px-4 py-2.5 border-t border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle size={13} className="mt-px shrink-0" />
          <span>
            <strong>These adjustments predate the latest submission.</strong> A team submitted
            (or resubmitted) after this final scorecard was saved, so the values below are the
            frozen snapshot, not the current consolidated scores. Use{' '}
            <strong>Reset to submitted scores</strong> below to start again from the live figures,
            or edit and save to re-freeze against them.
          </span>
        </div>
      )}
      <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-600 dark:text-slate-300">
              <th className="text-left px-3 py-2 font-medium">Theme</th>
              <th className="text-left px-3 py-2 font-medium">Measure</th>
              {teams.map((t) => (
                <th key={t.attendee_id} className="text-center px-3 py-2 font-medium whitespace-nowrap" title={t.email}>
                  {teamLabel(t)}
                </th>
              ))}
              <th className="text-center px-3 py-2 font-medium bg-emerald-50/60 dark:bg-emerald-900/10">Avg</th>
              <th className="text-center px-3 py-2 font-medium">Cat Avg</th>
              <th className="text-center px-3 py-2 font-medium">Wt%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {consolidated.categories.map((cat) => (
              cat.measures.map((m, mi) => {
                const isRag = m.measure_type === 'rag'
                return (
                  <tr key={m.key} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    {mi === 0 && (
                      <td rowSpan={cat.measures.length} className="align-top px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-200 border-r border-slate-100 dark:border-slate-800">
                        {cat.label}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{m.label}</td>
                    {teams.map((t) => {
                      // `not_asked` = the config never put this measure in front of that
                      // reviewer's team, so there is nothing for the VMO to adjust. Only
                      // when no value was ever stored though: an older snapshot may hold a
                      // figure from before the team restriction, and that must stay editable
                      // rather than become an unreachable contributor to the average.
                      const notAsked = m.team_status?.[t.attendee_id] === 'not_asked'
                        && scores[m.key]?.[t.attendee_id] == null
                      return (
                      <td key={t.attendee_id} className="text-center px-2 py-2">
                        {isRag ? (
                          notAsked
                            ? <span className="text-slate-300 dark:text-slate-600" title="Not assigned to this team">·</span>
                            : <RagChip value={m.team_rag?.[t.attendee_id]} />
                        ) : notAsked ? (
                          <span className="text-slate-300 dark:text-slate-600" title="Not assigned to this team">·</span>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            max={5}
                            step={0.1}
                            value={scores[m.key]?.[t.attendee_id] ?? ''}
                            onChange={(e) => setScore(m.key, t.attendee_id, e.target.value)}
                            placeholder="—"
                            // Nothing typed while the saved snapshot is unavailable can be
                            // saved (Save is gated on loadFailed) and Retry load full-replaces
                            // the matrix — an editable field here loses the VMO's typing
                            // silently. Disable until the load succeeds.
                            disabled={loadFailed}
                            className="w-16 px-2 py-1 text-center text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                        )}
                      </td>
                      )
                    })}
                    <td className={cn('text-center px-3 py-2.5 font-semibold bg-emerald-50/60 dark:bg-emerald-900/10', isRag ? '' : scoreColor(computed.measureAvg[m.key]))}>
                      {isRag
                        ? <RagChip value={m.rag_consensus} />
                        : (computed.measureAvg[m.key] != null ? computed.measureAvg[m.key]!.toFixed(1) : '—')}
                    </td>
                    {mi === 0 && (
                      <td rowSpan={cat.measures.length} className={cn('text-center px-3 py-2.5 font-semibold align-middle', scoreColor(computed.catAvg[cat.key]))}>
                        {computed.catAvg[cat.key] != null ? computed.catAvg[cat.key]!.toFixed(1) : '—'}
                      </td>
                    )}
                    {mi === 0 && (
                      <td rowSpan={cat.measures.length} className="text-center px-3 py-2.5 text-slate-500 dark:text-slate-400 align-middle">
                        {cat.weight}%
                      </td>
                    )}
                  </tr>
                )
              })
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 space-y-3 border-t border-slate-100 dark:border-slate-800">
        <p className="text-[11px] text-slate-400">
          Values pre-filled with each team’s submitted score. Edit any cell — the measure Avg, Cat Avg and Overall recompute live. Blank = not applicable (excluded). RAG measures are status only and never affect the score.
        </p>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
          Adjustment note (why the scores were changed)
          {/* The textarea is disabled while loadFailed for the same reason as the score
              inputs above: unsaveable, and Retry load discards whatever was typed. */}
          <textarea
            value={note}
            onChange={(e) => { setNote(e.target.value); setSavedAt(null) }}
            rows={2}
            placeholder="e.g. Operations revised up after internal alignment discussion…"
            disabled={loadFailed}
            className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </label>

        {error && (
          <div className="flex items-center gap-2">
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            {loadFailed && (
              <button
                onClick={() => setReloadNonce((n) => n + 1)}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Retry load
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Reset is NOT gated on loadFailed: it is a DELETE of the stored snapshot and
              needs nothing from the failed GET. It is also the only way to clear a bad
              snapshot, so disabling it turns a recoverable error into a dead end. Save
              below stays gated — it WOULD overwrite the adjustments with fallback values. */}
          <button
            onClick={handleReset}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            <RotateCcw size={13} /> Reset to submitted scores
          </button>
          {savedAt && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={13} /> Saved
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || loadFailed}
            className="ml-auto flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save Final Scorecard
          </button>
        </div>
      </div>
      </>}
    </div>
  )
}
