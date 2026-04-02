import { useState } from 'react'
import { Cpu, Info } from 'lucide-react'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import SlotCard from './SlotCard'
import type { SlotProposal } from '@/types/scheduling.types'
import type { AgentStatus } from '@/types/agent.types'

interface SlotRankingPanelProps {
  slots: SlotProposal[]
  onSlotApproved: (slotId: string) => void
}

export default function SlotRankingPanel({
  slots,
  onSlotApproved,
}: SlotRankingPanelProps) {
  const [agentStatus] = useState<AgentStatus>('complete')
  const [isProcessing, setIsProcessing] = useState(false)

  function handleApprove(slotId: string) {
    setIsProcessing(true)
    setTimeout(() => {
      setIsProcessing(false)
      onSlotApproved(slotId)
    }, 1000)
  }

  return (
    <div className="space-y-4 fade-in">
      {/* Header card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center shrink-0">
              <Cpu size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                Slot Ranking
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Deterministic algorithm — no AI involvement in ranking
              </p>
            </div>
          </div>
          <AgentStatusBadge status={agentStatus} />
        </div>

        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-start gap-2">
          <Info size={14} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 dark:text-blue-400">
            The scheduling agent has analysed availability for all 9 attendees
            and ranked {slots.length} viable slots. Ranking uses hard constraints
            (organiser &amp; exec sponsor availability) and soft scores
            (attendance coverage, timezone suitability). Select a slot to
            generate a calendar invite draft.
          </p>
        </div>
      </div>

      {/* Slot cards */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {slots.map((slot, idx) => (
          <SlotCard
            key={slot.slot_id}
            slot={slot}
            rank={idx + 1}
            onApprove={handleApprove}
            isProcessing={isProcessing}
          />
        ))}
      </div>

      {/* Algorithm explainer */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
          Ranking Algorithm
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          {[
            { label: 'Organiser available', type: 'Hard constraint', color: 'text-red-600 dark:text-red-400' },
            { label: 'Exec Sponsor available', type: 'Hard constraint', color: 'text-red-600 dark:text-red-400' },
            { label: 'Max group attendance', type: 'Soft score', color: 'text-blue-600 dark:text-blue-400' },
            { label: 'Conflict count', type: '−10 per conflict', color: 'text-amber-600 dark:text-amber-400' },
            { label: 'Timezone suitability', type: '+5 bonus', color: 'text-emerald-600 dark:text-emerald-400' },
          ].map((rule) => (
            <div key={rule.label} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5">
              <p className="font-medium text-slate-700 dark:text-slate-300">{rule.label}</p>
              <p className={rule.color}>{rule.type}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
