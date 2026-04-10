import { useState, useRef } from 'react'
import { TrendingUp, CheckCircle2, ChevronDown, ChevronRight, Info } from 'lucide-react'
import type { CompiledScorecard, CompiledParameter, IndividualScore } from '@/types/scorecard.types'
import { PARAMETER_TOOLTIPS } from '@/types/scorecard.types'
import { cn } from '@/utils/cn'

interface Props {
  scorecard: CompiledScorecard
}

function scoreColor(score: number | null) {
  if (score === null) return 'text-slate-400 dark:text-slate-500'
  if (score >= 4.5) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 3.5) return 'text-blue-600 dark:text-blue-400'
  if (score >= 2.5) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function avgBg(value: number | null) {
  if (value === null) return 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
  if (value >= 4.5) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
  if (value >= 3.5) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
  if (value >= 2.5) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
}

function ScoreCell({ value }: { value: number | null }) {
  return (
    <span className={cn('inline-flex items-center justify-center px-2 py-0.5 rounded font-semibold text-sm min-w-[3rem]', avgBg(value))}>
      {value !== null ? value.toFixed(2) : '—'}
    </span>
  )
}

/* ── Hover Tooltip for individual scores ─────────────────────── */

function ScoreTooltip({ scores, label }: { scores: IndividualScore[]; label: string }) {
  return (
    <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-slate-900 dark:bg-slate-700 text-white rounded-lg shadow-xl p-3 pointer-events-none">
      <p className="text-xs font-semibold mb-2 text-slate-300">{label} Breakdown</p>
      <div className="space-y-1.5">
        {scores.map((s, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-slate-300 truncate mr-2">{s.name}</span>
            <span className={cn(
              'font-bold px-1.5 py-0.5 rounded text-xs',
              s.score >= 4.5 ? 'bg-emerald-900/50 text-emerald-300'
                : s.score >= 3.5 ? 'bg-blue-900/50 text-blue-300'
                : s.score >= 2.5 ? 'bg-amber-900/50 text-amber-300'
                : 'bg-red-900/50 text-red-300'
            )}>
              {s.score}
            </span>
          </div>
        ))}
      </div>
      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-slate-900 dark:border-t-slate-700" />
    </div>
  )
}

function HoverableScoreCell({
  value,
  count,
  scores,
  label,
}: {
  value: number | null
  count: number
  scores?: IndividualScore[]
  label: string
}) {
  const [showTooltip, setShowTooltip] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasScores = scores && scores.length > 0

  function handleMouseEnter() {
    if (!hasScores) return
    timeoutRef.current = setTimeout(() => setShowTooltip(true), 200)
  }

  function handleMouseLeave() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setShowTooltip(false)
  }

  return (
    <div
      className="relative inline-flex items-center gap-1 cursor-default"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className={cn('font-semibold text-sm', scoreColor(value))}>
        {value !== null ? value.toFixed(1) : '—'}
      </span>
      {count > 0 && (
        <span className="text-xs text-slate-400">({count})</span>
      )}
      {showTooltip && hasScores && (
        <ScoreTooltip scores={scores} label={label} />
      )}
    </div>
  )
}

/* ── Gap indicator between internal and vendor ────────────────── */

function GapIndicator({ internal, vendor }: { internal: number | null; vendor: number | null }) {
  if (internal === null || vendor === null) return null
  const gap = Math.abs(internal - vendor)
  if (gap < 0.5) return null
  return (
    <span className={cn(
      'text-[10px] font-bold px-1 py-0.5 rounded',
      gap >= 1.5 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        : gap >= 1 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
    )}>
      Δ {gap.toFixed(1)}
    </span>
  )
}

