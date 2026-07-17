import { Bell, Sun, Moon, Menu } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useUIStore } from '@/store/useUIStore'
import { getCycleById } from '@/mock/cycles.mock'

function PageTitle() {
  const location = useLocation()
  const { cycleId } = useParams<{ cycleId: string }>()

  if (location.pathname === '/') {
    return (
      <div>
        <h1 className="text-base font-semibold text-slate-900 dark:text-white leading-tight">
          Dashboard
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          VendorPulse — Governance Platform
        </p>
      </div>
    )
  }

  if (cycleId) {
    const cycle = getCycleById(cycleId)
    return (
      <div>
        <h1 className="text-base font-semibold text-slate-900 dark:text-white leading-tight">
          {cycle ? `${cycle.vendor_name} — ${cycle.quarter} ${cycle.year}` : 'Cycle Workspace'}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Governance Cycle
        </p>
      </div>
    )
  }

  if (location.pathname === '/analytics') {
    return (
      <div>
        <h1 className="text-base font-semibold text-slate-900 dark:text-white leading-tight">
          Analytics
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Cross-cycle trend analysis
        </p>
      </div>
    )
  }

  if (location.pathname === '/directory') {
    return (
      <div>
        <h1 className="text-base font-semibold text-slate-900 dark:text-white leading-tight">
          User Directory
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Manage people available as attendees
        </p>
      </div>
    )
  }

  return (
    <h1 className="text-base font-semibold text-slate-900 dark:text-white">
      VendorPulse
    </h1>
  )
}

export default function Topbar() {
  const { theme, toggleTheme, setMobileNavOpen } = useUIStore()
  const navigate = useNavigate()

  return (
    <header className="h-16 flex items-center justify-between gap-3 px-4 sm:px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {/* Hamburger — opens the nav drawer on small screens only. */}
        <button
          onClick={() => setMobileNavOpen(true)}
          className="md:hidden p-2 -ml-1 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          title="Open menu"
          aria-label="Open navigation menu"
        >
          <Menu size={18} />
        </button>
        <PageTitle />
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <Bell size={18} />
          <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-red-500 rounded-full" />
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-2" />

        {/* User — opens the directory / admin page */}
        <button
          onClick={() => navigate('/directory')}
          title="Manage user directory"
          className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center shrink-0">
            <span className="text-indigo-700 dark:text-indigo-400 text-xs font-semibold">
              AT
            </span>
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-medium text-slate-900 dark:text-white leading-tight">
              Alex Thompson
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              VMO Coordinator
            </p>
          </div>
        </button>
      </div>
    </header>
  )
}
