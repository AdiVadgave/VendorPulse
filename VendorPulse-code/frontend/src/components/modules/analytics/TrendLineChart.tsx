import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { VendorTrend } from '@/types/analytics.types'
import type { ScorecardCategoryKey } from '@/types/scorecard.types'
import { CATEGORY_LABELS, SCORECARD_CATEGORIES } from '@/types/scorecard.types'

interface Props {
  trend: VendorTrend
  selectedCategory: ScorecardCategoryKey | 'ALL'
}

const CATEGORY_COLORS: Record<ScorecardCategoryKey, string> = {
  RISK_COMPLIANCE: '#ef4444',
  PERFORMANCE:     '#6366f1',
  COMMERCIAL:      '#f59e0b',
  RELATIONSHIP:    '#10b981',
}

export default function TrendLineChart({ trend, selectedCategory }: Props) {
  const data = trend.cycles.map((cycle) => ({
    label: cycle.cycle_label,
    ...cycle.scores,
  }))

  const categoriesToShow: ScorecardCategoryKey[] =
    selectedCategory === 'ALL' ? SCORECARD_CATEGORIES : [selectedCategory]

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Category Score Trends — {trend.vendor_name}
        </h3>
        <p className="text-xs text-slate-400 dark:text-slate-500">Q1 2025 → Q1 2026 · Score scale 1–5</p>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#e2e8f0',
              }}
              formatter={(value, name) => [
                typeof value === 'number' ? value.toFixed(2) : value,
                CATEGORY_LABELS[name as ScorecardCategoryKey] ?? name,
              ]}
            />
            <Legend
              formatter={(value) => CATEGORY_LABELS[value as ScorecardCategoryKey] ?? value}
              wrapperStyle={{ fontSize: '11px' }}
            />
            {categoriesToShow.map((cat) => (
              <Line
                key={cat}
                type="monotone"
                dataKey={cat}
                stroke={CATEGORY_COLORS[cat]}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 2 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