export default function CompiledScorecardTable({ scorecard }: Props) {
  const [panelOpen, setPanelOpen] = useState(true)
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    scorecard.categories.forEach((c) => { init[c.category] = true })
    return init
  })

  const {
    internal_respondents,
    vendor_respondents,
    overall_internal_avg,
    overall_vendor_avg,
    categories,
  } = scorecard

  const totalRespondents = internal_respondents + vendor_respondents

  function toggleCat(category: string) {
    setExpandedCats((prev) => ({ ...prev, [category]: !prev[category] }))
  }

  function expandAll() {
    const next: Record<string, boolean> = {}
    categories.forEach((c) => { next[c.category] = true })
    setExpandedCats(next)
  }

  function collapseAll() {
    const next: Record<string, boolean> = {}
    categories.forEach((c) => { next[c.category] = false })
    setExpandedCats(next)
  }

  const allExpanded = categories.every((c) => expandedCats[c.category])

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {/* Header — click to collapse/expand entire panel */}
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="w-full px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
        >
          <CheckCircle2 size={15} className="text-emerald-500" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Compiled Scorecard
          </h3>
          <span className="ml-auto flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
            {totalRespondents} respondent{totalRespondents !== 1 ? 's' : ''} ({internal_respondents} internal, {vendor_respondents} vendor)
            {panelOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </button>

        {panelOpen && (
          <>
            {/* Controls bar */}
            <div className="px-5 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                <Info size={11} />
                <span>Hover over scores to see individual respondent breakdown</span>
              </div>
              <button
                onClick={allExpanded ? collapseAll : expandAll}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium transition-colors"
              >
                {allExpanded ? 'Collapse All' : 'Expand All'}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 w-56">
                      Category / Parameter
                    </th>
                    <th className="px-3 py-2.5 font-medium text-center min-w-[7rem]">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
                        <span className="text-blue-700 dark:text-blue-400">Internal Stakeholder</span>
                      </div>
                    </th>
                    <th className="px-3 py-2.5 font-medium text-center min-w-[7rem]">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm bg-orange-500" />
                        <span className="text-orange-700 dark:text-orange-400">Vendor</span>
                      </div>
                    </th>
                    <th className="px-3 py-2.5 font-medium text-center w-16">
                      <span className="text-slate-500 dark:text-slate-400">Gap</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {categories.map((cat) => {
                    const isExpanded = expandedCats[cat.category] ?? true
                    return (
                      <CategorySection
                        key={cat.category}
                        cat={cat}
                        isExpanded={isExpanded}
                        onToggle={() => toggleCat(cat.category)}
                      />
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                    <td className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300">
                      Overall Score
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <ScoreCell value={overall_internal_avg} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <ScoreCell value={overall_vendor_avg} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <GapIndicator internal={overall_internal_avg} vendor={overall_vendor_avg} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <TrendingUp size={12} className="text-emerald-500" />
                Scores compiled from {totalRespondents} valid submission{totalRespondents !== 1 ? 's' : ''}
              </div>
              <div className="ml-auto flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> &lt;3 Low</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> 2.5–3.5</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" /> 3.5–4.5</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> 4.5+ Excellent</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Category section with collapse/expand ───────────────────── */

function CategorySection({
  cat,
  isExpanded,
  onToggle,
}: {
  cat: CompiledScorecard['categories'][number]
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      {/* Category header row — clickable to expand/collapse */}
      <tr
        className="bg-slate-50/80 dark:bg-slate-800/40 cursor-pointer hover:bg-slate-100/80 dark:hover:bg-slate-800/60 transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-2 font-semibold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wide">
          <span className="inline-flex items-center gap-1.5">
            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            {cat.category_label}
          </span>
        </td>
        <td className="px-3 py-2 text-center">
          <ScoreCell value={cat.internal_avg} />
        </td>
        <td className="px-3 py-2 text-center">
          <ScoreCell value={cat.vendor_avg} />
        </td>
        <td className="px-3 py-2 text-center">
          <GapIndicator internal={cat.internal_avg} vendor={cat.vendor_avg} />
        </td>
      </tr>
      {/* Parameter rows — visible only when expanded */}
      {isExpanded && cat.parameters.map((param: CompiledParameter) => {
        const isLowScore = (param.internal_avg !== null && param.internal_avg < 3) || (param.vendor_avg !== null && param.vendor_avg < 3)
        const hasHighGap = param.internal_avg !== null && param.vendor_avg !== null && Math.abs(param.internal_avg - param.vendor_avg) >= 1.5

        return (
          <tr
            key={param.parameter_key}
            className={cn(
              'transition-colors',
              isLowScore ? 'bg-red-50/40 dark:bg-red-900/10' : hasHighGap ? 'bg-amber-50/30 dark:bg-amber-900/10' : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/30',
            )}
          >
            <td className="px-4 py-2 pl-10 text-slate-600 dark:text-slate-400 whitespace-nowrap">
              <span className="flex items-center gap-1.5 group/param">
                {param.parameter_label}
                {PARAMETER_TOOLTIPS[param.parameter_key] && (
                  <span className="relative">
                    <Info size={11} className="text-slate-300 dark:text-slate-600 group-hover/param:text-slate-500 dark:group-hover/param:text-slate-400 transition-colors cursor-help" />
                    <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-48 px-2.5 py-1.5 bg-slate-900 dark:bg-slate-600 text-white text-[10px] leading-snug rounded-md shadow-lg opacity-0 pointer-events-none group-hover/param:opacity-100 transition-opacity whitespace-normal text-center">
                      {PARAMETER_TOOLTIPS[param.parameter_key]}
                    </span>
                  </span>
                )}
                {isLowScore && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="Low score" />}
                {hasHighGap && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="High gap" />}
              </span>
            </td>
            <td className="px-3 py-2 text-center">
              <HoverableScoreCell
                value={param.internal_avg}
                count={param.internal_count}
                scores={param.internal_scores}
                label="Internal Stakeholder"
              />
            </td>
            <td className="px-3 py-2 text-center">
              <HoverableScoreCell
                value={param.vendor_avg}
                count={param.vendor_count}
                scores={param.vendor_scores}
                label="Vendor"
              />
            </td>
            <td className="px-3 py-2 text-center">
              <GapIndicator internal={param.internal_avg} vendor={param.vendor_avg} />
            </td>
          </tr>
        )
      })}
    </>
  )
}
