import { useEffect, useMemo, useState } from 'react'
import {
  Building2, TrendingUp, TrendingDown, Minus, Users, BarChart3,
  Loader2, AlertTriangle, CheckCircle2, Layers, Activity,
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList,
} from 'recharts'
import { getPortfolioAnalytics } from '@/lib/analyticsApi'
import type { PortfolioAnalytics, AnalyticsVendor, Trajectory } from '@/lib/analyticsApi'
import { useUIStore } from '@/store/useUIStore'
import { cn } from '@/utils/cn'

/* ── Palette (dataviz reference; theme-aware) ─────────────────────────────── */
function usePalette() {
  const theme = useUIStore((s) => s.theme)
  const dark = theme === 'dark'
  return {
    dark,
    series: dark ? '#3987e5' : '#2a78d6',       // categorical slot 1 (blue)
    grid: dark ? '#2c2c2a' : '#e1e0d9',
    axis: '#898781',
    surface: dark ? '#1a1a19' : '#fcfcfb',
    text: dark ? '#ffffff' : '#0b0b0b',
    textDim: dark ? '#c3c2b7' : '#52514e',
    border: dark ? 'rgba(255,255,255,0.14)' : 'rgba(11,11,11,0.12)',
  }
}

/* Status band for a 1–5 governance score (reserved status colours + label). */
function scoreStatus(s: number | null | undefined) {
  if (s == null) return { tone: 'na', color: '#898781', label: 'No data' }
  if (s >= 4) return { tone: 'good', color: '#0ca30c', label: 'Strong' }
  if (s >= 3) return { tone: 'ok', color: '#2a78d6', label: 'On track' }
  if (s >= 2.5) return { tone: 'warning', color: '#fab219', label: 'Watch' }
  return { tone: 'critical', color: '#d03b3b', label: 'At risk' }
}

