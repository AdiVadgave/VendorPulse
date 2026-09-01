import { useEffect, useState } from 'react'
import ScheduleAlignmentMeeting from './ScheduleAlignmentMeeting'
import type { AlignmentMeetingResult } from './ScheduleAlignmentMeeting'
import TranscriptInput from '@/components/modules/meeting/TranscriptInput'
import MeetingMinutesViewer from '@/components/modules/meeting/MeetingMinutesViewer'
import { getMeetingArtifact } from '@/lib/meetingApi'
import type { MeetingNote, MeetingMinutes } from '@/types/meeting.types'
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
  /** Fired when this alignment meeting is scheduled (or recovered as scheduled) — the
   *  parent advances the workflow so Vendor Prep unlocks without waiting for the
   *  transcript to be parsed. Idempotent (the store advance is forward-only). */
  onScheduled?: () => void
}

/**
 * One internal-alignment meeting: schedule it (manual time), paste its transcript,
 * and extract action items. Meeting minutes are generated only in the final Meeting
 * section — not here. Each instance is scoped by its 1-based index so a cycle can
 * run several independent alignment meetings.
 */
export default function AlignmentMeetingPanel({ cycleId, index, vendorName, quarter, year, onActionsExtracted, alreadyExtracted, qbrMeetingDate, onScheduled }: Props) {
  const [meetingResult, setMeetingResult] = useState<AlignmentMeetingResult | null>(null)
  // Parsed transcript notes + any previously-generated MoM for THIS alignment meeting.
  const meetingId = `align-${cycleId}-${index}`
  const [parsedNotes, setParsedNotes] = useState<MeetingNote[]>([])
  const [savedMinutes, setSavedMinutes] = useState<MeetingMinutes | null>(null)

  // Restore the parsed notes + minutes for this meeting on mount so the MoM survives a refresh.
  useEffect(() => {
    let cancelled = false
    getMeetingArtifact(cycleId, meetingId)
      .then((a) => {
        if (cancelled) return
        if (a.notes?.length) setParsedNotes(a.notes)
        if (a.minutes) setSavedMinutes(a.minutes)
      })
      .catch(() => { /* backend offline / never parsed */ })
    return () => { cancelled = true }
  }, [cycleId, meetingId])

  function handleParsed(parsed: MeetingNote[]) {
    setParsedNotes(parsed)
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
        onMeetingScheduled={(result) => { setMeetingResult(result); onScheduled?.() }}
        qbrMeetingDate={qbrMeetingDate}
      />
      <TranscriptInput
        cycleId={cycleId}
        meetingId={meetingId}
        onParsed={handleParsed}
        alreadyExtracted={alreadyExtracted}
      />
      {/* Generate the minutes (MoM) for this alignment meeting once its transcript is parsed. */}
      {(parsedNotes.length > 0 || savedMinutes) && (
        <MeetingMinutesViewer
          cycleId={cycleId}
          meetingId={meetingId}
          heading={`Alignment Meeting ${index} Minutes`}
          notes={parsedNotes}
          initialMinutes={savedMinutes}
          vendorName={vendorName}
          quarter={quarter}
          year={year}
          onApproved={() => { /* per-meeting MoM — no workflow gate */ }}
        />
      )}
    </div>
  )
}
