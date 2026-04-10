import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  Zap,
} from 'lucide-react'
import { useUIStore } from '@/store/useUIStore'
import { useCycleStore } from '@/store/useCycleStore'
import { cn } from '@/utils/cn'
import { WORKFLOW_STATE_LABELS, getDefaultTabFromState } from '@/utils/constants'

const STATE_DOT_COLORS: Record<string, string> = {
  CYCLE_CREATED: 'bg-slate-400',
  ATTENDEE_REFRESH_SENT: 'bg-blue-400',
  AVAILABILITY_COLLECTED: 'bg-blue-500',
  MEETING_SCHEDULED: 'bg-indigo-500',
  SCORECARD_REQUEST_SENT: 'bg-violet-500',
  SCORECARD_COLLECTION: 'bg-violet-500',
  SCORECARD_COMPILED: 'bg-purple-500',
  INTERNAL_ALIGNMENT: 'bg-amber-500',
  VENDOR_PREP: 'bg-orange-500',
  MEETING_IN_PROGRESS: 'bg-rose-500',
  POST_MEETING_COMPLETE: 'bg-emerald-500',
  ARCHIVED: 'bg-slate-400',
}

interface NavItemProps {
  to: string
  icon: React.ReactNode
  label: string
  collapsed: boolean
  end?: boolean
}

function NavItem({ to, icon, label, collapsed, end }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-150',
          collapsed && 'justify-center',
          isActive
            ? 'bg-indigo-50 text-indigo-700 font-medium dark:bg-indigo-900/30 dark:text-indigo-400'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/60'
        )
      }
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  )
}

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const cycles = useCycleStore((s) => s.cycles)
  const getWorkflowState = useCycleStore((s) => s.getWorkflowState)
  const lastTabs = useCycleStore((s) => s.lastTabs)

  return (
    <aside
      className={cn(
        'flex flex-col shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Brand */}
      <div className="h-16 flex items-center px-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div
          className={cn(
            'flex items-center gap-3',
            sidebarCollapsed && 'justify-center w-full'
          )}
        >
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
            <Zap size={16} className="text-white" />
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 dark:text-white text-sm leading-tight">
                Zen-VendorPulse
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Governance Platform
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <NavItem
          to="/"
          icon={<LayoutDashboard size={18} />}
          label="Dashboard"
          collapsed={sidebarCollapsed}
          end
        />
        <NavItem
          to="/analytics"
          icon={<BarChart3 size={18} />}
          label="Analytics"
          collapsed={sidebarCollapsed}
        />

        {/* Active Cycles */}
        {!sidebarCollapsed && (
          <div className="pt-4">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-3 mb-2">
              Active Cycles
            </p>
            <div className="space-y-1">
              {cycles.map((cycle) => (
                (() => {
                  const effectiveState = getWorkflowState(cycle.cycle_id)
                  const tab = lastTabs[cycle.cycle_id] ?? getDefaultTabFromState(effectiveState)
                  return (
                <NavLink
                  key={cycle.cycle_id}
                  to={`/cycles/${cycle.cycle_id}?tab=${tab}`}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors duration-150',
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    )
                  }
                >
                  <Building2 size={14} className="shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-xs">
                      {cycle.vendor_name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={cn(
                          'w-1.5 h-1.5 rounded-full shrink-0',
                          STATE_DOT_COLORS[effectiveState] ?? 'bg-slate-400'
                        )}
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-500 truncate">
                        {WORKFLOW_STATE_LABELS[effectiveState]}
                      </p>
                    </div>
                  </div>
                </NavLink>
                  )
                })()
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Collapse toggle */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center gap-2 p-2 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {sidebarCollapsed ? (
            <ChevronRight size={16} />
          ) : (
            <>
              <ChevronLeft size={16} />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
