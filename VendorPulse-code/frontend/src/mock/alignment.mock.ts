import type {
  ScoreDelta,
  AlignmentFlag,
  FaceOffPosition,
  ExtractedAction,
  CategoryComparison,
  AlignmentInsight,
} from '@/types/alignment.types'
import type { CompiledCategoryScore } from '@/types/scorecard.types'
import { SCORECARD_STRUCTURE, CATEGORY_LABELS } from '@/types/scorecard.types'

/* ── Score Deltas vs Previous Cycle (Q4 2025) ──────────────── */

export const MOCK_SCORE_DELTAS: ScoreDelta[] = [
  {
    category: 'RISK_COMPLIANCE',
    current_avg: 3.67,
    previous_avg: 3.33,
    delta: 0.34,
    direction: 'up',
    significant: false,
  },
  {
    category: 'PERFORMANCE',
    current_avg: 3.90,
    previous_avg: 3.0,
    delta: 0.90,
    direction: 'up',
    significant: false,
  },
  {
    category: 'COMMERCIAL',
    current_avg: 4.0,
    previous_avg: 3.5,
    delta: 0.50,
    direction: 'up',
    significant: false,
  },
  {
    category: 'RELATIONSHIP',
    current_avg: 4.13,
    previous_avg: 4.5,
    delta: -0.37,
    direction: 'down',
    significant: false,
  },
]

/* ── Alignment Flags (Stakeholder vs Vendor score gaps) ────── */

export const MOCK_ALIGNMENT_FLAGS: AlignmentFlag[] = [
  {
    flag_id: 'af1',
    category: 'PERFORMANCE',
    parameter_key: 'DELIVERY_TIMELINESS',
    parameter_label: 'Delivery Timeliness',
    spread: 1.0,
    high_stakeholder: 'Vendor',
    high_score: 4,
    low_stakeholder: 'Stakeholder',
    low_score: 3,
    prompt_question:
      'Vendor scores Delivery Timeliness at 4; Stakeholder at 3 — two deliverables slipped by a week per stakeholder. Align on expectations before vendor call.',
  },
  {
    flag_id: 'af2',
    category: 'COMMERCIAL',
    parameter_key: 'PRICING_COMPETITIVENESS',
    parameter_label: 'Pricing Competitiveness',
    spread: 1.0,
    high_stakeholder: 'Stakeholder',
    high_score: 4,
    low_stakeholder: 'Vendor',
    low_score: 3,
    prompt_question:
      'Stakeholder rates Pricing Competitiveness at 4; Vendor at 3 — vendor may push back on pricing structure. Prepare data to support position.',
  },
  {
    flag_id: 'af3',
    category: 'RELATIONSHIP',
    parameter_key: 'COMMUNICATION_EFFECTIVENESS',
    parameter_label: 'Communication Effectiveness',
    spread: 1.0,
    high_stakeholder: 'Vendor',
    high_score: 4,
    low_stakeholder: 'Stakeholder',
    low_score: 3,
    prompt_question:
      'Vendor scores Communication at 4; Stakeholder at 3 — escalation handling noted as concern. Discuss escalation SLA clarity.',
  },
]

/* ── Face-off Model ────────────────────────────────────────── */

export const MOCK_FACE_OFF: FaceOffPosition[] = [
  { position_number: 1, client_name: 'Alex Thompson', client_role: 'VMO Coordinator', vendor_name: 'Raj Patel', vendor_role: 'Account Director' },
  { position_number: 2, client_name: 'Sarah Chen', client_role: 'EGB Chair', vendor_name: 'Lisa Wang', vendor_role: 'Delivery Director' },
  { position_number: 3, client_name: 'Priya Sharma', client_role: 'Internal Lead', vendor_name: 'David Kim', vendor_role: 'Commercial Manager' },
  { position_number: 4, client_name: "James O'Brien", client_role: 'Technical Lead', vendor_name: 'Chen Wei', vendor_role: 'Technical Architect' },
  { position_number: 5, client_name: 'Tom Baker', client_role: 'Vendor Manager', vendor_name: 'Anita Ross', vendor_role: 'Operations Lead' },
  { position_number: 6, client_name: 'Emma Davies', client_role: 'Commercial Lead', vendor_name: '', vendor_role: '' },
]

/* ── Extracted Actions ─────────────────────────────────────── */

