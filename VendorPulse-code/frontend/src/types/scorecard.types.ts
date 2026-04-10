/* ── Scorecard Category & Parameter Definitions ─────────────── */

export type ScorecardCategoryKey =
  | 'RISK_COMPLIANCE'
  | 'PERFORMANCE'
  | 'COMMERCIAL'
  | 'RELATIONSHIP'

export interface ScorecardParameter {
  key: string
  label: string
}

export interface ScorecardCategoryDef {
  key: ScorecardCategoryKey
  label: string
  parameters: ScorecardParameter[]
}

export const SCORECARD_STRUCTURE: ScorecardCategoryDef[] = [
  {
    key: 'RISK_COMPLIANCE',
    label: 'Risk & Compliance',
    parameters: [
      { key: 'RELEASE_PATCH_MGMT', label: 'Release & Patch Management' },
      { key: 'SECURITY_RISK_MGMT', label: 'Security & Risk Management' },
      { key: 'AUDIT_COMPLIANCE', label: 'Audit & Compliance Adherence' },
    ],
  },
  {
    key: 'PERFORMANCE',
    label: 'Performance',
    parameters: [
      { key: 'DELIVERY_TIMELINESS', label: 'Delivery Timeliness' },
      { key: 'QUALITY_OF_DELIVERY', label: 'Quality of Delivery' },
      { key: 'RESOURCE_CAPABILITY', label: 'Resource Capability' },
      { key: 'SLA_ADHERENCE', label: 'SLA Adherence' },
      { key: 'OPERATIONAL_EFFICIENCY', label: 'Operational Efficiency' },
    ],
  },
  {
    key: 'COMMERCIAL',
    label: 'Commercial',
    parameters: [
      { key: 'PRICING_COMPETITIVENESS', label: 'Pricing Competitiveness' },
      { key: 'CONTRACT_COMPLIANCE', label: 'Contract Compliance' },
      { key: 'COST_CONTROL', label: 'Cost Control' },
      { key: 'BILLING_ACCURACY', label: 'Billing Accuracy' },
    ],
  },
  {
    key: 'RELATIONSHIP',
    label: 'Relationship',
    parameters: [
      { key: 'COMMUNICATION_EFFECTIVENESS', label: 'Communication Effectiveness' },
      { key: 'STAKEHOLDER_ENGAGEMENT', label: 'Stakeholder Engagement' },
      { key: 'RESPONSIVENESS', label: 'Responsiveness' },
      { key: 'COLLABORATION_ALIGNMENT', label: 'Collaboration & Alignment' },
    ],
  },
]

export const CATEGORY_LABELS: Record<ScorecardCategoryKey, string> = {
  RISK_COMPLIANCE: 'Risk & Compliance',
  PERFORMANCE: 'Performance',
  COMMERCIAL: 'Commercial',
  RELATIONSHIP: 'Relationship',
}

// Backward-compatible aliases used by analytics/alignment modules
export type ScorecardCategory = ScorecardCategoryKey
export const SCORECARD_CATEGORIES: ScorecardCategoryKey[] = [
  'RISK_COMPLIANCE', 'PERFORMANCE', 'COMMERCIAL', 'RELATIONSHIP',
]

export const ALL_PARAMETERS = SCORECARD_STRUCTURE.flatMap((cat) =>
  cat.parameters.map((p) => ({ ...p, category: cat.key }))
)

/** Short tooltips explaining each scorecard parameter */
export const PARAMETER_TOOLTIPS: Record<string, string> = {
  RELEASE_PATCH_MGMT: 'Timeliness and quality of release and patch deployments',
  SECURITY_RISK_MGMT: 'Adherence to security protocols and risk mitigation practices',
  AUDIT_COMPLIANCE: 'Compliance with audit requirements and regulatory standards',
  DELIVERY_TIMELINESS: 'On-time delivery of committed milestones and deliverables',
  QUALITY_OF_DELIVERY: 'Defect rates, rework frequency, and output quality',
  RESOURCE_CAPABILITY: 'Skill levels, certifications, and team competency',
  SLA_ADHERENCE: 'Compliance with agreed service level agreements',
  OPERATIONAL_EFFICIENCY: 'Process optimization and operational productivity',
  PRICING_COMPETITIVENESS: 'Value for money relative to market benchmarks',
  CONTRACT_COMPLIANCE: 'Adherence to contractual terms and obligations',
  COST_CONTROL: 'Budget management and cost optimization',
  BILLING_ACCURACY: 'Accuracy and timeliness of invoicing',
  COMMUNICATION_EFFECTIVENESS: 'Clarity, frequency, and quality of communication',
  STAKEHOLDER_ENGAGEMENT: 'Proactive engagement with key stakeholders',
  RESPONSIVENESS: 'Speed and quality of response to queries and issues',
  COLLABORATION_ALIGNMENT: 'Strategic alignment and collaborative problem-solving',
}

/* ── Submission Tracking ────────────────────────────────────── */

export type SubmissionStatus = 'PENDING' | 'SUBMITTED' | 'INVALID' | 'CORRECTED'

export interface StakeholderSubmission {
  stakeholder_id: string
  stakeholder_name: string
  role: string
  organisation: string
  status: SubmissionStatus
  submitted_at: string | null
  reminders_sent: number
  last_reminder: string | null
}

/* ── Individual Scorecard Entry (per parameter per stakeholder) */

export interface ScorecardEntry {
  scorecard_id: string
  cycle_id: string
  stakeholder_id: string
  stakeholder_name: string
  parameter_key: string
  category: ScorecardCategoryKey
  score: number
  comment: string
  is_valid: boolean
  validation_flags: string[]
  submitted_at: string | null
}

/* ── Compiled Results ───────────────────────────────────────── */

export interface ParameterScore {
  parameter_key: string
  parameter_label: string
  scores: { stakeholder_id: string; stakeholder_name: string; score: number; is_outlier: boolean }[]
  average: number
}

export interface CompiledCategoryScore {
  category: ScorecardCategoryKey
  category_label: string
  parameters: ParameterScore[]
  category_average: number
}

/* ── 2-Column Compiled Scorecard (Internal vs Vendor) ──────── */

export interface IndividualScore {
  name: string
  score: number
}

export interface CompiledParameter {
  parameter_key: string
  parameter_label: string
  internal_avg: number | null
  vendor_avg: number | null
  internal_count: number
  vendor_count: number
  internal_scores?: IndividualScore[]
  vendor_scores?: IndividualScore[]
}

export interface CompiledCategory {
  category: ScorecardCategoryKey
  category_label: string
  internal_avg: number | null
  vendor_avg: number | null
  parameters: CompiledParameter[]
}

export interface CompiledScorecard {
  cycle_id: string
  internal_respondents: number
  vendor_respondents: number
  overall_internal_avg: number | null
  overall_vendor_avg: number | null
  categories: CompiledCategory[]
  comments: Record<string, { internal: string[]; vendor: string[] }>
  key_recommendations: string[]
}

/* ── Submission Tracker ────────────────────────────────────── */

export interface SubmissionTrackerEntry {
  attendee_id: string
  name: string
  email: string
  gmail: string
  type: 'Internal Stakeholder' | 'Vendor'
  role: string
  organisation: string
  submitted: boolean
  submitted_at: string | null
  response_id: string | null
}

export interface SubmissionTrackerData {
  cycle_id: string
  total_key_attendees: number
  submitted: number
  pending: number
  tracker: SubmissionTrackerEntry[]
}
