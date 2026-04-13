import { useState } from 'react'
import { Sparkles, Check, Shield, Handshake, AlertOctagon, Lock } from 'lucide-react'
import type { PushbackItem, PushbackResponse } from '@/types/vendor-prep.types'
import { PUSHBACK_CATEGORY_LABELS } from '@/types/vendor-prep.types'
import { generatePushbackResponses } from '@/lib/vendorPrepApi'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import type { AgentStatus } from '@/types/agent.types'
import { cn } from '@/utils/cn'

interface Props {
  cycleId: string
  items: PushbackItem[]
  responses: Record<string, PushbackResponse[]>
  onGenerate: (pushbackId: string, responses: PushbackResponse[]) => void
  onSelectResponse: (pushbackId: string, responseId: string) => void
}

const STANCE_CONFIG = {
  factual: { label: 'Factual', icon: <Shield size={13} />, color: 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10' },
  neutral: { label: 'Neutral', icon: <Handshake size={13} />, color: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10' },
  escalation: { label: 'Escalation', icon: <AlertOctagon size={13} />, color: 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10' },
}

function PushbackCard({
  cycleId,
  item,
  responses,
  onGenerate,
  onSelect,
}: {
  cycleId: string
  item: PushbackItem
  responses: PushbackResponse[]
  onGenerate: (responses: PushbackResponse[]) => void
  onSelect: (id: string) => void
}) {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>(responses.length > 0 ? 'complete' : 'idle')
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setAgentStatus('running')
    setError(null)
    try {
      const response = await generatePushbackResponses(
        cycleId,
        item.pushback_id,
        item.category,
        item.description,
        item.raised_by,
        item.needs_legal_review
      )
      if (response.status === 'success' && response.data) {
        onGenerate(response.data.responses ?? [])
        setAgentStatus('complete')
      } else {
        setError(response.summary || 'Failed to generate responses')
        setAgentStatus('idle')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reach backend')
      setAgentStatus('idle')
    }
  }

  function handleSelect(id: string) {
    setSelected(id)
    onSelect(id)
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      {/* Pushback header */}
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-start justify-between gap-3 mb-2">
          <span className="text-xs bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 px-2 py-0.5 rounded font-medium">
            {PUSHBACK_CATEGORY_LABELS[item.category]}
          </span>
          <div className="flex items-center gap-2">
            {item.needs_legal_review && (
              <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded font-medium">
                <Lock size={11} />
                Legal Review Required
              </span>
            )}
            <AgentStatusBadge status={agentStatus} />
          </div>
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300 mb-1">{item.description}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">Raised by: {item.raised_by}</p>
      </div>

      {/* Response options */}
      {item.needs_legal_review ? (
        <div className="px-5 py-4 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Lock size={14} />
          AI response drafts excluded — requires legal/commercial review before Zensar can respond.
        </div>
      ) : responses.length > 0 ? (
        <div className="p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Response Options (Select one)
          </p>
          {responses.map((r) => {
            const cfg = STANCE_CONFIG[r.stance]
            const isSelected = selected === r.response_id
            return (
              <div
                key={r.response_id}
                onClick={() => handleSelect(r.response_id)}
                className={cn(
                  'relative p-3 rounded-lg border cursor-pointer transition-all',
                  cfg.color,
                  isSelected && 'ring-2 ring-indigo-500 dark:ring-indigo-400'
                )}
              >
                {isSelected && (
                  <div className="absolute top-2 right-2 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center">
                    <Check size={11} className="text-white" />
                  </div>
                )}
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    {cfg.icon} {cfg.label}
                  </span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed pr-6">{r.content}</p>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="px-5 py-4 space-y-2">
          <button
            onClick={handleGenerate}
            disabled={agentStatus === 'running'}
            className="w-full flex items-center justify-center gap-2 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Sparkles size={12} />
            {agentStatus === 'running' ? 'Drafting responses...' : 'Generate 3 Response Options'}
          </button>
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function PushbackResponseCards({ cycleId, items, responses, onGenerate, onSelectResponse }: Props) {
  if (items.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center">
        <p className="text-sm text-slate-400 dark:text-slate-500">
          No pushback items yet. Use the form above to add vendor objections.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        Pushback Items & Response Drafts ({items.length})
      </p>
      {items.map((item) => (
        <PushbackCard
          key={item.pushback_id}
          cycleId={cycleId}
          item={item}
          responses={responses[item.pushback_id] ?? []}
          onGenerate={(generated) => onGenerate(item.pushback_id, generated)}
          onSelect={(rid) => onSelectResponse(item.pushback_id, rid)}
        />
      ))}
    </div>
  )
}
