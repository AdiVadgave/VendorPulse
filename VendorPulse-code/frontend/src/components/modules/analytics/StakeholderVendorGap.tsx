import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { StakeholderVsVendorPoint } from '@/types/analytics.types'

interface Props {
  data: StakeholderVsVendorPoint[]
  vendorName: string
}

export default function StakeholderVendorGap({ data, vendorName }: Props) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
      <div className="mb-1">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Stakeholder vs Vendor Score Comparison
        </h3>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {vendorName} — Q1 2026 · Self-assessment vs stakeholder perception per category
        </p>
      </div>

      {/* Gap legend note */}
      <div className="flex items-center gap-4 mb-3 mt-2">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-indigo-500" />
          <span className="text-xs text-slate-500 dark:text-slate-400">Vendor (self)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" />
          <span className="text-xs text-slate-500 dark:text-slate-400">Stakeholder</span>
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto italic">
          Large gap = perception misalignment requiring discussion
        </span>
      </div>

      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }} barGap={3} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="category"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 5]}
              ticks={[0, 1, 2, 3, 4, 5]}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
            />
            <ReferenceLine y={3.5} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1} label={{ value: 'Threshold', position: 'insideTopRight', fontSize: 10, fill: '#f59e0b' }} />
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
                name === 'vendor' ? 'Vendor (self)' : 'Stakeholder',
              ]}
            />
            <Legend
              formatter={(value) => (value === 'vendor' ? 'Vendor (self)' : 'Stakeholder')}
              wrapperStyle={{ fontSize: '11px' }}
            />
            <Bar dataKey="vendor"       fill="#6366f1" radius={[3, 3, 0, 0]} />
            <Bar dataKey="stakeholder"  fill="#10b981" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
