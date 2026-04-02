import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts'
import type { RadarDataPoint } from '@/types/analytics.types'

interface Props {
  data: RadarDataPoint[]
  vendorName: string
}

export default function RadarChartComponent({ data, vendorName }: Props) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Health Radar — {vendorName}
        </h3>
        <p className="text-xs text-slate-400 dark:text-slate-500">Current (Q1 2026) vs Previous (Q4 2025)</p>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis
              dataKey="category"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 5]}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickCount={6}
            />
            <Radar
              name="Q1 2026"
              dataKey="current"
              stroke="#6366f1"
              fill="#6366f1"
              fillOpacity={0.2}
              strokeWidth={2}
            />
            <Radar
              name="Q4 2025"
              dataKey="previous"
              stroke="#94a3b8"
              fill="#94a3b8"
              fillOpacity={0.1}
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            <Tooltip
              contentStyle={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#e2e8f0',
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
