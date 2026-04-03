import { useState, useEffect, useRef } from 'react'
import {
  Users,
  CheckCircle2,
  AlertCircle,
  Key,
  ArrowRight,
  UserPlus,
  X,
  Loader2,
  Search,
  CalendarClock,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type { CycleAttendee } from '@/types/scheduling.types'
import { ROLE_LABELS } from '@/types/cycle.types'
import type { StakeholderRole } from '@/types/cycle.types'
import { apiFetch } from '@/lib/api'
import { MOCK_SYSTEM_USERS, type SystemUser } from '@/mock/scheduling.mock'

interface AttendeeRefreshPanelProps {
  cycleId: string
  attendees: CycleAttendee[]
  onAttendeesChanged: (updated: CycleAttendee[]) => void
  onDispatchComplete: () => void
  onResponsesSimulated: (updated: CycleAttendee[]) => void
}

// ── Search & Add Attendee Form ───────────────────────────────────────────────

interface SearchAddAttendeeFormProps {
  cycleId: string
  existingAttendeeIds: string[]
  onAdded: (attendee: CycleAttendee) => void
  onCancel: () => void
}

function SearchAddAttendeeForm({ cycleId, existingAttendeeIds, onAdded, onCancel }: SearchAddAttendeeFormProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SystemUser[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selected, setSelected] = useState<SystemUser | null>(null)
  const [role, setRole] = useState<StakeholderRole>('VMO_COORDINATOR')
  const [isKey, setIsKey] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      setResults([])
      setShowDropdown(false)
      return
    }
    apiFetch<{ users: Array<{ userId?: string; user_id?: string; name: string; email: string; role?: string; organisation?: string }> }>(
      `/api/users`,
      { params: { search: q } }
    )
      .then(({ users }) => {
        // Normalize API response to SystemUser shape
        const mapped: SystemUser[] = users.map((u) => ({
          user_id: u.user_id ?? u.userId ?? '',
          name: u.name,
          email: u.email,
          organisation: u.organisation ?? u.role ?? '',
        }))
        setResults(mapped.filter((u) => u.user_id && !existingAttendeeIds.includes(u.user_id)))
        setShowDropdown(true)
      })
      .catch(() => {
        // API unavailable — fall back to mock data filtered locally
        const filtered = MOCK_SYSTEM_USERS.filter(
          (u) =>
            !existingAttendeeIds.includes(u.user_id) &&
            (u.name.toLowerCase().includes(q) ||
              u.email.toLowerCase().includes(q) ||
              u.organisation.toLowerCase().includes(q))
        )
        setResults(filtered)
        setShowDropdown(true)
      })
  }, [query, existingAttendeeIds])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(user: SystemUser) {
    setSelected(user)
    setQuery(user.name)
    setShowDropdown(false)
    setError(null)
  }

  function handleQueryChange(value: string) {
    setQuery(value)
    if (selected && value !== selected.name) {
      setSelected(null)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) {
      setError('Please search and select a user from the list.')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await apiFetch<{ attendees: CycleAttendee[]; data?: { attendees: CycleAttendee[] } }>(
        `/api/cycles/${cycleId}/attendees`,
        {
          method: 'POST',
          body: JSON.stringify([
            {
              stakeholder_id: `s_${Date.now()}`,
              name: selected.name,
              email: selected.email,
              role,
              organisation: selected.organisation,
              is_key: isKey,
              user_id: selected.user_id,
            },
          ]),
        }
      )
      const added =
        (res as unknown as { data: { attendees: CycleAttendee[] } }).data?.attendees ??
        (res as unknown as { attendees: CycleAttendee[] }).attendees ??
        []
      if (added.length > 0) {
        onAdded(added[0])
      }
    } catch {
      const localAttendee: CycleAttendee = {
        attendee_id: `a_${Date.now()}`,
        stakeholder_id: `s_${Date.now()}`,
        name: selected.name,
        email: selected.email,
        role,
        organisation: selected.organisation,
        is_key: isKey,
        invite_status: 'PENDING',
        availability_submitted: false,
        user_id: selected.user_id,
      }
      onAdded(localAttendee)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 bg-indigo-50/40 dark:bg-indigo-900/10 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">Add Attendee from Database</span>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600">
          <X size={14} />
        </button>
      </div>

      <div className="space-y-1 relative" ref={dropdownRef}>
        <label className="text-xs text-slate-600 dark:text-slate-400">Search user *</label>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Type name, email or organisation…"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => results.length > 0 && setShowDropdown(true)}
            className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {showDropdown && results.length > 0 && (
          <div className="absolute z-20 top-full mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
            {results.map((u) => (
              <button
                key={u.user_id}
                type="button"
                onMouseDown={() => handleSelect(u)}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors flex items-start gap-2"
              >
                <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-indigo-600 dark:text-indigo-400 text-xs font-semibold">
                    {u.name.charAt(0)}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{u.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{u.email}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{u.organisation}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {showDropdown && results.length === 0 && query.trim() && (
          <div className="absolute z-20 top-full mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
            No users found matching "{query}"
          </div>
        )}
      </div>

      {selected && (
        <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg">
          <CheckCircle2 size={13} className="text-indigo-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{selected.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{selected.email} · {selected.organisation}</p>
          </div>
        </div>
      )}

      {selected && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs text-slate-600 dark:text-slate-400">Role *</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as StakeholderRole)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {(Object.keys(ROLE_LABELS) as StakeholderRole[]).map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end pb-1.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isKey}
                onChange={(e) => setIsKey(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Key size={11} className="text-amber-500" />
                Key attendee
              </span>
            </label>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
          <AlertCircle size={12} />
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !selected}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors',
            (isSubmitting || !selected) && 'opacity-60 cursor-not-allowed'
          )}
        >
          {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : null}
          {isSubmitting ? 'Adding...' : 'Add Attendee'}
        </button>
      </div>
    </form>
  )
}

// ── Main Panel ───────────────────────────────────────────────────────────────

export default function AttendeeRefreshPanel({
  cycleId,
  attendees,
  onAttendeesChanged,
  onResponsesSimulated,
}: AttendeeRefreshPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [togglingKey, setTogglingKey] = useState<string | null>(null)
  const [isProceeding, setIsProceeding] = useState(false)

  async function handleToggleKey(attendee: CycleAttendee) {
    setTogglingKey(attendee.attendee_id)
    try {
      const updated = await apiFetch<{ attendee: CycleAttendee }>(
        `/api/cycles/${cycleId}/attendees/${attendee.attendee_id}`,
        {
          method: 'PUT',
          body: JSON.stringify({ is_key: !attendee.is_key }),
        }
      )
      onAttendeesChanged(
        attendees.map((a) =>
          a.attendee_id === attendee.attendee_id ? { ...a, ...updated.attendee } : a
        )
      )
    } catch {
      // optimistic toggle
      onAttendeesChanged(
        attendees.map((a) =>
          a.attendee_id === attendee.attendee_id ? { ...a, is_key: !a.is_key } : a
        )
      )
    } finally {
      setTogglingKey(null)
    }
  }

  function handleAttendeeAdded(added: CycleAttendee) {
    onAttendeesChanged([...attendees, added])
    setShowAddForm(false)
  }

  function handleProceed() {
    setIsProceeding(true)
    // Simulate scheduler agent analysing attendees to find time slots
    setTimeout(() => {
      setIsProceeding(false)
      onResponsesSimulated(attendees)
    }, 1500)
  }

  return (
    <div className="space-y-4 fade-in">
      {/* Header card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center shrink-0">
              <Users size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                Meeting Attendees
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Add all attendees for this governance cycle
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-400 flex items-start gap-2">
          <CalendarClock size={14} className="shrink-0 mt-0.5" />
          <span>
            Add all attendees below. Once ready, click{' '}
            <strong>Proceed to Scheduling</strong> — the scheduler agent will
            analyse attendees and propose the best available time slots.
          </span>
        </div>

        {/* Proceed button */}
        <div className="mt-4">
          <button
            onClick={handleProceed}
            disabled={isProceeding || attendees.length === 0}
            className={cn(
              'flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors',
              (isProceeding || attendees.length === 0) && 'opacity-60 cursor-not-allowed'
            )}
          >
            {isProceeding ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ArrowRight size={14} />
            )}
            {isProceeding ? 'Analysing availability...' : 'Proceed to Scheduling'}
          </button>
          {attendees.length === 0 && (
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              Add at least one attendee to proceed.
            </p>
          )}
        </div>
      </div>

      {/* Attendee table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Attendee List
            </span>
            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-xs">
              {attendees.length}
            </span>
          </div>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
            >
              <UserPlus size={12} />
              Add
            </button>
          )}
        </div>

        {showAddForm && (
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <SearchAddAttendeeForm
              cycleId={cycleId}
              existingAttendeeIds={attendees.map((a) => a.user_id ?? a.attendee_id)}
              onAdded={handleAttendeeAdded}
              onCancel={() => setShowAddForm(false)}
            />
          </div>
        )}

        {attendees.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No attendees yet. Click <strong>Add</strong> to add the first attendee.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
                  <th className="text-left px-5 py-2.5 font-medium">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium">Role</th>
                  <th className="text-left px-4 py-2.5 font-medium">Organisation</th>
                  <th className="text-left px-4 py-2.5 font-medium">Key</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {attendees.map((a) => (
                  <tr
                    key={a.attendee_id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {a.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                      {ROLE_LABELS[a.role] ?? a.role}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                      {a.organisation}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleKey(a)}
                        disabled={togglingKey === a.attendee_id}
                        title={a.is_key ? 'Remove key status' : 'Mark as key attendee'}
                        className={cn(
                          'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
                          a.is_key
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700',
                          togglingKey === a.attendee_id && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        {togglingKey === a.attendee_id ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <Key size={11} />
                        )}
                        {a.is_key ? 'Key' : 'Set key'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <Key size={11} className="text-amber-500" />
            <span>Key attendee — hard constraint for slot ranking (organiser + exec sponsor must be free)</span>
          </div>
        </div>
      </div>
    </div>
  )
}
