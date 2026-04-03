import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import {
  CalendarClock,
  ClipboardList,
  GitMerge,
  Package,
  Video,
  ListChecks,
  LayoutDashboard,
  Lock,
  CheckCircle2,
  Building2,
  Clock,
} from 'lucide-react'
import { format } from 'date-fns'
import { getMockCycleById as getMockCycleById } from '@/mock/cycles.mock'
import {
  MOCK_ATTENDEES_INITIAL,
  MOCK_SLOT_PROPOSALS,
  MOCK_ATTENDEES_RSVP,
} from '@/mock/scheduling.mock'
import { fetchAttendees } from '@/lib/schedulingApi'
import {
  MOCK_SCORECARD_SUBMISSIONS,
  MOCK_COMPILED_SCORES,
} from '@/mock/scorecard.mock'
import {
  MOCK_SCORE_DELTAS,
  MOCK_ALIGNMENT_FLAGS,
  MOCK_FACE_OFF,
  MOCK_ALIGNMENT_ACTIONS,
} from '@/mock/alignment.mock'
import {
  MOCK_PUSHBACK_ITEMS,
  MOCK_PUSHBACK_RESPONSES,
  MOCK_VENDOR_BRIEF,
} from '@/mock/vendor-prep.mock'
import {
  MOCK_MEETING_NOTES,
  MOCK_MEETING_ACTIONS,
} from '@/mock/meeting.mock'
import { MOCK_ALL_ACTIONS } from '@/mock/analytics.mock'

import WorkflowProgressBar from '@/components/shared/WorkflowProgressBar'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import AttendeeRefreshPanel from '@/components/modules/scheduling/AttendeeRefreshPanel'
import SlotRankingPanel from '@/components/modules/scheduling/SlotRankingPanel'
import InviteApprovalPanel from '@/components/modules/scheduling/InviteApprovalPanel'
import ConfirmationTracker from '@/components/modules/scheduling/ConfirmationTracker'

import ScorecardDispatchPanel from '@/components/modules/scorecard/ScorecardDispatchPanel'
import SubmissionTracker from '@/components/modules/scorecard/SubmissionTracker'
import CompiledScorecardTable from '@/components/modules/scorecard/CompiledScorecardTable'

import ChangeHighlightsPanel from '@/components/modules/alignment/ChangeHighlightsPanel'
import AlignmentFlagsPanel from '@/components/modules/alignment/AlignmentFlagsPanel'
import FaceOffModelEditor from '@/components/modules/alignment/FaceOffModelEditor'
import NotesInputPanel from '@/components/modules/alignment/NotesInputPanel'

import VendorBriefPanel from '@/components/modules/vendor-prep/VendorBriefPanel'
import PushbackInput from '@/components/modules/vendor-prep/PushbackInput'
import PushbackResponseCards from '@/components/modules/vendor-prep/PushbackResponseCards'
import UnresolvedItemTracker from '@/components/modules/vendor-prep/UnresolvedItemTracker'

import MeetingBriefingCard from '@/components/modules/meeting/MeetingBriefingCard'
import LiveCapturePanel from '@/components/modules/meeting/LiveCapturePanel'
import TranscriptInput from '@/components/modules/meeting/TranscriptInput'
import MeetingMinutesViewer from '@/components/modules/meeting/MeetingMinutesViewer'

import ActionLog from '@/components/shared/ActionLog'
import EmptyState from '@/components/shared/EmptyState'
import { cn } from '@/utils/cn'
import type { TabKey, WorkflowState } from '@/utils/constants'
import { WORKFLOW_STATES, TAB_LABELS, TAB_MIN_STATE_INDEX } from '@/utils/constants'
import { apiFetch } from '@/lib/api'
import { useCycleStore } from '@/store/useCycleStore'
import type { GovernanceCycle } from '@/types/cycle.types'
import type { SchedulingPhase, CycleAttendee } from '@/types/scheduling.types'
import type { StakeholderSubmission } from '@/types/scorecard.types'
import type { ExtractedAction } from '@/types/alignment.types'
import type { VendorBrief, PushbackItem, PushbackResponse } from '@/types/vendor-prep.types'
import type { MeetingNote } from '@/types/meeting.types'

