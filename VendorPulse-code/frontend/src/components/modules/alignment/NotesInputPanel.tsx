import { useState } from 'react'
import { FileText, Sparkles, Plus } from 'lucide-react'
import type { ExtractedAction } from '@/types/alignment.types'
import { extractAlignmentActions } from '@/lib/alignmentApi'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import type { AgentStatus } from '@/types/agent.types'

const DEMO_NOTES = `Strategic Vendor Governance Council — Q2 Planning Session
Date: April 10, 2024 | Attendees: Alex (Procurement Lead), Priya (Engineering), James (Finance), Sandra (Legal), Rachel (Security & Compliance), David (Operations), Marcus (Zensar CSM), Lena (Zensar Engineering Lead)

Alex opened by noting that the April 3rd follow-up was postponed due to Zensar's delayed SLA dispute response, which was received on March 21st — three days past the agreed March 18th deadline. Sandra flagged this as a contract compliance issue and will formally log it in the vendor performance register by end of week. Marcus apologized and cited internal legal review delays.

Sandra presented the revised SLA notification language drafted post-March meeting. James raised a concern that the new language inadvertently removes the 48-hour cure period that currently protects Zensar. Marcus confirmed this was unintentional and Lena will work with Sandra directly to reconcile the language — both parties will aim to sign off on the final version no later than April 25th.

Rachel introduced a new agenda item: Zensar's SOC 2 Type II certification is expiring on May 31st. She needs confirmation from Lena that renewal is in progress and an estimated completion date before Rachel can update the vendor risk register. Lena confirmed renewal is underway but could not give a date on the spot — she will follow up with Rachel directly by April 15th.

James presented the penalty analysis for delayed Q4 innovation KPIs. The contract specifies a 5% service credit per missed milestone, meaning Zensar owes a $42,000 credit against the next invoice. Marcus disputed the calculation, claiming the bulk export API delay was caused by a dependency on Shell's internal API team, not Zensar. James and Marcus agreed to a working session to review the timeline evidence. James will pull the relevant Jira tickets and email chain history before that session. The working session should happen before April 19th.

David raised an operational concern: the Zensar integration currently has no documented runbook for failover procedures. This creates an incident response risk. Lena agreed to provide a draft failover runbook within three weeks. David will review it and provide feedback within five business days of receipt.

Priya confirmed the AI automation pilot scope document was shared on March 20th as planned. However, Shell's engineering team identified two open technical dependencies — single sign-on integration and data residency compliance — that need Zensar's input before Shell's engineering can begin. Lena will provide written responses to both dependency questions by April 17th. If responses are not received by then, Priya will escalate to Alex to invoke the contractual response SLA.

Rachel also noted that the last penetration test was conducted fourteen months ago — Shell's security policy requires annual testing. She will initiate the vendor pen test scheduling process and coordinate with Lena to agree on a testing window. They should have a testing date confirmed within two weeks.

Alex closed by saying the next governance council meeting will be scheduled for the second week of May. He will send a Doodle poll to all attendees by April 12th to confirm availability. Sandra reminded the group that the contract renewal window opens June 1st and Shell's team needs at least six weeks to prepare — meaning the renewal strategy document must be ready by April 20th. Alex agreed to own the first draft.

 `

interface Props {
  cycleId: string
  onActionsExtracted: (actions: ExtractedAction[]) => void
}

export default function NotesInputPanel({ cycleId, onActionsExtracted }: Props) {
  const [notes, setNotes] = useState('')
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle')
  const [extracted, setExtracted] = useState<ExtractedAction[]>([])
  const [newItem, setNewItem] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleExtract() {
    if (!notes.trim()) return
    setAgentStatus('running')
    setError(null)
    try {
      const response = await extractAlignmentActions(cycleId, notes)
      if (response.status === 'success' && response.data) {
        const actions = response.data.actions ?? []
        setExtracted(actions)
        onActionsExtracted(actions)
        setAgentStatus('complete')
      } else {
        setError(response.summary || 'Failed to extract actions')
        setAgentStatus('idle')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reach backend')
      setAgentStatus('idle')
    }
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
              Load Transcript
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
        {error && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
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
