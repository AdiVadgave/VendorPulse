import { Fragment, useState } from 'react'
import { MessageSquare, ChevronDown, ChevronRight, Lock, Sparkles, RefreshCw, Loader2, Download } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { WeightedScorecard } from '@/types/scorecard.types'
import { downloadScorecardExcel } from '@/lib/scorecardApi'
import { RagDot, RagChip } from './rag'

interface Props {
  data: WeightedScorecard
  /** measure_key -> AI comment summary. When provided, a "Comment Summary" column is shown. */
  summaries?: Record<string, string>
  summaryLoading?: boolean
  summaryLlmUsed?: boolean
  onRegenerateSummary?: () => void
}

function scoreColor(v: number | null): string {
  if (v == null) return 'text-slate-400'
  if (v >= 4) return 'text-emerald-600 dark:text-emerald-400'
  if (v >= 3) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

/** Render newline-separated "- " bullet text as a point-wise list. */
function BulletList({ text }: { text: string }) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return <span className="text-slate-300 dark:text-slate-600">—</span>
  return (
    <ul className="space-y-1">
      {lines.map((l, i) => (
        <li key={i} className="flex gap-1.5">
          <span className="text-indigo-400 mt-0.5 shrink-0">•</span>
          <span>{l.replace(/^[-•]\s*/, '')}</span>
        </li>
      ))}
    </ul>
  )
}

