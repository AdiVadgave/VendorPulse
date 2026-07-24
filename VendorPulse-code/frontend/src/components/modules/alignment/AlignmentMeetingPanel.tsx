import { useState } from 'react'
import ScheduleAlignmentMeeting from './ScheduleAlignmentMeeting'
import type { AlignmentMeetingResult } from './ScheduleAlignmentMeeting'
import TranscriptInput from '@/components/modules/meeting/TranscriptInput'
import type { MeetingNote } from '@/types/meeting.types'
import type { ExtractedAction } from '@/types/alignment.types'

interface Props {
  cycleId: string
  /** 1-based alignment-meeting index (a cycle can have several). */
  index: number
  vendorName: string
  quarter: string
  year: number
  /** Final QBR date — alignment slots end the day before it. */
  qbrMeetingDate?: string | null
  /** Bubble action items parsed from this meeting's transcript to the shared log. */
  onActionsExtracted?: (actions: ExtractedAction[]) => void
  /** True when this meeting already contributed action items (persisted queue) — so
   *  the transcript panel doesn't re-prompt for an upload that already happened. */
  alreadyExtracted?: boolean
}

/**
 * One internal-alignment meeting: schedule it (manual time), paste its transcript,
 * and extract action items. Meeting minutes are generated only in the final Meeting
 * section — not here. Each instance is scoped by its 1-based index so a cycle can
 * run several independent alignment meetings.
 */
export default function AlignmentMeetingPanel({ cycleId, index, onActionsExtracted, alreadyExtracted, qbrMeetingDate }: Props) {
  const [meetingResult, setMeetingResult] = useState<AlignmentMeetingResult | null>(null)

  function handleParsed(parsed: MeetingNote[]) {
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
        meetingResult={meetingResult}
        onMeetingScheduled={setMeetingResult}
        qbrMeetingDate={qbrMeetingDate}
      />
      <TranscriptInput
        cycleId={cycleId}
        meetingId={`align-${cycleId}-${index}`}
        onParsed={handleParsed}
        alreadyExtracted={alreadyExtracted}
      />
    </div>
  )
}
