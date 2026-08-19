import { useState } from 'react'
import { Sparkles, Check, Lock, ChevronDown, ChevronRight } from 'lucide-react'
import type { PushbackItem, PushbackResponse, PushbackCategory } from '@/types/vendor-prep.types'
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
}

function PushbackCard({
  cycleId,
  item,
  responses,
  onGenerate,
}: {
  cycleId: string
  item: PushbackItem
  responses: PushbackResponse[]
  onGenerate: (responses: PushbackResponse[]) => void
}) {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>(responses.length > 0 ? 'complete' : 'idle')
  const [error, setError] = useState<string | null>(null)
  // Collapsed by default once handled (drafts ready or legal-locked); open when the
  // coordinator still needs to generate drafts — so a long list stays tidy.
  const [open, setOpen] = useState(responses.length === 0 && !item.needs_legal_review)

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
            {/* Collapsed: show a one-line preview inline so the card is a single row. */}
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
        {/* Expanded: full description + who raised it. */}
        {open && (
          <>
            <p className="text-sm text-slate-700 dark:text-slate-300 mb-1 pl-6">{item.description}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 pl-6">Raised by: {item.raised_by}</p>
          </>
        )}
      </div>

      {/* Response options — only when expanded */}
      {!open ? null : item.needs_legal_review ? (
        <div className="px-5 py-4 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Lock size={14} />
          AI response drafts excluded — requires legal/commercial review before Shell can respond.
        </div>
      ) : responses.length > 0 ? (
        // Once drafted, the select/edit UI lives in the Unresolved Item Tracker — keep this compact.
        <div className="px-5 py-4 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <Check size={14} />
          {responses.length} response draft{responses.length === 1 ? '' : 's'} ready — review, edit &amp; select in the
          Unresolved Item Tracker below.
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

export default function PushbackResponseCards({ cycleId, items, responses, onGenerate }: Props) {
  // Track which category groups are collapsed (all expanded by default).
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set())
  const toggleCat = (cat: string) =>
    setCollapsedCats((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })

  if (items.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center">
        <p className="text-sm text-slate-400 dark:text-slate-500">
          No pushback items yet. Use the form above to add vendor objections.
        </p>
      </div>
    )
  }

  // Group by category (in the standard category order) so all "Data Dispute" items
  // sit together, then "Process Concern", etc.
  const order = Object.keys(PUSHBACK_CATEGORY_LABELS) as PushbackCategory[]
  const groups = order
    .map((cat) => ({ cat, list: items.filter((i) => i.category === cat) }))
    .filter((g) => g.list.length > 0)

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      {/* Panel header */}
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Pushback Items &amp; Response Drafts ({items.length})
        </h3>
      </div>

      {/* One collapsible section per category */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {groups.map((g) => {
          const catOpen = !collapsedCats.has(g.cat)
          return (
            <div key={g.cat}>
              <button
                type="button"
                onClick={() => toggleCat(g.cat)}
                className="w-full flex items-center gap-2 px-5 py-3 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {catOpen ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
                <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wide">
                  {PUSHBACK_CATEGORY_LABELS[g.cat]}
                </span>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full px-1.5 min-w-[18px] text-center">
                  {g.list.length}
                </span>
              </button>
              {catOpen && (
                <div className="p-4 space-y-2 bg-slate-50/30 dark:bg-slate-800/20">
                  {g.list.map((item) => (
                    <PushbackCard
                      key={item.pushback_id}
                      cycleId={cycleId}
                      item={item}
                      responses={responses[item.pushback_id] ?? []}
                      onGenerate={(generated) => onGenerate(item.pushback_id, generated)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
