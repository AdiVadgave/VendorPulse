import { useState } from 'react'
import { Sparkles, TrendingUp, TrendingDown, Minus, CheckCircle2, AlertTriangle, Send } from 'lucide-react'
import type { VendorBrief } from '@/types/vendor-prep.types'
import type { CompiledScorecard } from '@/types/scorecard.types'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import ApprovalPanel from '@/components/shared/ApprovalPanel'
import type { AgentStatus } from '@/types/agent.types'
import { cn } from '@/utils/cn'

interface Props {
  vendorName: string
  brief: VendorBrief | null
  compiledScorecard?: CompiledScorecard | null
  onBriefGenerated: (brief: VendorBrief) => void
  onBriefApproved: () => void
}

const TREND_ICON = {
  up: <TrendingUp size={13} className="text-emerald-500" />,
  down: <TrendingDown size={13} className="text-red-500" />,
  flat: <Minus size={13} className="text-slate-400" />,
}

function ScoreDots({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={cn(
            'w-2 h-2 rounded-full',
            i <= Math.round(score)
              ? score >= 4 ? 'bg-emerald-500' : score >= 3 ? 'bg-blue-500' : 'bg-amber-500'
              : 'bg-slate-200 dark:bg-slate-700'
          )}
        />
      ))}
      <span className="ml-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">{score.toFixed(1)}</span>
    </div>
  )
}

