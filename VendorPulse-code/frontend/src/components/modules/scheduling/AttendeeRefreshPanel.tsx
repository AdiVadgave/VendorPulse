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
  Trash2,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type {
  CycleAttendee,
  AttendanceRequirement,
  LTStatus,
  ShellDepartment,
} from '@/types/scheduling.types'
import { SHELL_DEPARTMENTS } from '@/types/scheduling.types'
import { ROLE_LABELS } from '@/types/cycle.types'
import type { StakeholderRole } from '@/types/cycle.types'
import { apiFetch } from '@/lib/api'
import type { SystemUser } from '@/lib/schedulingApi'
import { createUser } from '@/lib/usersApi'
import { searchPeople, type PeopleSearchResult } from '@/lib/auth/graphPeople'

interface AttendeeRefreshPanelProps {
  cycleId: string
  attendees: CycleAttendee[]
  onAttendeesChanged: (updated: CycleAttendee[]) => void
  onDispatchComplete: () => void
  /** Move on to the (manual) meeting-scheduling step. */
  onProceed: () => void
  onBackToAttendance?: () => void
}

// ── Search & Add Attendee Form ───────────────────────────────────────────────

interface SearchAddAttendeeFormProps {
  cycleId: string
  existingAttendeeIds: string[]
  onAdded: (attendee: CycleAttendee) => void
  onCancel: () => void
}

