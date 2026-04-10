import { useState } from 'react'
import { FileText, Sparkles } from 'lucide-react'
import type { MeetingNote } from '@/types/meeting.types'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import type { AgentStatus } from '@/types/agent.types'
import { apiFetch } from '@/lib/api'

interface Props {
  cycleId: string
  onParsed: (notes: MeetingNote[]) => void
}

const DEMO_TRANSCRIPT = `Alex Thompson [10:05]: Can NovaTech provide root cause analysis for the February SLA breach within 5 business days?

Raj Patel [10:12]: NovaTech disputes the SLA scoring for the February incident — the root cause was a Zensar network outage, not a vendor failure.

Sarah Chen [10:20]: Let's schedule a joint incident review within 7 days to reconcile the timelines and determine SLA applicability. Agreed by all.

Sarah Chen [10:28]: I want to note that Zensar recognises NovaTech's proactive delivery improvement this quarter. Delivery Quality is up from Q4 — well done.

Priya Sharma [10:35]: What is NovaTech's timeline for the AI automation pilot Phase 2 go-live?

Emma Davies [10:40]: Any AI pilot scope change requires a formal contract amendment — NovaTech cannot proceed without a signed SOW.

Alex Thompson [10:45]: Action: NovaTech to submit written scope proposal for AI pilot Phase 2 by 15 April 2026. Zensar Legal to review.

Emma Davies [10:52]: Decision: The pricing dispute is escalated to Zensar Commercial team. Invoices at the 8% increase rate will be held pending resolution.

Alex Thompson [10:58]: Action: I'll schedule the joint incident review for the February SLA event within the next 7 days.`

export default function TranscriptInput({ cycleId, onParsed }: Props) {
  const [transcript, setTranscript] = useState('')
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [parsedCount, setParsedCount] = useState<number | null>(null)

  async function handleParse() {
    if (!transcript.trim()) return
    setAgentStatus('running')
    setError(null)
    setParsedCount(null)
    try {
      const result = await apiFetch<{ notes: MeetingNote[]; count: number }>(
        `/api/cycles/${cycleId}/meeting/parse-transcript`,
        {
          method: 'POST',
          body: JSON.stringify({ transcript }),
        }
      )
      setAgentStatus('complete')
      setParsedCount(result.count)
      onParsed(result.notes)
    } catch (err: any) {
      setAgentStatus('failed')
      setError(err?.message ?? 'Failed to parse transcript. Is the backend running with LLM enabled?')
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <FileText size={15} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Transcript Paste & Parse
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <AgentStatusBadge status={agentStatus} />
          <button
            onClick={() => setTranscript(DEMO_TRANSCRIPT)}
            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
          >
            Load demo
          </button>
        </div>
      </div>

      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="Paste full meeting transcript here. The AI will parse it into structured note types: questions, objections, decisions, appreciations, and action items..."
        rows={8}
        className="w-full text-sm text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400"
      />

      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {parsedCount !== null && agentStatus === 'complete' && (
        <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2">
          {parsedCount} note{parsedCount !== 1 ? 's' : ''} extracted and added to Live Capture
        </p>
      )}

      <button
        onClick={handleParse}
        disabled={!transcript.trim() || agentStatus === 'running'}
        className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
      >
        <Sparkles size={14} />
        {agentStatus === 'running' ? 'Parsing transcript...' : 'Parse Transcript'}
      </button>
    </div>
  )
}
