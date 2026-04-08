import type {
  StakeholderSubmission,
  ScorecardEntry,
  CompiledCategoryScore,
  ScorecardCategoryKey,
} from '@/types/scorecard.types'
import { SCORECARD_STRUCTURE } from '@/types/scorecard.types'
import type { CycleAttendee } from '@/types/scheduling.types'

/* ── Attendee shape used in scorecard ────────────────────────── */

export interface ScorecardAttendee {
  stakeholder_id: string
  stakeholder_name: string
  role: string
  organisation: string
}

/**
 * Derive the 2 key scorecard attendees from the cycle's attendee list.
 *
 * Strategy:
 * 1. Try to split by vendor name — if an attendee's org matches vendorName,
 *    they're on the vendor side; otherwise stakeholder side.
 * 2. If no attendee matches the vendor org (common when orgs are e.g. "Zensar VMO"
 *    while vendor is "Amazon"), fall back to picking the first 2 key attendees
 *    (or first 2 attendees if none are marked key).
 */
export function deriveScorecardAttendees(
  attendees: CycleAttendee[],
  vendorName: string,
): { vendor: ScorecardAttendee | null; stakeholder: ScorecardAttendee | null } {
  const toScorecard = (a: CycleAttendee): ScorecardAttendee => ({
    stakeholder_id: a.stakeholder_id,
    stakeholder_name: a.name,
    role: a.role,
    organisation: a.organisation,
  })

  const vendorSide = attendees.filter((a) => a.organisation === vendorName)
  const stakeholderSide = attendees.filter((a) => a.organisation !== vendorName)

  // If we can split by org, pick best from each side
  if (vendorSide.length > 0 && stakeholderSide.length > 0) {
    const pickBest = (list: CycleAttendee[]) => {
      const key = list.find((a) => a.is_key)
      return key ?? list[0]
    }
    return {
      vendor: toScorecard(pickBest(vendorSide)),
      stakeholder: toScorecard(pickBest(stakeholderSide)),
    }
  }

  // Fallback: pick the first 2 key attendees (or first 2 overall)
  const keyAttendees = attendees.filter((a) => a.is_key)
  const pool = keyAttendees.length >= 2 ? keyAttendees : attendees

  return {
    vendor: pool[0] ? toScorecard(pool[0]) : null,
    stakeholder: pool[1] ? toScorecard(pool[1]) : null,
  }
}

/* ── Build initial submissions from derived attendees ────────── */

export function getInitialSubmissions(
  attendees: ScorecardAttendee[],
): StakeholderSubmission[] {
  return attendees.map((a) => ({
    ...a,
    status: 'PENDING' as const,
    submitted_at: null,
    reminders_sent: 0,
    last_reminder: null,
  }))
}

/* ── Pre-defined score sets (mapped to whichever attendee is selected) */

const VENDOR_SCORES: Record<string, { score: number; comment: string }> = {
  // Risk & Compliance
  RELEASE_PATCH_MGMT: { score: 4, comment: 'Patches delivered on schedule with minimal rollback.' },
  SECURITY_RISK_MGMT: { score: 3, comment: 'Two minor vulnerabilities identified in Q1 scan.' },
  AUDIT_COMPLIANCE: { score: 4, comment: 'Full compliance with SOC2 requirements.' },
  // Performance
  DELIVERY_TIMELINESS: { score: 4, comment: 'All major milestones met within SLA window.' },
  QUALITY_OF_DELIVERY: { score: 5, comment: 'Zero critical defects in production releases this quarter.' },
  RESOURCE_CAPABILITY: { score: 4, comment: 'Team skills well-aligned with project needs.' },
  SLA_ADHERENCE: { score: 4, comment: 'SLA met in 95% of incidents.' },
  OPERATIONAL_EFFICIENCY: { score: 3, comment: 'Some manual processes still need automation.' },
  // Commercial
  PRICING_COMPETITIVENESS: { score: 3, comment: 'Pricing slightly above market average.' },
  CONTRACT_COMPLIANCE: { score: 4, comment: 'All contract terms adhered to.' },
  COST_CONTROL: { score: 4, comment: 'No budget overruns this quarter.' },
  BILLING_ACCURACY: { score: 5, comment: 'Invoicing has been flawless.' },
  // Relationship
  COMMUNICATION_EFFECTIVENESS: { score: 4, comment: 'Regular updates and clear escalation paths.' },
  STAKEHOLDER_ENGAGEMENT: { score: 4, comment: 'Proactive engagement with all stakeholders.' },
  RESPONSIVENESS: { score: 5, comment: 'Issues acknowledged within 2 hours consistently.' },
  COLLABORATION_ALIGNMENT: { score: 4, comment: 'Good alignment on strategic priorities.' },
}

