import type {
  VendorTrend,
  RecurringIssue,
  LeadershipBrief,
  RadarDataPoint,
  CrossVendorDataPoint,
  StakeholderVsVendorPoint,
  ParameterInsight,
} from '@/types/analytics.types'
import type { ExtractedAction } from '@/types/alignment.types'

/**
 * Category-wise score trends across 5 cycles (Q1 2025 → Q1 2026).
 * Categories align with the real SCORECARD_STRUCTURE:
 *   RISK_COMPLIANCE | PERFORMANCE | COMMERCIAL | RELATIONSHIP
 *
 * Q1 2026 values are derived from the mock vendor/stakeholder scorecard entries:
 *   NovaTech (v1):  RC=3.67, P=3.80, C=4.00, R=4.13
 *   CoreSystems (v2): all declining, ending ~2.1–2.5
 *   Meridian (v3):  flat/stable, ~3.1–3.3
 */
export const MOCK_VENDOR_TRENDS: VendorTrend[] = [
  {
    vendor_id: 'v1',
    vendor_name: 'NovaTech Services',
    cycles: [
      {
        cycle_label: 'Q1 2025', quarter: 'Q1', year: 2025,
        scores: { RISK_COMPLIANCE: 2.8, PERFORMANCE: 3.0, COMMERCIAL: 3.2, RELATIONSHIP: 3.0 },
      },
      {
        cycle_label: 'Q2 2025', quarter: 'Q2', year: 2025,
        scores: { RISK_COMPLIANCE: 3.0, PERFORMANCE: 3.2, COMMERCIAL: 3.3, RELATIONSHIP: 3.2 },
      },
      {
        cycle_label: 'Q3 2025', quarter: 'Q3', year: 2025,
        scores: { RISK_COMPLIANCE: 3.2, PERFORMANCE: 3.5, COMMERCIAL: 3.7, RELATIONSHIP: 3.5 },
      },
      {
        cycle_label: 'Q4 2025', quarter: 'Q4', year: 2025,
        scores: { RISK_COMPLIANCE: 3.5, PERFORMANCE: 3.8, COMMERCIAL: 3.9, RELATIONSHIP: 4.0 },
      },
      {
        cycle_label: 'Q1 2026', quarter: 'Q1', year: 2026,
        scores: { RISK_COMPLIANCE: 3.67, PERFORMANCE: 3.80, COMMERCIAL: 4.00, RELATIONSHIP: 4.13 },
      },
    ],
  },
  {
    vendor_id: 'v2',
    vendor_name: 'CoreSystems Ltd',
    cycles: [
      {
        cycle_label: 'Q1 2025', quarter: 'Q1', year: 2025,
        scores: { RISK_COMPLIANCE: 3.8, PERFORMANCE: 3.5, COMMERCIAL: 3.6, RELATIONSHIP: 3.8 },
      },
      {
        cycle_label: 'Q2 2025', quarter: 'Q2', year: 2025,
        scores: { RISK_COMPLIANCE: 3.4, PERFORMANCE: 3.2, COMMERCIAL: 3.3, RELATIONSHIP: 3.4 },
      },
      {
        cycle_label: 'Q3 2025', quarter: 'Q3', year: 2025,
        scores: { RISK_COMPLIANCE: 3.0, PERFORMANCE: 2.8, COMMERCIAL: 3.0, RELATIONSHIP: 3.0 },
      },
      {
        cycle_label: 'Q4 2025', quarter: 'Q4', year: 2025,
        scores: { RISK_COMPLIANCE: 2.5, PERFORMANCE: 2.3, COMMERCIAL: 2.7, RELATIONSHIP: 2.6 },
      },
      {
        cycle_label: 'Q1 2026', quarter: 'Q1', year: 2026,
        scores: { RISK_COMPLIANCE: 2.3, PERFORMANCE: 2.1, COMMERCIAL: 2.5, RELATIONSHIP: 2.4 },
      },
    ],
  },
  {
    vendor_id: 'v3',
    vendor_name: 'Meridian IT',
    cycles: [
      {
        cycle_label: 'Q1 2025', quarter: 'Q1', year: 2025,
        scores: { RISK_COMPLIANCE: 3.2, PERFORMANCE: 3.3, COMMERCIAL: 3.0, RELATIONSHIP: 3.2 },
      },
      {
        cycle_label: 'Q2 2025', quarter: 'Q2', year: 2025,
        scores: { RISK_COMPLIANCE: 3.3, PERFORMANCE: 3.2, COMMERCIAL: 3.1, RELATIONSHIP: 3.3 },
      },
      {
        cycle_label: 'Q3 2025', quarter: 'Q3', year: 2025,
        scores: { RISK_COMPLIANCE: 3.1, PERFORMANCE: 3.4, COMMERCIAL: 3.2, RELATIONSHIP: 3.1 },
      },
      {
        cycle_label: 'Q4 2025', quarter: 'Q4', year: 2025,
        scores: { RISK_COMPLIANCE: 3.3, PERFORMANCE: 3.3, COMMERCIAL: 3.0, RELATIONSHIP: 3.2 },
      },
      {
        cycle_label: 'Q1 2026', quarter: 'Q1', year: 2026,
        scores: { RISK_COMPLIANCE: 3.20, PERFORMANCE: 3.30, COMMERCIAL: 3.10, RELATIONSHIP: 3.20 },
      },
    ],
  },
]

