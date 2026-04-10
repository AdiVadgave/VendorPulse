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
  Globe,
  Trash2,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type { CycleAttendee, SlotProposal } from '@/types/scheduling.types'
import { ROLE_LABELS } from '@/types/cycle.types'
import type { StakeholderRole } from '@/types/cycle.types'
import { apiFetch } from '@/lib/api'
import { getPreferredOrganizerEmail, getTokenOwnerOrganizerEmail } from '@/lib/schedulingApi'
import type { SystemUser } from '@/lib/schedulingApi'

interface AttendeeRefreshPanelProps {
  cycleId: string
  attendees: CycleAttendee[]
  onAttendeesChanged: (updated: CycleAttendee[]) => void
  onDispatchComplete: () => void
  onResponsesSimulated: (updated: CycleAttendee[], slots: SlotProposal[]) => void
  onBackToAttendance?: () => void
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
  const [attendeeType, setAttendeeType] = useState<'Internal Stakeholder' | 'Vendor'>('Internal Stakeholder')
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
    apiFetch<SystemUser[]>(`/api/users`, { params: { search: q } })
      .then((data) => {
        setResults(data.filter((u) => !existingAttendeeIds.includes(u.user_id)))
        setShowDropdown(true)
      })
      .catch(() => {
        setResults([])
        setShowDropdown(false)
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
              gmail: selected.gmail || '',
              role,
              organisation: selected.organisation,
              type: attendeeType,
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
        gmail: selected.gmail || '',
        role,
        organisation: selected.organisation,
        type: attendeeType,
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
  onBackToAttendance,
}: AttendeeRefreshPanelProps) {
  const today = new Date()
  const defaultStartDate = today.toISOString().split('T')[0]
  const defaultEndDate = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const [showAddForm, setShowAddForm] = useState(false)
  const [togglingKey, setTogglingKey] = useState<string | null>(null)
  const [togglingType, setTogglingType] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isGraphSearching, setIsGraphSearching] = useState(false)
  const [graphStatus, setGraphStatus] = useState<string>('')
  const [graphError, setGraphError] = useState<string | null>(null)
  const [graphStartDate, setGraphStartDate] = useState(defaultStartDate)
  const [graphEndDate, setGraphEndDate] = useState(defaultEndDate)
  const [graphDurationHours, setGraphDurationHours] = useState(0.5)
  const [graphTimeZone, setGraphTimeZone] = useState<'IST' | 'UTC' | 'GMT'>('IST')

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