const STAKEHOLDER_SCORES: Record<string, { score: number; comment: string }> = {
  // Risk & Compliance
  RELEASE_PATCH_MGMT: { score: 3, comment: 'One delayed patch caused a brief service disruption.' },
  SECURITY_RISK_MGMT: { score: 4, comment: 'Security posture has improved significantly.' },
  AUDIT_COMPLIANCE: { score: 4, comment: 'Audit findings resolved promptly.' },
  // Performance
  DELIVERY_TIMELINESS: { score: 3, comment: 'Two deliverables slipped by a week.' },
  QUALITY_OF_DELIVERY: { score: 4, comment: 'Quality is good but minor rework needed on UI components.' },
  RESOURCE_CAPABILITY: { score: 3, comment: 'Junior resources need more ramp-up time.' },
  SLA_ADHERENCE: { score: 4, comment: 'SLA compliance improved from last quarter.' },
  OPERATIONAL_EFFICIENCY: { score: 4, comment: 'Automation initiatives showing results.' },
  // Commercial
  PRICING_COMPETITIVENESS: { score: 4, comment: 'Competitive rates for the scope delivered.' },
  CONTRACT_COMPLIANCE: { score: 5, comment: 'Exemplary contract adherence.' },
  COST_CONTROL: { score: 3, comment: 'Some unexpected costs in cloud infrastructure.' },
  BILLING_ACCURACY: { score: 4, comment: 'Minor discrepancy resolved quickly.' },
  // Relationship
  COMMUNICATION_EFFECTIVENESS: { score: 3, comment: 'Escalation communication could be faster.' },
  STAKEHOLDER_ENGAGEMENT: { score: 4, comment: 'Good stakeholder engagement overall.' },
  RESPONSIVENESS: { score: 4, comment: 'Generally responsive, occasional delays on weekends.' },
  COLLABORATION_ALIGNMENT: { score: 5, comment: 'Excellent alignment on roadmap priorities.' },
}

/* ── Build ScorecardEntry arrays ──────────────────────────── */

function buildEntries(
  attendee: ScorecardAttendee,
  scores: Record<string, { score: number; comment: string }>,
  cycleId: string,
  submittedAt: string,
  idPrefix: string,
): ScorecardEntry[] {
  let idx = 0
  return SCORECARD_STRUCTURE.flatMap((cat) =>
    cat.parameters.map((param) => {
      idx++
      const s = scores[param.key]
      return {
        scorecard_id: `${idPrefix}_${idx}`,
        cycle_id: cycleId,
        stakeholder_id: attendee.stakeholder_id,
        stakeholder_name: attendee.stakeholder_name,
        parameter_key: param.key,
        category: cat.key as ScorecardCategoryKey,
        score: s.score,
        comment: s.comment,
        is_valid: true,
        validation_flags: [],
        submitted_at: submittedAt,
      }
    })
  )
}

export function getVendorEntries(
  attendee: ScorecardAttendee,
  cycleId: string,
  submittedAt: string,
): ScorecardEntry[] {
  return buildEntries(attendee, VENDOR_SCORES, cycleId, submittedAt, 'scv')
}

export function getStakeholderEntries(
  attendee: ScorecardAttendee,
  cycleId: string,
  submittedAt: string,
): ScorecardEntry[] {
  return buildEntries(attendee, STAKEHOLDER_SCORES, cycleId, submittedAt, 'scs')
}

/* ── Compile scores from entries ──────────────────────────── */

export function compileScores(entries: ScorecardEntry[]): CompiledCategoryScore[] {
  return SCORECARD_STRUCTURE.map((cat) => {
    const parameters = cat.parameters.map((param) => {
      const paramEntries = entries.filter((e) => e.parameter_key === param.key)
      const scores = paramEntries.map((e) => ({
        stakeholder_id: e.stakeholder_id,
        stakeholder_name: e.stakeholder_name,
        score: e.score,
        is_outlier: false,
      }))
      const avg = scores.length > 0
        ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length
        : 0
      return {
        parameter_key: param.key,
        parameter_label: param.label,
        scores,
        average: parseFloat(avg.toFixed(2)),
      }
    })

    const catAvg = parameters.length > 0
      ? parameters.reduce((sum, p) => sum + p.average, 0) / parameters.length
      : 0

    return {
      category: cat.key as ScorecardCategoryKey,
      category_label: cat.label,
      parameters,
      category_average: parseFloat(catAvg.toFixed(2)),
    }
  })
}
