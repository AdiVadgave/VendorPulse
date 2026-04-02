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
} from 'lucide-react'
import { MOCK_CYCLES } from '@/mock/cycles.mock'
import { WORKFLOW_STATE_LABELS, WORKFLOW_STATES } from '@/utils/constants'
import type { WorkflowState } from '@/utils/constants'
import { cn } from '@/utils/cn'

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

export default function Dashboard() {
  const navigate = useNavigate()
  const today = new Date()

  const stats = [
    { label: 'Active Cycles', value: MOCK_CYCLES.length, icon: <Layers size={18} />, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/30' },
    { label: 'Pending Approvals', value: 2, icon: <AlertCircle size={18} />, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Upcoming Meetings', value: 1, icon: <CalendarClock size={18} />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Agent Runs Today', value: MOCK_AGENT_RUNS.length, icon: <Activity size={18} />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Welcome header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            Welcome back, Alex
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {format(today, 'EEEE, d MMMM yyyy')} · Shell VMO — Governance Platform
          </p>
        </div>
        <button
          onClick={() => navigate('/cycles/c3?tab=scheduling')}
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
              Q1 2026
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {MOCK_CYCLES.map((cycle) => {
              const badge = STATE_BADGE[cycle.workflow_state]
              const stateIdx = getStateIndex(cycle.workflow_state)
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
                          badge.classes
                        )}
                      >
                        {WORKFLOW_STATE_LABELS[cycle.workflow_state]}
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
          {MOCK_CYCLES.map((cycle) => (
            <button
              key={cycle.cycle_id}
              onClick={() => navigate(`/cycles/${cycle.cycle_id}?tab=scheduling`)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-slate-700 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-800 rounded-lg text-sm transition-colors"
            >
              <Building2 size={13} />
              {cycle.vendor_name} — Scheduling
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
