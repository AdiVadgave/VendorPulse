import { useState } from 'react'
import {
  AlertTriangle, CheckCircle2, ExternalLink, Pencil, Trash2, X, Check,
  Shield, Handshake, AlertOctagon, ChevronDown, ChevronRight, Lock,
} from 'lucide-react'
import type { PushbackItem, PushbackResponse, PushbackCategory } from '@/types/vendor-prep.types'
import { PUSHBACK_CATEGORY_LABELS } from '@/types/vendor-prep.types'
import { format } from 'date-fns'
import { cn } from '@/utils/cn'

interface Props {
  items: PushbackItem[]
  /** Drafted responses per pushback item (keyed by pushback_id). */
  responses?: Record<string, PushbackResponse[]>
  onStatusChange: (id: string, status: PushbackItem['status']) => void
  onEdit?: (id: string, patch: Partial<Pick<PushbackItem, 'category' | 'description' | 'raised_by' | 'needs_legal_review'>>) => void
  /** Persist edited response drafts (content + which one is selected). */
  onEditResponses?: (id: string, responses: PushbackResponse[]) => void
  onDelete?: (id: string) => void
}

const STATUS_CONFIG = {
  OPEN: { label: 'Open', icon: <AlertTriangle size={12} />, classes: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
  RESOLVED: { label: 'Resolved', icon: <CheckCircle2 size={12} />, classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' },
  ESCALATED: { label: 'Escalated', icon: <ExternalLink size={12} />, classes: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
}

const STANCE_CONFIG = {
  factual: { label: 'Factual', icon: <Shield size={11} />, dot: 'text-blue-500' },
  neutral: { label: 'Neutral', icon: <Handshake size={11} />, dot: 'text-emerald-500' },
  escalation: { label: 'Escalation', icon: <AlertOctagon size={11} />, dot: 'text-red-500' },
}

function ItemRow({
  item, responses, onStatusChange, onEdit, onEditResponses, onDelete,
}: {
  item: PushbackItem
  responses: PushbackResponse[]
  onStatusChange: Props['onStatusChange']
  onEdit?: Props['onEdit']
  onEditResponses?: Props['onEditResponses']
  onDelete?: Props['onDelete']
}) {
  const [editing, setEditing] = useState(false)
  const [showResponses, setShowResponses] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [draft, setDraft] = useState({
    category: item.category,
    description: item.description,
    raised_by: item.raised_by,
    needs_legal_review: item.needs_legal_review,
  })
  // Editable copy of the drafted responses (stance content + which one is selected).
  const [draftResponses, setDraftResponses] = useState<PushbackResponse[]>(responses)

  const cfg = STATUS_CONFIG[item.status]
  const selected = responses.find((r) => r.is_selected)

  function startEdit() {
    setDraft({ category: item.category, description: item.description, raised_by: item.raised_by, needs_legal_review: item.needs_legal_review })
    setDraftResponses(responses.map((r) => ({ ...r })))
    setEditing(true)
  }

  function saveEdit() {
    if (!draft.description.trim() || !draft.raised_by.trim()) return
    onEdit?.(item.pushback_id, {
      category: draft.category,
      description: draft.description.trim(),
      raised_by: draft.raised_by.trim(),
      needs_legal_review: draft.needs_legal_review,
    })
    if (responses.length > 0 && onEditResponses) {
      onEditResponses(item.pushback_id, draftResponses.map((r) => ({ ...r, content: r.content.trim() })))
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="px-5 py-3.5 space-y-2 bg-slate-50/60 dark:bg-slate-800/30">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select
            value={draft.category}
            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as PushbackCategory }))}
            className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            {(Object.keys(PUSHBACK_CATEGORY_LABELS) as PushbackCategory[]).map((c) => (
              <option key={c} value={c}>{PUSHBACK_CATEGORY_LABELS[c]}</option>
            ))}
          </select>
          <input
            value={draft.raised_by}
            onChange={(e) => setDraft((d) => ({ ...d, raised_by: e.target.value }))}
            placeholder="Raised by"
            className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
        <textarea
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          rows={2}
          className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        {/* Edit the drafted responses inline — pick the stance to use and tweak its wording. */}
        {draftResponses.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Response drafts — select one &amp; edit
            </p>
            {draftResponses.map((r, idx) => {
              const scfg = STANCE_CONFIG[r.stance]
              return (
                <div
                  key={r.response_id}
                  className={cn(
                    'rounded-lg border p-2 space-y-1.5',
                    r.is_selected
                      ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/60 dark:bg-indigo-900/15'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                  )}
                >
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name={`resp-${item.pushback_id}`}
                      checked={!!r.is_selected}
                      onChange={() =>
                        setDraftResponses((prev) => prev.map((x, i) => ({ ...x, is_selected: i === idx })))
                      }
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className={scfg.dot}>{scfg.icon}</span>
                    {scfg.label}
                    {r.is_selected && (
                      <span className="flex items-center gap-0.5 text-indigo-600 dark:text-indigo-400"><Check size={10} /> Selected</span>
                    )}
                  </label>
                  <textarea
                    value={r.content}
                    onChange={(e) =>
                      setDraftResponses((prev) => prev.map((x, i) => (i === idx ? { ...x, content: e.target.value } : x)))
                    }
                    rows={3}
                    className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 text-slate-700 dark:text-slate-300 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              )
            })}
          </div>
        )}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.needs_legal_review}
              onChange={(e) => setDraft((d) => ({ ...d, needs_legal_review: e.target.checked }))}
              className="rounded border-slate-300 dark:border-slate-600 text-orange-600 focus:ring-orange-500"
            />
            Requires legal review
          </label>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setEditing(false)} className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X size={12} /> Cancel
            </button>
            <button onClick={saveEdit} disabled={!draft.description.trim() || !draft.raised_by.trim()} className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-medium">
              <Check size={12} /> Save
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-5 py-3.5">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-xs bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 px-1.5 py-0.5 rounded font-medium">
              {PUSHBACK_CATEGORY_LABELS[item.category]}
            </span>
            {item.needs_legal_review && (
              <span className="flex items-center gap-0.5 text-xs bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 px-1.5 py-0.5 rounded font-medium">
                <Lock size={9} /> Legal
              </span>
            )}
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300 mb-1">{item.description}</p>
          <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500 flex-wrap">
            <span>Raised by: <span className="font-medium text-slate-600 dark:text-slate-400">{item.raised_by}</span></span>
            <span>{format(new Date(item.created_at), 'd MMM')}</span>
            {responses.length > 0 && (
              <button
                onClick={() => setShowResponses((v) => !v)}
                className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
              >
                {showResponses ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {responses.length} response draft{responses.length === 1 ? '' : 's'}
                {selected && <span className="text-emerald-600 dark:text-emerald-400">· selected: {STANCE_CONFIG[selected.stance].label}</span>}
              </button>
            )}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          <select
            value={item.status}
            onChange={(e) => onStatusChange(item.pushback_id, e.target.value as PushbackItem['status'])}
            className={cn(
              'px-2 py-1 rounded-full text-xs font-medium border-0 cursor-pointer focus:outline-none',
              cfg.classes
            )}
          >
            <option value="OPEN">Open</option>
            <option value="RESOLVED">Resolved</option>
            <option value="ESCALATED">Escalated</option>
          </select>
          {onEdit && (
            <button onClick={startEdit} title="Edit" className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
              <Pencil size={13} />
            </button>
          )}
          {onDelete && (
            confirmDelete ? (
              <div className="flex items-center gap-1">
                <button onClick={() => onDelete(item.pushback_id)} title="Confirm delete" className="p-1 text-red-600 hover:text-red-700"><Check size={13} /></button>
                <button onClick={() => setConfirmDelete(false)} title="Cancel" className="p-1 text-slate-400 hover:text-slate-600"><X size={13} /></button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} title="Delete" className="p-1 text-slate-400 hover:text-red-500">
                <Trash2 size={13} />
              </button>
            )
          )}
        </div>
      </div>

      {/* The chosen response — always shown for a prepared item. */}
      {selected && (
        <div className="mt-2 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-indigo-50/60 dark:bg-indigo-900/15 p-2.5">
          <div className="flex items-center gap-1.5 mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span className={STANCE_CONFIG[selected.stance].dot}>{STANCE_CONFIG[selected.stance].icon}</span>
            Chosen response · {STANCE_CONFIG[selected.stance].label}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">{selected.content}</p>
        </div>
      )}

      {/* Legal-review items get no AI draft — flag them for offline handling. */}
      {!selected && item.needs_legal_review && (
        <div className="mt-2 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/60 dark:bg-red-900/15 p-2.5 flex items-start gap-2 text-xs text-red-700 dark:text-red-400">
          <Lock size={13} className="mt-0.5 shrink-0" />
          Requires legal / commercial review — no AI response is drafted; handle this objection offline.
        </div>
      )}

      {/* Drafted responses (persisted) — selected one highlighted. */}
      {showResponses && responses.length > 0 && (
        <div className="mt-2 space-y-1.5 pl-1">
          {responses.map((r) => {
            const scfg = STANCE_CONFIG[r.stance]
            return (
              <div
                key={r.response_id}
                className={cn(
                  'rounded-lg border p-2.5 text-xs',
                  r.is_selected
                    ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/60 dark:bg-indigo-900/15'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30'
                )}
              >
                <div className="flex items-center gap-1.5 mb-1 font-semibold text-slate-600 dark:text-slate-300">
                  <span className={scfg.dot}>{scfg.icon}</span>
                  {scfg.label}
                  {r.is_selected && <span className="flex items-center gap-0.5 text-indigo-600 dark:text-indigo-400"><Check size={10} /> Selected</span>}
                </div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{r.content}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function UnresolvedItemTracker({ items, responses = {}, onStatusChange, onEdit, onEditResponses, onDelete }: Props) {
  // Track which category groups are collapsed (all expanded by default).
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set())
  const toggleCat = (cat: string) =>
    setCollapsedCats((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })

  // Items that are "handled" and tracked here: any item with a chosen response, plus
  // legal-review items (which get no AI draft and must be handled offline). Items
  // still awaiting an AI-response decision live in the "Add Vendor Disagreement"
  // section above. Grouped by category.
  const tracked = items.filter(
    (i) => i.needs_legal_review || (responses[i.pushback_id] ?? []).some((r) => r.is_selected)
  )
  const order = Object.keys(PUSHBACK_CATEGORY_LABELS) as PushbackCategory[]
  const groups = order
    .map((cat) => ({ cat, list: tracked.filter((i) => i.category === cat) }))
    .filter((g) => g.list.length > 0)

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={15} className="text-amber-400" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Pushback Tracker
          </h3>
        </div>
        {tracked.length > 0 && (
          <span className="text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400 px-2 py-0.5 rounded-full font-medium">
            {tracked.length} item{tracked.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Nothing tracked yet — choose a response above (or flag an item for legal review) and it will appear here, grouped by category.
          </p>
        </div>
      ) : (
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
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {g.list.map((item) => (
                      <ItemRow
                        key={item.pushback_id}
                        item={item}
                        responses={responses[item.pushback_id] ?? []}
                        onStatusChange={onStatusChange}
                        onEdit={onEdit}
                        onEditResponses={onEditResponses}
                        onDelete={onDelete}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          These items and their chosen responses are carried forward to the EGB/QBR live meeting and stored in the issues tracker.
        </p>
      </div>
    </div>
  )
}
