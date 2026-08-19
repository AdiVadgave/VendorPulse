export type RAG = 'red' | 'amber' | 'green'

export const RAG_OPTIONS: RAG[] = ['red', 'amber', 'green']

export const RAG_META: Record<RAG, { label: string; dot: string; chip: string }> = {
  red:   { label: 'Red',   dot: 'bg-red-500',     chip: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800' },
  amber: { label: 'Amber', dot: 'bg-amber-500',   chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
  green: { label: 'Green', dot: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
}

export function isRAG(v: string | null | undefined): v is RAG {
  return v === 'red' || v === 'amber' || v === 'green'
}
