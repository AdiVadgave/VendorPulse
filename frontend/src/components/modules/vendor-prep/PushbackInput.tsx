import { useState } from 'react'
import { Plus, AlertTriangle } from 'lucide-react'
import type { PushbackItem, PushbackCategory } from '@/types/vendor-prep.types'
import { PUSHBACK_CATEGORY_LABELS } from '@/types/vendor-prep.types'

interface Props {
  onAdd: (item: Omit<PushbackItem, 'pushback_id' | 'cycle_id' | 'created_at'>) => void
}

export default function PushbackInput({ onAdd }: Props) {
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<PushbackCategory>('DATA_DISPUTE')
  const [raisedBy, setRaisedBy] = useState('')
  const [needsLegal, setNeedsLegal] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  function handleSubmit() {
    if (!description.trim() || !raisedBy.trim()) return
    setSubmitting(true)
    setTimeout(() => {
      onAdd({
        category,
        description: description.trim(),
        raised_by: raisedBy.trim(),
        needs_legal_review: needsLegal,
        status: 'OPEN',
      })
      setDescription('')
      setRaisedBy('')
      setNeedsLegal(false)
      setSubmitting(false)
    }, 600)
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle size={15} className="text-red-400" />
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Add Vendor Disagreement (Pushback / Objection)
        </h3>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as PushbackCategory)}
              className="w-full text-sm bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {(Object.keys(PUSHBACK_CATEGORY_LABELS) as PushbackCategory[]).map((cat) => (
                <option key={cat} value={cat}>{PUSHBACK_CATEGORY_LABELS[cat]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Raised By</label>
            <input
              value={raisedBy}
              onChange={(e) => setRaisedBy(e.target.value)}
              placeholder="e.g. Raj Patel"
              className="w-full text-sm bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-slate-400"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">
            Objection / Pushback Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the vendor's objection or pushback in detail..."
            rows={3}
            className="w-full text-sm bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-slate-400"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={needsLegal}
            onChange={(e) => setNeedsLegal(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-600 text-orange-600 focus:ring-orange-500"
          />
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Requires legal / commercial review — exclude from AI response drafts
          </span>
        </label>

        <button
          onClick={handleSubmit}
          disabled={!description.trim() || !raisedBy.trim() || submitting}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={14} />
          {submitting ? 'Adding...' : 'Add Pushback Item'}
        </button>
      </div>
    </div>
  )
}