export function SearchAddAttendeeForm({ cycleId, existingAttendeeIds, onAdded, onCancel }: SearchAddAttendeeFormProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PeopleSearchResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selected, setSelected] = useState<PeopleSearchResult | null>(null)
  const [role, setRole] = useState<StakeholderRole>('VMO_COORDINATOR')
  const [attendeeType, setAttendeeType] = useState<'Internal Stakeholder' | 'Vendor'>('Internal Stakeholder')
  const [isKey, setIsKey] = useState(false)
  const [attendanceRequirement, setAttendanceRequirement] = useState<AttendanceRequirement>('Required')
  const [ltStatus, setLtStatus] = useState<LTStatus>('Non-LT')
  const [shellDepartment, setShellDepartment] = useState<ShellDepartment>('IDTM')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Inline "create a brand-new person" flow (when the search finds nobody).
  const [creatingNew, setCreatingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newOrg, setNewOrg] = useState('')
  const [creating, setCreating] = useState(false)

  function openCreateNew() {
    // Pre-fill from the current query: an "@"-containing query is an email, else a name.
    const q = query.trim()
    if (q.includes('@')) { setNewEmail(q); setNewName('') }
    else { setNewName(q); setNewEmail('') }
    setNewOrg('')
    setError(null)
    setShowDropdown(false)
    setCreatingNew(true)
  }

  async function handleCreateNew() {
    const name = newName.trim()
    const email = newEmail.trim()
    if (!name) { setError('Name is required for the new person.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid work email for the new person.'); return }
    setCreating(true)
    setError(null)
    try {
      const created = await createUser({ name, email, role, organisation: newOrg.trim() })
      // Immediately select the freshly-created person so the normal add flow proceeds.
      setSelected(created)
      setQuery(created.name)
      setCreatingNew(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create the new person (the email may already exist).')
    } finally {
      setCreating(false)
    }
  }

  useEffect(() => {
    const raw = query.trim()
    if (!raw) {
      setResults([])
      setShowDropdown(false)
      return
    }
    const q = raw.toLowerCase()
    let cancelled = false
    // Debounce so we don't hit the local directory + Graph on every keystroke.
    const timer = setTimeout(() => {
      Promise.all([
        // Local directory (people already saved in VendorPulse).
        apiFetch<SystemUser[]>(`/api/users`, { params: { search: q } }).catch(() => [] as SystemUser[]),
        // Shell directory via Microsoft Graph — [] when SSO is off or unavailable.
        searchPeople(raw).catch(() => [] as SystemUser[]),
      ])
        .then(([local, shell]) => {
          if (cancelled) return
          // Local results first; append Shell people not already present (by email).
          const seen = new Set(local.map((u) => u.email.toLowerCase()))
          const merged: PeopleSearchResult[] = [...local]
          for (const u of shell) {
            const e = u.email.toLowerCase()
            if (seen.has(e)) continue
            seen.add(e)
            merged.push(u)
          }
          setResults(merged.filter((u) => !existingAttendeeIds.includes(u.user_id)))
          setShowDropdown(true)
        })
        .catch(() => {
          if (cancelled) return
          setResults([])
          setShowDropdown(false)
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
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

  function handleSelect(user: PeopleSearchResult) {
    setSelected(user)
    setQuery(user.name)
    setShowDropdown(false)
    setError(null)
    // Shell directory people are internal employees — default the type accordingly.
    if (user.user_id.startsWith('graph:')) setAttendeeType('Internal Stakeholder')
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
              type: attendeeType,
              is_key: isKey,
              attendance_requirement: attendanceRequirement,
              lt_status: ltStatus,
              shell_department: attendeeType === 'Internal Stakeholder' ? shellDepartment : null,
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
        type: attendeeType,
        is_key: isKey,
        attendance_requirement: attendanceRequirement,
        lt_status: ltStatus,
        shell_department: attendeeType === 'Internal Stakeholder' ? shellDepartment : null,
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
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5">
                    {u.name}
                    {u.user_id.startsWith('graph:') && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">
                        Shell directory
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{u.email}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{u.organisation}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {showDropdown && results.length === 0 && query.trim() && !creatingNew && (
          <div className="absolute z-20 top-full mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
            <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
              No users found matching "{query}"
            </div>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); openCreateNew() }}
              className="w-full text-left px-3 py-2 border-t border-slate-100 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors flex items-center gap-2 text-xs font-medium text-indigo-600 dark:text-indigo-400"
            >
              <UserPlus size={13} /> Add "{query.trim()}" as a new person
            </button>
          </div>
        )}
      </div>

      {/* Inline create-new-person form (adds to the directory, then selects them) */}
      {creatingNew && (
        <div className="border border-indigo-200 dark:border-indigo-700 rounded-lg p-3 bg-white dark:bg-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
              <UserPlus size={12} /> New person
            </span>
            <button type="button" onClick={() => setCreatingNew(false)} className="text-slate-400 hover:text-slate-600">
              <X size={13} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text" placeholder="Full name *" value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="email" placeholder="Work email *" value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="text" placeholder="Organisation" value={newOrg}
              onChange={(e) => setNewOrg(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="button"
            onClick={handleCreateNew}
            disabled={creating}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {creating ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
            Create &amp; select
          </button>
          <p className="text-[10px] text-slate-400">
            Saved to the directory — you can manage them later under Directory. Then set their role &amp; type below.
          </p>
        </div>
      )}

      {selected && (
        <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg">
          <CheckCircle2 size={13} className="text-indigo-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{selected.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{selected.email} · {selected.organisation}</p>
            {(selected.jobTitle || selected.department) && (
              <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                {[selected.jobTitle, selected.department].filter(Boolean).join(' · ')}
              </p>
            )}
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
          <div className="space-y-1">
            <label className="text-xs text-slate-600 dark:text-slate-400">Type *</label>
            <select
              value={attendeeType}
              onChange={(e) => setAttendeeType(e.target.value as 'Internal Stakeholder' | 'Vendor')}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="Internal Stakeholder">Internal Stakeholder</option>
              <option value="Vendor">Vendor</option>
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

          {/* Invitee classification */}
          <div className="space-y-1">
            <label className="text-xs text-slate-600 dark:text-slate-400">Attendance</label>
            <select
              value={attendanceRequirement}
              onChange={(e) => setAttendanceRequirement(e.target.value as AttendanceRequirement)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="Required">Required</option>
              <option value="Optional">Optional</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-600 dark:text-slate-400">Leadership</label>
            <select
              value={ltStatus}
              onChange={(e) => setLtStatus(e.target.value as LTStatus)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="Non-LT">Non-LT</option>
              <option value="LT">LT (Leadership Team)</option>
            </select>
          </div>
          {attendeeType === 'Internal Stakeholder' && (
            <div className="space-y-1">
              <label className="text-xs text-slate-600 dark:text-slate-400">Shell Department</label>
              <select
                value={shellDepartment}
                onChange={(e) => setShellDepartment(e.target.value as ShellDepartment)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {SHELL_DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}
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
  onProceed,
  onBackToAttendance,
}: AttendeeRefreshPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleUpdateAttendee(
    attendee: CycleAttendee,
    patch: Partial<Pick<CycleAttendee, 'type' | 'is_key' | 'attendance_requirement' | 'lt_status' | 'shell_department'>>
  ) {
    try {
      const updated = await apiFetch<{ attendee: CycleAttendee }>(
        `/api/cycles/${cycleId}/attendees/${attendee.attendee_id}`,
        { method: 'PUT', body: JSON.stringify(patch) }
      )
      onAttendeesChanged(
        attendees.map((a) =>
          a.attendee_id === attendee.attendee_id ? { ...a, ...updated.attendee } : a
        )
      )
    } catch {
      // optimistic update if backend is unavailable
      onAttendeesChanged(
        attendees.map((a) =>
          a.attendee_id === attendee.attendee_id ? { ...a, ...patch } : a
        )
      )
    }
  }

  async function handleDeleteAttendee(attendee: CycleAttendee) {
    setDeletingId(attendee.attendee_id)
    try {
      await apiFetch(`/api/cycles/${cycleId}/attendees/${attendee.attendee_id}`, {
        method: 'DELETE',
      })
      onAttendeesChanged(attendees.filter((a) => a.attendee_id !== attendee.attendee_id))
    } catch {
      // still remove from UI optimistically
      onAttendeesChanged(attendees.filter((a) => a.attendee_id !== attendee.attendee_id))
    } finally {
      setDeletingId(null)
    }
  }

  function handleAttendeeAdded(added: CycleAttendee) {
    onAttendeesChanged([...attendees, added])
    setShowAddForm(false)
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
          {onBackToAttendance && (
            <button
              type="button"
              onClick={onBackToAttendance}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Back to Attendance
            </button>
          )}
        </div>

        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-400 flex items-start gap-2">
          <CalendarClock size={14} className="shrink-0 mt-0.5" />
          <span>
            Add or remove attendees for this cycle. When the list is ready, continue to set the
            meeting date &amp; time.
          </span>
        </div>

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <button
            onClick={onProceed}
            disabled={attendees.length === 0}
            className={cn(
              'flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors',
              attendees.length === 0 && 'opacity-60 cursor-not-allowed'
            )}
          >
            <ArrowRight size={14} />
            Proceed to Schedule Meeting
          </button>
          {attendees.length === 0 && (
            <span className="text-xs text-slate-400 dark:text-slate-500">Add at least one attendee to proceed.</span>
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
                  <th className="text-left px-4 py-2.5 font-medium">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium">Attendance</th>
                  <th className="text-left px-4 py-2.5 font-medium">LT</th>
                  <th className="text-left px-4 py-2.5 font-medium">Dept</th>
                  <th className="text-left px-4 py-2.5 font-medium">Key</th>
                  <th className="text-left px-4 py-2.5 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {attendees.map((a) => {
                  // Anything not explicitly a Vendor is treated as an internal
                  // stakeholder — robust to legacy/missing `type` values so the Dept
                  // and Key columns never collapse to "—" for a real internal member.
                  const isInternal = a.type !== 'Vendor'
                  return (
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
                      <select
                        value={isInternal ? 'Internal Stakeholder' : 'Vendor'}
                        onChange={(e) => {
                          const newType = e.target.value as CycleAttendee['type']
                          handleUpdateAttendee(a, {
                            type: newType,
                            // Vendors have no Shell department and are never key
                            // (scorecards are collected from internal stakeholders only).
                            ...(newType === 'Vendor' ? { shell_department: null, is_key: false } : {}),
                          })
                        }}
                        className="px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="Internal Stakeholder">Internal</option>
                        <option value="Vendor">Vendor</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={a.attendance_requirement ?? 'Required'}
                        onChange={(e) =>
                          handleUpdateAttendee(a, {
                            attendance_requirement: e.target.value as AttendanceRequirement,
                          })
                        }
                        className="px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="Required">Required</option>
                        <option value="Optional">Optional</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={a.lt_status ?? 'Non-LT'}
                        onChange={(e) =>
                          handleUpdateAttendee(a, { lt_status: e.target.value as LTStatus })
                        }
                        className="px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="Non-LT">Non-LT</option>
                        <option value="LT">LT</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {isInternal ? (
                        <select
                          value={a.shell_department ?? 'IDTM'}
                          onChange={(e) =>
                            handleUpdateAttendee(a, {
                              shell_department: e.target.value as ShellDepartment,
                            })
                          }
                          className="px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {SHELL_DEPARTMENTS.map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isInternal ? (
                        <select
                          value={a.is_key ? 'key' : 'not'}
                          onChange={(e) => handleUpdateAttendee(a, { is_key: e.target.value === 'key' })}
                          title={a.is_key ? 'Key attendee (fills scorecard)' : 'Not a key attendee'}
                          className={cn(
                            'px-2 py-1 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500',
                            a.is_key
                              ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          )}
                        >
                          <option value="key">Key</option>
                          <option value="not">Not key</option>
                        </select>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDeleteAttendee(a)}
                        disabled={deletingId === a.attendee_id}
                        title="Remove attendee"
                        className={cn(
                          'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
                          'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50',
                          deletingId === a.attendee_id && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        {deletingId === a.attendee_id ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <Trash2 size={11} />
                        )}
                        Delete
                      </button>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <Key size={11} className="text-amber-500" />
            <span>Key internal stakeholders fill the scorecard (scorecards are not collected from vendors)</span>
          </div>
        </div>
      </div>
    </div>
  )
}
