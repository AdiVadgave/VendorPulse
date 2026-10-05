import type {
  ScoreDelta,
  AlignmentFlag,
  FaceOffPosition,
  ExtractedAction,
  AlignmentInsight,
} from '@/types/alignment.types'
import type { WeightedScorecard } from '@/types/scorecard.types'

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

/* ══════════════════════════════════════════════════════════════
 * Weighted scorecard (internal-only) — Alignment is about where the
 * internal TEAMS diverge and where consolidated scores are low. There is no
 * vendor self-report to compare against.
 * ══════════════════════════════════════════════════════════════ */

/** Flags where internal teams disagree on a measure (cross-team divergence). */
export function buildFlagsFromWeighted(w: WeightedScorecard): AlignmentFlag[] {
  const flags: AlignmentFlag[] = []
  let id = 0
  for (const cat of w.categories) {
    for (const m of cat.measures) {
      const entries = w.teams
        .map((t) => ({ label: t.team || t.name || t.email, score: m.team_scores[t.attendee_id] }))
        .filter((e): e is { label: string; score: number } => e.score != null)
      if (entries.length < 2) continue
      // Keep every participating team (sorted high→low) so the flag reflects all
      // reviewers, not just the two extremes.
      const ranked = [...entries].sort((a, b) => b.score - a.score)
      const high = ranked[0]
      const low = ranked[ranked.length - 1]
      const spread = high.score - low.score
      if (spread >= 1) {
        id++
        flags.push({
          flag_id: `af-w-${id}`,
          category: cat.key,
          parameter_key: m.key,
          parameter_label: m.label,
          spread,
          high_stakeholder: high.label,
          high_score: high.score,
          low_stakeholder: low.label,
          low_score: low.score,
          team_scores: ranked,
          prompt_question: `Teams disagree on ${m.label}: ${ranked.map((e) => `${e.label} rated ${e.score}`).join(', ')} (${spread.toFixed(1)} pt spread) — agree the internal position before the vendor meeting.`,
        })
      }
    }
  }
  return flags.sort((a, b) => b.spread - a.spread)
}

/** Insights: low consolidated scores + notable cross-team divergence. */
export function buildInsightsFromWeighted(w: WeightedScorecard): AlignmentInsight[] {
  const insights: AlignmentInsight[] = []
  let id = 0
  for (const cat of w.categories) {
    if (cat.category_average != null && cat.category_average < 3) {
      id++
      insights.push({
        insight_id: `iw-${id}`,
        type: 'low_score',
        category: cat.key,
        message: `${cat.label}: consolidated ${cat.category_average.toFixed(1)}/5 — below target; prepare an improvement ask for the vendor.`,
        severity: 'warning',
      })
    }
    for (const m of cat.measures) {
      if (m.average != null && m.average < 3) {
        id++
        insights.push({
          insight_id: `iw-${id}`,
          type: 'low_score',
          category: cat.key,
          parameter_key: m.key,
          parameter_label: m.label,
          message: `${m.label}: consolidated ${m.average.toFixed(1)}/5 — flag for the vendor discussion.`,
          severity: 'warning',
        })
      }
      const scores = w.teams.map((t) => m.team_scores[t.attendee_id]).filter((s): s is number => s != null)
      if (scores.length >= 2) {
        const spread = Math.max(...scores) - Math.min(...scores)
        if (spread >= 1) {
          id++
          insights.push({
            insight_id: `iw-${id}`,
            type: 'high_variance',
            category: cat.key,
            parameter_key: m.key,
            parameter_label: m.label,
            message: `${m.label}: internal teams differ by ${spread.toFixed(1)} pts — align on the position first.`,
            severity: spread >= 2 ? 'critical' : 'warning',
          })
        }
      }
    }
  }
  const order = { critical: 0, warning: 1, info: 2 } as const
  return insights.sort((a, b) => order[a.severity] - order[b.severity])
}

/** "What changed" bullets from the consolidated internal scorecard. */
export function buildWhatChangedFromWeighted(w: WeightedScorecard): string[] {
  const bullets: string[] = []
  if (w.overall_score != null) {
    bullets.push(`Consolidated overall score: ${w.overall_score.toFixed(1)}/5 across ${w.teams.length} internal team${w.teams.length !== 1 ? 's' : ''}.`)
  }
  const sorted = [...w.categories]
    .filter((c) => c.category_average != null)
    .sort((a, b) => (a.category_average as number) - (b.category_average as number))
  for (const cat of sorted) {
    const low = cat.measures.filter((m) => m.average != null && (m.average as number) < 3).map((m) => m.label)
    if (low.length > 0) {
      bullets.push(`${cat.label} (${(cat.category_average as number).toFixed(1)}/5): ${low.join(', ')} scored below 3 — discuss improvement.`)
    } else {
      bullets.push(`${cat.label}: consolidated ${(cat.category_average as number).toFixed(1)}/5 (weight ${cat.weight}%).`)
    }
  }
  return bullets.slice(0, 6)
}

/* ── Build Alignment Flags from Compiled Scores ────────────── */
