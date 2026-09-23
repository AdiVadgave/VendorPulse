import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ClipboardList, CheckCircle2, AlertCircle, AlertTriangle, Loader2, Send, User } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { ScorecardFormMeta, WeightedScorecard } from '@/types/scorecard.types'
import { WEIGHTED_SCORECARD_STRUCTURE } from '@/types/scorecard.types'
import { getScorecardFormMeta, submitScorecard, checkAlreadySubmitted, getWeightedScorecard } from '@/lib/scorecardApi'
import WeightedScorecardTable from '@/components/modules/scorecard/WeightedScorecardTable'
import { RAG_OPTIONS, RAG_META } from '@/components/modules/scorecard/rag-constants'

// Brand header shown at the top of the standalone scorecard form (dark themed).
function BrandHeader() {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0">
        <img src="/shell-logo.svg" alt="Shell" className="w-7 h-7" />
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-white text-sm leading-tight">Mobility Vendor Pulse</p>
        <p className="text-xs text-slate-400">Governance Platform</p>
      </div>
    </div>
  )
}

const SCORE_OPTIONS = [1, 2, 3, 4, 5]
// High-Level Summary scale (per the SPR rating guide).
const SCORE_LABELS: Record<number, string> = {
  1: 'Systemic gaps',
  2: 'Isolated gaps',
  3: 'Meeting basic and/or contractual requirements',
  4: 'Proactive or value-add activity or performance',
  5: 'Significantly proactive or value-add with tangible business benefits',
}

// The redaction model has to echo every comment back, so an unbounded comment is what
// pushes a full scorecard past the model's output budget. Bound it at source, visibly.
const COMMENT_MAX_LENGTH = 1500

// Shape of the sessionStorage draft (the skipped Sets are stored as arrays).
type ScorecardDraft = {
  scores?: Record<string, number>
  rag?: Record<string, string>
  comments?: Record<string, string>
  skippedThemes?: string[]
  skippedMeasures?: string[]
}

