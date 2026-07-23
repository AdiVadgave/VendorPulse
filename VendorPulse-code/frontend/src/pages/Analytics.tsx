import { useEffect, useMemo, useState } from 'react'
import {
  Building2, TrendingUp, TrendingDown, Minus, Users, BarChart3,
  Loader2, AlertTriangle, CheckCircle2, Layers, Activity, Calendar,
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList, Legend,
} from 'recharts'
import { getPortfolioAnalytics } from '@/lib/analyticsApi'
import type { PortfolioAnalytics, AnalyticsVendor, AnalyticsCyclePoint, Trajectory } from '@/lib/analyticsApi'
import { getWeightedScorecard } from '@/lib/scorecardApi'
import type { WeightedScorecard } from '@/types/scorecard.types'
import TeamScorecardsSection from '@/components/modules/scorecard/TeamScorecardsSection'
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

/** Recharts 3 chart/label formatters receive varying value types across Tooltip
 *  and LabelList. Accept `unknown` and coerce to a fixed-decimal string, passing
 *  non-numbers through safely. */
function num(v: unknown, dp = 2): string {
  return typeof v === 'number' ? v.toFixed(dp) : String(v ?? '')
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
            <Tooltip cursor={{ fill: pal.grid, opacity: 0.4 }} contentStyle={chartTooltipStyle(pal)} formatter={(v: unknown) => [num(v), 'Overall']} />
            <Bar dataKey="score" fill={pal.series} radius={[0, 4, 4, 0]} barSize={20}>
              <LabelList dataKey="score" position="right" formatter={(v: unknown) => num(v)} style={{ fill: pal.textDim, fontSize: 11, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* Categorical palette (dataviz reference, fixed order). Colour follows the vendor's
   stable index — toggling selection never repaints the survivors. */
const CAT_LIGHT = ['#2a78d6', '#008300', '#e87ba4', '#eda100', '#1baf7a', '#eb6834', '#4a3aa7', '#e34948']
const CAT_DARK = ['#3987e5', '#008300', '#d55181', '#c98500', '#199e70', '#d95926', '#9085e9', '#e66767']

function CompareVendorsChart({ vendors, themes }: { vendors: AnalyticsVendor[]; themes: string[] }) {
  const pal = usePalette()
  const cat = pal.dark ? CAT_DARK : CAT_LIGHT
  const colorFor = (vendorId: string) => cat[Math.max(0, vendors.findIndex((v) => v.vendor_id === vendorId)) % cat.length]

  // Quarters available across all vendors, ordered oldest→newest, with the count of
  // vendors that have data in each (so we can default to the richest period).
  const Q = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 } as Record<string, number>
  const periods = useMemo(() => {
    const map = new Map<string, { label: string; year: number; q: string; count: number }>()
    vendors.forEach((v) => v.cycles.forEach((c) => {
      const e = map.get(c.label) ?? { label: c.label, year: c.year, q: c.quarter, count: 0 }
      e.count += 1
      map.set(c.label, e)
    }))
    return Array.from(map.values()).sort((a, b) => a.year - b.year || (Q[a.q] ?? 0) - (Q[b.q] ?? 0))
  }, [vendors])

  const richest = useMemo(() => [...periods].sort((a, b) => b.count - a.count || b.year - a.year || (Q[b.q] ?? 0) - (Q[a.q] ?? 0))[0], [periods]) // eslint-disable-line
  const [period, setPeriod] = useState<string>('')
  const activePeriod = period || richest?.label || ''

  // Default-select up to the first 4 vendors that have data in the active period.
  const inPeriod = useMemo(
    () => vendors.filter((v) => v.cycles.some((c) => c.label === activePeriod)),
    [vendors, activePeriod]
  )
  const [selected, setSelected] = useState<Set<string> | null>(null)
  // Re-default the vendor selection whenever the quarter changes, so switching
  // quarter never leaves the chart showing (or blank on) vendors absent that period.
  useEffect(() => { setSelected(null) }, [activePeriod])
  const selectedIds = selected ?? new Set(inPeriod.slice(0, 4).map((v) => v.vendor_id))
  const chosen = vendors.filter((v) => selectedIds.has(v.vendor_id))

  function toggle(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else if (next.size < 6) next.add(id)
    setSelected(next)
  }

  const categories = ['Overall', ...themes]
  const data = categories.map((c) => {
    const row: Record<string, string | number | null> = { category: c }
    chosen.forEach((v) => {
      const pt = v.cycles.find((cy) => cy.label === activePeriod)
      if (pt) row[v.vendor_name] = c === 'Overall' ? pt.overall_score : (pt.themes[c] ?? null)
    })
    return row
  })

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-center gap-2">
          <BarChart3 size={15} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Compare Vendors by Theme</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 dark:text-slate-500">Quarter</span>
          <select
            value={activePeriod}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {periods.map((p) => <option key={p.label} value={p.label}>{p.label} ({p.count})</option>)}
          </select>
        </div>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
        Pick vendors to compare their consolidated theme scores for {activePeriod || 'the selected quarter'}.
      </p>

      {/* Vendor multi-select (colour = the vendor's fixed series colour) */}
      <div className="flex flex-wrap gap-2 mb-4">
        {vendors.map((v) => {
          const on = selectedIds.has(v.vendor_id)
          const has = v.cycles.some((c) => c.label === activePeriod)
          return (
            <button
              key={v.vendor_id}
              onClick={() => toggle(v.vendor_id)}
              disabled={!has && !on}
              title={has ? undefined : `No data for ${activePeriod}`}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                on ? 'text-white border-transparent'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300',
                !has && !on && 'opacity-40 cursor-not-allowed'
              )}
              style={on ? { background: colorFor(v.vendor_id) } : undefined}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: on ? '#fff' : colorFor(v.vendor_id) }} />
              {v.vendor_name}
            </button>
          )
        })}
      </div>

      {chosen.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 py-8 text-center">Select one or more vendors to compare.</p>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 28 }} barGap={2} barCategoryGap="22%">
              <CartesianGrid strokeDasharray="3 3" stroke={pal.grid} vertical={false} />
              <XAxis dataKey="category" tick={{ fontSize: 10, fill: pal.axis }} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={52} />
              <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: pal.axis }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: pal.grid, opacity: 0.35 }} contentStyle={chartTooltipStyle(pal)} formatter={(v: unknown) => num(v)} />
              <Legend verticalAlign="top" align="center" wrapperStyle={{ fontSize: 11, paddingBottom: 10 }} />
              {chosen.map((v) => (
                // Function dataKey (not the raw name) so a vendor name containing a
                // dot isn't misread by Recharts as a nested path.
                <Bar key={v.vendor_id} name={v.vendor_name} dataKey={(row) => (row as Record<string, number | null>)[v.vendor_name] ?? null} fill={colorFor(v.vendor_id)} radius={[3, 3, 0, 0]} maxBarSize={34} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function TrendChart({ vendor }: { vendor: AnalyticsVendor }) {
  const pal = usePalette()
  const cat = pal.dark ? CAT_DARK : CAT_LIGHT
  const themeOptions = useMemo(() => {
    const set = new Set<string>()
    vendor.cycles.forEach((c) => Object.keys(c.themes).forEach((t) => set.add(t)))
    return Array.from(set)
  }, [vendor])
  // '__all__' = every category as its own line; '__average__' = the single overall
  // (averaged) line; otherwise a single line for the chosen category.
  const [series, setSeries] = useState<string>('__all__')

  // One row per cycle carrying every category score + the overall average.
  const data = vendor.cycles.map((c) => {
    const row: Record<string, string | number | null> = { label: c.label, Average: c.overall_score }
    themeOptions.forEach((t) => { row[t] = c.themes[t] ?? null })
    return row
  })

  const showAll = series === '__all__'
  const lines = showAll
    ? themeOptions.map((t, i) => ({ key: t, name: t, color: cat[i % cat.length] }))
    : series === '__average__'
      ? [{ key: 'Average', name: 'Average', color: pal.series }]
      : [{ key: series, name: series, color: pal.series }]

  const seriesLabel = showAll ? 'All categories' : series === '__average__' ? 'Average (overall)' : series

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
          <option value="__all__">Overall (all categories)</option>
          <option value="__average__">Average</option>
          {themeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 18, right: 16, left: -16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={pal.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: pal.axis }} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: pal.axis }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={chartTooltipStyle(pal)} formatter={(v: unknown, n: unknown) => [num(v), String(n)]} />
            {showAll && <Legend verticalAlign="top" align="center" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />}
            {lines.map((ln) => (
              <Line
                key={ln.key}
                type="monotone"
                dataKey={ln.key}
                name={ln.name}
                stroke={ln.color}
                strokeWidth={2}
                dot={{ r: showAll ? 3 : 4, fill: ln.color }}
                activeDot={{ r: 6 }}
                connectNulls
              >
                {!showAll && (
                  <LabelList dataKey={ln.key} position="top" formatter={(v: unknown) => num(v, 1)} style={{ fill: pal.textDim, fontSize: 11, fontWeight: 600 }} />
                )}
              </Line>
            ))}
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
  const [view, setView] = useState<'cross' | 'vendor'>('cross')

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
          {/* Section toggle — Cross-Vendor (portfolio) vs Vendor-Wise (per-vendor detail) */}
          <div className="flex w-full gap-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1.5">
            {([['cross', 'Cross-Vendor'], ['vendor', 'Vendor-Wise']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={cn(
                  'flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                  view === key
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {view === 'cross' && (
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

              {/* Selectable per-theme vendor comparison for any quarter */}
              {vendors.length >= 1 && <CompareVendorsChart vendors={vendors} themes={data.themes} />}
            </>
          )}

          {view === 'vendor' && (
            <>
              {/* Vendor selector — a dropdown so only the chosen vendor's name is
                  visible (safe to show a vendor their own dashboard without exposing
                  the other vendors on the portfolio). */}
              <div className="flex items-center gap-2 flex-wrap">
                <Building2 size={14} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Vendor</span>
                <select
                  value={selected?.vendor_id ?? ''}
                  onChange={(e) => setSelectedVendorId(e.target.value)}
                  className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {[...vendors]
                    .sort((a, b) => a.vendor_name.localeCompare(b.vendor_name))
                    .map((v) => (
                      <option key={v.vendor_id} value={v.vendor_id}>{v.vendor_name}</option>
                    ))}
                </select>
              </div>

              {selected && <VendorDetail key={selected.vendor_id} vendor={selected} />}
            </>
          )}
        </>
      )}
    </div>
  )
}

/* Derive a per-cycle trajectory label from a delta (mirrors the backend thresholds). */
function trajFromDelta(delta: number | null): Trajectory {
  if (delta == null) return 'n/a'
  if (delta >= 0.25) return 'improving'
  if (delta <= -0.25) return 'declining'
  return 'stable'
}

function VendorDetail({ vendor }: { vendor: AnalyticsVendor }) {
  // cycles arrive oldest→newest; default the selector to the latest quarter.
  const cycles = vendor.cycles
  const [selectedId, setSelectedId] = useState<string>(vendor.latest.cycle_id)
  const idx = Math.max(0, cycles.findIndex((c) => c.cycle_id === selectedId))
  const sel: AnalyticsCyclePoint = cycles[idx] ?? vendor.latest
  const prev: AnalyticsCyclePoint | null = idx > 0 ? cycles[idx - 1] : null
  const isLatest = sel.cycle_id === vendor.latest.cycle_id

  // Delta vs the immediately-preceding scored quarter (so trajectory reflects the
  // quarter you're actually looking at, not always the newest one).
  const delta = prev && sel.overall_score != null && prev.overall_score != null
    ? Math.round((sel.overall_score - prev.overall_score) * 100) / 100
    : null

  const st = scoreStatus(sel.overall_score)
  const traj = TRAJ[trajFromDelta(delta)]
  const themeEntries = Object.entries(sel.themes)
  const attention = themeEntries.filter(([, s]) => s < 3).sort((a, b) => a[1] - b[1])

  return (
    <div className="space-y-5">
      {/* Quarter selector — lets an admin inspect any scored quarter for this vendor */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar size={14} className="text-slate-400" />
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Quarter</span>
        <select
          value={sel.cycle_id}
          onChange={(e) => setSelectedId(e.target.value)}
          className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {[...cycles].reverse().map((c) => (
            <option key={c.cycle_id} value={c.cycle_id}>
              {c.label}{c.cycle_id === vendor.latest.cycle_id ? ' (latest)' : ''}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {cycles.length} scored quarter{cycles.length === 1 ? '' : 's'} on record
        </span>
      </div>

      {/* Hero */}
      <div className="bg-gradient-to-br from-indigo-50 via-white to-violet-50 dark:from-indigo-950/40 dark:via-slate-900 dark:to-violet-950/30 border border-indigo-100 dark:border-indigo-900/50 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              {isLatest ? 'Latest Overall Score' : 'Overall Score'}
            </p>
            <div className="flex items-end gap-3 mt-1">
              <span className="text-4xl font-bold tabular-nums" style={{ color: st.color }}>{fmt(sel.overall_score)}</span>
              <span className="text-sm text-slate-400 dark:text-slate-500 mb-1">/ 5.0 · {sel.label}</span>
            </div>
            <p className="text-xs mt-1 font-medium" style={{ color: st.color }}>{st.label}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border', traj.classes)}>
              {traj.icon}
              {traj.label}
              {delta != null && <span className="tabular-nums">({delta > 0 ? '+' : ''}{delta})</span>}
            </span>
            <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {sel.team_count} team{sel.team_count === 1 ? '' : 's'} scored
            </span>
          </div>
        </div>
        {prev && delta != null && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
            Compared to <span className="font-medium">{prev.label}</span> — the overall score moved {delta > 0 ? 'up' : delta < 0 ? 'down' : 'by'} {Math.abs(delta)} pt.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Theme breakdown */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={15} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Theme Breakdown — {sel.label}</h3>
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
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Attention Areas — {sel.label}</h3>
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

      {/* Team-wise consolidated scorecard for the selected quarter */}
      <QuarterTeamScorecards cycleId={sel.cycle_id} label={sel.label} />

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

/* Per-quarter team-level scorecard. Reuses the same weighted-scorecard payload and
   TeamScorecardsSection component the Scorecard tab uses, so an admin sees each
   team's scores for any quarter of any vendor — right here in the analytics view. */
function QuarterTeamScorecards({ cycleId, label }: { cycleId: string; label: string }) {
  const [data, setData] = useState<WeightedScorecard | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setFailed(false)
    setData(null)
    getWeightedScorecard(cycleId)
      .then((d) => mounted && setData(d))
      .catch(() => mounted && setFailed(true))
      .finally(() => mounted && setLoading(false))
    return () => { mounted = false }
  }, [cycleId])

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-4 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
        <Loader2 size={14} className="animate-spin text-slate-400" /> Loading team scorecards for {label}…
      </div>
    )
  }

  if (failed || !data || data.teams.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-4 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
        <Users size={14} className="text-slate-400" />
        No team-level scorecards recorded for {label}.
      </div>
    )
  }

  return <TeamScorecardsSection data={data} />
}
