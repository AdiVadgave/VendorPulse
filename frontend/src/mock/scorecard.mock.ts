/**
 * Scorecard utilities — now mostly wrappers around backend API data.
 * Static mock scores removed. Compilation logic moved to backend.
 */
import type {
  CompiledCategoryScore,
  ScorecardCategoryKey,
  CompiledScorecard,
} from '@/types/scorecard.types'
import { SCORECARD_STRUCTURE } from '@/types/scorecard.types'

/**
 * Convert backend CompiledScorecard to the legacy CompiledCategoryScore[]
 * format that alignment/vendor-prep tabs still expect.
 * Internal avg → first "score", Vendor avg → second "score".
 */
export function compiledScorecardToLegacy(cs: CompiledScorecard): CompiledCategoryScore[] {
  return cs.categories.map((cat) => {
    const parameters = cat.parameters.map((param) => {
      const scores: { stakeholder_id: string; stakeholder_name: string; score: number; is_outlier: boolean }[] = []
      if (param.internal_avg !== null) {
        scores.push({
          stakeholder_id: 'internal',
          stakeholder_name: 'Internal Stakeholder',
          score: param.internal_avg,
          is_outlier: false,
        })
      }
      if (param.vendor_avg !== null) {
        scores.push({
          stakeholder_id: 'vendor',
          stakeholder_name: 'Vendor',
          score: param.vendor_avg,
          is_outlier: false,
        })
      }
      const avg = scores.length > 0
        ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length
        : 0
      return {
        parameter_key: param.parameter_key,
        parameter_label: param.parameter_label,
        scores,
        average: parseFloat(avg.toFixed(2)),
      }
    })

    const catAvg = parameters.length > 0
      ? parameters.reduce((sum, p) => sum + p.average, 0) / parameters.length
      : 0

    return {
      category: cat.category as ScorecardCategoryKey,
      category_label: cat.category_label,
      parameters,
      category_average: parseFloat(catAvg.toFixed(2)),
    }
  })
}

/**
 * Build CompiledCategoryScore[] from raw entries (legacy path).
 * Kept for backward compatibility but prefer backend /compiled endpoint.
 */
export function compileScoresFromEntries(
  entries: { parameter_key: string; stakeholder_id: string; stakeholder_name: string; score: number }[]
): CompiledCategoryScore[] {
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