  async function handleToggleType(attendee: CycleAttendee) {
    const newType = attendee.type === 'Vendor' ? 'Internal Stakeholder' : 'Vendor'
    setTogglingType(attendee.attendee_id)
    try {
      const updated = await apiFetch<{ attendee: CycleAttendee }>(
        `/api/cycles/${cycleId}/attendees/${attendee.attendee_id}`,
        {
          method: 'PUT',
          body: JSON.stringify({ type: newType }),
        }
      )
      onAttendeesChanged(
        attendees.map((a) =>
          a.attendee_id === attendee.attendee_id ? { ...a, ...updated.attendee } : a
        )
      )
    } catch {
      onAttendeesChanged(
        attendees.map((a) =>
          a.attendee_id === attendee.attendee_id ? { ...a, type: newType as CycleAttendee['type'] } : a
        )
      )
    } finally {
      setTogglingType(null)
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

  async function handleFindGraphSlots() {
    setIsGraphSearching(true)
    setGraphError(null)
    setGraphStatus('Finding real calendar slots via Graph…')
    try {
      const attendeeEmails = attendees.map((a) => a.email)
      const organiserEmail = await getTokenOwnerOrganizerEmail()
      const fallbackOrganizer = getPreferredOrganizerEmail(attendees)
      if (!organiserEmail) {
        setGraphError(
          fallbackOrganizer
            ? 'Could not resolve token owner organizer from Graph token. Refresh GRAPH_ACCESS_TOKEN and retry.'
            : 'No organiser email found. Add at least one attendee with an email address.'
        )
        return
      }

      const result = await apiFetch<{
        message?: string
        slot_proposals: SlotProposal[]
        graph_summary?: { empty_suggestions_reason?: string; no_slots_reason?: string }
      }>(
        `/api/cycles/${cycleId}/scheduling/graph/find-times`,
        {
          method: 'POST',
          body: JSON.stringify({
            organiser_email: organiserEmail,
            date_range_start: graphStartDate,
            date_range_end: graphEndDate,
            duration_hours: graphDurationHours,
            use_specific_attendees: attendeeEmails,
            time_zone: graphTimeZone,
            debug: true,
          }),
        }
      )

      const durationMinutes = Math.round(graphDurationHours * 60)
      const slots = (result.slot_proposals ?? []).map((slot) => {
        const withDuration = slot as SlotProposal & {
          duration_minutes?: number
          proposed_time_zone?: string
        }
        return {
          ...slot,
          duration_minutes: withDuration.duration_minutes ?? durationMinutes,
          proposed_time_zone: withDuration.proposed_time_zone ?? graphTimeZone,
        }
      })

      if (slots.length === 0) {
        const reason = result.graph_summary?.no_slots_reason?.trim() || result.graph_summary?.empty_suggestions_reason?.trim()
        const msg = result.message?.trim()
        setGraphError(
          reason
            ? `No slots found. Reason: ${reason}`
            : msg || 'No common slots found for the selected attendees/date range in working-hours mode.'
        )
        return
      }

      setGraphStatus(`Found ${slots.length} real calendar slots`)
      onResponsesSimulated(attendees, slots)
    } catch (err) {
      setGraphError(err instanceof Error ? err.message : 'Graph API error')
    } finally {
      setIsGraphSearching(false)
      setGraphStatus('')
    }
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
            Add all attendees below. Once ready, click{' '}
            <strong>Find Slots (Graph)</strong> — VendorPulse will query calendar availability
            via Microsoft Graph and return the best common time slots.
          </span>
        </div>

        {/* Proceed button */}
        <div className="mt-4 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                Start date
                <input
                  type="date"
                  value={graphStartDate}
                  onChange={(e) => setGraphStartDate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                End date
                <input
                  type="date"
                  value={graphEndDate}
                  onChange={(e) => setGraphEndDate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                Meeting duration
                <select
                  value={graphDurationHours}
                  onChange={(e) => setGraphDurationHours(Number(e.target.value))}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value={0.5}>30 minutes</option>
                  <option value={1}>60 minutes</option>
                  <option value={1.5}>90 minutes</option>
                  <option value={2}>120 minutes</option>
                </select>
              </label>
            </div>
            <div className="max-w-55">
              <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                Scheduling timezone
                <select
                  value={graphTimeZone}
                  onChange={(e) => setGraphTimeZone(e.target.value as 'IST' | 'UTC' | 'GMT')}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="IST">IST</option>
                  <option value="UTC">UTC</option>
                  <option value="GMT">GMT</option>
                </select>
              </label>
            </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleFindGraphSlots}
              disabled={isGraphSearching || attendees.length === 0}
              className={cn(
                'flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors',
                (isGraphSearching || attendees.length === 0) && 'opacity-60 cursor-not-allowed'
              )}
            >
              {isGraphSearching ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Globe size={14} />
              )}
              {isGraphSearching ? (graphStatus || 'Finding slots…') : 'Find Slots (Graph)'}
            </button>
          </div>
          {!isGraphSearching && attendees.length > 0 && (
            <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <ArrowRight size={12} />
              Uses Microsoft Graph calendar availability
            </span>
          )}
          {attendees.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Add at least one attendee to proceed.
            </p>
          )}
          {graphError && (
            <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertCircle size={12} />
              {graphError}
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
                  <th className="text-left px-4 py-2.5 font-medium">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium">Key</th>
                  <th className="text-left px-4 py-2.5 font-medium">Action</th>
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
                        onClick={() => handleToggleType(a)}
                        disabled={togglingType === a.attendee_id}
                        title={`Switch to ${a.type === 'Vendor' ? 'Internal Stakeholder' : 'Vendor'}`}
                        className={cn(
                          'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
                          a.type === 'Vendor'
                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50',
                          togglingType === a.attendee_id && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        {togglingType === a.attendee_id ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : null}
                        {a.type === 'Vendor' ? 'Vendor' : 'Internal'}
                      </button>
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
