import { useState } from 'react'
import { Pencil, Check, X, Users } from 'lucide-react'
import type { FaceOffPosition } from '@/types/alignment.types'

interface Props {
  positions: FaceOffPosition[]
}

export default function FaceOffModelEditor({ positions: initialPositions }: Props) {
  const [positions, setPositions] = useState(initialPositions)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<FaceOffPosition>>({})

  function startEdit(pos: FaceOffPosition) {
    setEditingId(pos.position_number)
    setEditDraft({ ...pos })
  }

  function saveEdit() {
    if (editingId === null) return
    setPositions((prev) =>
      prev.map((p) =>
        p.position_number === editingId ? { ...p, ...editDraft } : p
      )
    )
    setEditingId(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDraft({})
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
        <Users size={15} className="text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Face-off Model
        </h3>
        <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
          Click row to edit
        </span>
      </div>

      {/* Header */}
      <div className="grid grid-cols-[2.5rem_1fr_1fr_2.5rem] gap-0 bg-slate-50 dark:bg-slate-800/50 px-4 py-2 border-b border-slate-200 dark:border-slate-800">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">#</span>
        <div className="grid grid-cols-2 gap-2">
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Zensar Name</span>
          <span className="text-xs font-semibold text-blue-500 dark:text-blue-500">Zensar Role</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">Vendor Name</span>
          <span className="text-xs font-semibold text-orange-500 dark:text-orange-500">Vendor Role</span>
        </div>
        <span />
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {positions.map((pos) => {
          const isEditing = editingId === pos.position_number
          return (
            <div
              key={pos.position_number}
              className="grid grid-cols-[2.5rem_1fr_1fr_2.5rem] gap-0 px-4 py-3 items-center hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors"
            >
              <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center text-xs font-bold">
                {pos.position_number}
              </span>

              {/* Zensar side */}
              <div className="grid grid-cols-2 gap-2 pr-4">
                {isEditing ? (
                  <>
                    <input
                      value={editDraft.client_name ?? ''}
                      onChange={(e) => setEditDraft((d) => ({ ...d, client_name: e.target.value }))}
                      className="text-xs border border-blue-300 dark:border-blue-700 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="Name"
                    />
                    <input
                      value={editDraft.client_role ?? ''}
                      onChange={(e) => setEditDraft((d) => ({ ...d, client_role: e.target.value }))}
                      className="text-xs border border-blue-300 dark:border-blue-700 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="Role"
                    />
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-800 dark:text-slate-200 font-medium truncate">{pos.client_name || '—'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{pos.client_role || '—'}</p>
                  </>
                )}
              </div>

              {/* Vendor side */}
              <div className="grid grid-cols-2 gap-2 pl-4 border-l border-slate-200 dark:border-slate-700">
                {isEditing ? (
                  <>
                    <input
                      value={editDraft.vendor_name ?? ''}
                      onChange={(e) => setEditDraft((d) => ({ ...d, vendor_name: e.target.value }))}
                      className="text-xs border border-orange-300 dark:border-orange-700 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      placeholder="Name"
                    />
                    <input
                      value={editDraft.vendor_role ?? ''}
                      onChange={(e) => setEditDraft((d) => ({ ...d, vendor_role: e.target.value }))}
                      className="text-xs border border-orange-300 dark:border-orange-700 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      placeholder="Role"
                    />
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-800 dark:text-slate-200 font-medium truncate">{pos.vendor_name || '—'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{pos.vendor_role || '—'}</p>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-center">
                {isEditing ? (
                  <div className="flex gap-1">
                    <button onClick={saveEdit} className="p-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded">
                      <Check size={14} />
                    </button>
                    <button onClick={cancelEdit} className="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(pos)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
