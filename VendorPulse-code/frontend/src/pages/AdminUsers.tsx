import { useEffect, useMemo, useState } from 'react'
import {
  Users, UserPlus, Search, Pencil, Trash2, X, Check, Loader2,
  Building2, AlertTriangle, Info,
} from 'lucide-react'
import { listUsers, createUser, updateUser, deleteUser } from '@/lib/usersApi'
import type { SystemUser, UserInput } from '@/lib/usersApi'
import { ROLE_LABELS } from '@/types/cycle.types'
import type { StakeholderRole } from '@/types/cycle.types'
import { cn } from '@/utils/cn'

const ROLE_KEYS = Object.keys(ROLE_LABELS) as StakeholderRole[]

const EMPTY_FORM: UserInput = {
  name: '',
  email: '',
  role: 'VMO_COORDINATOR',
  organisation: '',
}

function roleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? role
}

export default function AdminUsers() {
  const [users, setUsers] = useState<SystemUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  // Add/edit form: `editingId` = null means "not open", '' means "adding new".
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<UserInput>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setUsers(await listUsers())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the directory')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) =>
      [u.name, u.email, u.organisation, roleLabel(u.role)]
        .some((v) => (v ?? '').toLowerCase().includes(q))
    )
  }, [users, query])

  function openAdd() {
    setForm(EMPTY_FORM)
    setEditingId('')
    setFormError(null)
  }

  function openEdit(u: SystemUser) {
    setForm({
      name: u.name,
      email: u.email,
      role: ROLE_KEYS.includes(u.role as StakeholderRole) ? u.role : 'VMO_COORDINATOR',
      organisation: u.organisation ?? '',
    })
    setEditingId(u.user_id)
    setFormError(null)
  }

  function closeForm() {
    setEditingId(null)
    setFormError(null)
  }

  async function handleSave() {
    const name = form.name.trim()
    const email = form.email.trim()
    if (!name) { setFormError('Name is required.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFormError('Enter a valid work email.'); return }

    setSaving(true)
    setFormError(null)
    try {
      const payload: UserInput = {
        name,
        email,
        role: form.role,
        organisation: form.organisation?.trim() || '',
      }
      if (editingId) await updateUser(editingId, payload)
      else await createUser(payload)
      await load()
      closeForm()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save. The email may already exist.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(userId: string) {
    setDeletingId(userId)
    try {
      await deleteUser(userId)
      await load()
      setConfirmDeleteId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete the person')
    } finally {
      setDeletingId(null)
    }
  }

  const field = 'w-full text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Users size={20} className="text-indigo-600 dark:text-indigo-400" />
            User Directory
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            The people available to add as cycle attendees. Add, edit, or remove them here.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <UserPlus size={15} /> Add person
        </button>
      </div>

      {/* Interim-directory note */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300">
        <Info size={14} className="shrink-0 mt-0.5" />
        <span>
          This is the interim manual directory. Once Microsoft Entra ID (SSO/SPN) is connected,
          this list will be populated from your organisation automatically.
        </span>
      </div>

      {/* Add / edit form */}
      {editingId !== null && (
        <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800/60 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {editingId ? 'Edit person' : 'Add a new person'}
            </h3>
            <button onClick={closeForm} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Name <span className="text-red-500">*</span>
              <input className={cn(field, 'mt-1')} value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Alex Thompson" />
            </label>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Work email <span className="text-red-500">*</span>
              <input className={cn(field, 'mt-1')} type="email" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="alex@shell.com" />
            </label>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Role
              <select className={cn(field, 'mt-1')} value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                {ROLE_KEYS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Organisation
              <input className={cn(field, 'mt-1')} value={form.organisation}
                onChange={(e) => setForm((f) => ({ ...f, organisation: e.target.value }))}
                placeholder="Shell VMO / Zensar / Vendor name" />
            </label>
          </div>

          {formError && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <AlertTriangle size={13} /> {formError}
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {editingId ? 'Save changes' : 'Add person'}
            </button>
            <button onClick={closeForm} className="px-3.5 py-2 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, organisation, or role…"
          className="w-full pl-9 pr-3 py-2 text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-10 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading directory…
        </div>
      ) : error ? (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl px-6 py-12 text-center">
          <Users size={22} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {query ? 'No one matches that search.' : 'No people in the directory yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-2.5 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
            {filtered.length} {filtered.length === 1 ? 'person' : 'people'}
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((u) => (
              <div key={u.user_id} className="px-5 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0 text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                  {u.avatar || (u.name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{u.name}</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {roleLabel(u.role)}
                    </span>
                    {u.organisation && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 flex items-center gap-1">
                        <Building2 size={10} /> {u.organisation}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{u.email}</p>
                </div>

                {confirmDeleteId === u.user_id ? (
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">Remove {u.name}?</span>
                    <button
                      onClick={() => handleDelete(u.user_id)}
                      disabled={deletingId === u.user_id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      {deletingId === u.user_id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2.5 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(u)}
                      title="Edit"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(u.user_id)}
                      title="Delete"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
