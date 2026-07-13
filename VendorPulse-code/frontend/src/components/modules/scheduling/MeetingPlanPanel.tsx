import { useMemo, useState } from 'react'
import {
  CalendarRange,
  Plus,
  Trash2,
  Save,
  Loader2,
  CheckCircle2,
  Info,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type { CycleMeeting, MeetingType } from '@/types/cycle.types'
import { MEETING_TYPE_LABELS, MEETING_TYPE_TAB } from '@/types/cycle.types'
import { updateMeetingPlan } from '@/lib/schedulingApi'
import { useCycleStore } from '@/store/useCycleStore'

interface MeetingPlanPanelProps {
  cycleId: string
  meetingPlan: CycleMeeting[]
  isMockCycle: boolean
}

const DEFAULT_PLAN: CycleMeeting[] = [
  { meeting_key: 'internal_alignment_1', meeting_type: 'INTERNAL_ALIGNMENT', title: 'Internal Alignment Call', enabled: true, order: 1 },
  { meeting_key: 'supplier_prep', meeting_type: 'SUPPLIER_PREP', title: 'Supplier Prep Call', enabled: true, order: 2 },
  { meeting_key: 'leadership_alignment', meeting_type: 'LEADERSHIP_ALIGNMENT', title: 'Leadership Alignment Call', enabled: false, order: 3 },
  { meeting_key: 'main_governance', meeting_type: 'MAIN_GOVERNANCE', title: 'Main Governance Meeting', enabled: true, order: 4 },
]

const TYPE_DOT: Record<MeetingType, string> = {
  INTERNAL_ALIGNMENT: 'bg-blue-500',
  SUPPLIER_PREP: 'bg-amber-500',
  LEADERSHIP_ALIGNMENT: 'bg-purple-500',
  MAIN_GOVERNANCE: 'bg-emerald-500',
}

export default function MeetingPlanPanel({ cycleId, meetingPlan, isMockCycle }: MeetingPlanPanelProps) {
  const upsertCycle = useCycleStore((s) => s.upsertCycle)
  const getCycleById = useCycleStore((s) => s.getCycleById)

  const initialPlan = useMemo<CycleMeeting[]>(() => {
    const plan = meetingPlan && meetingPlan.length > 0 ? meetingPlan : DEFAULT_PLAN
    return [...plan].sort((a, b) => a.order - b.order)
  }, [meetingPlan])

  const [plan, setPlan] = useState<CycleMeeting[]>(initialPlan)
  const [savedPlan, setSavedPlan] = useState<CycleMeeting[]>(initialPlan)
  const [isSaving, setIsSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDirty = JSON.stringify(plan) !== JSON.stringify(savedPlan)

  function toggleEnabled(key: string) {
    setJustSaved(false)
    setPlan((p) => p.map((m) => (m.meeting_key === key ? { ...m, enabled: !m.enabled } : m)))
  }

  function renameMeeting(key: string, title: string) {
    setJustSaved(false)
    setPlan((p) => p.map((m) => (m.meeting_key === key ? { ...m, title } : m)))
  }

  function addInternalAlignment() {
    setJustSaved(false)
    setPlan((p) => {
      const existing = p.filter((m) => m.meeting_type === 'INTERNAL_ALIGNMENT')
      const n = existing.length + 1
      const maxOrder = p.reduce((max, m) => Math.max(max, m.order), 0)
      const newMeeting: CycleMeeting = {
        meeting_key: `internal_alignment_${Date.now()}`,
        meeting_type: 'INTERNAL_ALIGNMENT',
        title: `Internal Alignment Call ${n}`,
        enabled: true,
        order: maxOrder + 1,
      }
      // Keep main governance last for readability.
      const withNew = [...p, newMeeting].sort((a, b) => {
        if (a.meeting_type === 'MAIN_GOVERNANCE') return 1
        if (b.meeting_type === 'MAIN_GOVERNANCE') return -1
        return a.order - b.order
      })
      return withNew
    })
  }

  function removeMeeting(key: string) {
    setJustSaved(false)
    setPlan((p) => p.filter((m) => m.meeting_key !== key))
  }

  async function handleSave() {
    setIsSaving(true)
    setError(null)
    // Renumber order to match current display order.
    const normalized = plan.map((m, idx) => ({ ...m, order: idx + 1 }))
    try {
      let persisted = normalized
      if (!isMockCycle) {
        persisted = await updateMeetingPlan(cycleId, normalized)
      }
      const sorted = [...persisted].sort((a, b) => a.order - b.order)
      setPlan(sorted)
      setSavedPlan(sorted)
      setJustSaved(true)
      // Reflect the change in the store so other tabs see the updated plan.
      const existing = getCycleById(cycleId)
      if (existing) upsertCycle({ ...existing, meeting_plan: sorted })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save meeting plan')
    } finally {
      setIsSaving(false)
    }
  }

  // Extra internal-alignment calls (beyond the first) can be removed.
  const firstInternalKey = plan.find((m) => m.meeting_type === 'INTERNAL_ALIGNMENT')?.meeting_key

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center shrink-0">
            <CalendarRange size={18} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Cycle Meetings</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Choose which meetings are part of this SPR cycle. You can change this at any time.
            </p>
          </div>
        </div>
        {justSaved && !isDirty && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={13} /> Saved
          </span>
        )}
      </div>

      <div className="space-y-2">
        {plan.map((m) => {
          const removable = m.meeting_type === 'INTERNAL_ALIGNMENT' && m.meeting_key !== firstInternalKey
          return (
            <div
              key={m.meeting_key}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                m.enabled
                  ? 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40'
                  : 'border-slate-100 dark:border-slate-800 bg-transparent opacity-60'
              )}
            >
              {/* Toggle */}
              <button
                type="button"
                onClick={() => toggleEnabled(m.meeting_key)}
                role="switch"
                aria-checked={m.enabled}
                title={m.enabled ? 'Included — click to exclude' : 'Excluded — click to include'}
                className={cn(
                  'relative w-9 h-5 rounded-full shrink-0 transition-colors',
                  m.enabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform',
                    m.enabled && 'translate-x-4'
                  )}
                />
              </button>

              <span className={cn('w-2 h-2 rounded-full shrink-0', TYPE_DOT[m.meeting_type])} />

              {/* Editable title */}
              <input
                type="text"
                value={m.title}
                onChange={(e) => renameMeeting(m.meeting_key, e.target.value)}
                className="flex-1 min-w-0 bg-transparent text-sm text-slate-800 dark:text-slate-200 border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none py-0.5"
              />

              <span className="hidden md:inline text-xs text-slate-400 dark:text-slate-500 shrink-0">
                {MEETING_TYPE_LABELS[m.meeting_type]} · {MEETING_TYPE_TAB[m.meeting_type]}
              </span>

              {removable && (
                <button
                  type="button"
                  onClick={() => removeMeeting(m.meeting_key)}
                  title="Remove this alignment call"
                  className="text-slate-400 hover:text-red-500 shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-3 p-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-400 flex items-start gap-2">
        <Info size={13} className="shrink-0 mt-0.5" />
        <span>
          The <strong>Main Governance Meeting</strong> time is found in the Scheduling tab via Microsoft Graph.
          The other meetings are scheduled in their own tabs (Internal Alignment → Alignment tab, Supplier Prep → Vendor Prep tab).
        </span>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={addInternalAlignment}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
        >
          <Plus size={13} />
          Add Internal Alignment Call
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          className={cn(
            'ml-auto flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg transition-colors',
            isDirty && !isSaving
              ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
          )}
        >
          {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
