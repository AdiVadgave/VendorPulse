import { Outlet } from 'react-router-dom'
import { useUIStore } from '@/store/useUIStore'
import { cn } from '@/utils/cn'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AppLayout() {
  const { theme } = useUIStore()

  return (
    <div className={cn('h-full', theme === 'dark' && 'dark')}>
      <div className="flex h-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <Topbar />
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