export default function ScorecardForm() {
  const [params] = useSearchParams()
  const cycleId = params.get('cycle') ?? ''
  const attendeeId = params.get('attendee') ?? ''
  // In-progress answers are drafted per reviewer link, so a refresh or an accidental
  // close does not destroy fifteen minutes of work. sessionStorage rather than
  // localStorage: comments are free text that may still hold names/PII (redaction
  // happens server-side on submit) and a Shell laptop is often shared — this survives
  // F5 and back/forward, which are the losses people actually hit, and dies with the tab.
  const draftKey = `vp-scorecard-draft:${cycleId}:${attendeeId}`

  const [meta, setMeta] = useState<ScorecardFormMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [scores, setScores] = useState<Record<string, number>>({})
  const [rag, setRag] = useState<Record<string, string>>({})
  const [comments, setComments] = useState<Record<string, string>>({})
  const [skippedThemes, setSkippedThemes] = useState<Set<string>>(new Set())
  const [skippedMeasures, setSkippedMeasures] = useState<Set<string>>(new Set())
  // Armed only once any stored draft has been read back, so the save effect below can
  // never overwrite a draft with the empty state of the first render.
  const [hydrated, setHydrated] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Consolidated scorecard so far (shown pinned beside the form).
  const [weighted, setWeighted] = useState<WeightedScorecard | null>(null)
  // The previous cycle's consolidated scorecard, so reviewers can consult it while
  // filling this one in. A toggle switches the pinned panel between the two.
  const [previousWeighted, setPreviousWeighted] = useState<WeightedScorecard | null>(null)
  const [scoreView, setScoreView] = useState<'current' | 'previous'>('current')

  const structure = meta?.structure ?? WEIGHTED_SCORECARD_STRUCTURE
  const respondent = meta?.respondent ?? null
  // The backend serves each reviewer only the measures their team is asked to score, so
  // an empty structure means "this team is asked nothing" — not "no config". The `??`
  // above does NOT fall back here, because [] is not nullish; without this flag the page
  // renders zero themes, `missing` is empty and the reviewer is invited to submit a
  // blank scorecard that the tracker would then count as a real response.
  const noMeasures = !!respondent && structure.length === 0

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
        // Nothing assigned to this team: there is no form to draft, submit or compare
        // against, so skip the remaining fetches and let the render explain why. This
        // returns BEFORE checkAlreadySubmitted, so `alreadySubmitted` is never set for a
        // no-measures reviewer and the "Nothing to score yet" panel below always wins —
        // including when a hollow submission for them already exists in the DB. That is
        // deliberate: an honest explanation beats "Already submitted", and either way
        // there is nothing they could fill in.
        if (m.structure.length === 0) return
        const done = await checkAlreadySubmitted(cycleId, attendeeId)
        if (done) setAlreadySubmitted(true)
        else {
          // Restore the draft BEFORE arming the save effect, never after.
          try {
            const raw = sessionStorage.getItem(draftKey)
            if (raw) {
              const d = JSON.parse(raw) as ScorecardDraft
              setScores(d.scores ?? {})
              setRag(d.rag ?? {})
              setComments(d.comments ?? {})
              setSkippedThemes(new Set(d.skippedThemes ?? []))
              setSkippedMeasures(new Set(d.skippedMeasures ?? []))
            }
          } catch { /* storage blocked or draft corrupt — start from an empty form */ }
          setHydrated(true)
        }
        // Load other teams' submitted scorecards (visible to the reviewer).
        try { setWeighted(await getWeightedScorecard(cycleId)) } catch { /* none yet */ }
        // Load the previous cycle's consolidated scorecard for the "previous" view.
        if (m.previous_cycle_id) {
          try { setPreviousWeighted(await getWeightedScorecard(m.previous_cycle_id)) } catch { /* none */ }
        }
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load the scorecard'))
      .finally(() => setLoading(false))
  }, [cycleId, attendeeId, draftKey])

  // Auto-close the tab shortly after a successful submission.
  useEffect(() => {
    if (!submitted) return
    const t = setTimeout(() => {
      try { window.close() } catch { /* browser may block programmatic close */ }
    }, 2500)
    return () => clearTimeout(t)
  }, [submitted])

  function clearDraft() {
    try { sessionStorage.removeItem(draftKey) } catch { /* storage blocked — nothing to clear */ }
  }

  // Persist the in-progress answers on every change. Best-effort: a managed browser can
  // block site data, and a failed draft must never break the form itself.
  useEffect(() => {
    if (!hydrated || submitted || alreadySubmitted) return
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({
        scores,
        rag,
        comments,
        skippedThemes: Array.from(skippedThemes),
        skippedMeasures: Array.from(skippedMeasures),
      } satisfies ScorecardDraft))
    } catch { /* quota or blocked storage — drafting is best-effort */ }
  }, [hydrated, submitted, alreadySubmitted, draftKey, scores, rag, comments, skippedThemes, skippedMeasures])

  // Challenge an accidental refresh/close while there is unsaved work. The `submitted`
  // guard is load-bearing: the auto-close above would otherwise trip this dialog and
  // turn a clean "Thank you" into a scary prompt.
  useEffect(() => {
    if (submitted || alreadySubmitted) return
    const handler = (e: BeforeUnloadEvent) => {
      const dirty = Object.keys(scores).length > 0 || Object.keys(rag).length > 0
        || Object.values(comments).some((c) => c.trim().length > 0)
        // Marking themes/measures N/A is a complete contribution in its own right (that
        // reviewer's `missing` is empty and Submit is enabled), so it has to count as
        // unsaved work or they get no prompt at all on an accidental refresh.
        || skippedThemes.size > 0 || skippedMeasures.size > 0
      if (!dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [submitted, alreadySubmitted, scores, rag, comments, skippedThemes, skippedMeasures])

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
        if (m.measure_type === 'rag') {
          if (!rag[m.key]) miss.push(`${m.label}: status`)
        } else if (!scores[m.key]) {
          miss.push(`${m.label}: score`)
        }
        if (!(comments[m.key] ?? '').trim()) miss.push(`${m.label}: comment`)
      }
    }
    return miss
  }, [structure, skippedThemes, skippedMeasures, scores, rag, comments])

  // `!noMeasures` is belt-and-braces: the render below already refuses to draw the form
  // in that state, but an enabled Submit over zero measures must never be reachable.
  const canSubmit = !!respondent && !noMeasures && missing.length === 0 && !submitting

  async function handleSubmit() {
    if (!respondent) return
    if (missing.length > 0) { setError('Please complete all scores and comments, or mark items as not applicable.'); return }
    setSubmitting(true)
    setError(null)
    try {
      const submitScores: Record<string, number> = {}
      const submitRag: Record<string, string> = {}
      const submitComments: Record<string, string> = {}
      for (const cat of structure) {
        if (skippedThemes.has(cat.key)) continue
        for (const m of cat.measures) {
          if (skippedMeasures.has(m.key)) continue
          if (m.measure_type === 'rag') submitRag[m.key] = rag[m.key]
          else submitScores[m.key] = scores[m.key]
          submitComments[m.key] = (comments[m.key] ?? '').trim()
        }
      }
      await submitScorecard({
        cycle_id: cycleId,
        attendee_id: attendeeId,
        scores: submitScores,
        rag_scores: submitRag,
        comments: submitComments,
        skipped_measures: Array.from(skippedMeasures),
        skipped_themes: Array.from(skippedThemes),
      })
      clearDraft()
      setSubmitted(true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to submit the scorecard'
      // Clear on the duplicate-submission path too, or a stale draft outlives the form.
      if (/already been submitted|already submitted/i.test(msg)) { clearDraft(); setAlreadySubmitted(true) }
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

  // Asked nothing: say so honestly, rather than rendering an empty form whose footer
  // would read "All set — ready to submit" over a scorecard with no answers in it.
  if (noMeasures) {
    return (
      <div className="min-h-screen flex items-center justify-center dark bg-slate-950 p-6">
        <div className="max-w-md text-center space-y-3">
          <ClipboardList className="mx-auto text-slate-400" size={40} />
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Nothing to score yet</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No scorecard measures are assigned to {respondent?.team ? <strong>{respondent.team}</strong> : 'your team'} for
            this cycle, so there is nothing for you to fill in. Please contact the VMO coordinator if you were expecting
            to review {meta?.vendor_name ? <strong>{meta.vendor_name}</strong> : 'this vendor'}.
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
                {meta?.quarter} {meta?.year} · rate each measure 1 (systemic gaps) – 5 (significantly proactive)
              </p>
            </div>
          </div>

          {/* Scoring guide (High-Level Summary) */}
          <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">Scoring guide</p>
            <ul className="space-y-1">
              {SCORE_OPTIONS.map((n) => (
                <li key={n} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <span className="w-4 h-4 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
                  <span>{SCORE_LABELS[n]}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <p>Do not include personal information in comments. Names and other personal data are automatically removed before storage and shown as placeholders, for example <span className="font-semibold">[PERSON NAME]</span>.</p>
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
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                              {m.label}
                              {m.measure_type === 'rag' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" title="Colour-coded status — not included in the numeric score">
                                  Status only
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{m.description}</p>
                          </div>
                          <label className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 shrink-0 cursor-pointer">
                            <input type="checkbox" checked={measureSkipped} onChange={() => toggleMeasure(m.key)} className="rounded border-slate-300" />
                            N/A
                          </label>
                        </div>

                        {!measureSkipped && (
                          <>
                            {m.measure_type === 'rag' ? (
                              <div className="flex flex-wrap gap-2">
                                {RAG_OPTIONS.map((opt) => (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => setRag((r) => ({ ...r, [m.key]: opt }))}
                                    className={cn(
                                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                                      rag[m.key] === opt
                                        ? 'border-transparent ' + RAG_META[opt].chip
                                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-400'
                                    )}
                                  >
                                    <span className={cn('w-2 h-2 rounded-full', RAG_META[opt].dot)} />
                                    {RAG_META[opt].label}
                                  </button>
                                ))}
                              </div>
                            ) : (
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
                            )}
                            {m.measure_type !== 'rag' && (scores[m.key] < 2 || scores[m.key] > 4) && (
                              <div className="flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300">
                                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                                <span>
                                  You rated this <strong>{scores[m.key]} — {SCORE_LABELS[scores[m.key]]}</strong>, an extreme of the scale.
                                  Please make sure your comment clearly explains {scores[m.key] < 2 ? 'the specific gap' : 'the tangible business benefit'}.
                                </span>
                              </div>
                            )}
                            <div>
                              <textarea
                                value={comments[m.key] ?? ''}
                                onChange={(e) => setComments((c) => ({ ...c, [m.key]: e.target.value }))}
                                rows={2}
                                maxLength={COMMENT_MAX_LENGTH}
                                placeholder="Comment (required)"
                                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                              {/* The cap truncates a long paste silently, so always show where it bites. */}
                              <p className={cn(
                                'mt-0.5 text-right text-[10px]',
                                (comments[m.key] ?? '').length >= COMMENT_MAX_LENGTH
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-400'
                              )}>
                                {(comments[m.key] ?? '').length}/{COMMENT_MAX_LENGTH}
                              </p>
                            </div>
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

        {/* Right — Consolidated Scorecard (pinned), with a toggle to consult the
            previous cycle's scorecard (all teams) while filling this one in. */}
        <aside className="w-full lg:w-[560px] shrink-0 lg:sticky lg:top-[76px] self-stretch lg:self-start">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {scoreView === 'previous'
                ? `Previous Scorecard${meta?.previous_label ? ` — ${meta.previous_label}` : ''}`
                : 'Consolidated Scorecard'}
            </p>
            {meta?.previous_cycle_id && previousWeighted && previousWeighted.teams.length > 0 && (
              <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 shrink-0">
                {(['current', 'previous'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setScoreView(v)}
                    className={cn(
                      'px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors',
                      scoreView === v
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    )}
                  >
                    {v === 'current' ? 'This cycle' : `Previous${meta?.previous_label ? ` (${meta.previous_label})` : ''}`}
                  </button>
                ))}
              </div>
            )}
          </div>
          {scoreView === 'previous' ? (
            previousWeighted && previousWeighted.teams.length > 0 ? (
              <div className="lg:max-h-[calc(100vh-96px)] overflow-y-auto">
                <WeightedScorecardTable data={previousWeighted} />
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                No consolidated scores were recorded for the previous cycle.
              </div>
            )
          ) : weighted && weighted.teams.length > 0 ? (
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
