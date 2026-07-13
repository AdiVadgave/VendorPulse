import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ClipboardList, CheckCircle2, AlertCircle, Loader2, Send, User, Zap } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { ScorecardFormMeta, WeightedScorecard } from '@/types/scorecard.types'
import { WEIGHTED_SCORECARD_STRUCTURE } from '@/types/scorecard.types'
import { getScorecardFormMeta, submitScorecard, checkAlreadySubmitted, getWeightedScorecard } from '@/lib/scorecardApi'
import WeightedScorecardTable from '@/components/modules/scorecard/WeightedScorecardTable'

// Brand header shown at the top of the standalone scorecard form (dark themed).
function BrandHeader() {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
        <Zap size={18} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-white text-sm leading-tight">Zen-VendorPulse</p>
        <p className="text-xs text-slate-400">Governance Platform</p>
      </div>
    </div>
  )
}

const SCORE_OPTIONS = [1, 2, 3, 4, 5]
const SCORE_LABELS: Record<number, string> = {
  1: 'Poor', 2: 'Below expectations', 3: 'Acceptable', 4: 'Good', 5: 'Excellent',
}

export default function ScorecardForm() {
  const [params] = useSearchParams()
  const cycleId = params.get('cycle') ?? ''
  const attendeeId = params.get('attendee') ?? ''

  const [meta, setMeta] = useState<ScorecardFormMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [scores, setScores] = useState<Record<string, number>>({})
  const [comments, setComments] = useState<Record<string, string>>({})
  const [skippedThemes, setSkippedThemes] = useState<Set<string>>(new Set())
  const [skippedMeasures, setSkippedMeasures] = useState<Set<string>>(new Set())

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Consolidated scorecard so far (shown pinned beside the form).
  const [weighted, setWeighted] = useState<WeightedScorecard | null>(null)

  const structure = meta?.structure ?? WEIGHTED_SCORECARD_STRUCTURE
  const respondent = meta?.respondent ?? null

  useEffect(() => {
    if (!cycleId || !attendeeId) {
      setLoadError('This scorecard link is invalid or incomplete. Please use the link from your invitation email.')
      setLoading(false)
      return
    }
    getScorecardFormMeta(cycleId, attendeeId)
      .then(async (m) => {
        setMeta(m)
        if (!m.respondent) {
          setLoadError('This scorecard link does not match a known reviewer for this cycle.')
          return
        }
        const done = await checkAlreadySubmitted(cycleId, attendeeId)
        if (done) setAlreadySubmitted(true)
        // Load other teams' submitted scorecards (visible to the reviewer).
        try { setWeighted(await getWeightedScorecard(cycleId)) } catch { /* none yet */ }
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load the scorecard'))
      .finally(() => setLoading(false))
  }, [cycleId, attendeeId])

  // Auto-close the tab shortly after a successful submission.
  useEffect(() => {
    if (!submitted) return
    const t = setTimeout(() => {
      try { window.close() } catch { /* browser may block programmatic close */ }
    }, 2500)
    return () => clearTimeout(t)
  }, [submitted])

  function toggleTheme(catKey: string, measureKeys: string[]) {
    setSkippedThemes((prev) => {
      const next = new Set(prev)
      const willSkip = !next.has(catKey)
      if (willSkip) next.add(catKey)
      else next.delete(catKey)
      setSkippedMeasures((pm) => {
        const nm = new Set(pm)
        measureKeys.forEach((k) => (willSkip ? nm.add(k) : nm.delete(k)))
        return nm
      })
      return next
    })
  }

  function toggleMeasure(measureKey: string) {
    setSkippedMeasures((prev) => {
      const next = new Set(prev)
      if (next.has(measureKey)) next.delete(measureKey)
      else next.add(measureKey)
      return next
    })
  }

  const missing = useMemo(() => {
    const miss: string[] = []
    for (const cat of structure) {
      if (skippedThemes.has(cat.key)) continue
      for (const m of cat.measures) {
        if (skippedMeasures.has(m.key)) continue
        if (!scores[m.key]) miss.push(`${m.label}: score`)
        if (!(comments[m.key] ?? '').trim()) miss.push(`${m.label}: comment`)
      }
    }
    return miss
  }, [structure, skippedThemes, skippedMeasures, scores, comments])

  const canSubmit = !!respondent && missing.length === 0 && !submitting

  async function handleSubmit() {
    if (!respondent) return
    if (missing.length > 0) { setError('Please complete all scores and comments, or mark items as not applicable.'); return }
    setSubmitting(true)
    setError(null)
    try {
      const submitScores: Record<string, number> = {}
      const submitComments: Record<string, string> = {}
      for (const cat of structure) {
        if (skippedThemes.has(cat.key)) continue
        for (const m of cat.measures) {
          if (skippedMeasures.has(m.key)) continue
          submitScores[m.key] = scores[m.key]
          submitComments[m.key] = (comments[m.key] ?? '').trim()
        }
      }
      await submitScorecard({
        cycle_id: cycleId,
        attendee_id: attendeeId,
        scores: submitScores,
        comments: submitComments,
        skipped_measures: Array.from(skippedMeasures),
        skipped_themes: Array.from(skippedThemes),
      })
      setSubmitted(true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to submit the scorecard'
      if (/already been submitted|already submitted/i.test(msg)) setAlreadySubmitted(true)
      else setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center dark bg-slate-950">
        <Loader2 className="animate-spin text-indigo-500" size={28} />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center dark bg-slate-950 p-6">
        <div className="max-w-md text-center space-y-3">
          <AlertCircle className="mx-auto text-red-500" size={32} />
          <p className="text-sm text-slate-700 dark:text-slate-300">{loadError}</p>
        </div>
      </div>
    )
  }

  if (alreadySubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center dark bg-slate-950 p-6">
        <div className="max-w-md text-center space-y-3">
          <CheckCircle2 className="mx-auto text-emerald-500" size={40} />
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Already submitted</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {respondent?.name ? `${respondent.name}'s ` : 'A '}scorecard for this cycle has already been submitted.
            Each reviewer can submit only once. You can close this tab.
          </p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center dark bg-slate-950 p-6">
        <div className="max-w-md text-center space-y-3">
          <CheckCircle2 className="mx-auto text-emerald-500" size={40} />
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Thank you!</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Your scorecard for <strong>{meta?.vendor_name}</strong> ({meta?.quarter} {meta?.year}) has been submitted.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            This tab will close automatically. You can close it now if it stays open.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="dark min-h-screen bg-slate-950 flex flex-col">
      {/* Constant top navbar */}
      <header className="sticky top-0 z-20 bg-slate-900 border-b border-slate-800 px-5 py-3 flex items-center justify-between gap-4">
        <BrandHeader />
        <div className="text-right hidden sm:block">
          <p className="text-sm font-semibold text-white leading-tight">
            {meta?.cycle_type ?? 'SPR'} Scorecard — {meta?.vendor_name}
          </p>
          <p className="text-xs text-slate-400">{meta?.quarter} {meta?.year}</p>
        </div>
      </header>

      {/* Two-pane: scrollable form (left) + pinned consolidated (right) */}
      <div className="flex-1 w-full max-w-[1500px] mx-auto flex flex-col lg:flex-row gap-5 p-4 items-start">
        {/* Left — form (scrolls with the page) */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Header */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
              <ClipboardList className="text-indigo-600 dark:text-indigo-400" size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                {meta?.cycle_type ?? 'SPR'} Scorecard — {meta?.vendor_name}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {meta?.quarter} {meta?.year} · rate each measure 1 (Poor) – 5 (Excellent)
              </p>
            </div>
          </div>

          {/* Read-only reviewer identity */}
          {respondent && (
            <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <User size={14} className="text-slate-400 shrink-0" />
              <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">{respondent.name}</span>
              {respondent.team && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">{respondent.team}</span>
              )}
              <span className="ml-auto text-xs text-slate-400">{respondent.email}</span>
            </div>
          )}
        </div>

        {/* Themes */}
        {structure.map((cat) => {
          const themeSkipped = skippedThemes.has(cat.key)
          const measureKeys = cat.measures.map((m) => m.key)
          return (
            <div key={cat.key} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">{cat.label}</h2>
                  <span className="text-[11px] text-slate-400">Weight {cat.weight}%</span>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={themeSkipped} onChange={() => toggleTheme(cat.key, measureKeys)} className="rounded border-slate-300" />
                  Not applicable (skip theme)
                </label>
              </div>

              {!themeSkipped && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {cat.measures.map((m) => {
                    const measureSkipped = skippedMeasures.has(m.key)
                    return (
                      <div key={m.key} className="p-5 space-y-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{m.label}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{m.description}</p>
                          </div>
                          <label className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 shrink-0 cursor-pointer">
                            <input type="checkbox" checked={measureSkipped} onChange={() => toggleMeasure(m.key)} className="rounded border-slate-300" />
                            N/A
                          </label>
                        </div>

                        {!measureSkipped && (
                          <>
                            <div className="flex flex-wrap gap-2">
                              {SCORE_OPTIONS.map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  onClick={() => setScores((s) => ({ ...s, [m.key]: n }))}
                                  className={cn(
                                    'w-16 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                                    scores[m.key] === n
                                      ? 'bg-indigo-600 border-indigo-600 text-white'
                                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-400'
                                  )}
                                  title={SCORE_LABELS[n]}
                                >
                                  {n}
                                </button>
                              ))}
                              {scores[m.key] && (
                                <span className="self-center text-xs text-slate-500 dark:text-slate-400">{SCORE_LABELS[scores[m.key]]}</span>
                              )}
                            </div>
                            <textarea
                              value={comments[m.key] ?? ''}
                              onChange={(e) => setComments((c) => ({ ...c, [m.key]: e.target.value }))}
                              rows={2}
                              placeholder="Comment (required)"
                              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Submit */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-center justify-between gap-4 sticky bottom-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {missing.length > 0
              ? `${missing.length} field${missing.length > 1 ? 's' : ''} still need attention (score + comment, or mark N/A).`
              : 'All set — ready to submit.'}
            {error && <span className="block text-red-600 dark:text-red-400 mt-1">{error}</span>}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shrink-0',
              canSubmit ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
            )}
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {submitting ? 'Submitting…' : 'Submit Scorecard'}
          </button>
        </div>
        </div>

        {/* Right — Consolidated Scorecard (pinned) */}
        <aside className="w-full lg:w-[560px] shrink-0 lg:sticky lg:top-[76px] self-stretch lg:self-start">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Consolidated Scorecard</p>
          {weighted && weighted.teams.length > 0 ? (
            <div className="lg:max-h-[calc(100vh-96px)] overflow-y-auto">
              <WeightedScorecardTable data={weighted} />
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              The Consolidated Scorecard will appear here as teams submit their scorecards.
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
