import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { format } from 'date-fns'
import {
  Building2,
  Plus,
  Activity,
  AlertCircle,
  Archive,
  ChevronDown,
  ChevronRight,
  Layers,
  TrendingUp,
  TrendingDown,
  Minus,
  X,
  Loader2,
  Trash2,
  Search,
} from 'lucide-react'
import { WORKFLOW_STATE_LABELS, WORKFLOW_STATES, getDefaultTabFromState } from '@/utils/constants'
import type { WorkflowState } from '@/utils/constants'
import { cn } from '@/utils/cn'
import { apiFetch } from '@/lib/api'
import { useCycleStore } from '@/store/useCycleStore'
import type { CycleType, GovernanceCycle } from '@/types/cycle.types'
import { CYCLE_TYPE_LABELS } from '@/types/cycle.types'
import { fetchVendors } from '@/lib/schedulingApi'
import type { VendorRecord } from '@/lib/schedulingApi'
import { useCurrentUser, friendlyFirstName } from '@/lib/auth/currentUser'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

/**
 * The create-cycle endpoint returns HTTP 409 with detail.code === 'DUPLICATE_CYCLE'
 * when a same vendor+quarter+year cycle already exists. apiFetch surfaces that as
 * an Error whose message is the JSON-stringified detail — parse it back out so we
 * can show a "still create?" prompt instead of a raw error.
 */
function extractDuplicateMessage(err: unknown): string | null {
  if (!(err instanceof Error)) return null
  try {
    const parsed = JSON.parse(err.message)
    if (parsed && typeof parsed === 'object' && parsed.code === 'DUPLICATE_CYCLE') {
      return typeof parsed.message === 'string'
        ? parsed.message
        : 'A cycle for this vendor, quarter and year already exists. Do you still want to create it?'
    }
  } catch {
    // Not a JSON duplicate payload — treat as a normal error.
  }
  return null
}

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

const VENDOR_TRENDS: Record<string, { dir: string; icon: React.ReactNode; label: string }> = {
  'NovaTech Services': { dir: 'up', icon: <TrendingUp size={13} className="text-emerald-500" />, label: 'Improving' },
  'CoreSystems Ltd':   { dir: 'down', icon: <TrendingDown size={13} className="text-red-500" />, label: 'Declining' },
  'Meridian IT':       { dir: 'flat', icon: <Minus size={13} className="text-slate-400" />, label: 'Stable' },
}

function getStateIndex(state: WorkflowState) {
  return WORKFLOW_STATES.indexOf(state)
}

// ── New Cycle Modal ──────────────────────────────────────────────────────────

interface NewCycleForm {
  vendor_id: string
  vendor_name: string
  category: string
  description: string
  cycle_type: CycleType
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'
  year: number
}

function NewCycleModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (cycle: GovernanceCycle) => void
}) {
  const currentYear = new Date().getFullYear()
  const [vendors, setVendors] = useState<VendorRecord[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [form, setForm] = useState<NewCycleForm>({
    vendor_id: '',
    vendor_name: '',
    category: '',
    description: '',
    cycle_type: 'SPR',
    quarter: 'Q1',
    year: currentYear,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Duplicate (same vendor+quarter+year) soft-warning prompt. Non-null => open.
  const [duplicatePrompt, setDuplicatePrompt] = useState<string | null>(null)
  const [confirmingDuplicate, setConfirmingDuplicate] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const quarterRef = useRef<HTMLSelectElement>(null)

  // Load vendors from API on mount
  useEffect(() => {
    fetchVendors().then(setVendors)
  }, [])

  // Close the vendor dropdown when clicking outside
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  // Filter vendors based on search query (case-insensitive partial match)
  const filteredVendors = vendors.filter((v) =>
    v.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Determine if the typed name is a new (not yet existing) vendor
  const isNewVendor =
    searchQuery.trim().length > 0 &&
    !vendors.some((v) => v.name.toLowerCase() === searchQuery.trim().toLowerCase())

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setSearchQuery(val)
    setDropdownOpen(true)
    // If the typed text matches no existing vendor, treat it as a new vendor
    const matched = vendors.find((v) => v.name.toLowerCase() === val.trim().toLowerCase())
    if (matched) {
      setForm((f) => ({ ...f, vendor_id: matched.vendor_id, vendor_name: matched.name, category: matched.category }))
    } else {
      setForm((f) => ({ ...f, vendor_id: 'v_custom', vendor_name: val.trim(), category: '' }))
    }
  }

  function handleSelectVendor(v: VendorRecord) {
    setSearchQuery(v.name)
    setForm((f) => ({ ...f, vendor_id: v.vendor_id, vendor_name: v.name, category: v.category }))
    setDropdownOpen(false)
  }

  function handleSelectNew() {
    setForm((f) => ({ ...f, vendor_id: 'v_custom', vendor_name: searchQuery.trim(), category: '' }))
    setDropdownOpen(false)
  }

  // Single POST used both for the first attempt and the "create anyway" retry.
  // confirmDuplicate === true tells the backend to skip its same-quarter warning.
  async function postCycle(confirmDuplicate: boolean) {
    const res = await apiFetch<{ cycle: GovernanceCycle; message: string }>('/api/cycles', {
      method: 'POST',
      body: JSON.stringify({
        vendor_id: form.vendor_id,
        vendor_name: form.vendor_name.trim(),
        // Category is carried from the selected vendor (or defaulted for a new one);
        // it is no longer entered manually — the cycle description replaces it.
        category: form.category.trim() || 'IT Infrastructure',
        description: form.description.trim(),
        cycle_type: form.cycle_type,
        quarter: form.quarter,
        year: form.year,
        confirm_duplicate: confirmDuplicate,
      }),
    })
    onCreate(res.cycle)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.vendor_name.trim()) {
      setError('Vendor name is required.')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      await postCycle(false)
    } catch (err) {
      // Same vendor+quarter+year already exists → warn instead of failing; the
      // coordinator can still choose to create it.
      const dupMessage = extractDuplicateMessage(err)
      if (dupMessage) {
        setDuplicatePrompt(dupMessage)
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create cycle')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // "Create anyway" — proceed with the normal flow despite the duplicate.
  async function handleConfirmDuplicate() {
    setConfirmingDuplicate(true)
    setError(null)
    try {
      await postCycle(true)
      // onCreate navigates away / closes the modal on success.
    } catch (err) {
      setDuplicatePrompt(null)
      setError(err instanceof Error ? err.message : 'Failed to create cycle')
    } finally {
      setConfirmingDuplicate(false)
    }
  }

  // "Choose a different quarter" — dismiss the prompt and return the coordinator
  // to the form, focusing the Quarter field.
  function handleCancelDuplicate() {
    setDuplicatePrompt(null)
    setTimeout(() => quarterRef.current?.focus(), 0)
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
              New Governance Cycle
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={15} className="text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Vendor search */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Vendor
            </label>
            <div className="relative" ref={dropdownRef}>
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search or type a new vendor name…"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={() => setDropdownOpen(true)}
                  className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoComplete="off"
                />
              </div>

              {dropdownOpen && (filteredVendors.length > 0 || isNewVendor) && (
                <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                  {filteredVendors.map((v) => (
                    <button
                      key={v.vendor_id}
                      type="button"
                      onMouseDown={() => handleSelectVendor(v)}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors',
                        form.vendor_id === v.vendor_id && searchQuery === v.name
                          ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400'
                          : 'text-slate-700 dark:text-slate-300'
                      )}
                    >
                      <Building2 size={13} className="text-slate-400 shrink-0" />
                      <span className="truncate">{v.name}</span>
                      <span className="ml-auto text-xs text-slate-400 shrink-0">{v.category}</span>
                    </button>
                  ))}
                  {isNewVendor && (
                    <button
                      type="button"
                      onMouseDown={handleSelectNew}
                      className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors border-t border-slate-100 dark:border-slate-700"
                    >
                      <Plus size={13} className="shrink-0" />
                      <span>Add "{searchQuery.trim()}" as new vendor</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Selected vendor chip */}
            {form.vendor_name && (
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                {form.vendor_id === 'v_custom' ? (
                  <span className="px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded text-xs border border-amber-200 dark:border-amber-800">
                    New vendor — will be saved
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded text-xs border border-emerald-200 dark:border-emerald-800">
                    Existing vendor — attendees auto-seeded from last cycle
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Description <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Purpose or scope of this governance cycle — e.g. focus areas, known issues to review, contract milestones…"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            />
          </div>

          {/* Cycle type — SPR is currently the only option */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Cycle Type
            </label>
            <select
              value={form.cycle_type}
              onChange={(e) => setForm((f) => ({ ...f, cycle_type: e.target.value as CycleType }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="SPR">SPR — {CYCLE_TYPE_LABELS.SPR}</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Quarter */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Quarter
              </label>
              <select
                ref={quarterRef}
                value={form.quarter}
                onChange={(e) => setForm((f) => ({ ...f, quarter: e.target.value as NewCycleForm['quarter'] }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="Q4">Q4</option>
              </select>
            </div>

            {/* Year */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Year
              </label>
              <input
                type="number"
                value={form.year}
                onChange={(e) => setForm((f) => ({ ...f, year: parseInt(e.target.value, 10) || currentYear }))}
                min={currentYear - 1}
                max={currentYear + 3}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <AlertCircle size={13} />
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors',
                isSubmitting && 'opacity-70 cursor-not-allowed'
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Cycle'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>

    <ConfirmDialog
      open={duplicatePrompt !== null}
      tone="default"
      title="Cycle already exists"
      confirmLabel="Create anyway"
      cancelLabel="Choose a different quarter"
      busy={confirmingDuplicate}
      onConfirm={handleConfirmDuplicate}
      onCancel={handleCancelDuplicate}
      message={duplicatePrompt}
    />
    </>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const user = useCurrentUser()
  const today = new Date()
  const { cycles, addCycle, setCycles, removeCycle, getWorkflowState, lastTabs } = useCycleStore()
  const [showNewCycleModal, setShowNewCycleModal] = useState(false)
  const [isLoadingCycles, setIsLoadingCycles] = useState(false)
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [deletingCycleId, setDeletingCycleId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedVendor, setSelectedVendor] = useState('')  // '' = all vendors
  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set())

  useEffect(() => {
    let mounted = true
    setIsLoadingCycles(true)
    setLoadingError(null)
    apiFetch<{ cycles: GovernanceCycle[] }>('/api/cycles')
      .then((res) => {
        if (!mounted) return
        const sorted = [...(res.cycles ?? [])].sort((a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )
        setCycles(sorted)
      })
      .catch((err) => {
        if (!mounted) return
        setLoadingError(err instanceof Error ? err.message : 'Failed to load cycles from backend')
      })
      .finally(() => {
        if (mounted) setIsLoadingCycles(false)
      })

    return () => {
      mounted = false
    }
  }, [setCycles])

  // Split active vs closed (ARCHIVED) using the effective workflow state.
  const activeCycles = cycles.filter((c) => getWorkflowState(c.cycle_id) !== 'ARCHIVED')
  const archivedCycles = cycles.filter((c) => getWorkflowState(c.cycle_id) === 'ARCHIVED')
  const vendorCount = new Set(cycles.map((c) => c.vendor_name)).size

  // Distinct vendor names for the filter dropdown (alphabetical).
  const vendorNames = [...new Set(cycles.map((c) => c.vendor_name))].sort((a, b) => a.localeCompare(b))

  const q = query.trim().toLowerCase()
  const matchesFilters = (c: GovernanceCycle) =>
    (!q || c.vendor_name.toLowerCase().includes(q)) &&
    (!selectedVendor || c.vendor_name === selectedVendor)
  const activeShown = activeCycles.filter(matchesFilters)
  const archivedShown = archivedCycles.filter(matchesFilters)

  // Group closed cycles vendor-wise (most cycles first), each group sorted recent→old.
  const archivedByVendor = Object.entries(
    archivedShown.reduce<Record<string, GovernanceCycle[]>>((acc, c) => {
      (acc[c.vendor_name] ??= []).push(c)
      return acc
    }, {})
  ).sort((a, b) => b[1].length - a[1].length)

  const stats = [
    { label: 'Active Cycles', value: activeCycles.length, icon: <Activity size={18} />, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/30' },
    { label: 'Closed Cycles', value: archivedCycles.length, icon: <Archive size={18} />, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800' },
    { label: 'Vendors', value: vendorCount, icon: <Building2 size={18} />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Total Cycles', value: cycles.length, icon: <Layers size={18} />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
  ]

  function toggleVendor(name: string) {
    setExpandedVendors((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  function handleCycleCreated(cycle: GovernanceCycle) {
    addCycle(cycle)
    setShowNewCycleModal(false)
    const preferredTab = lastTabs[cycle.cycle_id] ?? getDefaultTabFromState(cycle.workflow_state as WorkflowState)
    navigate(`/cycles/${cycle.cycle_id}?tab=${preferredTab}`)
  }

  async function handleDeleteCycle(cycleId: string) {
    const ok = window.confirm('Delete this cycle and related attendee/slot data?')
    if (!ok) return

    setDeletingCycleId(cycleId)
    try {
      await apiFetch(`/api/cycles/${cycleId}`, { method: 'DELETE' })
      removeCycle(cycleId)
    } catch (err) {
      setLoadingError(err instanceof Error ? err.message : 'Failed to delete cycle')
    } finally {
      setDeletingCycleId(null)
    }
  }

  // One cycle card — reused in the active list and the vendor-grouped closed list.
  function renderCycleCard(cycle: GovernanceCycle) {
    const effectiveState = getWorkflowState(cycle.cycle_id)
    const badge = STATE_BADGE[effectiveState]
    const stateIdx = getStateIndex(effectiveState)
    const stepNumber = stateIdx >= 0 ? stateIdx + 1 : 0
    const trend = VENDOR_TRENDS[cycle.vendor_name]
    const defaultTab = lastTabs[cycle.cycle_id] ?? getDefaultTabFromState(effectiveState)
    return (
      <div
        key={cycle.cycle_id}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all cursor-pointer"
        onClick={() => navigate(`/cycles/${cycle.cycle_id}?tab=${defaultTab}`)}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
              <Building2 size={16} className="text-slate-500 dark:text-slate-400" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm truncate">{cycle.vendor_name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {cycle.quarter} {cycle.year} · {cycle.cycle_type ?? 'SPR'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleDeleteCycle(cycle.cycle_id) }}
            disabled={deletingCycleId === cycle.cycle_id}
            className={cn(
              'w-7 h-7 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center transition-colors shrink-0',
              deletingCycleId === cycle.cycle_id && 'opacity-60 cursor-not-allowed'
            )}
            title="Delete cycle"
          >
            {deletingCycleId === cycle.cycle_id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium', badge?.classes ?? 'bg-slate-100 text-slate-600')}>
            {WORKFLOW_STATE_LABELS[effectiveState] ?? effectiveState}
          </span>
          {trend && (
            <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              {trend.icon}<span className="hidden sm:inline">{trend.label}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
              style={{ width: stateIdx >= 0 ? `${(stepNumber / WORKFLOW_STATES.length) * 100}%` : '0%' }}
            />
          </div>
          <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{stepNumber}/{WORKFLOW_STATES.length}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {showNewCycleModal && (
        <NewCycleModal
          onClose={() => setShowNewCycleModal(false)}
          onCreate={handleCycleCreated}
        />
      )}

      {/* Welcome header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            {friendlyFirstName(user.name) ? `Welcome back, ${friendlyFirstName(user.name)}` : 'Welcome back'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {format(today, 'EEEE, d MMMM yyyy')} · Shell VMO — Governance Platform
          </p>
        </div>
        <button
          onClick={() => setShowNewCycleModal(true)}
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

      {loadingError && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          {loadingError}
        </div>
      )}

      {/* Search + vendor filter */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cycles by vendor…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="relative sm:w-64">
          <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <select
            value={selectedVendor}
            onChange={(e) => setSelectedVendor(e.target.value)}
            className="w-full appearance-none pl-9 pr-8 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="">All vendors</option>
            {vendorNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <ChevronDown size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          {selectedVendor && (
            <button
              type="button"
              onClick={() => setSelectedVendor('')}
              title="Clear vendor filter"
              className="absolute right-7 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Active governance cycles */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} className="text-indigo-500 dark:text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Active Governance Cycles</h3>
          <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-medium">{activeShown.length}</span>
        </div>
        {isLoadingCycles ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-8 text-sm text-slate-500 dark:text-slate-400">Loading cycles from backend…</div>
        ) : activeShown.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {q ? 'No active cycles match your search.' : 'No active cycles yet. Create one to get started.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeShown.map(renderCycleCard)}
          </div>
        )}
      </section>

      {/* Closed cycles — grouped vendor-wise, collapsible, searchable */}
      {archivedCycles.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Archive size={16} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Closed Cycles</h3>
            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-xs font-medium">{archivedShown.length}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">grouped by vendor</span>
          </div>
          {archivedByVendor.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl px-5 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No closed cycles match your search.
            </div>
          ) : (
            <div className="space-y-3">
              {archivedByVendor.map(([vendor, list]) => {
                const open = expandedVendors.has(vendor) || !!q || !!selectedVendor
                return (
                  <div key={vendor} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleVendor(vendor)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      {open ? <ChevronDown size={15} className="text-slate-400 shrink-0" /> : <ChevronRight size={15} className="text-slate-400 shrink-0" />}
                      <Building2 size={15} className="text-slate-500 dark:text-slate-400 shrink-0" />
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{vendor}</span>
                      <span className="ml-auto px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full text-xs shrink-0">
                        {list.length} cycle{list.length === 1 ? '' : 's'}
                      </span>
                    </button>
                    {open && (
                      <div className="px-4 pb-4 pt-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {list.map(renderCycleCard)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
