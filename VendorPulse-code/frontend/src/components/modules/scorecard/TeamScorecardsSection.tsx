import { Fragment, useMemo, useState } from 'react'
import { Users, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { WeightedScorecard } from '@/types/scorecard.types'
import { RagChip } from './rag'

interface Props {
  data: WeightedScorecard
}

function scoreColor(v: number | null): string {
  if (v == null) return 'text-slate-400'
  if (v >= 4) return 'text-emerald-600 dark:text-emerald-400'
  if (v >= 3) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

export default function TeamScorecardsSection({ data }: Props) {
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string>(data.teams[0]?.attendee_id ?? '')

  const team = data.teams.find((t) => t.attendee_id === activeId) ?? data.teams[0]

  // Compute the selected team's per-category average + weighted overall from
  // that team's own scores in the weighted payload.
  const view = useMemo(() => {
    if (!team) return null
    let wNum = 0
    let wDen = 0
    const categories = data.categories.map((cat) => {
      const measures = cat.measures.map((m) => ({
        key: m.key,
        label: m.label,
        description: m.description,
        measure_type: m.measure_type,
        score: m.team_scores[team.attendee_id] ?? null,
        rag: m.team_rag?.[team.attendee_id] ?? null,
        comment: m.comments[team.attendee_id] ?? '',
      }))
      const provided = measures.map((m) => m.score).filter((s): s is number => s != null)
      const avg = provided.length ? Math.round((provided.reduce((a, b) => a + b, 0) / provided.length) * 100) / 100 : null
      if (avg != null) { wNum += avg * cat.weight; wDen += cat.weight }
      return { key: cat.key, label: cat.label, weight: cat.weight, measures, avg }
    })
    const overall = wDen ? Math.round((wNum / wDen) * 100) / 100 : null
    return { categories, overall }
  }, [data, team])

  if (!team || !view) return null

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div
        onClick={() => setOpen((o) => !o)}
        className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap cursor-pointer select-none hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-slate-400 dark:text-slate-500">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
          <Users size={14} className="text-slate-400" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Individual Team Scorecards</span>
          <span className="text-xs text-slate-400">· {data.teams.length} team{data.teams.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-xs text-slate-500 dark:text-slate-400 mr-2">Team overall</span>
            <span className={cn('text-base font-bold', scoreColor(view.overall))}>
              {view.overall != null ? `${view.overall.toFixed(1)}/5` : '—'}
            </span>
          </div>
        </div>
      </div>

      {open && <>
      {/* Team selector */}
      <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1.5">
        {data.teams.map((t) => (
          <button
            key={t.attendee_id}
            onClick={() => setActiveId(t.attendee_id)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
              t.attendee_id === team.attendee_id
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            )}
            title={t.email}
          >
            {t.team || t.name || t.email}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <colgroup>
            <col style={{ width: '9rem' }} />
            <col style={{ width: '9rem' }} />
            <col style={{ width: '14rem' }} />
            <col style={{ width: '4rem' }} />
            <col style={{ width: '4rem' }} />
            <col style={{ width: '4rem' }} />
            <col style={{ width: '38rem' }} />
          </colgroup>
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-600 dark:text-slate-300">
              <th className="text-left px-3 py-2 font-medium">Theme</th>
              <th className="text-left px-3 py-2 font-medium">Measure</th>
              <th className="text-left px-3 py-2 font-medium">Description</th>
              <th className="text-center px-3 py-2 font-medium">Score</th>
              <th className="text-center px-3 py-2 font-medium">Avg</th>
              <th className="text-center px-3 py-2 font-medium">Weight</th>
              <th className="text-left px-3 py-2 font-medium">Comments</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {view.categories.map((cat) => (
              cat.measures.map((m, mi) => (
                <Fragment key={m.key}>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 align-top">
                    {mi === 0 && (
                      <td rowSpan={cat.measures.length} className="px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-200 border-r border-slate-100 dark:border-slate-800 align-top">
                        {cat.label}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300 whitespace-nowrap align-top">{m.label}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400 align-top">{m.description}</td>
                    <td className={cn('text-center px-3 py-2.5 font-semibold whitespace-nowrap align-top', m.measure_type === 'rag' ? '' : scoreColor(m.score))}>
                      {m.measure_type === 'rag'
                        ? <RagChip value={m.rag} />
                        : (m.score != null ? `${m.score}/5` : 'N/A')}
                    </td>
                    {mi === 0 && (
                      <td rowSpan={cat.measures.length} className={cn('text-center px-3 py-2.5 font-semibold align-top whitespace-nowrap', scoreColor(cat.avg))}>
                        {cat.avg != null ? `${cat.avg.toFixed(1)}/5` : '—'}
                      </td>
                    )}
                    {mi === 0 && (
                      <td rowSpan={cat.measures.length} className="text-center px-3 py-2.5 text-slate-500 dark:text-slate-400 align-top">
                        {cat.weight}%
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400 whitespace-pre-line leading-relaxed">
                      {m.comment || <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                  </tr>
                </Fragment>
              ))
            ))}
          </tbody>
        </table>
      </div>
      </>}
    </div>
  )
}