const TAB_ICONS: Record<TabKey, React.ReactNode> = {
  overview:      <LayoutDashboard size={14} />,
  scheduling:    <CalendarClock size={14} />,
  scorecard:     <ClipboardList size={14} />,
  alignment:     <GitMerge size={14} />,
  'vendor-prep': <Package size={14} />,
  meeting:       <Video size={14} />,
  actions:       <ListChecks size={14} />,
}

function getInitialSchedulingPhase(state: string): SchedulingPhase {
  const idx = WORKFLOW_STATES.indexOf(state as never)
  if (idx >= WORKFLOW_STATES.indexOf('MEETING_SCHEDULED')) return 'confirmation_tracking'
  if (idx >= WORKFLOW_STATES.indexOf('AVAILABILITY_COLLECTED')) return 'slot_ranking'
  return 'attendee_refresh'
}

const SCHEDULING_STEPS: { key: SchedulingPhase; label: string }[] = [
  { key: 'attendee_refresh', label: 'Attendees' },
  { key: 'slot_ranking', label: 'Slot Ranking' },
  { key: 'invite_approval', label: 'Invite Approval' },
  { key: 'confirmation_tracking', label: 'Confirmation' },
]
const PHASE_ORDER: SchedulingPhase[] = [
  'attendee_refresh', 'slot_ranking', 'invite_approval', 'confirmation_tracking',
]

