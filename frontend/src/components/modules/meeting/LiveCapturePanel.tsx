import { useState } from 'react'
import { ExternalLink, Plus, Radio } from 'lucide-react'
import type { MeetingNote, NoteType } from '@/types/meeting.types'
import { NOTE_TYPE_LABELS, NOTE_TYPE_COLORS } from '@/types/meeting.types'
import { cn } from '@/utils/cn'

interface Props {
  notes: MeetingNote[]
  onAdd: (note: Omit<MeetingNote, 'note_id' | 'meeting_id'>) => void
  teamsMeetingUrl?: string | null
}

const NOTE_TYPES: NoteType[] = ['QUESTION', 'OBJECTION', 'DECISION', 'APPRECIATION', 'ACTION']

export default function LiveCapturePanel({ notes, onAdd, teamsMeetingUrl }: Props) {
  const [selectedType, setSelectedType] = useState<NoteType>('QUESTION')
  const [content, setContent] = useState('')
  const [raisedBy, setRaisedBy] = useState('')
  const [isLive, setIsLive] = useState(false)

  function handleStartMeeting() {
    // Mirrors the "Open Teams Meeting" flow from the Internal Alignment tab — open
    // the Graph-returned join URL in a new tab before flipping into LIVE capture mode.
    if (!isLive && teamsMeetingUrl) {
      window.open(teamsMeetingUrl, '_blank', 'noopener,noreferrer')
    }
    setIsLive((prev) => !prev)
  }

  function handleAdd() {
    if (!content.trim()) return
    const now = new Date()
    onAdd({
      note_type: selectedType,
      content: content.trim(),
      raised_by: raisedBy.trim() || 'Facilitator',
      timestamp: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
    })
    setContent('')
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio size={15} className={cn(isLive ? 'text-red-500 animate-pulse' : 'text-slate-400')} />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Live Capture</h3>
        </div>
        <button
          onClick={handleStartMeeting}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors',
            isLive
              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
          )}
          title={!isLive && teamsMeetingUrl ? 'Opens the Teams meeting in a new tab' : undefined}
        >
          {isLive ? (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          ) : teamsMeetingUrl ? (
            <ExternalLink size={11} />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          )}
          {isLive ? 'LIVE' : 'Start Meeting'}
        </button>
      </div>

      {/* Note type selector */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex gap-1.5 overflow-x-auto">
        {NOTE_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setSelectedType(type)}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all border',
              selectedType === type
                ? NOTE_TYPE_COLORS[type]
                : 'border-transparent bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            )}
          >
            {NOTE_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex gap-2 mb-2">
          <input
            value={raisedBy}
            onChange={(e) => setRaisedBy(e.target.value)}
            placeholder="Raised by..."
            className="w-36 text-xs bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-400"
          />
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder={`Log ${NOTE_TYPE_LABELS[selectedType].toLowerCase()}...`}
            className="flex-1 text-sm bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-400"
          />
          <button
            onClick={handleAdd}
            disabled={!content.trim()}
            className="flex items-center gap-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Plus size={13} />
            Log
          </button>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">Press Enter to log quickly</p>
      </div>

      {/* Note feed */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
        {notes.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
            No notes yet. Start the meeting and log items above.
          </div>
        ) : (
          [...notes].reverse().map((note) => (
            <div key={note.note_id} className="px-4 py-3 flex items-start gap-3">
              <span className="text-xs text-slate-400 dark:text-slate-500 font-mono shrink-0 mt-0.5">
                {note.timestamp}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={cn('px-1.5 py-0.5 rounded text-xs font-semibold border', NOTE_TYPE_COLORS[note.note_type])}>
                    {NOTE_TYPE_LABELS[note.note_type]}
                  </span>
                  {note.raised_by && (
                    <span className="text-xs text-slate-400 dark:text-slate-500">{note.raised_by}</span>
                  )}
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300">{note.content}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