/**
 * Current (Q1 2026) vs previous (Q4 2025) radar data.
 * Category labels map to the 4 scorecard categories.
 */
export const MOCK_RADAR_DATA: Record<string, RadarDataPoint[]> = {
  v1: [
    { category: 'Risk & Compliance', current: 3.67, previous: 3.5 },
    { category: 'Performance',       current: 3.80, previous: 3.8 },
    { category: 'Commercial',        current: 4.00, previous: 3.9 },
    { category: 'Relationship',      current: 4.13, previous: 4.0 },
  ],
  v2: [
    { category: 'Risk & Compliance', current: 2.3,  previous: 2.5 },
    { category: 'Performance',       current: 2.1,  previous: 2.3 },
    { category: 'Commercial',        current: 2.5,  previous: 2.7 },
    { category: 'Relationship',      current: 2.4,  previous: 2.6 },
  ],
  v3: [
    { category: 'Risk & Compliance', current: 3.20, previous: 3.3 },
    { category: 'Performance',       current: 3.30, previous: 3.3 },
    { category: 'Commercial',        current: 3.10, previous: 3.0 },
    { category: 'Relationship',      current: 3.20, previous: 3.2 },
  ],
}

/** Q1 2026 cross-vendor comparison per scorecard category */
export const MOCK_CROSS_VENDOR_DATA: CrossVendorDataPoint[] = [
  { category: 'Risk & Compliance', novatech: 3.67, coresystems: 2.3,  meridian: 3.2  },
  { category: 'Performance',       novatech: 3.80, coresystems: 2.1,  meridian: 3.3  },
  { category: 'Commercial',        novatech: 4.00, coresystems: 2.5,  meridian: 3.1  },
  { category: 'Relationship',      novatech: 4.13, coresystems: 2.4,  meridian: 3.2  },
]

/**
 * Vendor self-score vs stakeholder score per category (Q1 2026).
 *
 * NovaTech values are computed directly from scorecard.mock.ts:
 *   VENDOR_SCORES   → RC=3.67, P=4.00, C=4.00, R=4.25
 *   STAKEHOLDER_SCORES → RC=3.67, P=3.60, C=4.00, R=4.00
 */
export const MOCK_STAKEHOLDER_VS_VENDOR: Record<string, StakeholderVsVendorPoint[]> = {
  v1: [
    { category: 'Risk & Compliance', vendor: 3.67, stakeholder: 3.67 },
    { category: 'Performance',       vendor: 4.00, stakeholder: 3.60 },
    { category: 'Commercial',        vendor: 4.00, stakeholder: 4.00 },
    { category: 'Relationship',      vendor: 4.25, stakeholder: 4.00 },
  ],
  v2: [
    { category: 'Risk & Compliance', vendor: 2.8,  stakeholder: 2.0  },
    { category: 'Performance',       vendor: 2.6,  stakeholder: 1.8  },
    { category: 'Commercial',        vendor: 3.0,  stakeholder: 2.2  },
    { category: 'Relationship',      vendor: 2.8,  stakeholder: 2.1  },
  ],
  v3: [
    { category: 'Risk & Compliance', vendor: 3.3,  stakeholder: 3.1  },
    { category: 'Performance',       vendor: 3.4,  stakeholder: 3.2  },
    { category: 'Commercial',        vendor: 3.2,  stakeholder: 3.0  },
    { category: 'Relationship',      vendor: 3.3,  stakeholder: 3.1  },
  ],
}

/**
 * Parameter-level insights derived from VENDOR_SCORES vs STAKEHOLDER_SCORES.
 * Gap = vendor_score − stakeholder_score (positive → vendor overrated themselves)
 * Only parameters with |gap| >= 1 or avg <= 3.5 are surfaced.
 */