export const MOCK_ALIGNMENT_ACTIONS: ExtractedAction[] = [
  {
    action_id: 'ac1',
    description: 'Align on Delivery Timeliness expectations — discuss the two slipped deliverables and agree on root cause before vendor call',
    owner: 'Alex Thompson',
    due_date: '2026-04-15',
    source: 'alignment',
    status: 'OPEN',
  },
  {
    action_id: 'ac2',
    description: 'Prepare pricing analysis data to support Pricing Competitiveness score during vendor discussion',
    owner: 'Priya Sharma',
    due_date: '2026-04-12',
    source: 'alignment',
    status: 'OPEN',
  },
  {
    action_id: 'ac3',
    description: 'Review escalation SLA terms in contract — confirm communication expectations for incident handling',
    owner: "James O'Brien",
    due_date: '2026-04-11',
    source: 'alignment',
    status: 'OPEN',
  },
]

/* ── Generate Dynamic "What Changed" Bullets from Compiled Scores ── */

export function generateWhatChangedBullets(
  comparisons: CategoryComparison[],
  flags: AlignmentFlag[],
): string[] {
  const bullets: string[] = []

  // Sort categories by difference (highest variance first)
  const sorted = [...comparisons].sort((a, b) => b.difference - a.difference)

  for (const cat of sorted) {
    const avgScore = (cat.stakeholder_avg + cat.vendor_avg) / 2
    const highVarianceParams = cat.parameters.filter((p) => p.high_variance)
    const lowScoreParams = cat.parameters.filter((p) => p.low_score)

    if (cat.difference > 1) {
      const detail = highVarianceParams.length > 0
        ? ` — ${highVarianceParams.map((p) => p.parameter_label).join(', ')} show${highVarianceParams.length === 1 ? 's' : ''} significant gaps.`
        : '.'
      bullets.push(
        `${cat.category_label}: ${cat.difference.toFixed(1)} point gap between Internal Stakeholder (${cat.stakeholder_avg.toFixed(1)}) and Vendor (${cat.vendor_avg.toFixed(1)})${detail}`
      )
    } else if (lowScoreParams.length > 0) {
      bullets.push(
        `${cat.category_label}: ${lowScoreParams.map((p) => p.parameter_label).join(', ')} scored below 3.0 — flag for improvement plan.`
      )
    } else if (avgScore >= 4.0) {
      bullets.push(
        `${cat.category_label}: Strong performance at ${avgScore.toFixed(1)} avg — Stakeholder and Vendor well aligned.`
      )
    } else {
      bullets.push(
        `${cat.category_label}: Average score ${avgScore.toFixed(1)} — Internal Stakeholder (${cat.stakeholder_avg.toFixed(1)}) vs Vendor (${cat.vendor_avg.toFixed(1)}).`
      )
    }
  }

  // Add a summary flag count if any
  if (flags.length > 0) {
    const maxGap = Math.max(...flags.map((f) => f.spread))
    bullets.push(
      `Key flag: ${flags.length} parameter${flags.length > 1 ? 's' : ''} flagged with gaps up to ${maxGap.toFixed(1)} points between Internal Stakeholder and Vendor scores.`
    )
  }

  return bullets.slice(0, 5) // Cap at 5 bullets
}

/* ── Build Stakeholder vs Vendor Comparison from Compiled Scores */

export function buildCategoryComparisons(
  compiledScores: CompiledCategoryScore[],
): CategoryComparison[] {
  return compiledScores.map((cat) => {
    const catDef = SCORECARD_STRUCTURE.find((s) => s.key === cat.category)

    const parameters = cat.parameters.map((param) => {
      // Scores array: internal stakeholder first, vendor second
      const internalScore = param.scores.find((s) => s.stakeholder_id === 'internal')
      const vendorScoreEntry = param.scores.find((s) => s.stakeholder_id === 'vendor')
      const stakeholderScore = internalScore?.score ?? (param.scores[0]?.score ?? 0)
      const vendorScore = vendorScoreEntry?.score ?? (param.scores[1]?.score ?? 0)
      const diff = Math.abs(stakeholderScore - vendorScore)

      return {
        parameter_key: param.parameter_key,
        parameter_label: param.parameter_label,
        category: cat.category,
        category_label: cat.category_label,
        stakeholder_score: stakeholderScore,
        vendor_score: vendorScore,
        difference: diff,
        high_variance: diff > 1,
        low_score: stakeholderScore < 3 || vendorScore < 3,
      }
    })

    const stakeholderAvg = parameters.length > 0
      ? parameters.reduce((sum, p) => sum + p.stakeholder_score, 0) / parameters.length
      : 0
    const vendorAvg = parameters.length > 0
      ? parameters.reduce((sum, p) => sum + p.vendor_score, 0) / parameters.length
      : 0

    return {
      category: cat.category,
      category_label: catDef?.label ?? cat.category_label,
      stakeholder_avg: parseFloat(stakeholderAvg.toFixed(2)),
      vendor_avg: parseFloat(vendorAvg.toFixed(2)),
      difference: parseFloat(Math.abs(stakeholderAvg - vendorAvg).toFixed(2)),
      parameters,
    }
  })
}

