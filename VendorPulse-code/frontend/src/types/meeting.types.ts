export type NoteType = 'QUESTION' | 'OBJECTION' | 'DECISION' | 'APPRECIATION' | 'ACTION'

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  QUESTION: 'Question',
  OBJECTION: 'Objection',
  DECISION: 'Decision',
  APPRECIATION: 'Appreciation',
  ACTION: 'Action Item',
}

export const NOTE_TYPE_COLORS: Record<NoteType, string> = {
  QUESTION: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
  OBJECTION: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
  DECISION: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
  APPRECIATION: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
  ACTION: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800',
}

export interface MeetingNote {
  note_id: string
  meeting_id: string
  note_type: NoteType
  content: string
  raised_by: string
  timestamp: string
}

export interface MeetingMinutes {
  minutes_id: string
  meeting_id: string
  cycle_id: string
  meeting_date: string
  attendees: string[]
  executive_summary: string
  agenda_summaries: { topic: string; summary: string }[]
  key_decisions: string[]
  qa_log: { question: string; raised_by: string; response: string }[]
  action_items: { description: string; owner: string; due_date: string }[]
  generated_at: string
}
