import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Mail, CalendarPlus, Eye, Pencil, Loader2, X, Users } from 'lucide-react'
import { cn } from '@/utils/cn'

interface Props {
  open: boolean
  title: string
  /** Affects the header icon/labels only. */
  kind?: 'email' | 'invite'
  /** Initial subject — the editor seeds from this each time it opens. */
  subject: string
  /** Initial HTML body — seeds the editor each time it opens. */
  body: string
  recipients?: string[]
  /** Small hint under the body (e.g. token substitution note). */
  note?: ReactNode
  sendLabel?: string
  busy?: boolean
  onSend: (draft: { subject: string; body: string }) => void
  onCancel: () => void
}

/**
 * Review + edit an outbound draft (email or calendar invite) before it is sent.
 * Shows the subject and body. "Preview" renders it read-only; "Edit" turns the
 * rendered message into an in-place rich-text editor (no HTML/code shown) so a
 * non-technical user can change the wording directly. Returns subject + body.
 */
export default function DraftReviewDialog({
  open,
  title,
  kind = 'email',
  subject,
  body,
  recipients = [],
  note,
  sendLabel = 'Send',
  busy = false,
  onSend,
  onCancel,
}: Props) {
  const [subj, setSubj] = useState(subject)
  const [html, setHtml] = useState(body)
  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  const editorRef = useRef<HTMLDivElement>(null)

  // Re-seed the editor whenever it (re)opens or the source draft changes.
  useEffect(() => {
    if (open) {
      setSubj(subject)
      setHtml(body)
      setMode('preview')
    }
  }, [open, subject, body])

  // Populate the rich-text editor's DOM once when entering Edit mode (an
  // uncontrolled contentEditable — we read innerHTML back on input, so we must
  // NOT re-set it on every render or the caret would jump).
  useEffect(() => {
    if (mode === 'edit' && editorRef.current) {
      editorRef.current.innerHTML = html
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  const Icon = kind === 'invite' ? CalendarPlus : Mail

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onMouseDown={() => { if (!busy) onCancel() }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
              <Icon size={16} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm truncate">{title}</h3>
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

        {/* Body (scrolls) */}
        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          {recipients.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Users size={13} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <span className="font-medium text-slate-600 dark:text-slate-300">Recipients ({recipients.length}): </span>
                <span className="break-words">{recipients.join(', ')}</span>
              </div>
            </div>
          )}

          {/* Subject */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Subject</label>
            <input
              type="text"
              value={subj}
              disabled={busy}
              onChange={(e) => setSubj(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Body — Preview / Edit toggle */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Message</label>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">
                <button
                  type="button"
                  onClick={() => setMode('preview')}
                  className={cn('flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors',
                    mode === 'preview' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400')}
                >
                  <Eye size={12} /> Preview
                </button>
                <button
                  type="button"
                  onClick={() => setMode('edit')}
                  className={cn('flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors',
                    mode === 'edit' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400')}
                >
                  <Pencil size={12} /> Edit
                </button>
              </div>
            </div>

            {mode === 'preview' ? (
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-800/50 max-h-80 overflow-y-auto text-sm text-slate-700 dark:text-slate-300">
                {/* eslint-disable-next-line react/no-danger */}
                <div dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            ) : (
              <>
                <div
                  ref={editorRef}
                  contentEditable={!busy}
                  suppressContentEditableWarning
                  onInput={(e) => setHtml((e.target as HTMLDivElement).innerHTML)}
                  className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-900 max-h-80 overflow-y-auto text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Click anywhere in the message above and type to change the wording — the formatting is kept automatically.
                </p>
              </>
            )}
            {note && <p className="text-[11px] text-slate-400 dark:text-slate-500">{note}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSend({ subject: subj, body: html })}
            disabled={busy || !subj.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60 transition-colors"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {sendLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
