import { useCallback, useEffect, useState } from 'react'
import type { WeightedScorecard } from '@/types/scorecard.types'
import { getScorecardCommentSummary } from '@/lib/scorecardApi'
import WeightedScorecardTable from './WeightedScorecardTable'

interface Props {
  cycleId: string
  weighted: WeightedScorecard
}

/**
 * Consolidated Scorecard with an extra "Comment Summary" column — the per-measure
 * AI synthesis of the teams' comments (same LLM wiring as Alignment / Vendor Prep;
 * the backend falls back to the raw comments when the LLM is off).
 */
export default function ConsolidatedScorecardPanel({ cycleId, weighted }: Props) {
  const [summaries, setSummaries] = useState<Record<string, string>>({})
  const [llmUsed, setLlmUsed] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getScorecardCommentSummary(cycleId)
      const map: Record<string, string> = {}
      for (const m of res.measures) map[m.measure_key] = m.summary
      setSummaries(map)
      setLlmUsed(res.llm_used)
    } catch {
      /* leave prior summaries; column falls back to "—" */
    } finally {
      setLoading(false)
    }
  }, [cycleId])

  // Auto-generate on mount and whenever the submission count changes.
  useEffect(() => { void load() }, [load, weighted.submitted_count])

  return (
    <WeightedScorecardTable
      data={weighted}
      summaries={summaries}
      summaryLoading={loading}
      summaryLlmUsed={llmUsed}
      onRegenerateSummary={load}
    />
  )
}
