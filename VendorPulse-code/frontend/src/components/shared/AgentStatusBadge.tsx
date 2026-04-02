import { Loader2, CheckCircle2, XCircle, Clock, CircleDot } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { AgentStatus } from '@/types/agent.types'

interface AgentStatusBadgeProps {
  status: AgentStatus
  label?: string
}

const STATUS_CONFIG: Record<
  AgentStatus,
  { label: string; icon: React.ReactNode; classes: string }
> = {
  idle: {
    label: 'Idle',
    icon: <CircleDot size={12} />,
    classes:
      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  },
  running: {
    label: 'Agent Running',
    icon: <Loader2 size={12} className="animate-spin" />,
    classes: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  awaiting_approval: {
    label: 'Awaiting Approval',
    icon: <Clock size={12} />,
    classes:
      'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  complete: {
    label: 'Complete',
    icon: <CheckCircle2 size={12} />,
    classes:
      'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  failed: {
    label: 'Failed',
    icon: <XCircle size={12} />,
    classes: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
}

export default function AgentStatusBadge({
  status,
  label,
}: AgentStatusBadgeProps) {
  const config = STATUS_CONFIG[status]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        config.classes
      )}
    >
      {config.icon}
      {label ?? config.label}
    </span>
  )
}
