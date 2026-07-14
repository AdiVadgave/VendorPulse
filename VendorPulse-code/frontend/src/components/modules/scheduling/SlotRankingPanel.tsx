import { useState } from 'react'
import { Cpu, Info, AlertCircle, ChevronDown } from 'lucide-react'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import SlotCard from './SlotCard'
import ManualScheduleControl from './ManualScheduleControl'
import type { SlotProposal } from '@/types/scheduling.types'
import type { AgentStatus } from '@/types/agent.types'
import { approveSlot } from '@/lib/schedulingApi'
import { SCHEDULING_CONFIG } from '@/config/scheduling.config'

type TimeZoneView = 'IST' | 'UTC' | 'GMT'

interface SlotRankingPanelProps {
  cycleId: string
  slots: SlotProposal[]
  onSlotApproved: (slotId: string, timeZone: TimeZoneView) => void
  onBackToAttendees: () => void
  /** Manual override: meeting scheduled at a coordinator-chosen time via Graph. */
  onManualScheduled: (slot: SlotProposal, timeZone: TimeZoneView, teamsUrl: string | null) => void
}

export default function SlotRankingPanel({
  cycleId,
  slots,
  onSlotApproved,
  onBackToAttendees,
  onManualScheduled,
}: SlotRankingPanelProps) {
  const PAGE_SIZE = SCHEDULING_CONFIG.PAGE_SIZE

  const [agentStatus] = useState<AgentStatus>('complete')
  const [processingSlotId, setProcessingSlotId] = useState<string | null>(null)
  const [approveError, setApproveError] = useState<string | null>(null)
  const [timeZoneView, setTimeZoneView] = useState<TimeZoneView>('IST')
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE)

  async function handleApprove(slotId: string) {
    setProcessingSlotId(slotId)
    setApproveError(null)
    try {
      await approveSlot(cycleId, slotId, 'coordinator', timeZoneView)
      onSlotApproved(slotId, timeZoneView)
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : 'Failed to approve slot')
    } finally {
      setProcessingSlotId(null)
    }
  }

  return (
    <div className="space-y-4 fade-in">
      {/* Header card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center shrink-0">
              <Cpu size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                Slot Ranking
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              </p>
            </div>
          </div>
          <AgentStatusBadge status={agentStatus} />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Need to change attendees before approving a slot? Go back and edit the list.
          </div>
          <div className="flex items-center gap-2">
            <select
              value={timeZoneView}
              onChange={(e) => setTimeZoneView(e.target.value as TimeZoneView)}
              className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="IST">IST</option>
              <option value="UTC">UTC</option>
              <option value="GMT">GMT</option>
            </select>
            <button
              type="button"
              onClick={onBackToAttendees}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Back to Attendees
            </button>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-start gap-2">
          <Info size={14} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          {slots.length === 0 ? (
            <p className="text-xs text-blue-700 dark:text-blue-400">
              No viable slots were found for the selected attendees and date range. Go back and adjust the
              attendee list, date range, duration, or timezone, then search again.
            </p>
          ) : (
            <p className="text-xs text-blue-700 dark:text-blue-400">
              The scheduling agent has analysed availability for all {slots[0]?.total_attendees ?? 'the selected'} attendees
              and ranked {slots.length} viable slot{slots.length !== 1 ? 's' : ''}. Ranking uses hard constraints
              (organiser &amp; exec sponsor availability) and soft scores
              (attendance coverage, timezone suitability).{' '}
              {slots.length > PAGE_SIZE
                ? `Showing the top ${Math.min(visibleCount, slots.length)} — use "Show more" to see additional options.`
                : 'Select a slot to generate a calendar invite draft.'}
            </p>
          )}
        </div>

        {approveError && (
          <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            {approveError}
          </div>
        )}
      </div>

      {/* Slot cards */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {slots.slice(0, visibleCount).map((slot, idx) => (
          <SlotCard
            key={slot.slot_id}
            slot={slot}
            rank={idx + 1}
            onApprove={handleApprove}
            isProcessing={processingSlotId === slot.slot_id}
            timeZoneView={timeZoneView}
          />
        ))}
      </div>

      {/* Manual override — bypass the recommendations and set your own time */}
      <ManualScheduleControl
        cycleId={cycleId}
        mode="schedule"
        defaultTimeZone={timeZoneView}
        onScheduled={onManualScheduled}
      />

      {/* Load more */}
      {visibleCount < slots.length && (
        <div className="flex flex-col items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, slots.length))}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
          >
            <ChevronDown size={15} />
            Show {Math.min(PAGE_SIZE, slots.length - visibleCount)} more slot
            {Math.min(PAGE_SIZE, slots.length - visibleCount) !== 1 ? 's' : ''}
          </button>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Showing {Math.min(visibleCount, slots.length)} of {slots.length} slots
          </p>
        </div>
      )}
    </div>
  )
}
