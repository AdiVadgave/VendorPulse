import type { VendorTrend, RecurringIssue, LeadershipBrief, RadarDataPoint, CrossVendorDataPoint } from '@/types/analytics.types'
import type { ExtractedAction } from '@/types/alignment.types'

export const MOCK_VENDOR_TRENDS: VendorTrend[] = [
  {
    vendor_id: 'v1',
    vendor_name: 'NovaTech Services',
    cycles: [
      { cycle_label: 'Q1 2025', quarter: 'Q1', year: 2025, scores: { DELIVERY_QUALITY: 3, SLA_COMPLIANCE: 2, INNOVATION: 3, COMMUNICATION: 3, VALUE_FOR_MONEY: 3 } },
      { cycle_label: 'Q2 2025', quarter: 'Q2', year: 2025, scores: { DELIVERY_QUALITY: 3, SLA_COMPLIANCE: 3, INNOVATION: 3, COMMUNICATION: 4, VALUE_FOR_MONEY: 3 } },
      { cycle_label: 'Q3 2025', quarter: 'Q3', year: 2025, scores: { DELIVERY_QUALITY: 4, SLA_COMPLIANCE: 3, INNOVATION: 4, COMMUNICATION: 4, VALUE_FOR_MONEY: 3 } },
      { cycle_label: 'Q4 2025', quarter: 'Q4', year: 2025, scores: { DELIVERY_QUALITY: 4, SLA_COMPLIANCE: 4, INNOVATION: 5, COMMUNICATION: 4, VALUE_FOR_MONEY: 4 } },
      { cycle_label: 'Q1 2026', quarter: 'Q1', year: 2026, scores: { DELIVERY_QUALITY: 3.83, SLA_COMPLIANCE: 3.67, INNOVATION: 4.0, COMMUNICATION: 3.67, VALUE_FOR_MONEY: 3.83 } },
    ],
  },
  {
    vendor_id: 'v2',
    vendor_name: 'CoreSystems Ltd',
    cycles: [
      { cycle_label: 'Q1 2025', quarter: 'Q1', year: 2025, scores: { DELIVERY_QUALITY: 4, SLA_COMPLIANCE: 3, INNOVATION: 3, COMMUNICATION: 4, VALUE_FOR_MONEY: 4 } },
      { cycle_label: 'Q2 2025', quarter: 'Q2', year: 2025, scores: { DELIVERY_QUALITY: 3, SLA_COMPLIANCE: 3, INNOVATION: 2, COMMUNICATION: 3, VALUE_FOR_MONEY: 4 } },
      { cycle_label: 'Q3 2025', quarter: 'Q3', year: 2025, scores: { DELIVERY_QUALITY: 3, SLA_COMPLIANCE: 2, INNOVATION: 2, COMMUNICATION: 3, VALUE_FOR_MONEY: 3 } },
      { cycle_label: 'Q4 2025', quarter: 'Q4', year: 2025, scores: { DELIVERY_QUALITY: 2, SLA_COMPLIANCE: 2, INNOVATION: 2, COMMUNICATION: 2, VALUE_FOR_MONEY: 3 } },
      { cycle_label: 'Q1 2026', quarter: 'Q1', year: 2026, scores: { DELIVERY_QUALITY: 2.2, SLA_COMPLIANCE: 2.0, INNOVATION: 2.0, COMMUNICATION: 2.4, VALUE_FOR_MONEY: 2.8 } },
    ],
  },
  {
    vendor_id: 'v3',
    vendor_name: 'Meridian IT',
    cycles: [
      { cycle_label: 'Q1 2025', quarter: 'Q1', year: 2025, scores: { DELIVERY_QUALITY: 3, SLA_COMPLIANCE: 4, INNOVATION: 3, COMMUNICATION: 3, VALUE_FOR_MONEY: 3 } },
      { cycle_label: 'Q2 2025', quarter: 'Q2', year: 2025, scores: { DELIVERY_QUALITY: 3, SLA_COMPLIANCE: 4, INNOVATION: 3, COMMUNICATION: 3, VALUE_FOR_MONEY: 3 } },
      { cycle_label: 'Q3 2025', quarter: 'Q3', year: 2025, scores: { DELIVERY_QUALITY: 3, SLA_COMPLIANCE: 3, INNOVATION: 3, COMMUNICATION: 4, VALUE_FOR_MONEY: 3 } },
      { cycle_label: 'Q4 2025', quarter: 'Q4', year: 2025, scores: { DELIVERY_QUALITY: 3, SLA_COMPLIANCE: 4, INNOVATION: 3, COMMUNICATION: 3, VALUE_FOR_MONEY: 3 } },
      { cycle_label: 'Q1 2026', quarter: 'Q1', year: 2026, scores: { DELIVERY_QUALITY: 3.1, SLA_COMPLIANCE: 3.5, INNOVATION: 3.0, COMMUNICATION: 3.2, VALUE_FOR_MONEY: 3.0 } },
    ],
  },
]

export const MOCK_RECURRING_ISSUES: RecurringIssue[] = [
  {
    issue_id: 'ri1',
    vendor_id: 'v2',
    vendor_name: 'CoreSystems Ltd',
    description: 'Delivery Quality consistently below SLA threshold — recurring since Q2 2025',
    occurrences: 3,
    first_seen: 'Q2 2025',
    last_seen: 'Q4 2025',
    status: 'OPEN',
    cycles_affected: ['Q2 2025', 'Q3 2025', 'Q4 2025'],
  },
  {
    issue_id: 'ri2',
    vendor_id: 'v2',
    vendor_name: 'CoreSystems Ltd',
    description: 'Delayed invoice submissions — two consecutive cycles without resolution',
    occurrences: 2,
    first_seen: 'Q3 2025',
    last_seen: 'Q4 2025',
    status: 'OPEN',
    cycles_affected: ['Q3 2025', 'Q4 2025'],
  },
  {
    issue_id: 'ri3',
    vendor_id: 'v1',
    vendor_name: 'NovaTech Services',
    description: 'Innovation KPIs not aligned to contract commitments — resolved Q4 2025',
    occurrences: 2,
    first_seen: 'Q2 2025',
    last_seen: 'Q3 2025',
    status: 'RESOLVED',
    cycles_affected: ['Q2 2025', 'Q3 2025'],
  },
]

