import { useState } from 'react'
import ScheduleAlignmentMeeting from './ScheduleAlignmentMeeting'
import type { AlignmentMeetingResult } from './ScheduleAlignmentMeeting'
import TranscriptInput from '@/components/modules/meeting/TranscriptInput'
import MeetingMinutesViewer from '@/components/modules/meeting/MeetingMinutesViewer'
import type { SlotProposal } from '@/types/scheduling.types'
import type { MeetingNote } from '@/types/meeting.types'
import type { ExtractedAction } from '@/types/alignment.types'

interface Props {
  cycleId: string
  /** 1-based alignment-meeting index (a cycle can have several). */
  index: number
  vendorName: string
  quarter: string
  year: number
  /** Bubble action items parsed from this meeting's transcript to the shared log. */
  onActionsExtracted?: (actions: ExtractedAction[]) => void
  /** True when this meeting already contributed action items (persisted queue) — so
   *  the transcript panel doesn't re-prompt for an upload that already happened. */
  alreadyExtracted?: boolean
}

/**
 * One internal-alignment meeting: schedule it (Teams via Graph), paste its
 * transcript, and generate AI minutes + action items. Each instance is scoped by
 * its 1-based index so a cycle can run several independent alignment meetings.
 */
export default function AlignmentMeetingPanel({ cycleId, index, vendorName, quarter, year, onActionsExtracted, alreadyExtracted }: Props) {
  const [slots, setSlots] = useState<SlotProposal[]>([])
  const [meetingResult, setMeetingResult] = useState<AlignmentMeetingResult | null>(null)
  const [notes, setNotes] = useState<MeetingNote[]>([])

  function handleParsed(parsed: MeetingNote[]) {
    setNotes(parsed)
    const actions: ExtractedAction[] = parsed
      .filter((n) => n.note_type === 'ACTION')
      .map((n, i) => ({
        action_id: n.note_id || `align-${index}-act-${i}`,
        description: n.content,
        owner: n.raised_by || 'TBD',
        due_date: null,
        source: 'alignment',
        status: 'OPEN',
      }))
    if (actions.length && onActionsExtracted) onActionsExtracted(actions)
  }

  return (
    <div className="space-y-5">
      <ScheduleAlignmentMeeting
        cycleId={cycleId}
        meetingIndex={index}
        slots={slots}
        meetingResult={meetingResult}
        onSlotsFound={setSlots}
        onMeetingScheduled={setMeetingResult}
      />
      <TranscriptInput
        cycleId={cycleId}
        meetingId={`align-${cycleId}-${index}`}
        onParsed={handleParsed}
        alreadyExtracted={alreadyExtracted}
      />
      {notes.length > 0 && (
        <MeetingMinutesViewer
          cycleId={cycleId}
          notes={notes}
          vendorName={vendorName}
          quarter={quarter}
          year={year}
          onApproved={() => { /* per-meeting minutes approved */ }}
        />
      )}
    </div>
  )
}
