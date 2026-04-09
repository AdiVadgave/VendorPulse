import { useState } from 'react'
import { FileText, Sparkles, Plus } from 'lucide-react'
import type { ExtractedAction } from '@/types/alignment.types'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import type { AgentStatus } from '@/types/agent.types'

const DEMO_EXTRACTED: ExtractedAction[] = [
  { action_id: 'n1', description: 'Align on AI automation proposal scope — schedule follow-up with Priya and Alex before vendor prep call', owner: 'Alex Thompson', due_date: '2026-03-28', source: 'alignment', status: 'OPEN' },
  { action_id: 'n2', description: 'Prepare factual data to support SLA compliance score discussion with vendor', owner: 'Priya Sharma', due_date: '2026-03-26', source: 'alignment', status: 'OPEN' },
  { action_id: 'n3', description: 'Review Q4 innovation KPI commitments from contract — confirm which were delivered vs outstanding', owner: "James O'Brien", due_date: '2026-03-25', source: 'alignment', status: 'OPEN' },
]

const DEMO_NOTES = `Alex: We need to agree on the AI automation pilot scope before the vendor prep call. Priya had concerns about roadmap alignment that need to be resolved first.

Priya: I'll prepare the data analysis to support our SLA compliance score position. There's a factual dispute likely coming from NovaTech on the February incident.

James: I'll pull the Q4 innovation KPI contract commitments by Thursday — we need to know which ones were actually delivered before the meeting.

All: Agreed on March 28 for the vendor prep call. Alex to send calendar invite.`

interface Props {
  onActionsExtracted: (actions: ExtractedAction[]) => void
}

export default function NotesInputPanel({ onActionsExtracted }: Props) {
  const [notes, setNotes] = useState('')
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle')
  const [extracted, setExtracted] = useState<ExtractedAction[]>([])
  const [newItem, setNewItem] = useState('')

  function handleExtract() {
    if (!notes.trim()) return
    setAgentStatus('running')
    setTimeout(() => {
      setAgentStatus('complete')
      setExtracted(DEMO_EXTRACTED)
      onActionsExtracted(DEMO_EXTRACTED)
    }, 1600)
  }

  function handleDemo() {
    setNotes(DEMO_NOTES)
  }

  function addManualAction() {
    if (!newItem.trim()) return
    const action: ExtractedAction = {
      action_id: `manual-${Date.now()}`,
      description: newItem.trim(),
      owner: 'TBD',
      due_date: null,
      source: 'alignment',
      status: 'OPEN',
    }
    const updated = [...extracted, action]
    setExtracted(updated)
    onActionsExtracted(updated)
    setNewItem('')
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <FileText size={15} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Meeting Notes — Action Extraction
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <AgentStatusBadge status={agentStatus} />
            <button
              onClick={handleDemo}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
            >
              Load demo notes
            </button>
          </div>
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Paste your internal alignment call notes here. Claude will extract structured action items — owner, description, and due date where mentioned..."
          rows={7}
          className="w-full text-sm text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-600 placeholder-slate-400 dark:placeholder-slate-500"
        />

        <button
          onClick={handleExtract}
          disabled={!notes.trim() || agentStatus === 'running'}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Sparkles size={14} />
          {agentStatus === 'running' ? 'Extracting actions...' : 'Extract Action Items'}
        </button>
      </div>

      {/* Extracted actions preview */}
      {extracted.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <Sparkles size={14} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Extracted Actions ({extracted.length})
            </h3>
            <span className="ml-auto text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              Added to Action Log
            </span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {extracted.map((a) => (
              <div key={a.action_id} className="px-5 py-3">
                <p className="text-sm text-slate-800 dark:text-slate-200 mb-1">{a.description}</p>
                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span>Owner: <span className="font-medium text-slate-700 dark:text-slate-300">{a.owner}</span></span>
                  {a.due_date && <span>Due: {a.due_date}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Manual add */}
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex gap-2">
            <input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addManualAction()}
              placeholder="Add action manually..."
              className="flex-1 text-xs bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 dark:text-slate-200 placeholder-slate-400"
            />
            <button
              onClick={addManualAction}
              disabled={!newItem.trim()}
              className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Plus size={12} />
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