export const MOCK_RADAR_DATA: Record<string, RadarDataPoint[]> = {
  v1: [
    { category: 'Delivery Quality', current: 3.83, previous: 4.0 },
    { category: 'SLA Compliance', current: 3.67, previous: 4.0 },
    { category: 'Innovation', current: 4.0, previous: 5.0 },
    { category: 'Communication', current: 3.67, previous: 4.0 },
    { category: 'Value for Money', current: 3.83, previous: 4.0 },
  ],
  v2: [
    { category: 'Delivery Quality', current: 2.2, previous: 2.0 },
    { category: 'SLA Compliance', current: 2.0, previous: 2.0 },
    { category: 'Innovation', current: 2.0, previous: 2.0 },
    { category: 'Communication', current: 2.4, previous: 2.0 },
    { category: 'Value for Money', current: 2.8, previous: 3.0 },
  ],
  v3: [
    { category: 'Delivery Quality', current: 3.1, previous: 3.0 },
    { category: 'SLA Compliance', current: 3.5, previous: 4.0 },
    { category: 'Innovation', current: 3.0, previous: 3.0 },
    { category: 'Communication', current: 3.2, previous: 3.0 },
    { category: 'Value for Money', current: 3.0, previous: 3.0 },
  ],
}

export const MOCK_CROSS_VENDOR_DATA: CrossVendorDataPoint[] = [
  { category: 'Delivery Quality', novatech: 3.83, coresystems: 2.2, meridian: 3.1 },
  { category: 'SLA Compliance', novatech: 3.67, coresystems: 2.0, meridian: 3.5 },
  { category: 'Innovation', novatech: 4.0, coresystems: 2.0, meridian: 3.0 },
  { category: 'Communication', novatech: 3.67, coresystems: 2.4, meridian: 3.2 },
  { category: 'Value for Money', novatech: 3.83, coresystems: 2.8, meridian: 3.0 },
]

export const MOCK_LEADERSHIP_BRIEFS: Record<string, LeadershipBrief> = {
  v1: {
    vendor_id: 'v1',
    vendor_name: 'NovaTech Services',
    trajectory: 'improving',
    trajectory_summary: 'NovaTech Services has demonstrated a consistent improvement trajectory over 4 consecutive quarters. Overall score has risen from 3.0 (Q1 2025) to 3.8 (Q1 2026), with Innovation showing the strongest growth. One internal scoring outlier in Innovation requires resolution before the next cycle.',
    recurring_issues: ['No active recurring issues — previous Innovation KPI misalignment resolved in Q4 2025'],
    prior_commitments: [
      'AI automation pilot Phase 1 — status: in progress, Phase 2 SOW pending',
      'SLA improvement plan submitted Q3 2025 — results partially validated',
    ],
    recommended_focus: [
      'Resolve internal Innovation score divergence — Priya Sharma\'s outlier score (2 vs group avg 4) needs discussion',
      'Formalise AI pilot Phase 2 scope via contract amendment to unblock delivery',
      'Confirm CPI pricing clause interpretation with Zensar Commercial Lead before Q2',
    ],
    generated_at: '2026-03-28T12:00:00Z',
  },
  v2: {
    vendor_id: 'v2',
    vendor_name: 'CoreSystems Ltd',
    trajectory: 'declining',
    trajectory_summary: 'CoreSystems Ltd has shown a concerning and sustained declining trajectory across 4 consecutive quarters, with an overall score dropping from 3.6 (Q1 2025) to 2.3 (Q4 2025). Delivery Quality and SLA Compliance have fallen below acceptable thresholds. Two recurring issues remain unresolved.',
    recurring_issues: [
      'CRITICAL: Delivery Quality below SLA threshold — flagged in Q2, Q3, Q4 2025 (3 consecutive cycles)',
      'Delayed invoice submissions — flagged Q3, Q4 2025 (2 cycles, unresolved)',
    ],
    prior_commitments: [
      'Delivery improvement plan requested Q3 2025 — submitted but targets not met',
      'Invoice process fix committed Q3 2025 — not resolved as of Q4',
    ],
    recommended_focus: [
      'Initiate formal performance improvement notice given 3-cycle delivery quality decline',
      'Request senior vendor escalation — current engagement level is insufficient for trajectory reversal',
      'Review contractual exit criteria — confirm conditions for contract review if Q2 2026 targets not met',
    ],
    generated_at: '2026-03-28T12:00:00Z',
  },
  v3: {
    vendor_id: 'v3',
    vendor_name: 'Meridian IT',
    trajectory: 'stable',
    trajectory_summary: 'Meridian IT maintains a consistently stable performance profile across all categories, averaging 3.2–3.5 over the past 4 quarters. No significant improvements or declines detected. The vendor meets minimum governance thresholds but shows limited ambition for value creation.',
    recurring_issues: ['No active recurring issues'],
    prior_commitments: [
      'SLA response time improvement committed Q2 2025 — maintained in subsequent cycles',
    ],
    recommended_focus: [
      'Challenge Meridian IT on innovation contributions — no proposals submitted in 3 consecutive cycles',
      'Consider benchmarking against market alternatives given flat trajectory',
      'Explore whether managed services scope can be expanded to offset administrative overhead',
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
