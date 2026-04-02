import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react'
import type { PushbackItem } from '@/types/vendor-prep.types'
import { PUSHBACK_CATEGORY_LABELS } from '@/types/vendor-prep.types'
import { format } from 'date-fns'
import { cn } from '@/utils/cn'

interface Props {
  items: PushbackItem[]
  onStatusChange: (id: string, status: PushbackItem['status']) => void
}

const STATUS_CONFIG = {
  OPEN: { label: 'Open', icon: <AlertTriangle size={12} />, classes: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
  RESOLVED: { label: 'Resolved', icon: <CheckCircle2 size={12} />, classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' },
  ESCALATED: { label: 'Escalated', icon: <ExternalLink size={12} />, classes: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
}

export default function UnresolvedItemTracker({ items, onStatusChange }: Props) {
  const openCount = items.filter((i) => i.status === 'OPEN' || i.status === 'ESCALATED').length

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={15} className="text-amber-400" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Unresolved Item Tracker
          </h3>
        </div>
        {openCount > 0 && (
          <span className="text-xs bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">
            {openCount} unresolved
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-slate-400 dark:text-slate-500">No pushback items logged yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((item) => {
            const cfg = STATUS_CONFIG[item.status]
            return (
              <div key={item.pushback_id} className="px-5 py-3.5 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-xs bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 px-1.5 py-0.5 rounded font-medium">
                      {PUSHBACK_CATEGORY_LABELS[item.category]}
                    </span>
                    {item.needs_legal_review && (
                      <span className="text-xs bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 px-1.5 py-0.5 rounded font-medium">
                        Legal
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2 mb-1">
                    {item.description}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                    <span>Raised by: <span className="font-medium text-slate-600 dark:text-slate-400">{item.raised_by}</span></span>
                    <span>{format(new Date(item.created_at), 'd MMM')}</span>
                  </div>
                </div>
                <div className="shrink-0">
                  <select
                    value={item.status}
                    onChange={(e) => onStatusChange(item.pushback_id, e.target.value as PushbackItem['status'])}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border-0 cursor-pointer focus:outline-none',
                      cfg.classes
                    )}
                  >
                    <option value="OPEN">Open</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="ESCALATED">Escalated</option>
                  </select>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Unresolved items are carried forward to the EGB/QBR live meeting and stored in the issues tracker.
        </p>
      </div>
    </div>
  )
}