export const MOCK_PARAMETER_INSIGHTS: Record<string, ParameterInsight[]> = {
  v1: [
    // Vendor scored higher than stakeholder (overconfidence)
    { parameter_key: 'DELIVERY_TIMELINESS',      parameter_label: 'Delivery Timeliness',      category: 'PERFORMANCE',      category_label: 'Performance',       vendor_score: 4, stakeholder_score: 3, average: 3.5, gap: 1.0 },
    { parameter_key: 'RESOURCE_CAPABILITY',       parameter_label: 'Resource Capability',       category: 'PERFORMANCE',      category_label: 'Performance',       vendor_score: 4, stakeholder_score: 3, average: 3.5, gap: 1.0 },
    { parameter_key: 'COMMUNICATION_EFFECTIVENESS', parameter_label: 'Communication Effectiveness', category: 'RELATIONSHIP', category_label: 'Relationship',   vendor_score: 4, stakeholder_score: 3, average: 3.5, gap: 1.0 },
    { parameter_key: 'RELEASE_PATCH_MGMT',        parameter_label: 'Release & Patch Management', category: 'RISK_COMPLIANCE', category_label: 'Risk & Compliance', vendor_score: 4, stakeholder_score: 3, average: 3.5, gap: 1.0 },
    { parameter_key: 'COST_CONTROL',              parameter_label: 'Cost Control',              category: 'COMMERCIAL',       category_label: 'Commercial',        vendor_score: 4, stakeholder_score: 3, average: 3.5, gap: 1.0 },
    // Stakeholder rated higher than vendor (under-rated by vendor)
    { parameter_key: 'OPERATIONAL_EFFICIENCY',    parameter_label: 'Operational Efficiency',    category: 'PERFORMANCE',      category_label: 'Performance',       vendor_score: 3, stakeholder_score: 4, average: 3.5, gap: -1.0 },
    { parameter_key: 'PRICING_COMPETITIVENESS',   parameter_label: 'Pricing Competitiveness',   category: 'COMMERCIAL',       category_label: 'Commercial',        vendor_score: 3, stakeholder_score: 4, average: 3.5, gap: -1.0 },
    { parameter_key: 'CONTRACT_COMPLIANCE',       parameter_label: 'Contract Compliance',       category: 'COMMERCIAL',       category_label: 'Commercial',        vendor_score: 4, stakeholder_score: 5, average: 4.5, gap: -1.0 },
    { parameter_key: 'COLLABORATION_ALIGNMENT',   parameter_label: 'Collaboration & Alignment', category: 'RELATIONSHIP',     category_label: 'Relationship',      vendor_score: 4, stakeholder_score: 5, average: 4.5, gap: -1.0 },
  ],
  v2: [
    // All categories declining — flag low performers
    { parameter_key: 'DELIVERY_TIMELINESS',      parameter_label: 'Delivery Timeliness',      category: 'PERFORMANCE',      category_label: 'Performance',       vendor_score: 2, stakeholder_score: 1, average: 1.5, gap: 1.0 },
    { parameter_key: 'QUALITY_OF_DELIVERY',      parameter_label: 'Quality of Delivery',      category: 'PERFORMANCE',      category_label: 'Performance',       vendor_score: 2, stakeholder_score: 2, average: 2.0, gap: 0.0 },
    { parameter_key: 'SLA_ADHERENCE',            parameter_label: 'SLA Adherence',            category: 'PERFORMANCE',      category_label: 'Performance',       vendor_score: 2, stakeholder_score: 1, average: 1.5, gap: 1.0 },
    { parameter_key: 'RELEASE_PATCH_MGMT',       parameter_label: 'Release & Patch Management', category: 'RISK_COMPLIANCE', category_label: 'Risk & Compliance', vendor_score: 2, stakeholder_score: 2, average: 2.0, gap: 0.0 },
    { parameter_key: 'BILLING_ACCURACY',         parameter_label: 'Billing Accuracy',         category: 'COMMERCIAL',       category_label: 'Commercial',        vendor_score: 3, stakeholder_score: 1, average: 2.0, gap: 2.0 },
    { parameter_key: 'COMMUNICATION_EFFECTIVENESS', parameter_label: 'Communication Effectiveness', category: 'RELATIONSHIP', category_label: 'Relationship',  vendor_score: 3, stakeholder_score: 2, average: 2.5, gap: 1.0 },
    { parameter_key: 'RESPONSIVENESS',           parameter_label: 'Responsiveness',           category: 'RELATIONSHIP',     category_label: 'Relationship',      vendor_score: 3, stakeholder_score: 2, average: 2.5, gap: 1.0 },
  ],
  v3: [
    // Mostly aligned — flag minor gaps
    { parameter_key: 'OPERATIONAL_EFFICIENCY',   parameter_label: 'Operational Efficiency',   category: 'PERFORMANCE',      category_label: 'Performance',       vendor_score: 3, stakeholder_score: 3, average: 3.0, gap: 0.0 },
    { parameter_key: 'PRICING_COMPETITIVENESS',  parameter_label: 'Pricing Competitiveness',  category: 'COMMERCIAL',       category_label: 'Commercial',        vendor_score: 3, stakeholder_score: 3, average: 3.0, gap: 0.0 },
    { parameter_key: 'COMMUNICATION_EFFECTIVENESS', parameter_label: 'Communication Effectiveness', category: 'RELATIONSHIP', category_label: 'Relationship',  vendor_score: 4, stakeholder_score: 3, average: 3.5, gap: 1.0 },
    { parameter_key: 'RELEASE_PATCH_MGMT',       parameter_label: 'Release & Patch Management', category: 'RISK_COMPLIANCE', category_label: 'Risk & Compliance', vendor_score: 3, stakeholder_score: 3, average: 3.0, gap: 0.0 },
  ],
}

