import { Fragment, useState } from 'react'
import { MessageSquare, ChevronDown, Lock } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { WeightedScorecard } from '@/types/scorecard.types'
import { RagDot, RagChip } from './rag'

interface Props {
  data: WeightedScorecard
}

function scoreColor(v: number | null): string {
  if (v == null) return 'text-slate-400'
  if (v >= 4) return 'text-emerald-600 dark:text-emerald-400'
  if (v >= 3) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

export default function WeightedScorecardTable({ data }: Props) {
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({})
  const teams = data.teams

  if (data.submitted_count === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        No scorecards submitted yet. Once teams submit via their form links, the consolidated scorecard appears here.
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock size={13} className="text-slate-400" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Consolidated Scorecard</span>
          <span className="text-xs text-slate-400">· {teams.length} team{teams.length !== 1 ? 's' : ''} submitted · read-only</span>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-500 dark:text-slate-400 mr-2">Overall</span>
          <span className={cn('text-lg font-bold', scoreColor(data.overall_score))}>
            {data.overall_score != null ? data.overall_score.toFixed(1) : '—'}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
              <th className="text-left px-3 py-2 font-medium sticky left-0 bg-slate-50 dark:bg-slate-800/50">Theme</th>
              <th className="text-left px-3 py-2 font-medium">Measure</th>
              {teams.map((t) => (
                <th key={t.attendee_id} className="text-center px-3 py-2 font-medium whitespace-nowrap" title={t.email}>
                  {t.team || t.name || t.email}
                </th>
              ))}
              <th className="text-center px-3 py-2 font-medium bg-emerald-50/60 dark:bg-emerald-900/10">Avg</th>
              <th className="text-center px-3 py-2 font-medium">Wt%</th>
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
                          className="align-top px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-200 border-r border-slate-100 dark:border-slate-800 sticky left-0 bg-white dark:bg-slate-900"
                        >
                          <div>{cat.label}</div>
                          <div className="text-[11px] font-normal text-slate-400 mt-0.5">
                            Cat avg <span className={scoreColor(cat.category_average)}>{cat.category_average != null ? cat.category_average.toFixed(1) : '—'}</span>
                          </div>
                        </td>
                      ) : null}
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-1.5">
                          {m.label}
                          {commentEntries.length > 0 && (
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
                      {teams.map((t) => {
                        const isRag = m.measure_type === 'rag'
                        const v = m.team_scores[t.attendee_id]
                        return (
                          <td key={t.attendee_id} className="text-center px-3 py-2.5 text-slate-600 dark:text-slate-400">
                            {isRag
                              ? <RagDot value={m.team_rag?.[t.attendee_id]} />
                              : (v == null ? <span className="text-slate-300 dark:text-slate-600">—</span> : v)}
                          </td>
                        )
                      })}
                      <td className={cn('text-center px-3 py-2.5 font-semibold bg-emerald-50/60 dark:bg-emerald-900/10', scoreColor(m.average))}>
                        {m.measure_type === 'rag'
                          ? <RagChip value={m.rag_consensus} />
                          : (m.average != null ? m.average.toFixed(1) : '—')}
                      </td>
                      {mi === 0 ? (
                        <td rowSpan={cat.measures.length} className="text-center px-3 py-2.5 text-slate-500 dark:text-slate-400 align-middle">
                          {cat.weight}%
                        </td>
                      ) : null}
                    </tr>
                    {isOpen && commentEntries.length > 0 && (
                      <tr className="bg-slate-50/70 dark:bg-slate-800/30">
                        <td colSpan={teams.length + 3} className="px-3 py-2">
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
    </div>
  )
}