export default function CycleDetail() {
  const { cycleId } = useParams<{ cycleId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  // Store-driven: covers both mock cycles and API-created cycles
  const storeWorkflowState = useCycleStore((s) => cycleId ? s.workflowStates[cycleId] : undefined)
  const advanceWorkflow = useCycleStore((s) => s.advanceWorkflow)
  const addCycle = useCycleStore((s) => s.addCycle)
  const storeCycle = useCycleStore((s) => cycleId ? s.getCycleById(cycleId) : undefined)

  // If not in store/mock, fetch from API (handles direct URL navigation after refresh)
  useEffect(() => {
    if (!cycleId || storeCycle || getMockCycleById(cycleId)) return
    apiFetch<{ cycle: GovernanceCycle }>(`/api/cycles/${cycleId}`)
      .then(({ cycle: remote }) => addCycle(remote))
      .catch(() => {/* cycle not found — will show empty state */})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId])

  // Store takes precedence (includes API-created cycles); fall back to mock
  const cycle = storeCycle ?? (cycleId ? getMockCycleById(cycleId) : undefined)
  const tabParam = (searchParams.get('tab') as TabKey) ?? 'overview'
  const [activeTab, setActiveTab] = useState<TabKey>(tabParam)

  // --- Module A state ---
  const [schedulingPhase, setSchedulingPhase] = useState<SchedulingPhase>(() =>
    cycle ? getInitialSchedulingPhase(cycle.workflow_state) : 'attendee_refresh'
  )
  // For mock cycles pre-seed attendees; for new API-created cycles start empty
  const isMockCycle = cycleId ? !!getMockCycleById(cycleId) : false
  const [schedulingAttendees, setSchedulingAttendees] = useState<CycleAttendee[]>(
    isMockCycle ? MOCK_ATTENDEES_INITIAL : []
  )
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [apiSlots, setApiSlots] = useState<SlotProposal[]>([])
  const [teamsMeetingId, setTeamsMeetingId] = useState<string | null>(null)
  // Real slot proposals fetched from API for new (non-mock) cycles
  const [apiSlotProposals, setApiSlotProposals] = useState<typeof MOCK_SLOT_PROPOSALS>([])

  // --- Module B state ---
  const [scorecardDispatched, setScorecardDispatched] = useState(false)
  const [submissionsSimulated, setSubmissionsSimulated] = useState(false)
  const [submissions] = useState<StakeholderSubmission[]>(MOCK_SCORECARD_SUBMISSIONS)

  // --- Module C state ---
  const [alignmentActions, setAlignmentActions] = useState<ExtractedAction[]>(MOCK_ALIGNMENT_ACTIONS)

  const WHAT_CHANGED_BULLETS = [
    'Innovation score increased by 1.0 points to 4.0 — strongest performing category this cycle.',
    'Delivery Quality improved by +0.83 points — consistent delivery progress from Q4 2025.',
    'Communication score dipped slightly by −0.33 points — escalation handling noted as a concern.',
    'SLA Compliance improved by +0.67 points despite the February incident dispute.',
    'Internal alignment flag raised: Innovation spread of 3 points between stakeholders — resolve before vendor call.',
  ]

  // --- Module D state ---
  const [vendorBrief, setVendorBrief] = useState<VendorBrief | null>(
    cycle?.workflow_state === 'POST_MEETING_COMPLETE' ? MOCK_VENDOR_BRIEF : null
  )
  const [, setBriefApproved] = useState(cycle?.workflow_state === 'POST_MEETING_COMPLETE')
  const [pushbackItems, setPushbackItems] = useState<PushbackItem[]>(MOCK_PUSHBACK_ITEMS)
  const [pushbackResponses, setPushbackResponses] = useState<Record<string, PushbackResponse[]>>(MOCK_PUSHBACK_RESPONSES)

  // --- Module E state ---
  const [meetingNotes, setMeetingNotes] = useState<MeetingNote[]>(
    cycle?.workflow_state === 'POST_MEETING_COMPLETE' ? MOCK_MEETING_NOTES : []
  )
  const [minutesApproved, setMinutesApproved] = useState(false)
  const [allActions, setAllActions] = useState(
    cycle?.workflow_state === 'POST_MEETING_COMPLETE'
      ? MOCK_ALL_ACTIONS
      : alignmentActions.map(a => ({ ...a, cycle_ref: '' }))
  )

  useEffect(() => {
    setSearchParams({ tab: activeTab }, { replace: true })
  }, [activeTab, setSearchParams])

  // Reload persisted attendees from backend on refresh for all cycles
  useEffect(() => {
    if (!cycleId) return
    apiFetch<{ attendees: CycleAttendee[] }>(`/api/cycles/${cycleId}/attendees`)
      .then(({ attendees }) => {
        if (attendees.length > 0) setSchedulingAttendees(attendees)
      })
      .catch(() => {/* backend offline — keep existing state */})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId])

  // Load persisted slot proposals on mount so page refreshes don't lose ranked slots
  useEffect(() => {
    if (!cycleId || isMockCycle) return
    apiFetch<{ proposals: typeof MOCK_SLOT_PROPOSALS }>(`/api/cycles/${cycleId}/scheduling/slots`)
      .then(({ proposals }) => {
        if (proposals && proposals.length > 0) {
          setApiSlotProposals(proposals)
          setSchedulingPhase('slot_ranking')
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId])

  if (!cycle) {
    return (
      <div className="p-6">
        <EmptyState
          title="Cycle not found"
          description="The requested governance cycle does not exist."
          action={
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Back to Dashboard
            </button>
          }
        />
      </div>
    )
  }

  // Derive current workflow state: store override takes precedence over static mock
  const workflowState: WorkflowState = storeWorkflowState ?? cycle.workflow_state
  const currentStateIndex = WORKFLOW_STATES.indexOf(workflowState)

  function changeTab(tab: TabKey) {
    const minIndex = TAB_MIN_STATE_INDEX[tab]
    if (currentStateIndex < minIndex) return
    setActiveTab(tab)
  }

  // Always use API-returned slot proposals (populated after rank-slots call)
  const slotPool = apiSlotProposals
  const selectedSlot = slotPool.find((s) => s.slot_id === selectedSlotId) ?? slotPool[0]

  // Module A: advance workflow state as scheduling progresses
  async function advanceScheduling(next: SchedulingPhase, attendees?: CycleAttendee[]) {
    setSchedulingPhase(next)
    if (next === 'slot_ranking' && cycleId) {
      advanceWorkflow(cycle!.cycle_id, 'AVAILABILITY_COLLECTED')
      // Rank slots based on actual selected attendees from the backend
      const atts = attendees ?? schedulingAttendees
      const attsWithUserId = atts.filter((a) => a.user_id)
      if (attsWithUserId.length > 0) {
        try {
          const today = new Date()
          const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)
          const start = tomorrow.toISOString().slice(0, 10)
          const end = new Date(today.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
          // Identify organiser (VMO_COORDINATOR) and exec sponsor (EGB_CHAIR) from selected attendees
          const organiser = attsWithUserId.find((a) => a.role === 'VMO_COORDINATOR') ?? attsWithUserId[0]
          const execSponsor = attsWithUserId.find((a) => a.role === 'EGB_CHAIR') ?? attsWithUserId[1] ?? attsWithUserId[0]
          const result = await apiFetch<{ data?: { proposals: typeof MOCK_SLOT_PROPOSALS }; proposals?: typeof MOCK_SLOT_PROPOSALS }>(
            `/api/cycles/${cycleId}/scheduling/rank-slots`,
            {
              method: 'POST',
              body: JSON.stringify({
                cycle_id: cycleId,
                attendee_user_ids: attsWithUserId.map((a) => a.user_id),
                attendee_names: Object.fromEntries(attsWithUserId.map(a => [a.user_id!, a.name])),
                attendee_key_flags: Object.fromEntries(attsWithUserId.map(a => [a.user_id!, a.is_key])),
                organiser_id: organiser?.user_id ?? '',
                exec_sponsor_id: execSponsor?.user_id ?? '',
                date_range_start: start,
                date_range_end: end,
              }),
            }
          )
          const proposals = result.data?.proposals ?? (result as unknown as { proposals: typeof MOCK_SLOT_PROPOSALS }).proposals ?? []
          setApiSlotProposals(proposals)
        } catch {
          // Backend unavailable — stay with empty slots
          setApiSlotProposals([])
        }
      }
    }
    if (next === 'confirmation_tracking') {
      advanceWorkflow(cycle!.cycle_id, 'MEETING_SCHEDULED')
    }
  }

  // Module B: advance to SCORECARD_COMPILED when submissions are simulated
  function handleSimulateSubmissions() {
    setSubmissionsSimulated(true)
    advanceWorkflow(cycle!.cycle_id, 'SCORECARD_COMPILED')
  }

  function handlePushbackAdd(item: Omit<PushbackItem, 'pushback_id' | 'cycle_id' | 'created_at'>) {
    const newItem: PushbackItem = {
      ...item,
      pushback_id: `pb${pushbackItems.length + 1}`,
      cycle_id: cycle!.cycle_id,
      created_at: new Date().toISOString(),
    }
    setPushbackItems((prev) => [...prev, newItem])
  }

  function handlePushbackStatusChange(id: string, status: PushbackItem['status']) {
    setPushbackItems((prev) => prev.map((p) => (p.pushback_id === id ? { ...p, status } : p)))
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function handleGeneratePushbackResponses(_id: string) {
    // Responses already seeded via mock
  }

  function handleSelectPushbackResponse(pushbackId: string, responseId: string) {
    setPushbackResponses((prev) => ({
      ...prev,
      [pushbackId]: (prev[pushbackId] ?? []).map((r) => ({
        ...r,
        is_selected: r.response_id === responseId,
      })),
    }))
  }

  function handleNoteAdd(note: Omit<MeetingNote, 'note_id' | 'meeting_id'>) {
    const newNote: MeetingNote = {
      ...note,
      note_id: `mn${meetingNotes.length + 1}`,
      meeting_id: 'm1',
    }
    setMeetingNotes((prev) => [...prev, newNote])
  }

  function handleTranscriptParsed(notes: MeetingNote[]) {
    setMeetingNotes(notes)
  }

  // Module E: advance to POST_MEETING_COMPLETE when minutes are approved
  function handleMinutesApproved() {
    setMinutesApproved(true)
    advanceWorkflow(cycle!.cycle_id, 'POST_MEETING_COMPLETE')
    const newActions = MOCK_MEETING_ACTIONS.map(a => ({ ...a, cycle_ref: `${cycle!.vendor_name} ${cycle!.quarter} ${cycle!.year}` }))
    setAllActions((prev) => {
      const existing = prev.map(a => a.action_id)
      const fresh = newActions.filter(a => !existing.includes(a.action_id))
      return [...prev, ...fresh]
    })
  }

  function handleActionStatusChange(id: string, status: ExtractedAction['status']) {
    setAllActions((prev) => prev.map((a) => (a.action_id === id ? { ...a, status } : a)))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Cycle header bar — sticky so progress bar stays visible on scroll */}
      <div className="sticky top-0 z-10 px-6 pt-4 pb-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center shrink-0">
            <Building2 size={18} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white text-sm">
              {cycle.vendor_name}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{cycle.quarter} {cycle.year}</span>
              <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
              <span>EGB/QBR Governance Cycle</span>
              <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
              <Clock size={11} />
              <span>Updated {format(new Date(cycle.updated_at), 'd MMM yyyy')}</span>
            </div>
          </div>
        </div>

        {/* Workflow progress bar — always visible above tabs */}
        <div className="mb-3 px-1">
          <WorkflowProgressBar currentState={workflowState} compact />
        </div>

        <div className="flex items-center gap-0.5 overflow-x-auto">
          {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => {
            const minIndex = TAB_MIN_STATE_INDEX[tab]
            const isLocked = currentStateIndex < minIndex
            const isActive = activeTab === tab
            return (
              <button
                key={tab}
                onClick={() => changeTab(tab)}
                disabled={isLocked}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  isActive
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                    : isLocked
                      ? 'border-transparent text-slate-300 dark:text-slate-600 cursor-not-allowed'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                )}
              >
                {TAB_ICONS[tab]}
                {TAB_LABELS[tab]}
                {isLocked && <Lock size={11} className="ml-0.5" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'overview' && (
          <OverviewTab cycle={cycle} currentStateIndex={currentStateIndex} />
        )}

        {activeTab === 'scheduling' && (
          <SchedulingTab
            cycle={cycle}
            schedulingPhase={schedulingPhase}
            attendees={schedulingAttendees}
            slots={slotPool}
            selectedSlot={selectedSlot}
            onPhaseChange={advanceScheduling}
            onAttendeesUpdated={setSchedulingAttendees}
            onSlotsReceived={setApiSlots}
            onSlotSelected={setSelectedSlotId}
            teamsMeetingId={teamsMeetingId}
            onTeamsMeetingCreated={setTeamsMeetingId}
            isMockCycle={isMockCycle}
            onScorecardProceed={() => {
              advanceWorkflow(cycle!.cycle_id, 'SCORECARD_REQUEST_SENT')
              changeTab('scorecard')
            }}
          />
        )}

        {activeTab === 'scorecard' && (
          <ScorecardTab
            cycle={cycle}
            dispatched={scorecardDispatched}
            onDispatched={() => setScorecardDispatched(true)}
            submissions={submissions}
            simulated={submissionsSimulated}
            onSimulate={handleSimulateSubmissions}
          />
        )}

        {activeTab === 'alignment' && (
          <AlignmentTab
            cycle={cycle}
            whatChangedBullets={WHAT_CHANGED_BULLETS}
            actions={alignmentActions}
            onActionsExtracted={(extracted) => {
              setAlignmentActions(extracted)
              setAllActions((prev) => {
                const existing = prev.map(a => a.action_id)
                const fresh = extracted.filter(a => !existing.includes(a.action_id)).map(a => ({ ...a, cycle_ref: `${cycle.vendor_name} ${cycle.quarter} ${cycle.year}` }))
                return [...prev, ...fresh]
              })
              // Module C: advance to INTERNAL_ALIGNMENT when actions are extracted
              advanceWorkflow(cycle!.cycle_id, 'INTERNAL_ALIGNMENT')
            }}
          />
        )}

        {activeTab === 'vendor-prep' && (
          <VendorPrepTab
            cycle={cycle}
            vendorBrief={vendorBrief}
            onBriefGenerated={setVendorBrief}
            onBriefApproved={() => {
              setBriefApproved(true)
              // Module D: advance to VENDOR_PREP when brief is approved
              advanceWorkflow(cycle!.cycle_id, 'VENDOR_PREP')
            }}
            pushbackItems={pushbackItems}
            pushbackResponses={pushbackResponses}
            onPushbackAdd={handlePushbackAdd}
            onGenerateResponses={handleGeneratePushbackResponses}
            onSelectResponse={handleSelectPushbackResponse}
            onPushbackStatusChange={handlePushbackStatusChange}
          />
        )}

        {activeTab === 'meeting' && (
          <MeetingTab
            cycle={cycle}
            meetingNotes={meetingNotes}
            minutesApproved={minutesApproved}
            onNoteAdd={handleNoteAdd}
            onTranscriptParsed={handleTranscriptParsed}
            onMinutesApproved={handleMinutesApproved}
            allActions={allActions}
            onActionStatusChange={handleActionStatusChange}
          />
        )}

        {activeTab === 'actions' && (
          <ActionsTab
            actions={allActions}
            workflowState={workflowState}
            onStatusChange={handleActionStatusChange}
            onArchive={() => advanceWorkflow(cycle!.cycle_id, 'ARCHIVED')}
          />
        )}
      </div>
    </div>
  )
}

/* ── Overview Tab ─────────────────────────────────────────── */
function OverviewTab({
  cycle,
  currentStateIndex,
}: {
  cycle: NonNullable<ReturnType<typeof getMockCycleById>>
  currentStateIndex: number
}) {
  return (
    <div className="max-w-5xl mx-auto space-y-5">

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Cycle Progress', value: `${currentStateIndex + 1} / ${WORKFLOW_STATES.length}`, sub: 'workflow steps' },
          { label: 'Quarter', value: `${cycle.quarter} ${cycle.year}`, sub: 'governance cycle' },
          { label: 'Vendor', value: cycle.vendor_name, sub: 'IT Infrastructure' },
        ].map((card) => (
          <div key={card.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500 dark:text-slate-400">{card.label}</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{card.value}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Workflow Steps</h3>
        <div className="space-y-2">
          {WORKFLOW_STATES.map((state, idx) => (
            <div key={state} className="flex items-center gap-3">
              <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold',
                idx < currentStateIndex
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : idx === currentStateIndex
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
              )}>
                {idx < currentStateIndex ? <CheckCircle2 size={12} /> : idx + 1}
              </div>
              <span className={cn(
                'text-sm',
                idx < currentStateIndex ? 'text-slate-400 dark:text-slate-500 line-through'
                  : idx === currentStateIndex ? 'text-slate-900 dark:text-white font-medium'
                  : 'text-slate-500 dark:text-slate-400'
              )}>
                {state.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </span>
              {idx === currentStateIndex && (
                <span className="ml-auto text-xs bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 px-2 py-0.5 rounded-full font-medium">
                  Current
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Scheduling Tab ───────────────────────────────────────── */
function SchedulingTab({
  cycle, schedulingPhase, attendees, slots, selectedSlot, onPhaseChange, onAttendeesUpdated, onSlotSelected,
  teamsMeetingId, onTeamsMeetingCreated, isMockCycle, onScorecardProceed,
}: {
  cycle: NonNullable<ReturnType<typeof getMockCycleById>>
  schedulingPhase: SchedulingPhase
  attendees: CycleAttendee[]
  slots: typeof MOCK_SLOT_PROPOSALS
  selectedSlot: (typeof MOCK_SLOT_PROPOSALS)[0]
  onPhaseChange: (p: SchedulingPhase, attendees?: CycleAttendee[]) => void
  onAttendeesUpdated: (a: CycleAttendee[]) => void
  onSlotsReceived: (slots: SlotProposal[]) => void
  onSlotSelected: (id: string) => void
  teamsMeetingId: string | null
  onTeamsMeetingCreated: (id: string | null) => void
  isMockCycle: boolean
  onScorecardProceed: () => void
}) {
  const currentPhaseIndex = PHASE_ORDER.indexOf(schedulingPhase)
  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
        <div className="flex items-center">
          {SCHEDULING_STEPS.map((step, idx) => {
            const phaseIdx = PHASE_ORDER.indexOf(step.key)
            const isComplete = phaseIdx < currentPhaseIndex
            const isActive = phaseIdx === currentPhaseIndex
            const isUpcoming = phaseIdx > currentPhaseIndex
            return (
              <div key={step.key} className="flex items-center flex-1 min-w-0">
                <div className={cn(
                  'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium flex-1 justify-center transition-all',
                  isComplete && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
                  isActive && 'bg-indigo-600 text-white shadow-sm',
                  isUpcoming && 'bg-slate-50 text-slate-400 dark:bg-slate-800/50 dark:text-slate-600'
                )}>
                  {isComplete && <CheckCircle2 size={11} />}
                  <span className="truncate hidden sm:inline">{step.label}</span>
                  <span className="sm:hidden">{idx + 1}</span>
                </div>
                {idx < SCHEDULING_STEPS.length - 1 && (
                  <div className={cn('h-px w-4 shrink-0 mx-0.5', isComplete ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-slate-200 dark:bg-slate-700')} />
                )}
              </div>
            )
          })}
        </div>
      </div>
      {schedulingPhase === 'attendee_refresh' && (
        <AttendeeRefreshPanel
          cycleId={cycle.cycle_id}
          attendees={attendees}
          onAttendeesChanged={onAttendeesUpdated}
          onDispatchComplete={() => {}}
          onResponsesSimulated={(updated, rankedSlots) => {
            onAttendeesUpdated(updated)
            onPhaseChange('slot_ranking', updated)
          }}
        />
      )}
      {schedulingPhase === 'slot_ranking' && (
        <SlotRankingPanel
          slots={slots}
          attendeeCount={attendees.length}
          onSlotApproved={async (slotId) => {
            // Persist approval in the backend before advancing to invite step
            const organiser = attendees.find((a) => a.role === 'VMO_COORDINATOR' && a.user_id)
              ?? attendees.find((a) => a.user_id)
            const approverId = organiser?.user_id ?? 'u1'
            try {
              await apiFetch(`/api/cycles/${cycle.cycle_id}/scheduling/slots/${slotId}/approve`, {
                method: 'PUT',
                body: JSON.stringify({ approved_by: approverId }),
              })
            } catch { /* non-critical — proceed regardless */ }
            onSlotSelected(slotId)
            onPhaseChange('invite_approval')
          }}
        />
      )}
      {schedulingPhase === 'invite_approval' && selectedSlot && (
        <InviteApprovalPanel
          cycleId={cycle.cycle_id}
          slotId={selectedSlot.slot_id}
          slot={selectedSlot}
          attendees={attendees}
          vendorName={cycle.vendor_name}
          quarter={cycle.quarter}
          year={cycle.year}
          onInviteSent={(teamsMeetingId) => {
            onTeamsMeetingCreated(teamsMeetingId)
            onPhaseChange('confirmation_tracking')
          }}
        />
      )}
      {schedulingPhase === 'confirmation_tracking' && selectedSlot && (
        <ConfirmationTracker
          cycleId={cycle.cycle_id}
          attendees={attendees}
          slot={selectedSlot}
          teamsMeetingId={teamsMeetingId}
          onProceed={onScorecardProceed}
        />
      )}
    </div>
  )
}

/* ── Scorecard Tab ────────────────────────────────────────── */
function ScorecardTab({
  cycle, dispatched, onDispatched, submissions, simulated, onSimulate,
}: {
  cycle: NonNullable<ReturnType<typeof getMockCycleById>>
  dispatched: boolean
  onDispatched: () => void
  submissions: StakeholderSubmission[]
  simulated: boolean
  onSimulate: () => void
}) {
  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <ScorecardDispatchPanel
        vendorName={cycle.vendor_name}
        recipientCount={8}
        onDispatched={onDispatched}
      />
      {(dispatched || simulated) && (
        <SubmissionTracker
          submissions={submissions}
          onSimulate={onSimulate}
          simulated={simulated}
        />
      )}
      {simulated && (
        <CompiledScorecardTable scores={MOCK_COMPILED_SCORES} />
      )}
    </div>
  )
}

/* ── Alignment Tab ────────────────────────────────────────── */
function AlignmentTab({
  cycle, whatChangedBullets, actions, onActionsExtracted,
}: {
  cycle: NonNullable<ReturnType<typeof getMockCycleById>>
  whatChangedBullets: string[]
  actions: ExtractedAction[]
  onActionsExtracted: (a: ExtractedAction[]) => void
}) {
  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <ChangeHighlightsPanel
        deltas={MOCK_SCORE_DELTAS}
        whatChangedBullets={whatChangedBullets}
      />
      <AlignmentFlagsPanel flags={MOCK_ALIGNMENT_FLAGS} />
      <FaceOffModelEditor positions={MOCK_FACE_OFF} />
      <NotesInputPanel onActionsExtracted={onActionsExtracted} />
      {actions.length > 0 && (
        <ActionLog
          actions={actions.map(a => ({ ...a, cycle_ref: `${cycle.vendor_name} ${cycle.quarter} ${cycle.year}` }))}
        />
      )}
    </div>
  )
}

/* ── Vendor Prep Tab ──────────────────────────────────────── */
function VendorPrepTab({
  cycle, vendorBrief, onBriefGenerated, onBriefApproved,
  pushbackItems, pushbackResponses, onPushbackAdd, onGenerateResponses, onSelectResponse, onPushbackStatusChange,
}: {
  cycle: NonNullable<ReturnType<typeof getMockCycleById>>
  vendorBrief: VendorBrief | null
  onBriefGenerated: (b: VendorBrief) => void
  onBriefApproved: () => void
  pushbackItems: PushbackItem[]
  pushbackResponses: Record<string, PushbackResponse[]>
  onPushbackAdd: (item: Omit<PushbackItem, 'pushback_id' | 'cycle_id' | 'created_at'>) => void
  onGenerateResponses: (id: string) => void
  onSelectResponse: (pid: string, rid: string) => void
  onPushbackStatusChange: (id: string, s: PushbackItem['status']) => void
}) {
  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <VendorBriefPanel
        vendorName={cycle.vendor_name}
        brief={vendorBrief}
        onBriefGenerated={onBriefGenerated}
        onBriefApproved={onBriefApproved}
      />
      <PushbackInput onAdd={onPushbackAdd} />
      <PushbackResponseCards
        items={pushbackItems}
        responses={pushbackResponses}
        onGenerate={onGenerateResponses}
        onSelectResponse={onSelectResponse}
      />
      <UnresolvedItemTracker
        items={pushbackItems}
        onStatusChange={onPushbackStatusChange}
      />
      <FaceOffModelEditor positions={MOCK_FACE_OFF} />
    </div>
  )
}

/* ── Meeting Tab ──────────────────────────────────────────── */
function MeetingTab({
  cycle, meetingNotes, minutesApproved, onNoteAdd, onTranscriptParsed, onMinutesApproved, allActions, onActionStatusChange,
}: {
  cycle: NonNullable<ReturnType<typeof getMockCycleById>>
  meetingNotes: MeetingNote[]
  minutesApproved: boolean
  onNoteAdd: (n: Omit<MeetingNote, 'note_id' | 'meeting_id'>) => void
  onTranscriptParsed: (notes: MeetingNote[]) => void
  onMinutesApproved: () => void
  allActions: (ExtractedAction & { cycle_ref?: string })[]
  onActionStatusChange: (id: string, s: ExtractedAction['status']) => void
}) {
  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <MeetingBriefingCard
        vendorName={cycle.vendor_name}
        overallScore={3.8}
        trend="improving"
        mostImproved="Innovation"
        mostConcerning="Communication"
        recurringIssueCount={0}
        predictedChallenges={[
          'February SLA incident dispute — vendor likely to challenge score',
          'AI pilot scope change — formal contract amendment required',
          'Pricing CPI clause interpretation — 8% vs 5% cap',
        ]}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <LiveCapturePanel notes={meetingNotes} onAdd={onNoteAdd} />
        <TranscriptInput onParsed={onTranscriptParsed} />
      </div>
      <MeetingMinutesViewer
        notes={meetingNotes}
        vendorName={cycle.vendor_name}
        quarter={cycle.quarter}
        year={cycle.year}
        onApproved={onMinutesApproved}
      />
      {minutesApproved && (
        <ActionLog
          actions={allActions}
          showCycleRef={false}
          onStatusChange={onActionStatusChange}
        />
      )}
    </div>
  )
}

/* ── Actions Tab ──────────────────────────────────────────── */
function ActionsTab({
  actions,
  workflowState,
  onStatusChange,
  onArchive,
}: {
  actions: (ExtractedAction & { cycle_ref?: string })[]
  workflowState: WorkflowState
  onStatusChange: (id: string, s: ExtractedAction['status']) => void
  onArchive: () => void
}) {
  const allClosed = actions.length > 0 && actions.every((a) => a.status === 'CLOSED')
  const isArchived = workflowState === 'ARCHIVED'

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">Unified Action Log</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            All actions across Alignment, Vendor Prep, and Meeting modules
          </p>
        </div>
        <AgentStatusBadge status="complete" />
      </div>
      {actions.length === 0 ? (
        <EmptyState
          title="No actions yet"
          description="Action items will appear here once extracted from alignment notes, vendor prep, and meeting minutes."
        />
      ) : (
        <ActionLog actions={actions} showCycleRef onStatusChange={onStatusChange} />
      )}

      {/* Archive banner — shown when all actions closed and not yet archived */}
      {allClosed && !isArchived && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">All actions closed</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                Archive this cycle to mark the governance process complete.
              </p>
            </div>
          </div>
          <button
            onClick={onArchive}
            className="shrink-0 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Archive Cycle
          </button>
        </div>
      )}

      {isArchived && (
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex items-center gap-3">
          <CheckCircle2 size={18} className="text-slate-400 dark:text-slate-500 shrink-0" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Cycle archived — governance process complete.</p>
        </div>
      )}
    </div>
  )
}
