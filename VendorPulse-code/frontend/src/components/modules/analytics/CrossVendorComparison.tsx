import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { CrossVendorDataPoint } from '@/types/analytics.types'

interface Props {
  data: CrossVendorDataPoint[]
}

const VENDOR_COLORS = {
  novatech: '#6366f1',
  coresystems: '#ef4444',
  meridian: '#10b981',
}

const VENDOR_LABELS = {
  novatech: 'NovaTech Services',
  coresystems: 'CoreSystems Ltd',
  meridian: 'Meridian IT',
}

export default function CrossVendorComparison({ data }: Props) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Cross-Vendor Comparison
        </h3>
        <p className="text-xs text-slate-400 dark:text-slate-500">Q1 2026 — All vendors side-by-side</p>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }} barGap={2} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="category"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-15}
              textAnchor="end"
              height={40}
            />
            <YAxis
              domain={[0, 5]}
              ticks={[0, 1, 2, 3, 4, 5]}
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
                VENDOR_LABELS[name as keyof typeof VENDOR_LABELS] ?? name,
              ]}
            />
            <Legend
              formatter={(value) => VENDOR_LABELS[value as keyof typeof VENDOR_LABELS] ?? value}
              wrapperStyle={{ fontSize: '11px' }}
            />
            <Bar dataKey="novatech" fill={VENDOR_COLORS.novatech} radius={[3, 3, 0, 0]} />
            <Bar dataKey="coresystems" fill={VENDOR_COLORS.coresystems} radius={[3, 3, 0, 0]} />
            <Bar dataKey="meridian" fill={VENDOR_COLORS.meridian} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
