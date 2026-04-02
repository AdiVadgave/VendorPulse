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
import type { ScorecardCategory } from '@/types/scorecard.types'
import { CATEGORY_LABELS } from '@/types/scorecard.types'

interface Props {
  trend: VendorTrend
  selectedCategory: ScorecardCategory | 'ALL'
}

const CATEGORY_COLORS: Record<ScorecardCategory, string> = {
  DELIVERY_QUALITY: '#6366f1',
  SLA_COMPLIANCE: '#10b981',
  INNOVATION: '#f59e0b',
  COMMUNICATION: '#3b82f6',
  VALUE_FOR_MONEY: '#8b5cf6',
}

const CATEGORIES: ScorecardCategory[] = [
  'DELIVERY_QUALITY', 'SLA_COMPLIANCE', 'INNOVATION', 'COMMUNICATION', 'VALUE_FOR_MONEY',
]

export default function TrendLineChart({ trend, selectedCategory }: Props) {
  const data = trend.cycles.map((cycle) => ({
    label: cycle.cycle_label,
    ...cycle.scores,
  }))

  const categoriesToShow = selectedCategory === 'ALL' ? CATEGORIES : [selectedCategory]

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Score Trend — {trend.vendor_name}
        </h3>
        <p className="text-xs text-slate-400 dark:text-slate-500">Q1 2025 → Q1 2026</p>
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
                CATEGORY_LABELS[name as ScorecardCategory] ?? name,
              ]}
            />
            <Legend
              formatter={(value) => CATEGORY_LABELS[value as ScorecardCategory] ?? value}
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