const TRAJ: Record<Trajectory, { label: string; icon: React.ReactNode; classes: string }> = {
  improving: { label: 'Improving', icon: <TrendingUp size={14} />, classes: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800' },
  declining: { label: 'Declining', icon: <TrendingDown size={14} />, classes: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800' },
  stable: { label: 'Stable', icon: <Minus size={14} />, classes: 'text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700' },
  'n/a': { label: 'First cycle', icon: <Minus size={14} />, classes: 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700' },
}

function fmt(n: number | null | undefined) {
  return n == null ? '—' : n.toFixed(2)
}

/* ── Theme meter (magnitude bar + reserved status chip) ───────────────────── */
function ThemeMeter({ label, score }: { label: string; score: number }) {
  const st = scoreStatus(score)
  const pal = usePalette()
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 sm:w-44 shrink-0 text-sm text-slate-700 dark:text-slate-300 truncate" title={label}>{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${(score / 5) * 100}%`, background: pal.series }} />
      </div>
      <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-200">{score.toFixed(1)}</span>
      <span
        className="w-16 shrink-0 text-center text-[11px] font-medium px-1.5 py-0.5 rounded-full"
        style={{ color: st.color, background: `${st.color}1a` }}
      >
        {st.label}
      </span>
    </div>
  )
}

/* ── Charts ───────────────────────────────────────────────────────────────── */
function chartTooltipStyle(pal: ReturnType<typeof usePalette>) {
  return {
    background: pal.surface,
    border: `1px solid ${pal.border}`,
    borderRadius: 10,
    fontSize: 12,
    color: pal.text,
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
  }
}

function CrossVendorChart({ vendors }: { vendors: AnalyticsVendor[] }) {
  const pal = usePalette()
  const data = vendors
    .filter((v) => v.latest.overall_score != null)
    .map((v) => ({ vendor: v.vendor_name, score: v.latest.overall_score as number }))
  const height = Math.max(140, data.length * 44 + 24)
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Users size={15} className="text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Cross-Vendor Comparison</h3>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">Latest consolidated overall score per vendor (out of 5)</p>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={data} margin={{ top: 4, right: 44, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={pal.grid} horizontal={false} />
            <XAxis type="number" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: pal.axis }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="vendor" width={130} tick={{ fontSize: 12, fill: pal.textDim }} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: pal.grid, opacity: 0.4 }} contentStyle={chartTooltipStyle(pal)} formatter={(v: number) => [v.toFixed(2), 'Overall']} />
            <Bar dataKey="score" fill={pal.series} radius={[0, 4, 4, 0]} barSize={20}>
              <LabelList dataKey="score" position="right" formatter={(v: number) => v.toFixed(2)} style={{ fill: pal.textDim, fontSize: 11, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function TrendChart({ vendor }: { vendor: AnalyticsVendor }) {
  const pal = usePalette()
  const themeOptions = useMemo(() => {
    const set = new Set<string>()
    vendor.cycles.forEach((c) => Object.keys(c.themes).forEach((t) => set.add(t)))
    return Array.from(set)
  }, [vendor])
  const [series, setSeries] = useState<string>('__overall__')

  const data = vendor.cycles.map((c) => ({
    label: c.label,
    value: series === '__overall__' ? c.overall_score : (c.themes[series] ?? null),
  }))
  const seriesLabel = series === '__overall__' ? 'Overall score' : series

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Score Trend — {seriesLabel}</h3>
        </div>
        <select
          value={series}
          onChange={(e) => setSeries(e.target.value)}
          className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="__overall__">Overall</option>
          {themeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={pal.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: pal.axis }} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: pal.axis }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={chartTooltipStyle(pal)} formatter={(v: number) => [v?.toFixed?.(2) ?? v, seriesLabel]} />
            <Line type="monotone" dataKey="value" stroke={pal.series} strokeWidth={2} dot={{ r: 4, fill: pal.series }} activeDot={{ r: 6 }} connectNulls>
              <LabelList dataKey="value" position="top" formatter={(v: number) => (v == null ? '' : v.toFixed(1))} style={{ fill: pal.textDim, fontSize: 11, fontWeight: 600 }} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function Analytics() {
  const [data, setData] = useState<PortfolioAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    getPortfolioAnalytics()
      .then((r) => {
        if (!mounted) return
        setData(r)
        setSelectedVendorId((prev) => prev ?? r.vendors[0]?.vendor_id ?? null)
      })
      .catch((e) => mounted && setError(e instanceof Error ? e.message : 'Failed to load analytics'))
      .finally(() => mounted && setLoading(false))
    return () => { mounted = false }
  }, [])

  const vendors = data?.vendors ?? []
  const selected = vendors.find((v) => v.vendor_id === selectedVendorId) ?? vendors[0] ?? null

  const kpiTiles = data ? [
    { label: 'Vendors Tracked', value: data.kpis.vendors_tracked, icon: <Building2 size={16} />, tone: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/30' },
    { label: 'Avg Overall Score', value: fmt(data.kpis.avg_overall), icon: <BarChart3 size={16} />, tone: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Improving', value: data.kpis.improving, icon: <TrendingUp size={16} />, tone: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Declining', value: data.kpis.declining, icon: <TrendingDown size={16} />, tone: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
  ] : []

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Analytics Dashboard</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Portfolio insights derived from the actual compiled scorecards — trends, trajectory, and attention areas.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-10 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading analytics…
        </div>
      )}

      {error && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {!loading && !error && vendors.length === 0 && (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl px-6 py-14 text-center">
          <Layers size={22} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No scorecard data yet</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Analytics populate automatically once a cycle has a compiled scorecard. Collect and compile a
            scorecard for a vendor, then the trends, trajectory and attention areas will appear here.
          </p>
        </div>
      )}

      {!loading && !error && vendors.length > 0 && data && (
        <>
          {/* Portfolio KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {kpiTiles.map((k) => (
              <div key={k.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 mb-2">
                  <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center', k.bg)}><span className={k.tone}>{k.icon}</span></span>
                  <span className="text-xs font-medium">{k.label}</span>
                </div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{k.value}</p>
              </div>
            ))}
          </div>

          {/* Cross-vendor comparison (only meaningful with 2+ vendors) */}
          {vendors.filter((v) => v.latest.overall_score != null).length >= 2 && (
            <CrossVendorChart vendors={vendors} />
          )}

          {/* Vendor selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Vendor:</span>
            {vendors.map((v) => (
              <button
                key={v.vendor_id}
                onClick={() => setSelectedVendorId(v.vendor_id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border',
                  selected?.vendor_id === v.vendor_id
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-700'
                )}
              >
                <Building2 size={13} />
                {v.vendor_name}
              </button>
            ))}
          </div>

          {selected && <VendorDetail vendor={selected} />}
        </>
      )}
    </div>
  )
}

function VendorDetail({ vendor }: { vendor: AnalyticsVendor }) {
  const latest = vendor.latest
  const st = scoreStatus(latest.overall_score)
  const traj = TRAJ[vendor.trajectory]
  const themeEntries = Object.entries(latest.themes)
  const attention = themeEntries.filter(([, s]) => s < 3).sort((a, b) => a[1] - b[1])

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="bg-gradient-to-br from-indigo-50 via-white to-violet-50 dark:from-indigo-950/40 dark:via-slate-900 dark:to-violet-950/30 border border-indigo-100 dark:border-indigo-900/50 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Latest Overall Score</p>
            <div className="flex items-end gap-3 mt-1">
              <span className="text-4xl font-bold tabular-nums" style={{ color: st.color }}>{fmt(latest.overall_score)}</span>
              <span className="text-sm text-slate-400 dark:text-slate-500 mb-1">/ 5.0 · {latest.label}</span>
            </div>
            <p className="text-xs mt-1 font-medium" style={{ color: st.color }}>{st.label}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border', traj.classes)}>
              {traj.icon}
              {traj.label}
              {vendor.delta != null && <span className="tabular-nums">({vendor.delta > 0 ? '+' : ''}{vendor.delta})</span>}
            </span>
            <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {latest.team_count} team{latest.team_count === 1 ? '' : 's'} scored
            </span>
          </div>
        </div>
        {vendor.previous_label && vendor.delta != null && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
            Compared to <span className="font-medium">{vendor.previous_label}</span> — the overall score moved {vendor.delta > 0 ? 'up' : vendor.delta < 0 ? 'down' : 'by'} {Math.abs(vendor.delta)} pt.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Theme breakdown */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={15} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Theme Breakdown — {latest.label}</h3>
          </div>
          {themeEntries.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">No numeric theme scores for this cycle.</p>
          ) : (
            <div className="space-y-3">
              {themeEntries.map(([label, score]) => <ThemeMeter key={label} label={label} score={score} />)}
            </div>
          )}
        </div>

        {/* Attention areas */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={15} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Attention Areas</h3>
          </div>
          {attention.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={15} /> All themes are at or above target (3.0/5).
            </div>
          ) : (
            <ul className="space-y-2.5">
              {attention.map(([label, score]) => {
                const s = scoreStatus(score)
                return (
                  <li key={label} className="flex items-center gap-2.5">
                    <AlertTriangle size={14} style={{ color: s.color }} className="shrink-0" />
                    <span className="text-sm text-slate-700 dark:text-slate-300 flex-1 truncate">{label}</span>
                    <span className="text-sm font-semibold tabular-nums" style={{ color: s.color }}>{score.toFixed(1)}</span>
                    <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full" style={{ color: s.color, background: `${s.color}1a` }}>{s.label}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Trend over cycles (needs 2+ scored cycles) */}
      {vendor.cycles.length >= 2 ? (
        <TrendChart vendor={vendor} />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-4 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <Activity size={14} className="text-slate-400" />
          Trend lines appear once this vendor has at least two scored cycles. This is currently the first.
        </div>
      )}
    </div>
  )
}
