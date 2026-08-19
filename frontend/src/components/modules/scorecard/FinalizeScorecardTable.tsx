import { useEffect, useMemo, useState } from 'react'
import { Save, RotateCcw, Loader2, CheckCircle2, PencilLine, ChevronDown, ChevronRight } from 'lucide-react'
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

  const teams = consolidated.teams

  // Build the editable matrix from the consolidated team scores, optionally
  // overlaying previously-saved final values (keyed measure_key -> aid).
  function buildMatrix(saved?: Record<string, Record<string, number | null>>): ScoreMatrix {
    const m: ScoreMatrix = {}
    for (const cat of consolidated.categories) {
      for (const meas of cat.measures) {
        const savedRow = saved?.[meas.key]
        m[meas.key] = { ...(meas.team_scores ?? {}), ...(savedRow ?? {}) }
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
    getFinalScorecard(cycleId)
      .then((final) => {
        if (!mounted) return
        if (final) {
          const saved: Record<string, Record<string, number | null>> = {}
          for (const cat of final.categories) {
            for (const meas of cat.measures) saved[meas.key] = { ...(meas.team_scores ?? {}) }
          }
          setScores(buildMatrix(saved))
          setNote(final.note ?? '')
          setSavedAt(final.updated_at ?? null)
        } else {
          initFromConsolidated()
        }
      })
      .catch(() => initFromConsolidated())
      .finally(() => mounted && setLoading(false))
    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId])

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
        const vals = Object.values(scores[meas.key] ?? {}).filter((x): x is number => x != null)
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
  }, [scores, consolidated])

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
          team_scores: scores[m.key] ?? {},
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

  const teamLabel = (t: WeightedScorecard['teams'][number]) => t.team || t.name || t.email

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
                    {teams.map((t) => (
                      <td key={t.attendee_id} className="text-center px-2 py-2">
                        {isRag ? (
                          <RagChip value={m.team_rag?.[t.attendee_id]} />
                        ) : (
                          <input
                            type="number"
                            min={0}
                            max={5}
                            step={0.1}
                            value={scores[m.key]?.[t.attendee_id] ?? ''}
                            onChange={(e) => setScore(m.key, t.attendee_id, e.target.value)}
                            placeholder="—"
                            className="w-16 px-2 py-1 text-center text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        )}
                      </td>
                    ))}
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
          <textarea
            value={note}
            onChange={(e) => { setNote(e.target.value); setSavedAt(null) }}
            rows={2}
            placeholder="e.g. Operations revised up after internal alignment discussion…"
            className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex items-center gap-2">
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
            disabled={saving}
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