export default function WeightedScorecardTable({ data, summaries, summaryLoading, summaryLlmUsed, onRegenerateSummary }: Props) {
  const [open, setOpen] = useState(false)
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({})
  const [commentMode, setCommentMode] = useState<'summary' | 'comments'>('summary')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      await downloadScorecardExcel(data.cycle_id)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Excel download failed')
    } finally {
      setExporting(false)
    }
  }
  const teams = data.teams
  const showSummary = summaries !== undefined
  const extraCols = showSummary ? 1 : 0

  if (data.submitted_count === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        No scorecards submitted yet. Once teams submit via their form links, the consolidated scorecard appears here.
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div
        onClick={() => setOpen((o) => !o)}
        className="px-5 py-3 flex items-center justify-between cursor-pointer select-none hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-slate-400 dark:text-slate-500">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
          <Lock size={13} className="text-slate-400" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Consolidated Scorecard</span>
          <span className="text-xs text-slate-400">· {teams.length} team{teams.length !== 1 ? 's' : ''} submitted · read-only</span>
        </div>
        <div className="flex items-center gap-3">
          {open && showSummary && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); void handleExport() }}
                disabled={exporting}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-60"
                title="Download as Excel — Sheet 1: team-wise comments · Sheet 2: AI summary (both with the full scorecard)"
              >
                {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                {exporting ? 'Preparing…' : 'Excel'}
              </button>
              {commentMode === 'summary' && onRegenerateSummary && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRegenerateSummary() }}
                  disabled={summaryLoading}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
                  title="Regenerate the AI comment summary"
                >
                  {summaryLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Regenerate
                  {summaryLlmUsed && <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">AI</span>}
                </button>
              )}
            </>
          )}
          <div className="text-right">
            <span className="text-xs text-slate-500 dark:text-slate-400 mr-2">Overall</span>
            <span className={cn('text-lg font-bold', scoreColor(data.overall_score))}>
              {data.overall_score != null ? data.overall_score.toFixed(1) : '—'}
            </span>
          </div>
        </div>
      </div>

      {open && <>
      {exportError && (
        <div className="px-4 py-2 border-t border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 text-xs text-red-700 dark:text-red-400">
          Excel export failed: {exportError}
        </div>
      )}
      <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-600 dark:text-slate-300">
              <th className="text-left px-4 py-3 font-medium sticky left-0 bg-slate-50 dark:bg-slate-800/50">Theme</th>
              <th className="text-left px-4 py-3 font-medium">Measure</th>
              {showSummary && (
                <th className="text-left px-4 py-3 font-medium min-w-[26rem]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="normal-case text-[11px] text-slate-400">Show:</span>
                    <div className="inline-flex rounded-md border border-slate-300 dark:border-slate-600 overflow-hidden normal-case">
                      <button
                        onClick={() => setCommentMode('summary')}
                        className={cn('flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium transition-colors',
                          commentMode === 'summary' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800')}
                      >
                        <Sparkles size={10} /> AI Summary
                      </button>
                      <button
                        onClick={() => setCommentMode('comments')}
                        className={cn('flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium transition-colors border-l border-slate-300 dark:border-slate-600',
                          commentMode === 'comments' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800')}
                      >
                        <MessageSquare size={10} /> Team Comments
                      </button>
                    </div>
                  </div>
                </th>
              )}
              {teams.map((t) => (
                <th key={t.attendee_id} className="text-center px-4 py-3 font-medium whitespace-nowrap min-w-[6rem]" title={t.email}>
                  {t.team || t.name || t.email}
                </th>
              ))}
              <th className="text-center px-4 py-3 font-medium bg-emerald-50/60 dark:bg-emerald-900/10">Avg</th>
              <th className="text-center px-4 py-3 font-medium">Wt%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.categories.map((cat) => (
              cat.measures.map((m, mi) => {
                const commentEntries = Object.entries(m.comments)
                const isOpen = openComments[m.key]
                return (
                  <Fragment key={m.key}>
                    <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      {mi === 0 ? (
                        <td
                          rowSpan={cat.measures.length}
                          className="align-top px-4 py-3.5 font-semibold text-slate-800 dark:text-slate-200 border-r border-slate-100 dark:border-slate-800 sticky left-0 bg-white dark:bg-slate-900"
                        >
                          <div>{cat.label}</div>
                          <div className="text-[11px] font-normal text-slate-400 mt-0.5">
                            Cat avg <span className={scoreColor(cat.category_average)}>{cat.category_average != null ? cat.category_average.toFixed(1) : '—'}</span>
                          </div>
                        </td>
                      ) : null}
                      <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-1.5">
                          {m.label}
                          {!showSummary && commentEntries.length > 0 && (
                            <button
                              onClick={() => setOpenComments((s) => ({ ...s, [m.key]: !s[m.key] }))}
                              className="text-slate-400 hover:text-indigo-500"
                              title="Show comments"
                            >
                              {isOpen ? <ChevronDown size={13} /> : <MessageSquare size={13} />}
                            </button>
                          )}
                        </div>
                      </td>
                      {showSummary && (
                        <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed align-top min-w-[26rem]">
                          {commentMode === 'summary' ? (
                            summaries?.[m.key]
                              ? <BulletList text={summaries[m.key]} />
                              : summaryLoading
                                ? <span className="text-slate-400 inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Summarising…</span>
                                : <span className="text-slate-300 dark:text-slate-600">—</span>
                          ) : (
                            (() => {
                              const entries = teams
                                .map((t) => ({ label: t.team || t.name || t.email, text: m.comments[t.attendee_id] }))
                                .filter((e) => (e.text || '').trim())
                              return entries.length > 0 ? (
                                <ul className="space-y-1.5">
                                  {entries.map((e, i) => (
                                    <li key={i}>
                                      <span className="font-semibold text-slate-700 dark:text-slate-300">{e.label}:</span> {e.text}
                                    </li>
                                  ))}
                                </ul>
                              ) : <span className="text-slate-300 dark:text-slate-600">—</span>
                            })()
                          )}
                        </td>
                      )}
                      {teams.map((t) => {
                        const isRag = m.measure_type === 'rag'
                        const v = m.team_scores[t.attendee_id]
                        return (
                          <td key={t.attendee_id} className="text-center px-4 py-3.5 text-slate-600 dark:text-slate-400">
                            {isRag
                              ? <RagDot value={m.team_rag?.[t.attendee_id]} />
                              : (v == null ? <span className="text-slate-300 dark:text-slate-600">—</span> : v)}
                          </td>
                        )
                      })}
                      <td className={cn('text-center px-4 py-3.5 font-semibold bg-emerald-50/60 dark:bg-emerald-900/10', scoreColor(m.average))}>
                        {m.measure_type === 'rag'
                          ? <RagChip value={m.rag_consensus} />
                          : (m.average != null ? m.average.toFixed(1) : '—')}
                      </td>
                      {mi === 0 ? (
                        <td rowSpan={cat.measures.length} className="text-center px-4 py-3.5 text-slate-500 dark:text-slate-400 align-middle">
                          {cat.weight}%
                        </td>
                      ) : null}
                    </tr>
                    {!showSummary && isOpen && commentEntries.length > 0 && (
                      <tr className="bg-slate-50/70 dark:bg-slate-800/30">
                        <td colSpan={teams.length + 3 + extraCols} className="px-4 py-3">
                          <div className="space-y-1">
                            {commentEntries.map(([aid, text]) => {
                              const t = teams.find((x) => x.attendee_id === aid)
                              return (
                                <p key={aid} className="text-xs text-slate-600 dark:text-slate-400">
                                  <span className="font-semibold text-slate-700 dark:text-slate-300">{t?.team || t?.name || aid}:</span> {text}
                                </p>
                              )
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-1.5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
        Blank (—) = team marked this measure as not applicable. RAG measures are colour-coded status only and do not affect the score. Overall = weighted average of theme averages.
      </div>
      </>}
    </div>
  )
}
