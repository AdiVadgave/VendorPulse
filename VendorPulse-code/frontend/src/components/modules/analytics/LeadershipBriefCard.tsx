import { useState } from 'react'
import { Sparkles, TrendingUp, TrendingDown, Minus, AlertTriangle, Clock, Target } from 'lucide-react'
import type { LeadershipBrief } from '@/types/analytics.types'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import type { AgentStatus } from '@/types/agent.types'
import { cn } from '@/utils/cn'

interface Props {
  vendorId: string
  vendorName: string
  brief: LeadershipBrief | null
  onGenerate: () => void
}

const TRAJECTORY_CONFIG = {
  improving: { label: 'Improving', icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  stable: { label: 'Stable', icon: Minus, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800' },
  declining: { label: 'Declining', icon: TrendingDown, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
}

export default function LeadershipBriefCard({ vendorName, brief, onGenerate }: Props) {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>(brief ? 'complete' : 'idle')

  function handleGenerate() {
    setAgentStatus('running')
    setTimeout(() => {
      setAgentStatus('complete')
      onGenerate()
    }, 2000)
  }

  const trajectoryConfig = brief ? TRAJECTORY_CONFIG[brief.trajectory] : null
  const TrajectoryIcon = trajectoryConfig?.icon

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-50 dark:bg-violet-900/30 rounded-lg flex items-center justify-center">
            <Sparkles size={18} className="text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Leadership Brief</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{vendorName} · Claude-generated</p>
          </div>
        </div>
        <AgentStatusBadge status={agentStatus} />
      </div>

      {!brief ? (
        <div className="p-5">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Generate an executive briefing card synthesising vendor trajectory, recurring issues,
            prior commitments, and recommended focus areas.
          </p>
          <button
            onClick={handleGenerate}
            disabled={agentStatus === 'running'}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Sparkles size={14} />
            {agentStatus === 'running' ? 'Generating brief...' : 'Generate Leadership Brief'}
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {/* Trajectory */}
          <div className="p-5">
            <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg mb-3', trajectoryConfig?.bg)}>
              {TrajectoryIcon && <TrajectoryIcon size={16} className={trajectoryConfig?.color} />}
              <span className={cn('text-sm font-semibold', trajectoryConfig?.color)}>
                {trajectoryConfig?.label}
              </span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {brief.trajectory_summary}
            </p>
          </div>

          {/* Recurring issues */}
          <div className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={13} className="text-red-400" />
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Recurring Issues
              </h4>
            </div>
            <ul className="space-y-1.5">
              {brief.recurring_issues.map((issue, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 mt-1.5" />
                  {issue}
                </li>
              ))}
            </ul>
          </div>

          {/* Prior commitments */}
          <div className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={13} className="text-amber-400" />
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Prior Commitments
              </h4>
            </div>
            <ul className="space-y-1.5">
              {brief.prior_commitments.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                  {c}
                </li>
              ))}
            </ul>
          </div>

          {/* Recommended focus */}
          <div className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Target size={13} className="text-indigo-400" />
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Recommended Focus Areas
              </h4>
            </div>
            <ul className="space-y-1.5">
              {brief.recommended_focus.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/30">
            <button
              onClick={handleGenerate}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
            >
              Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
