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
      
      

    </div>
  )
}
