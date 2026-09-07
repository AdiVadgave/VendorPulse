import { useState } from 'react'
import {
  Sparkles, Check, Lock, ChevronDown, ChevronRight,
  Shield, Handshake, AlertOctagon, RotateCcw,
} from 'lucide-react'
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
  /** Choose one of the generated responses — moves the item to the "Chosen Responses" section. */
  onSelectResponse: (pushbackId: string, responseId: string) => void
}

const STANCE_CONFIG = {
  factual: { label: 'Factual', icon: <Shield size={11} />, dot: 'text-blue-500' },
  neutral: { label: 'Neutral', icon: <Handshake size={11} />, dot: 'text-emerald-500' },
  escalation: { label: 'Escalation', icon: <AlertOctagon size={11} />, dot: 'text-red-500' },
}

function PushbackCard({
  cycleId,
  item,
  responses,
  onGenerate,
  onSelectResponse,
}: {
  cycleId: string
  item: PushbackItem
  responses: PushbackResponse[]
  onGenerate: (responses: PushbackResponse[]) => void
  onSelectResponse: (responseId: string) => void
}) {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>(responses.length > 0 ? 'complete' : 'idle')
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(true)

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

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      {/* Pushback header — click to expand/collapse */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v) } }}
        className={cn(
          'px-5 py-4 cursor-pointer select-none hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors',
          open && 'border-b border-slate-100 dark:border-slate-800'
        )}
      >
        <div className={cn('flex items-center justify-between gap-3', open && 'mb-2')}>
          <div className="flex items-center gap-2 min-w-0">
            {open ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
            <span className="text-xs bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 px-2 py-0.5 rounded font-medium shrink-0">
              {PUSHBACK_CATEGORY_LABELS[item.category]}
            </span>
            {!open && (
              <span className="text-sm text-slate-600 dark:text-slate-400 truncate">{item.description}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {item.needs_legal_review && (
              <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded font-medium">
                <Lock size={11} />
                Legal Review Required
              </span>
            )}
            <AgentStatusBadge status={agentStatus} />
          </div>
        </div>
        {open && (
          <>
            <p className="text-sm text-slate-700 dark:text-slate-300 mb-1 pl-6">{item.description}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 pl-6">Raised by: {item.raised_by}</p>
          </>
        )}
      </div>

      {/* Body — generate, then show the 3 responses inline with a "choose" action. */}
      {!open ? null : item.needs_legal_review ? (
        <div className="px-5 py-4 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Lock size={14} />
          AI response drafts excluded — requires legal/commercial review before Shell can respond.
        </div>
      ) : responses.length > 0 ? (
        <div className="px-5 py-4 space-y-2.5">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Choose the response to use
          </p>
          {responses.map((r) => {
            const scfg = STANCE_CONFIG[r.stance]
            return (
              <div
                key={r.response_id}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 p-3 space-y-2"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span className={scfg.dot}>{scfg.icon}</span>
                  {scfg.label}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">{r.content}</p>
                <button
                  onClick={() => onSelectResponse(r.response_id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                >
                  <Check size={12} /> Choose this response
                </button>
              </div>
            )
          })}
          <button
            onClick={handleGenerate}
            disabled={agentStatus === 'running'}
            className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 font-medium disabled:opacity-60"
          >
            <RotateCcw size={12} /> {agentStatus === 'running' ? 'Regenerating…' : 'Regenerate options'}
          </button>
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
          )}
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
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function PushbackResponseCards({ cycleId, items, responses, onGenerate, onSelectResponse }: Props) {
  // Only items that still need an AI-response decision — they live right under the
  // "Add Vendor Disagreement" form (same section). Legal-review items (no AI drafts)
  // and any item with a chosen response skip this and go straight to the Pushback
  // Tracker below.
  const pending = items.filter(
    (i) => !i.needs_legal_review && !(responses[i.pushback_id] ?? []).some((r) => r.is_selected)
  )

  if (pending.length === 0) return null

  return (
    <div className="space-y-2">
      {pending.map((item) => (
        <PushbackCard
          key={item.pushback_id}
          cycleId={cycleId}
          item={item}
          responses={responses[item.pushback_id] ?? []}
          onGenerate={(generated) => onGenerate(item.pushback_id, generated)}
          onSelectResponse={(responseId) => onSelectResponse(item.pushback_id, responseId)}
        />
      ))}
    </div>
  )
}
