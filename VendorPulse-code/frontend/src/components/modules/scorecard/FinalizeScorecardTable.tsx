import { useEffect, useMemo, useState } from 'react'
import { Save, RotateCcw, Loader2, CheckCircle2, PencilLine } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { WeightedScorecard } from '@/types/scorecard.types'
import { getFinalScorecard, saveFinalScorecard, resetFinalScorecard } from '@/lib/scorecardApi'

interface Props {
  cycleId: string
  consolidated: WeightedScorecard
}

function scoreColor(v: number | null): string {
  if (v == null) return 'text-slate-400'
  if (v >= 4) return 'text-emerald-600 dark:text-emerald-400'
  if (v >= 3) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

export default function FinalizeScorecardTable({ cycleId, consolidated }: Props) {
  // measure_key -> edited score (null = not applicable / no value)
  const [values, setValues] = useState<Record<string, number | null>>({})
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function initFromConsolidated() {
    const v: Record<string, number | null> = {}
    for (const cat of consolidated.categories) {
      for (const m of cat.measures) v[m.key] = m.average
    }
    setValues(v)
    setNote('')
  }

  useEffect(() => {
    let mounted = true
    getFinalScorecard(cycleId)
      .then((final) => {
        if (!mounted) return
        if (final) {
          const v: Record<string, number | null> = {}
          for (const cat of final.categories) {
            for (const m of cat.measures) v[m.key] = m.average
          }
          setValues(v)
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

  // Recompute category averages + weighted overall from edited values.
  const computed = useMemo(() => {
    let num = 0
    let den = 0
    const catAvgs: Record<string, number | null> = {}
    for (const cat of consolidated.categories) {
      const vals = cat.measures.map((m) => values[m.key]).filter((x): x is number => x != null)
      const avg = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null
      catAvgs[cat.key] = avg
      if (avg != null) { num += avg * cat.weight; den += cat.weight }
    }
    const overall = den ? Math.round((num / den) * 100) / 100 : null
    return { catAvgs, overall }
  }, [values, consolidated])

  function setMeasure(key: string, raw: string) {
    setSavedAt(null)
    if (raw.trim() === '') { setValues((s) => ({ ...s, [key]: null })); return }
    const n = Number(raw)
    if (Number.isNaN(n)) return
    setValues((s) => ({ ...s, [key]: Math.max(0, Math.min(5, n)) }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const categories = consolidated.categories.map((cat) => ({
        key: cat.key,
        label: cat.label,
        weight: cat.weight,
        category_average: computed.catAvgs[cat.key],
        measures: cat.measures.map((m) => ({
          key: m.key,
          label: m.label,
          description: m.description,
          team_scores: {},
          comments: {},
          average: values[m.key] ?? null,
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

  return (
    <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/60 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PencilLine size={13} className="text-amber-500" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Final (Adjusted) Scorecard</span>
          <span className="text-xs text-slate-400">· admin-editable after alignment / vendor-prep</span>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-500 dark:text-slate-400 mr-2">Overall</span>
          <span className={cn('text-lg font-bold', scoreColor(computed.overall))}>
            {computed.overall != null ? computed.overall.toFixed(1) : '—'}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
              <th className="text-left px-3 py-2 font-medium">Theme</th>
              <th className="text-left px-3 py-2 font-medium">Measure</th>
              <th className="text-center px-3 py-2 font-medium">Adjusted Score</th>
              <th className="text-center px-3 py-2 font-medium">Cat Avg</th>
              <th className="text-center px-3 py-2 font-medium">Wt%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {consolidated.categories.map((cat) => (
              cat.measures.map((m, mi) => (
                <tr key={m.key} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  {mi === 0 && (
                    <td rowSpan={cat.measures.length} className="align-top px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-200 border-r border-slate-100 dark:border-slate-800">
                      {cat.label}
                    </td>
                  )}
                  <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{m.label}</td>
                  <td className="text-center px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      max={5}
                      step={0.1}
                      value={values[m.key] ?? ''}
                      onChange={(e) => setMeasure(m.key, e.target.value)}
                      placeholder="—"
                      className="w-20 px-2 py-1 text-center text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </td>
                  {mi === 0 && (
                    <td rowSpan={cat.measures.length} className={cn('text-center px-3 py-2.5 font-semibold align-middle', scoreColor(computed.catAvgs[cat.key]))}>
                      {computed.catAvgs[cat.key] != null ? computed.catAvgs[cat.key]!.toFixed(1) : '—'}
                    </td>
                  )}
                  {mi === 0 && (
                    <td rowSpan={cat.measures.length} className="text-center px-3 py-2.5 text-slate-500 dark:text-slate-400 align-middle">
                      {cat.weight}%
                    </td>
                  )}
                </tr>
              ))
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 space-y-3 border-t border-slate-100 dark:border-slate-800">
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
            <RotateCcw size={13} /> Reset to consolidated
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
    </div>
  )
}