export const MOCK_RECURRING_ISSUES: RecurringIssue[] = [
  {
    issue_id: 'ri1',
    vendor_id: 'v2',
    vendor_name: 'CoreSystems Ltd',
    description: 'Performance scores (Delivery Timeliness, SLA Adherence) consistently below threshold — 3 consecutive cycles',
    occurrences: 3,
    first_seen: 'Q2 2025',
    last_seen: 'Q1 2026',
    status: 'OPEN',
    cycles_affected: ['Q2 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026'],
  },
  {
    issue_id: 'ri2',
    vendor_id: 'v2',
    vendor_name: 'CoreSystems Ltd',
    description: 'Billing Accuracy flagged — large gap between vendor self-score (3) and stakeholder score (1) in Commercial',
    occurrences: 2,
    first_seen: 'Q3 2025',
    last_seen: 'Q1 2026',
    status: 'OPEN',
    cycles_affected: ['Q3 2025', 'Q4 2025', 'Q1 2026'],
  },
  {
    issue_id: 'ri3',
    vendor_id: 'v1',
    vendor_name: 'NovaTech Services',
    description: 'Delivery Timeliness gap (vendor 4 vs stakeholder 3) — vendor perception does not match stakeholder experience',
    occurrences: 2,
    first_seen: 'Q3 2025',
    last_seen: 'Q1 2026',
    status: 'OPEN',
    cycles_affected: ['Q3 2025', 'Q4 2025', 'Q1 2026'],
  },
  {
    issue_id: 'ri4',
    vendor_id: 'v3',
    vendor_name: 'Meridian IT',
    description: 'Innovation contribution absent — no proposals submitted in 3 consecutive cycles',
    occurrences: 3,
    first_seen: 'Q3 2025',
    last_seen: 'Q1 2026',
    status: 'OPEN',
    cycles_affected: ['Q3 2025', 'Q4 2025', 'Q1 2026'],
  },
]

