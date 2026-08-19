import { cn } from '@/utils/cn'
import { RAG_META, isRAG } from './rag-constants'

/** Read-only RAG chip (or a dash when no value). */
export function RagChip({ value, className }: { value?: string | null; className?: string }) {
  if (!isRAG(value)) return <span className="text-slate-300 dark:text-slate-600">—</span>
  const m = RAG_META[value]
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border', m.chip, className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', m.dot)} />
      {m.label}
    </span>
  )
}

/** Just the coloured dot (compact cells). */
export function RagDot({ value }: { value?: string | null }) {
  if (!isRAG(value)) return <span className="text-slate-300 dark:text-slate-600">—</span>
  return <span className={cn('inline-block w-2.5 h-2.5 rounded-full align-middle', RAG_META[value].dot)} title={RAG_META[value].label} />
}