export default function VendorBriefPanel({ vendorName, brief, compiledScorecard, onBriefGenerated, onBriefApproved }: Props) {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle')
  const [showApproval, setShowApproval] = useState(false)
  const [approved, setApproved] = useState(false)

  function handleGenerate() {
    setAgentStatus('running')
    setTimeout(() => {
      setAgentStatus('awaiting_approval')
      setShowApproval(true)

      // Build brief from compiled scorecard if available
      if (compiledScorecard && compiledScorecard.categories.length > 0) {
        const cs = compiledScorecard
        const iAvg = cs.overall_internal_avg ?? 0
        const vAvg = cs.overall_vendor_avg ?? 0
        const overall = (iAvg + vAvg) / 2

        const category_ratings = cs.categories.map((cat) => {
          const catI = cat.internal_avg ?? 0
          const catV = cat.vendor_avg ?? 0
          const avg = catI && catV ? (catI + catV) / 2 : catI || catV
          const gap = Math.abs(catI - catV)
          const trend: 'up' | 'down' | 'flat' = avg >= 3.5 ? 'up' : avg < 2.5 ? 'down' : 'flat'
          const rationale = gap > 1
            ? `Significant gap between Internal (${catI.toFixed(1)}) and Vendor (${catV.toFixed(1)}) — needs alignment discussion.`
            : `Internal: ${catI.toFixed(1)}, Vendor: ${catV.toFixed(1)} — ${avg >= 4 ? 'strong performance' : avg >= 3 ? 'acceptable, room for improvement' : 'requires attention'}.`
          return { category: cat.category_label, score: parseFloat(avg.toFixed(2)), rationale, trend }
        })

        const key_concerns: string[] = []
        const positive_areas: string[] = []
        cs.categories.forEach((cat) => {
          cat.parameters.forEach((p) => {
            const iS = p.internal_avg ?? 0
            const vS = p.vendor_avg ?? 0
            if (iS < 2.5 || vS < 2.5) key_concerns.push(`${p.parameter_label}: low score (Internal ${iS.toFixed(1)}, Vendor ${vS.toFixed(1)})`)
            if (Math.abs(iS - vS) > 1) key_concerns.push(`${p.parameter_label}: ${Math.abs(iS - vS).toFixed(1)} point gap between Internal and Vendor`)
            if (iS >= 4 && vS >= 4) positive_areas.push(`${p.parameter_label}: strong alignment (${iS.toFixed(1)} / ${vS.toFixed(1)})`)
          })
        })

        if (cs.key_recommendations.length > 0) {
          key_concerns.push(...cs.key_recommendations.slice(0, 2))
        }

        onBriefGenerated({
          overall_score: parseFloat(overall.toFixed(2)),
          overall_trend: overall >= 3.5 ? 'improving' : overall < 2.5 ? 'declining' : 'stable',
          category_ratings,
          key_concerns: key_concerns.slice(0, 5),
          positive_areas: positive_areas.slice(0, 5),
          open_actions: key_concerns.length,
          generated_at: new Date().toISOString(),
        })
      } else {
        // Fallback when no compiled scorecard is available
        onBriefGenerated({
          overall_score: 0,
          overall_trend: 'stable',
          category_ratings: [],
          key_concerns: ['No scorecard data available — compile scorecard first'],
          positive_areas: [],
          open_actions: 0,
          generated_at: new Date().toISOString(),
        })
      }
    }, 1800)
  }

  function handleApprove() {
    setShowApproval(false)
    setAgentStatus('complete')
    setApproved(true)
    onBriefApproved()
  }

  const trendLabel = brief?.overall_trend === 'improving' ? 'Improving'
    : brief?.overall_trend === 'declining' ? 'Declining' : 'Stable'

  const trendColor = brief?.overall_trend === 'improving'
    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
    : brief?.overall_trend === 'declining'
      ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
      : 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800'

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-orange-50 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
              <Sparkles size={18} className="text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Vendor Brief</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{vendorName} · Claude-generated</p>
            </div>
          </div>
          <AgentStatusBadge status={agentStatus} />
        </div>

        {!brief ? (
          <button
            onClick={handleGenerate}
            disabled={agentStatus === 'running'}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Sparkles size={14} />
            {agentStatus === 'running' ? 'Generating brief...' : 'Generate Vendor Brief'}
          </button>
        ) : (
          <div className="space-y-4">
            {/* Overall score */}
            <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
              <div className="text-center">
                <p className="text-3xl font-bold text-slate-900 dark:text-white">{brief.overall_score}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Overall Score</p>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', trendColor)}>
                    {brief.overall_trend === 'improving' ? <TrendingUp size={11} /> : brief.overall_trend === 'declining' ? <TrendingDown size={11} /> : <Minus size={11} />}
                    {trendLabel}
                  </span>
                  {approved && (
                    <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 size={12} />
                      Approved
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {brief.open_actions} open action items from prior cycles
                </p>
              </div>
            </div>

            {/* Category ratings */}
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                Category Ratings
              </p>
              <div className="space-y-2">
                {brief.category_ratings.map((cat) => (
                  <div key={cat.category} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <div className="flex items-center gap-2">
                        {TREND_ICON[cat.trend]}
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{cat.category}</span>
                      </div>
                      <ScoreDots score={cat.score} />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{cat.rationale}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Key concerns & positives */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-1">
                  <AlertTriangle size={12} /> Key Concerns
                </p>
                <ul className="space-y-1">
                  {brief.key_concerns.map((c, i) => (
                    <li key={i} className="text-xs text-red-700 dark:text-red-400 flex items-start gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-red-500 shrink-0 mt-1.5" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-lg">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Positive Areas
                </p>
                <ul className="space-y-1">
                  {brief.positive_areas.map((p, i) => (
                    <li key={i} className="text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-emerald-500 shrink-0 mt-1.5" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {!approved && (
              <button
                onClick={() => setShowApproval(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Send size={14} />
                Review & Approve Brief
              </button>
            )}
          </div>
        )}
      </div>

      {showApproval && brief && (
        <ApprovalPanel
          title="Approve Vendor Brief"
          summary={`Review the AI-generated vendor brief for ${vendorName} before the prep call.`}
          warnings={['This brief will be used to prepare the Zensar team — vendor does not see it directly.']}
          previewContent={
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {vendorName} — Q1 2026 Vendor Prep Brief
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Overall Score: <strong>{brief.overall_score}/5</strong> · Trend: {trendLabel}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Key concern: {brief.key_concerns[0]}
              </p>
            </div>
          }
          approveLabel="Approve Brief"
          onApprove={handleApprove}
          onCancel={() => { setShowApproval(false); if (agentStatus === 'awaiting_approval') setAgentStatus('idle') }}
        />
      )}
    </div>
  )
}