export const MOCK_LEADERSHIP_BRIEFS: Record<string, LeadershipBrief> = {
  v1: {
    vendor_id: 'v1',
    vendor_name: 'NovaTech Services',
    trajectory: 'improving',
    trajectory_summary:
      'NovaTech Services shows consistent improvement across all 4 scorecard categories over 5 cycles. Overall score rose from 3.0 (Q1 2025) to 3.9 (Q1 2026). Commercial and Relationship are now above 4.0. Key gap: vendor self-scores in Performance (4.0) run ahead of stakeholder perception (3.6) — particularly on Delivery Timeliness and Resource Capability.',
    recurring_issues: [
      'Delivery Timeliness — vendor rates 4, stakeholders rate 3 for 2 consecutive cycles',
      'Resource Capability perception gap unresolved — junior resource ramp-up concerns raised Q3 2025',
    ],
    prior_commitments: [
      'AI automation pilot Phase 2 SOW — in progress, contract amendment pending',
      'SLA improvement plan submitted Q3 2025 — results partially validated in Q1 2026',
    ],
    recommended_focus: [
      'Address Delivery Timeliness perception gap — align internal and stakeholder definitions of "on time"',
      'Formalise AI pilot Phase 2 contract amendment to unblock delivery commitment',
      'Confirm CPI pricing clause interpretation with Commercial Lead before Q2 2026',
    ],
    generated_at: '2026-03-28T12:00:00Z',
  },
  v2: {
    vendor_id: 'v2',
    vendor_name: 'CoreSystems Ltd',
    trajectory: 'declining',
    trajectory_summary:
      'CoreSystems Ltd is in sustained decline across all 4 scorecard categories — 4 consecutive quarters of deterioration. Overall score dropped from 3.7 (Q1 2025) to 2.3 (Q1 2026). Performance is critically low at 2.1 with Delivery Timeliness and SLA Adherence both below 2.0 from stakeholders. Billing Accuracy shows the highest vendor-stakeholder gap (vendor 3 vs stakeholder 1).',
    recurring_issues: [
      'CRITICAL: Performance category below acceptable threshold for 4 consecutive cycles',
      'Billing Accuracy — major stakeholder perception gap (vendor 3.0 vs stakeholder 1.0) unresolved',
      'Communication Effectiveness declining — stakeholders report escalation delays',
    ],
    prior_commitments: [
      'Delivery improvement plan submitted Q3 2025 — targets not met in Q4 2025 or Q1 2026',
      'Invoice process fix committed Q3 2025 — billing issues persist as of Q1 2026',
    ],
    recommended_focus: [
      'Issue formal performance improvement notice — 4-cycle Performance decline meets trigger threshold',
      'Request senior vendor leadership escalation — current engagement is insufficient',
      'Review contractual exit criteria — confirm whether Q2 2026 will trigger contract review',
    ],
    generated_at: '2026-03-28T12:00:00Z',
  },
  v3: {
    vendor_id: 'v3',
    vendor_name: 'Meridian IT',
    trajectory: 'stable',
    trajectory_summary:
      'Meridian IT maintains a flat performance profile — all 4 categories have held steady between 3.0 and 3.3 for 5 cycles. The vendor meets minimum governance thresholds but delivers no measurable improvement or value-add. Vendor and stakeholder scores are well-aligned (gap < 0.2 per category), indicating honest self-assessment. Innovation is the key area requiring challenge.',
    recurring_issues: [
      'No innovation proposals submitted in 3 consecutive cycles — flagged at Q3 2025 QBR',
    ],
    prior_commitments: [
      'SLA response time improvement committed Q2 2025 — maintained in subsequent cycles',
    ],
    recommended_focus: [
      'Challenge Meridian IT on innovation pipeline — set measurable targets for Q2 2026',
      'Benchmark against market alternatives given flat 5-cycle trajectory',
      'Explore whether managed services scope can be expanded to offset governance overhead',
    ],
    generated_at: '2026-03-28T12:00:00Z',
  },
}

export const MOCK_ALL_ACTIONS: (ExtractedAction & { cycle_ref: string })[] = [
  { action_id: 'ac1', description: 'Align on AI automation proposal scope', owner: 'Alex Thompson', due_date: '2026-03-28', source: 'alignment', status: 'OPEN', cycle_ref: 'NovaTech Q1 2026' },
  { action_id: 'ac2', description: 'Prepare factual data for SLA compliance discussion', owner: 'Priya Sharma', due_date: '2026-03-26', source: 'alignment', status: 'CLOSED', cycle_ref: 'NovaTech Q1 2026' },
  { action_id: 'ac3', description: 'Review Q4 innovation KPI contract commitments', owner: "James O'Brien", due_date: '2026-03-25', source: 'alignment', status: 'CLOSED', cycle_ref: 'NovaTech Q1 2026' },
  { action_id: 'ac4', description: 'Submit root cause analysis for February SLA incident', owner: 'Raj Patel (NovaTech)', due_date: '2026-04-02', source: 'vendor_prep', status: 'OPEN', cycle_ref: 'NovaTech Q1 2026' },
  { action_id: 'ac5', description: 'Schedule joint SLA incident timeline review session', owner: 'Alex Thompson', due_date: '2026-04-04', source: 'meeting', status: 'OPEN', cycle_ref: 'NovaTech Q1 2026' },
  { action_id: 'ac6', description: 'Submit written AI pilot Phase 2 scope proposal for Zensar Legal', owner: 'Lisa Wang (NovaTech)', due_date: '2026-04-15', source: 'meeting', status: 'OPEN', cycle_ref: 'NovaTech Q1 2026' },
  { action_id: 'ac7', description: 'Review pricing CPI clause with Zensar Commercial Lead', owner: 'Emma Davies', due_date: '2026-04-07', source: 'meeting', status: 'IN_PROGRESS', cycle_ref: 'NovaTech Q1 2026' },
]
