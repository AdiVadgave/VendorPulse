import { useState } from 'react'
import type { ExtractedAction } from '@/types/alignment.types'
import type { NewActionInput } from '@/lib/actionsApi'

interface Props {
  /** Source/origin stamped on the new item (which meeting the admin added it from). */
  source: ExtractedAction['source']
  originLabel?: string
  onAdd: (a: NewActionInput) => void
  onCancel: () => void
}

/** Inline form to create one action item manually. Shared by the queue panel
 *  and the Actions tab so "Add action" behaves identically everywhere. */
export default function AddActionForm({ source, originLabel, onAdd, onCancel }: Props) {
  const [desc, setDesc] = useState('')
  const [details, setDetails] = useState('')
  const [owner, setOwner] = useState('')
  const [due, setDue] = useState('')

  const submit = () => {
    if (!desc.trim()) return
    onAdd({
      description: desc.trim(),
      details: details.trim(),
      owner: owner.trim() || 'TBD',
      due_date: due || null,
      source,
      origin: originLabel ?? null,
      status: 'OPEN',
    })
    setDesc(''); setDetails(''); setOwner(''); setDue('')
  }

  return (
    <div className="px-4 py-3 bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Action (short title)…"
        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
      />
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        rows={2}
        placeholder="Description — the what & why, for context in the next meeting (optional)…"
        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 resize-y"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="Owner"
          className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
        />
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={submit}
            disabled={!desc.trim()}
            className="px-3 py-1 text-xs font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
          >
            Add to queue
          </button>
          <button
            onClick={() => { setDesc(''); setDetails(''); setOwner(''); setDue(''); onCancel() }}
            className="px-3 py-1 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
