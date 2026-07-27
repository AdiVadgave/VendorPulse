import { useEffect, type ReactNode } from 'react'
import { AlertTriangle, HelpCircle, Loader2, X } from 'lucide-react'
import { cn } from '@/utils/cn'

type Tone = 'danger' | 'default'

interface Props {
  open: boolean
  title: string
  /** Body text or rich content shown under the title. */
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** 'danger' uses a red confirm button + warning icon (destructive actions). */
  tone?: Tone
  /** Show a spinner on the confirm button and block interaction while an async action runs. */
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * A reusable in-app confirmation modal — replaces the native window.confirm() so
 * confirmations match the app's look and can carry rich content. Closes on
 * Escape / backdrop click (unless busy).
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  // Close on Escape while open (ignored mid-action).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  const danger = tone === 'danger'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onMouseDown={() => { if (!busy) onCancel() }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl w-full max-w-md"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-6 pt-6">
          <div className={cn(
            'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
            danger ? 'bg-red-50 dark:bg-red-900/20' : 'bg-indigo-50 dark:bg-indigo-900/30'
          )}>
            {danger
              ? <AlertTriangle size={18} className="text-red-600 dark:text-red-400" />
              : <HelpCircle size={18} className="text-indigo-600 dark:text-indigo-400" />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{title}</h3>
            <div className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {message}
            </div>
          </div>
          <button
            type="button"
            onClick={() => { if (!busy) onCancel() }}
            disabled={busy}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-40 shrink-0"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-70',
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
            )}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