/* ── Generate AI Insights from Comparisons & Deltas ────────── */

export function generateAlignmentInsights(
  comparisons: CategoryComparison[],
  deltas: ScoreDelta[],
): AlignmentInsight[] {
  const insights: AlignmentInsight[] = []
  let id = 0

  // Check each parameter for high variance
  for (const cat of comparisons) {
    for (const param of cat.parameters) {
      if (param.high_variance) {
        id++
        insights.push({
          insight_id: `ai-${id}`,
          type: 'high_variance',
          category: cat.category,
          parameter_key: param.parameter_key,
          parameter_label: param.parameter_label,
          message: `${param.parameter_label}: ${Math.abs(param.difference).toFixed(1)} point gap between Stakeholder (${param.stakeholder_score}) and Vendor (${param.vendor_score}) — this area needs discussion.`,
          severity: 'critical',
        })
      }

      if (param.low_score) {
        id++
        const lowSide = param.stakeholder_score < param.vendor_score ? 'Stakeholder' : 'Vendor'
        const lowVal = Math.min(param.stakeholder_score, param.vendor_score)
        insights.push({
          insight_id: `ai-${id}`,
          type: 'low_score',
          category: cat.category,
          parameter_key: param.parameter_key,
          parameter_label: param.parameter_label,
          message: `${param.parameter_label}: ${lowSide} scored ${lowVal}/5 — flag for improvement plan.`,
          severity: 'warning',
        })
      }
    }
  }

  // Check deltas for significant drops
  for (const delta of deltas) {
    if (delta.direction === 'down') {
      id++
      insights.push({
        insight_id: `ai-${id}`,
        type: 'significant_drop',
        category: delta.category,
        message: `${CATEGORY_LABELS[delta.category]}: dropped ${Math.abs(delta.delta).toFixed(2)} points from last cycle (${delta.previous_avg.toFixed(1)} → ${delta.current_avg.toFixed(2)}).`,
        severity: delta.significant ? 'critical' : 'warning',
      })
    }

    if (delta.direction === 'up' && delta.delta >= 0.5) {
      id++
      insights.push({
        insight_id: `ai-${id}`,
        type: 'positive_trend',
        category: delta.category,
        message: `${CATEGORY_LABELS[delta.category]}: improved +${delta.delta.toFixed(2)} points — positive trend from last cycle.`,
        severity: 'info',
      })
    }
  }

  // Sort: critical first, then warning, then info
  const severityOrder = { critical: 0, warning: 1, info: 2 }
  insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  return insights
}

/* ── Build Alignment Flags from Compiled Scores ────────────── */

export function buildAlignmentFlags(
  compiledScores: CompiledCategoryScore[],
): AlignmentFlag[] {
  const flags: AlignmentFlag[] = []
  let id = 0

  for (const cat of compiledScores) {
    for (const param of cat.parameters) {
      if (param.scores.length < 2) continue
      const internalEntry = param.scores.find((s) => s.stakeholder_id === 'internal')
      const vendorEntry = param.scores.find((s) => s.stakeholder_id === 'vendor')
      const stakeholderScore = internalEntry?.score ?? (param.scores[0]?.score ?? 0)
      const vendorScore = vendorEntry?.score ?? (param.scores[1]?.score ?? 0)
      const spread = Math.abs(vendorScore - stakeholderScore)

      if (spread >= 1) {
        id++
        const high = vendorScore > stakeholderScore ? 'Vendor' : 'Stakeholder'
        const low = vendorScore > stakeholderScore ? 'Stakeholder' : 'Vendor'
        const highVal = Math.max(vendorScore, stakeholderScore)
        const lowVal = Math.min(vendorScore, stakeholderScore)

        flags.push({
          flag_id: `af-dyn-${id}`,
          category: cat.category,
          parameter_key: param.parameter_key,
          parameter_label: param.parameter_label,
          spread,
          high_stakeholder: high,
          high_score: highVal,
          low_stakeholder: low,
          low_score: lowVal,
          prompt_question: `${high} scores ${param.parameter_label} at ${highVal}; ${low} at ${lowVal} — ${spread >= 2 ? 'major discrepancy, requires immediate discussion' : 'moderate gap, discuss during alignment call'}.`,
        })
      }
    }
  }

  return flags.sort((a, b) => b.spread - a.spread)
}
