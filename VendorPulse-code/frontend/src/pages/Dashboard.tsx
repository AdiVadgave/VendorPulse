import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  Building2,
  Plus,
  ArrowRight,
  Activity,
  AlertCircle,
  CalendarClock,
  Layers,
  TrendingUp,
  TrendingDown,
  Minus,
  X,
  Loader2,
  Trash2,
} from 'lucide-react'
import { WORKFLOW_STATE_LABELS, WORKFLOW_STATES, TAB_LABELS, getDefaultTabFromState } from '@/utils/constants'
import type { WorkflowState } from '@/utils/constants'
import { cn } from '@/utils/cn'
import { apiFetch } from '@/lib/api'
import { useCycleStore } from '@/store/useCycleStore'
import type { GovernanceCycle } from '@/types/cycle.types'
import { MOCK_VENDORS } from '@/mock/cycles.mock'

const STATE_BADGE: Record<string, { classes: string; progress: number }> = {
  CYCLE_CREATED:         { classes: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400', progress: 5 },
  ATTENDEE_REFRESH_SENT: { classes: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', progress: 16 },
  AVAILABILITY_COLLECTED:{ classes: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', progress: 25 },
  MEETING_SCHEDULED:     { classes: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400', progress: 33 },
  SCORECARD_REQUEST_SENT:{ classes: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', progress: 42 },
  SCORECARD_COLLECTION:  { classes: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', progress: 50 },
  SCORECARD_COMPILED:    { classes: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', progress: 58 },
  INTERNAL_ALIGNMENT:    { classes: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', progress: 67 },
  VENDOR_PREP:           { classes: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', progress: 75 },
  MEETING_IN_PROGRESS:   { classes: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400', progress: 83 },
  POST_MEETING_COMPLETE: { classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', progress: 92 },
  ARCHIVED:              { classes: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400', progress: 100 },
}

const MOCK_AGENT_RUNS = [
  { id: 'r1', agent: 'scheduling_agent', cycle: 'NovaTech Services Q1', status: 'success', summary: 'Slot ranking complete — 3 proposals generated', time: '14:32' },
  { id: 'r2', agent: 'scorecard_agent', cycle: 'CoreSystems Ltd Q1', status: 'success', summary: 'Scorecard compiled — 1 outlier flagged', time: '13:15' },
  { id: 'r3', agent: 'scheduling_agent', cycle: 'NovaTech Services Q1', status: 'success', summary: 'Attendee refresh form dispatched to 9 stakeholders', time: '11:47' },
  { id: 'r4', agent: 'scorecard_agent', cycle: 'CoreSystems Ltd Q1', status: 'partial', summary: '7/9 scorecards received — reminder sent to 2', time: '10:02' },
]

const VENDOR_TRENDS: Record<string, { dir: string; icon: React.ReactNode; label: string }> = {
  'NovaTech Services': { dir: 'up', icon: <TrendingUp size={13} className="text-emerald-500" />, label: 'Improving' },
  'CoreSystems Ltd':   { dir: 'down', icon: <TrendingDown size={13} className="text-red-500" />, label: 'Declining' },
  'Meridian IT':       { dir: 'flat', icon: <Minus size={13} className="text-slate-400" />, label: 'Stable' },
}

function getStateIndex(state: WorkflowState) {
  return WORKFLOW_STATES.indexOf(state)
}

// ── New Cycle Modal ──────────────────────────────────────────────────────────

interface NewCycleForm {
  vendor_id: string
  vendor_name: string
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'
  year: number
}

function NewCycleModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (cycle: GovernanceCycle) => void
}) {
  const currentYear = new Date().getFullYear()
  const [form, setForm] = useState<NewCycleForm>({
    vendor_id: MOCK_VENDORS[0].vendor_id,
    vendor_name: MOCK_VENDORS[0].name,
    quarter: 'Q1',
    year: currentYear,
  })
  const [customVendor, setCustomVendor] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleVendorChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    if (val === '__custom__') {
      setCustomVendor(true)
      setForm((f) => ({ ...f, vendor_id: 'v_custom', vendor_name: '' }))
    } else {
      setCustomVendor(false)
      const v = MOCK_VENDORS.find((v) => v.vendor_id === val)
      setForm((f) => ({ ...f, vendor_id: val, vendor_name: v?.name ?? '' }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.vendor_name.trim()) {
      setError('Vendor name is required.')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await apiFetch<{ cycle: GovernanceCycle; message: string }>('/api/cycles', {
        method: 'POST',
        body: JSON.stringify({
          vendor_id: form.vendor_id,
          vendor_name: form.vendor_name.trim(),
          quarter: form.quarter,
          year: form.year,
        }),
      })
      onCreate(res.cycle)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create cycle')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
              New Governance Cycle
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={15} className="text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Vendor */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Vendor
            </label>
            <select
              value={customVendor ? '__custom__' : form.vendor_id}
              onChange={handleVendorChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {MOCK_VENDORS.map((v) => (
                <option key={v.vendor_id} value={v.vendor_id}>
                  {v.name}
                </option>
              ))}
              <option value="__custom__">+ Add New Vendor</option>
            </select>
          </div>

          {customVendor && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Vendor Name
              </label>
              <input
                type="text"
                placeholder="e.g. Accenture Services"
                value={form.vendor_name}
                onChange={(e) => setForm((f) => ({ ...f, vendor_name: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* Quarter */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Quarter
              </label>
              <select
                value={form.quarter}
                onChange={(e) => setForm((f) => ({ ...f, quarter: e.target.value as NewCycleForm['quarter'] }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="Q4">Q4</option>
              </select>
            </div>

            {/* Year */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Year
              </label>
              <input
                type="number"
                value={form.year}
                onChange={(e) => setForm((f) => ({ ...f, year: parseInt(e.target.value) || currentYear }))}
                min={currentYear - 1}
                max={currentYear + 3}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <AlertCircle size={13} />
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors',
                isSubmitting && 'opacity-70 cursor-not-allowed'
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Cycle'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const today = new Date()
  const { cycles, addCycle, setCycles, removeCycle } = useCycleStore()
  const [showNewCycleModal, setShowNewCycleModal] = useState(false)
  const [isLoadingCycles, setIsLoadingCycles] = useState(false)
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [deletingCycleId, setDeletingCycleId] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setIsLoadingCycles(true)
    setLoadingError(null)
    apiFetch<{ cycles: GovernanceCycle[] }>('/api/cycles')
      .then((res) => {
        if (!mounted) return
        const sorted = [...(res.cycles ?? [])].sort((a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )
        setCycles(sorted)
      })
      .catch((err) => {
        if (!mounted) return
        setLoadingError(err instanceof Error ? err.message : 'Failed to load cycles from backend')
      })
      .finally(() => {
        if (mounted) setIsLoadingCycles(false)
      })

    return () => {
      mounted = false
    }
  }, [setCycles])

  const stats = [
    { label: 'Active Cycles', value: cycles.length, icon: <Layers size={18} />, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/30' },
    { label: 'Pending Approvals', value: 2, icon: <AlertCircle size={18} />, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Upcoming Meetings', value: 1, icon: <CalendarClock size={18} />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Agent Runs Today', value: MOCK_AGENT_RUNS.length, icon: <Activity size={18} />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
  ]

  function handleCycleCreated(cycle: GovernanceCycle) {
    addCycle(cycle)
    setShowNewCycleModal(false)
    navigate(`/cycles/${cycle.cycle_id}?tab=scheduling`)
  }

  async function handleDeleteCycle(cycleId: string) {
    const ok = window.confirm('Delete this cycle and related attendee/slot data?')
    if (!ok) return

    setDeletingCycleId(cycleId)
    try {
      await apiFetch(`/api/cycles/${cycleId}`, { method: 'DELETE' })
      removeCycle(cycleId)
    } catch (err) {
      setLoadingError(err instanceof Error ? err.message : 'Failed to delete cycle')
    } finally {
      setDeletingCycleId(null)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {showNewCycleModal && (
        <NewCycleModal
          onClose={() => setShowNewCycleModal(false)}
          onCreate={handleCycleCreated}
        />
      )}

      {/* Welcome header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            Welcome back, Alex
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {format(today, 'EEEE, d MMMM yyyy')} · Zensar VMO — Governance Platform
          </p>
        </div>
        <button
          onClick={() => setShowNewCycleModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
        >
          <Plus size={16} />
          New Cycle
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3"
          >
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', s.bg)}>
              <span className={s.color}>{s.icon}</span>
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {s.value}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {s.label}
              </p>
            </div>
          </div>
        ))}
      </div>

      {loadingError && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          {loadingError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Active cycles */}
        <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 size={15} className="text-slate-400" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Active Governance Cycles
              </span>
            </div>
            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-xs">
              {new Date().getFullYear()}
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {isLoadingCycles && (
              <div className="px-5 py-8 text-sm text-slate-500 dark:text-slate-400">
                Loading cycles from backend...
              </div>
            )}

            {!isLoadingCycles && cycles.length === 0 && (
              <div className="px-5 py-8 text-sm text-slate-500 dark:text-slate-400">
                No cycles found in backend data.
              </div>
            )}

            {cycles.map((cycle) => {
              const badge = STATE_BADGE[cycle.workflow_state]
              const stateIdx = getStateIndex(cycle.workflow_state as WorkflowState)
              const trend = VENDOR_TRENDS[cycle.vendor_name]

              return (
                <div
                  key={cycle.cycle_id}
                  className="px-5 py-4 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                  onClick={() => navigate(`/cycles/${cycle.cycle_id}`)}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
                        <Building2 size={15} className="text-slate-500 dark:text-slate-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 dark:text-slate-200 text-sm truncate">
                          {cycle.vendor_name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {cycle.quarter} {cycle.year} · EGB/QBR
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteCycle(cycle.cycle_id)
                        }}
                        disabled={deletingCycleId === cycle.cycle_id}
                        className={cn(
                          'w-7 h-7 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center transition-colors',
                          deletingCycleId === cycle.cycle_id && 'opacity-60 cursor-not-allowed'
                        )}
                        title="Delete cycle"
                      >
                        {deletingCycleId === cycle.cycle_id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                      </button>
                      {trend && (
                        <div className="flex items-center gap-1 text-xs">
                          {trend.icon}
                          <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">
                            {trend.label}
                          </span>
                        </div>
                      )}
                      <span
                        className={cn(
                          'px-2.5 py-0.5 rounded-full text-xs font-medium',
                          badge?.classes ?? 'bg-slate-100 text-slate-600'
                        )}
                      >
                        {WORKFLOW_STATE_LABELS[cycle.workflow_state as WorkflowState] ?? cycle.workflow_state}
                      </span>
                      <ArrowRight size={14} className="text-slate-400" />
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${((stateIdx + 1) / WORKFLOW_STATES.length) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
                      {stateIdx + 1}/{WORKFLOW_STATES.length}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Recent agent runs */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <Activity size={15} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Recent Agent Activity
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {MOCK_AGENT_RUNS.map((run) => (
              <div key={run.id} className="px-5 py-3.5">
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                    {run.agent.replace('_agent', ' agent').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={cn(
                        'w-1.5 h-1.5 rounded-full',
                        run.status === 'success' ? 'bg-emerald-500' : 'bg-amber-500'
                      )}
                    />
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {run.time}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {run.summary}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  {run.cycle}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick access chips */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
          Quick Access
        </p>
        <div className="flex flex-wrap gap-2">
          {cycles.map((cycle) => {
            const activeTab = getDefaultTabFromState(cycle.workflow_state as WorkflowState)
            return (
              <button
                key={cycle.cycle_id}
                onClick={() => navigate(`/cycles/${cycle.cycle_id}?tab=${activeTab}`)}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-slate-700 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-800 rounded-lg text-sm transition-colors"
              >
                <Building2 size={13} />
                {cycle.vendor_name} — {TAB_LABELS[activeTab]}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
