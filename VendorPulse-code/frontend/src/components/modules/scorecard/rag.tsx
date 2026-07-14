import { cn } from '@/utils/cn'

/**
 * RAG (Red / Amber / Green) status — a colour-coded measure with NO influence
 * on the numeric score (e.g. Decarbonisation, Financial Strength). Shared by the
 * form and the consolidated / team / finalize tables.
 */
export type RAG = 'red' | 'amber' | 'green'

export const RAG_OPTIONS: RAG[] = ['red', 'amber', 'green']

export const RAG_META: Record<RAG, { label: string; dot: string; chip: string }> = {
  red:   { label: 'Red',   dot: 'bg-red-500',     chip: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800' },
  amber: { label: 'Amber', dot: 'bg-amber-500',   chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
  green: { label: 'Green', dot: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
}

function isRAG(v: string | null | undefined): v is RAG {
  return v === 'red' || v === 'amber' || v === 'green'
}

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
