import { X, AlertTriangle, Send } from 'lucide-react'
import { cn } from '@/utils/cn'

interface ApprovalPanelProps {
  title: string
  summary: string
  previewContent: React.ReactNode
  recipients?: string[]
  warnings?: string[]
  onApprove: () => void
  onCancel: () => void
  approveLabel?: string
  isProcessing?: boolean
}

export default function ApprovalPanel({
  title,
  summary,
  previewContent,
  recipients,
  warnings = [],
  onApprove,
  onCancel,
  approveLabel = 'Approve & Send',
  isProcessing = false,
}: ApprovalPanelProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        role="button"
        tabIndex={-1}
        aria-label="Close"
        className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      />

      {/* Panel */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 fade-in max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 bg-amber-100 dark:bg-amber-900/30 rounded-md flex items-center justify-center">
                <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                Human Approval Required
              </span>
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {title}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {summary}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <ul className="space-y-1">
                {warnings.map((w, i) => (
                  <li
                    key={i}
                    className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2"
                  >
                    <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recipients */}
          {recipients && recipients.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                Recipients ({recipients.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {recipients.map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center px-2.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full text-xs"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
              Preview
            </p>
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              {previewContent}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onApprove}
            disabled={isProcessing}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors',
              isProcessing && 'opacity-60 cursor-not-allowed'
            )}
          >
            <Send size={14} />
            {isProcessing ? 'Processing...' : approveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
