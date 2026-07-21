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

/* ══════════════════════════════════════════════════════════════
 * Weighted scorecard (v2 / production format) — in-app form
 * ══════════════════════════════════════════════════════════════ */

export type ScorecardMeasureType = 'numeric' | 'rag'

export interface WeightedMeasureDef {
  key: string
  label: string
  description: string
  measure_type?: ScorecardMeasureType
}

export interface WeightedCategoryDef {
  key: string
  label: string
  weight: number
  measures: WeightedMeasureDef[]
}

/**
 * Fallback structure used only if the backend config hasn't loaded. The
 * authoritative per-SPR structure comes from the backend (`scorecard_config`),
 * so this stays minimal and is never the source of truth.
 */
export const WEIGHTED_SCORECARD_STRUCTURE: WeightedCategoryDef[] = [
  {
    key: 'RISK_COMPLIANCE',
    label: 'Risk & Compliance',
    weight: 20,
    measures: [
      { key: 'PATCH_MANAGEMENT', label: 'Patch Management', description: 'Vendor support towards implementing latest Releases, Anti-virus upgrades and Patch Management', measure_type: 'numeric' },
    ],
  },
  {
    key: 'PERFORMANCE',
    label: 'Performance',
    weight: 30,
    measures: [
      { key: 'RESOURCES_CAPABILITY', label: 'Resources & Capability', description: 'Vendor proactive capability to leverage their resources to meet the organizational goals and anticipating the future requirements of an organization', measure_type: 'numeric' },
      { key: 'RELEASE_DELIVERY', label: 'Release & Delivery', description: 'On-time, quality project delivery, resources and capability', measure_type: 'numeric' },
      { key: 'OPERATIONS', label: 'Operations', description: 'Meets or exceeds contracted service levels with strong focus on user experience', measure_type: 'numeric' },
    ],
  },
  {
    key: 'COMMERCIAL',
    label: 'Commercial',
    weight: 20,
    measures: [
      { key: 'PRICING', label: 'Pricing', description: 'Cost is competitive and well-managed', measure_type: 'numeric' },
      { key: 'COMMERCIAL_EXCELLENCE', label: 'Commercial Excellence', description: 'Appropriate commercial contract structure, invoices timely, accurate, and transparent', measure_type: 'numeric' },
      { key: 'COST_CONTROL', label: 'Cost Control', description: 'Changes and increases are managed well and minimized; cost-saving ideas shared', measure_type: 'numeric' },
    ],
  },
  {
    key: 'RELATIONSHIP',
    label: 'Relationship',
    weight: 30,
    measures: [
      { key: 'FLEXIBILITY', label: 'Flexibility', description: 'Vendor team demonstrates flexibility & Proactive responsiveness when required', measure_type: 'numeric' },
      { key: 'STAKEHOLDER_ENGAGEMENT', label: 'Stakeholder Engagement', description: "Vendor's ability to understand, communicate and respond to Shell's stakeholders in a professional, clear and timely manner", measure_type: 'numeric' },
      { key: 'ALIGNMENT', label: 'Alignment', description: 'Vendor understands the business needs and partners with Shell to meet the short- & long-term milestone roadmap timelines and ownership (includes innovation & sustainability)', measure_type: 'numeric' },
    ],
  },
]

/* ── Per-SPR scorecard configuration (catalog + selection) ─────── */

export type RAGStatus = 'red' | 'amber' | 'green'

export interface ScorecardCatalogMeasure {
  key: string
  label: string
  description: string
  measure_type: ScorecardMeasureType
}

export interface ScorecardCatalogTheme {
  key: string
  label: string
  default_weight: number
  measures: ScorecardCatalogMeasure[]
}

export interface ScorecardConfigMeasure {
  key: string
  label: string
  description: string
  measure_type: ScorecardMeasureType
}

export interface ScorecardConfigTheme {
  key: string
  label: string
  weight: number
  measures: ScorecardConfigMeasure[]
}

export interface ScorecardConfig {
  categories: ScorecardConfigTheme[]
  configured: boolean
}

export interface ScorecardSubmissionPayload {
  cycle_id: string
  attendee_id: string
  scores: Record<string, number>
  rag_scores: Record<string, string>
  comments: Record<string, string>
  skipped_measures: string[]
  skipped_themes: string[]
}

export interface WeightedTeamColumn {
  attendee_id: string
  email: string
  name: string
  team: string
}

export interface WeightedMeasureRow {
  key: string
  label: string
  description: string
  measure_type?: ScorecardMeasureType
  team_scores: Record<string, number | null>
  team_rag?: Record<string, string | null>
  rag_consensus?: string | null
  average: number | null
  comments: Record<string, string>
}

export interface WeightedCategoryResult {
  key: ScorecardCategoryKey
  label: string
  weight: number
  measures: WeightedMeasureRow[]
  category_average: number | null
}

export interface WeightedScorecard {
  cycle_id: string
  teams: WeightedTeamColumn[]
  categories: WeightedCategoryResult[]
  overall_score: number | null
  submitted_count: number
}

export interface ScorecardRespondent {
  attendee_id: string
  name: string
  email: string
  team: string
}

export interface ScorecardFormMeta {
  cycle_id: string
  vendor_name: string
  cycle_type: string
  quarter: string
  year: number
  structure: WeightedCategoryDef[]
  respondent: ScorecardRespondent | null
}

export interface TeamSubmissionEntry {
  attendee_id: string
  name: string
  email: string
  team: string
  submitted: boolean
  submitted_at: string | null
}

export interface TeamSubmissionsData {
  cycle_id: string
  total: number
  submitted: number
  pending: number
  tracker: TeamSubmissionEntry[]
}

/* ── Submission Tracker ────────────────────────────────────── */

export interface SubmissionTrackerEntry {
  attendee_id: string
  name: string
  email: string
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
