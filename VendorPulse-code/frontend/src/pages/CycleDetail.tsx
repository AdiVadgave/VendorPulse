import { useState, useEffect, useCallback } from 'react'
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
  ArrowRight,
} from 'lucide-react'
import { format } from 'date-fns'
import { getMockCycleById as getMockCycleById } from '@/mock/cycles.mock'
import {
  MOCK_ATTENDEES_INITIAL,
  MOCK_SLOT_PROPOSALS,
  MOCK_ATTENDEES_RSVP,
} from '@/mock/scheduling.mock'
import { completeAttendanceConfirmation, fetchAttendeesSeeded, fetchCycle, fetchSlots } from '@/lib/schedulingApi'
import { getCompiledScorecard, getWeightedScorecard, getScorecardConfig } from '@/lib/scorecardApi'
import { compiledScorecardToLegacy } from '@/mock/scorecard.mock'
import type { CompiledCategoryScore, CompiledScorecard, WeightedScorecard, TeamSubmissionsData, ScorecardConfig } from '@/types/scorecard.types'
import {
  MOCK_SCORE_DELTAS,
  MOCK_ALIGNMENT_FLAGS,
  MOCK_FACE_OFF,
  buildCategoryComparisons,
  generateAlignmentInsights,
  buildAlignmentFlags,
  generateWhatChangedBullets,
  buildComparisonsFromScorecard,
  buildFlagsFromScorecard,
  buildFlagsFromWeighted,
  buildInsightsFromWeighted,
  buildWhatChangedFromWeighted,
} from '@/mock/alignment.mock'
import {
  MOCK_PUSHBACK_ITEMS,
  MOCK_VENDOR_BRIEF,
} from '@/mock/vendor-prep.mock'
import {
  MOCK_MEETING_NOTES,
  MOCK_MEETING_ACTIONS,
} from '@/mock/meeting.mock'
import { MOCK_ALL_ACTIONS } from '@/mock/analytics.mock'

import WorkflowProgressBar from '@/components/shared/WorkflowProgressBar'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import AttendanceConfirmationPanel from '@/components/modules/scheduling/AttendanceConfirmationPanel'
import AttendeeRefreshPanel from '@/components/modules/scheduling/AttendeeRefreshPanel'
import SlotRankingPanel from '@/components/modules/scheduling/SlotRankingPanel'
import InviteApprovalPanel from '@/components/modules/scheduling/InviteApprovalPanel'
import ConfirmationTracker from '@/components/modules/scheduling/ConfirmationTracker'
import MeetingPlanPanel from '@/components/modules/scheduling/MeetingPlanPanel'

import ScorecardDispatchPanel from '@/components/modules/scorecard/ScorecardDispatchPanel'
import SubmissionTracker from '@/components/modules/scorecard/SubmissionTracker'
import WeightedScorecardTable from '@/components/modules/scorecard/WeightedScorecardTable'
import FinalizeScorecardTable from '@/components/modules/scorecard/FinalizeScorecardTable'
import TeamScorecardsSection from '@/components/modules/scorecard/TeamScorecardsSection'
import ScorecardConfigPanel from '@/components/modules/scorecard/ScorecardConfigPanel'

import ChangeHighlightsPanel from '@/components/modules/alignment/ChangeHighlightsPanel'
import AlignmentFlagsPanel from '@/components/modules/alignment/AlignmentFlagsPanel'
import FaceOffModelEditor from '@/components/modules/alignment/FaceOffModelEditor'
import ScheduleAlignmentMeeting from '@/components/modules/alignment/ScheduleAlignmentMeeting'
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
import { WORKFLOW_STATES, TAB_KEYS, TAB_LABELS, TAB_MIN_STATE_INDEX, getDefaultTabFromState } from '@/utils/constants'
import { useCycleStore } from '@/store/useCycleStore'
import type { SchedulingPhase, CycleAttendee, SlotProposal } from '@/types/scheduling.types'
// scorecard types imported via CompiledCategoryScore and CompiledScorecard above
import type { ExtractedAction, AlignmentInsight } from '@/types/alignment.types'
import { getAlignmentInsights } from '@/lib/alignmentApi'
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
  if (idx >= WORKFLOW_STATES.indexOf('ATTENDEE_REFRESH_SENT')) return 'attendee_refresh'
  return 'attendance_confirmation'
}

const SCHEDULING_STEPS: { key: SchedulingPhase; label: string }[] = [
  { key: 'attendance_confirmation', label: 'Attendance' },
  { key: 'attendee_refresh', label: 'Attendees' },
  { key: 'slot_ranking', label: 'Slot Ranking' },
  { key: 'invite_approval', label: 'Invite Approval' },
  { key: 'confirmation_tracking', label: 'Confirmation' },
]
const PHASE_ORDER: SchedulingPhase[] = [
  'attendance_confirmation', 'attendee_refresh', 'slot_ranking', 'invite_approval', 'confirmation_tracking',
]

export default function CycleDetail() {
  const { cycleId } = useParams<{ cycleId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  // Store-driven: covers both mock cycles and API-created cycles
  const storeWorkflowState = useCycleStore((s) => cycleId ? s.workflowStates[cycleId] : undefined)
  const advanceWorkflow = useCycleStore((s) => s.advanceWorkflow)
  const upsertCycle = useCycleStore((s) => s.upsertCycle)
  const storeCycle = useCycleStore((s) => cycleId ? s.getCycleById(cycleId) : undefined)
  const savedLastTab = useCycleStore((s) => (cycleId ? s.lastTabs[cycleId] : undefined))
  const setLastTab = useCycleStore((s) => s.setLastTab)

  // Store takes precedence (includes API-created cycles); fall back to mock
  const cycle = storeCycle ?? (cycleId ? getMockCycleById(cycleId) : undefined)
  const isMockCycle = cycleId ? !!getMockCycleById(cycleId) : false

  const requestedTabParam = searchParams.get('tab')
  const requestedTab: TabKey | null = TAB_KEYS.includes(requestedTabParam as TabKey)
    ? (requestedTabParam as TabKey)
    : null

  const effectiveWorkflowState: WorkflowState | undefined = (storeWorkflowState ?? cycle?.workflow_state) as
    | WorkflowState
    | undefined
  const effectiveStateIndex = effectiveWorkflowState ? WORKFLOW_STATES.indexOf(effectiveWorkflowState) : -1

  function isTabAllowed(tab: TabKey): boolean {
    if (effectiveStateIndex < 0) return tab === 'scheduling' || tab === 'overview'
    return effectiveStateIndex >= TAB_MIN_STATE_INDEX[tab]
  }

  // For API-created cycles not yet in store, show a loading state while we fetch from backend
  const [isLoadingCycle, setIsLoadingCycle] = useState(!cycle && !isMockCycle)

  // Initialise to the active step for the cycle's current state.
  // If a valid ?tab= is provided, honor it (when allowed for the current progress).
  const [activeTab, setActiveTab] = useState<TabKey>(() =>
    requestedTab && isTabAllowed(requestedTab)
      ? requestedTab
      : (savedLastTab && isTabAllowed(savedLastTab) ? savedLastTab : (effectiveWorkflowState ? getDefaultTabFromState(effectiveWorkflowState) : 'scheduling'))
  )

  // Persist last active tab per cycle so reopening returns to it.
  useEffect(() => {
    if (!cycleId) return
    setLastTab(cycleId, activeTab)
  }, [activeTab, cycleId, setLastTab])

  // --- Module A state ---
  const [schedulingPhase, setSchedulingPhase] = useState<SchedulingPhase>(() =>
    effectiveWorkflowState ? getInitialSchedulingPhase(effectiveWorkflowState) : 'attendance_confirmation'
  )
  const [schedulingAttendees, setSchedulingAttendees] = useState<CycleAttendee[]>(
    isMockCycle ? MOCK_ATTENDEES_INITIAL : []
  )
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [selectedSlotTimeZone, setSelectedSlotTimeZone] = useState<'IST' | 'UTC' | 'GMT'>('IST')
  // Null means "no slot search has been run yet". An empty array means "searched, but found none".
  const [apiSlots, setApiSlots] = useState<SlotProposal[] | null>(null)

  // --- Module B state ---
  const [scorecardDispatched, setScorecardDispatched] = useState(() => {
    if (!effectiveWorkflowState) return false
    return WORKFLOW_STATES.indexOf(effectiveWorkflowState) >= WORKFLOW_STATES.indexOf('SCORECARD_REQUEST_SENT')
  })
  const [, setSubmissionsSimulated] = useState(false)
  const [compiledScores, setCompiledScores] = useState<CompiledCategoryScore[] | null>(null)
  const [compiledScorecard, setCompiledScorecard] = useState<CompiledScorecard | null>(null)

  const handleCompiledFetched = useCallback((cs: CompiledScorecard) => {
    setCompiledScorecard(cs)
    const legacy = compiledScorecardToLegacy(cs)
    setCompiledScores(legacy)
    if (cs.internal_respondents > 0 && cs.vendor_respondents > 0) {
      setSubmissionsSimulated(true)
      advanceWorkflow(cycle!.cycle_id, 'SCORECARD_COMPILED')
    }
  }, [advanceWorkflow, cycle])

  // --- Module C state ---
  const [alignmentActions, setAlignmentActions] = useState<ExtractedAction[]>([])
  const [alignmentSlots, setAlignmentSlots] = useState<SlotProposal[]>([])
  const [alignmentMeetingResult, setAlignmentMeetingResult] = useState<{
    teamsUrl: string | null
    webLink: string | null
    attendeeCount: number
  } | null>(null)

  // --- Module D state ---
  const [vendorBrief, setVendorBrief] = useState<VendorBrief | null>(
    cycle?.workflow_state === 'POST_MEETING_COMPLETE' ? MOCK_VENDOR_BRIEF : null
  )
  const [, setBriefApproved] = useState(cycle?.workflow_state === 'POST_MEETING_COMPLETE')
  const [pushbackItems, setPushbackItems] = useState<PushbackItem[]>(MOCK_PUSHBACK_ITEMS)
  const [pushbackResponses, setPushbackResponses] = useState<Record<string, PushbackResponse[]>>({})

  // --- Module E state ---
  const [meetingNotes, setMeetingNotes] = useState<MeetingNote[]>(
    cycle?.workflow_state === 'POST_MEETING_COMPLETE' ? MOCK_MEETING_NOTES : []
  )
  const [vendorMeetingTeamsUrl, setVendorMeetingTeamsUrl] = useState<string | null>(
    cycle?.teams_meeting_url ?? null
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

  // On mount, fetch the cycle from the backend for API-created cycles.
  // This rehydrates the Zustand store after a page refresh so that workflow_state,
  // scheduling phase, and scorecard dispatch state are all restored correctly.
  //
  // IMPORTANT: all UI-derivation (active tab, scheduling phase, scorecard flags)
  // must use the MERGED state (local persisted ∨ backend) — never the raw backend
  // state. Otherwise a cycle the user has advanced locally (e.g. to
  // POST_MEETING_COMPLETE) would snap back to whatever stale state the backend
  // holds and side-effects like the scorecard auto-fetch would regress it.
  useEffect(() => {
    if (isMockCycle || !cycleId) return
    setIsLoadingCycle(true)
    fetchCycle(cycleId)
      .then((backendCycle) => {
        if (!backendCycle) return
        upsertCycle(backendCycle)
        // Rehydrate the Teams meeting URL so the Meeting tab's "Start Meeting" button
        // survives page refresh once an invite has been sent.
        if (backendCycle.teams_meeting_url) {
          setVendorMeetingTeamsUrl(backendCycle.teams_meeting_url)
        }
        // Read the merged state *after* the upsert so we honor any locally-advanced progress.
        const localState = useCycleStore.getState().workflowStates[cycleId]
        const state = (localState ?? backendCycle.workflow_state) as WorkflowState
        const idx = WORKFLOW_STATES.indexOf(state)
        setSchedulingPhase(getInitialSchedulingPhase(state))
        // Preserve the user's last tab if it's still reachable at the merged state.
        // Only override if an explicit ?tab= was provided, or if no valid tab is already selected.
        if (requestedTab && idx >= TAB_MIN_STATE_INDEX[requestedTab]) {
          setActiveTab(requestedTab)
        } else if (!savedLastTab || idx < TAB_MIN_STATE_INDEX[savedLastTab]) {
          setActiveTab(getDefaultTabFromState(state))
        }
        if (idx >= WORKFLOW_STATES.indexOf('SCORECARD_REQUEST_SENT')) setScorecardDispatched(true)
        if (idx >= WORKFLOW_STATES.indexOf('SCORECARD_COLLECTION')) setSubmissionsSimulated(true)
        // Auto-fetch compiled scorecard if already compiled
        if (idx >= WORKFLOW_STATES.indexOf('SCORECARD_COMPILED')) {
          getCompiledScorecard(cycleId).then((cs) => {
            if (cs && (cs.internal_respondents > 0 || cs.vendor_respondents > 0)) {
              setCompiledScorecard(cs)
              setCompiledScores(compiledScorecardToLegacy(cs))
            }
          }).catch(() => {/* ignore */})
        }
      })
      .catch(() => {/* backend offline — fall through to "not found" state */})
      .finally(() => setIsLoadingCycle(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId])

  // Load real attendees from backend for API-created (non-mock) cycles
  useEffect(() => {
    if (isMockCycle || !cycleId) return
    fetchAttendeesSeeded(cycleId, { seedFromPrevious: true })
      .then((attendees) => {
        if (attendees.length > 0) setSchedulingAttendees(attendees)
      })
      .catch(() => {/* backend may be offline — keep empty list */})
  }, [cycleId, isMockCycle])

  // Load saved slot proposals from backend for API-created cycles
  useEffect(() => {
    if (isMockCycle || !cycleId) return
    fetchSlots(cycleId)
      .then((slots) => {
        if (slots.length > 0) setApiSlots(slots)
      })
      .catch(() => {/* backend may be offline — keep empty list */})
  }, [cycleId, isMockCycle])

  if (isLoadingCycle) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading cycle…</p>
        </div>
      </div>
    )
  }

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

  // Use mock slots only for mock cycles *before* any search has run.
  // After a search runs, never fall back to mock slots (prevents showing default attendees).
  const activeSlots: SlotProposal[] = isMockCycle
    ? (apiSlots ?? MOCK_SLOT_PROPOSALS)
    : (apiSlots ?? [])

  const selectedSlot: SlotProposal | null =
    activeSlots.find((s) => s.slot_id === selectedSlotId) ??
    activeSlots[0] ??
    null

  // Module A: advance workflow state as scheduling progresses
  function advanceScheduling(next: SchedulingPhase) {
    setSchedulingPhase(next)
    if (next === 'attendee_refresh') {
      // Attendance confirmation complete — mark ATTENDEE_REFRESH_SENT
      advanceWorkflow(cycle!.cycle_id, 'ATTENDEE_REFRESH_SENT')
    }
    if (next === 'slot_ranking') {
      advanceWorkflow(cycle!.cycle_id, 'AVAILABILITY_COLLECTED')
    }
    if (next === 'confirmation_tracking') {
      advanceWorkflow(cycle!.cycle_id, 'MEETING_SCHEDULED')
    }
  }

  // Module B: workflow advance handled via onCompiled callback in ScorecardTab

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

  function handleGeneratePushbackResponses(pushbackId: string, generated: PushbackResponse[]) {
    setPushbackResponses((prev) => ({ ...prev, [pushbackId]: generated }))
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
          <div className="w-9 h-9 bg-indigo-100 dark:bg-indigo-500/15 rounded-lg flex items-center justify-center shrink-0 ring-1 ring-indigo-200/70 dark:ring-indigo-500/30">
            <Building2 size={18} className="text-indigo-700 dark:text-indigo-200" />
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
                    ? 'border-indigo-600 text-indigo-700 dark:text-indigo-200 dark:border-indigo-300 bg-indigo-50/60 dark:bg-indigo-500/10'
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
          <OverviewTab cycle={cycle} currentStateIndex={currentStateIndex} isMockCycle={isMockCycle} />
        )}

        {activeTab === 'scheduling' && (
          <SchedulingTab
            cycle={cycle}
            schedulingPhase={schedulingPhase}
            attendees={schedulingAttendees}
            slots={activeSlots}
            selectedSlot={selectedSlot}
            selectedSlotTimeZone={selectedSlotTimeZone}
            onPhaseChange={advanceScheduling}
            onAttendeesUpdated={setSchedulingAttendees}
            onSlotsReceived={setApiSlots}
            onSlotSelected={setSelectedSlotId}
            onSlotTimeZoneSelected={setSelectedSlotTimeZone}
            isMockCycle={isMockCycle}
            onTeamsMeetingUrlCaptured={setVendorMeetingTeamsUrl}
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
            compiledScorecard={compiledScorecard}
            onCompiledFetched={handleCompiledFetched}
            cycleId={cycle.cycle_id}
            attendees={schedulingAttendees}
            onAttendeesChanged={setSchedulingAttendees}
            onScorecardCompiled={() => advanceWorkflow(cycle!.cycle_id, 'SCORECARD_COMPILED')}
            onProceedToAlignment={() => {
              advanceWorkflow(cycle!.cycle_id, 'SCORECARD_COMPILED')
              setActiveTab('alignment')
              setLastTab(cycle!.cycle_id, 'alignment')
            }}
          />
        )}

        {activeTab === 'alignment' && (
          <AlignmentTab
            cycleId={cycle.cycle_id}
            cycle={cycle}
            actions={alignmentActions}
            compiledScores={compiledScores}
            compiledScorecard={compiledScorecard}
            alignmentSlots={alignmentSlots}
            alignmentMeetingResult={alignmentMeetingResult}
            onAlignmentSlotsFound={setAlignmentSlots}
            onAlignmentMeetingScheduled={setAlignmentMeetingResult}
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
            cycleId={cycle.cycle_id}
            cycle={cycle}
            vendorBrief={vendorBrief}
            onBriefGenerated={setVendorBrief}
            onBriefApproved={() => {
              setBriefApproved(true)
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
            cycleId={cycle.cycle_id}
            cycle={cycle}
            meetingNotes={meetingNotes}
            minutesApproved={minutesApproved}
            teamsMeetingUrl={vendorMeetingTeamsUrl}
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
  isMockCycle,
}: {
  cycle: NonNullable<ReturnType<typeof getMockCycleById>>
  currentStateIndex: number
  isMockCycle: boolean
}) {
  return (
    <div className="max-w-5xl mx-auto space-y-5">

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Cycle Progress', value: `${currentStateIndex + 1} / ${WORKFLOW_STATES.length}`, sub: 'workflow steps' },
          { label: `${cycle.cycle_type ?? 'SPR'} · Quarter`, value: `${cycle.quarter} ${cycle.year}`, sub: 'governance cycle' },
          { label: 'Vendor', value: cycle.vendor_name, sub: 'IT Infrastructure' },
        ].map((card) => (
          <div key={card.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500 dark:text-slate-400">{card.label}</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{card.value}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{card.sub}</p>
          </div>
        ))}
      </div>

      <MeetingPlanPanel
        cycleId={cycle.cycle_id}
        meetingPlan={cycle.meeting_plan ?? []}
        isMockCycle={isMockCycle}
      />

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
  cycle, schedulingPhase, attendees, slots, selectedSlot, onPhaseChange,
  onAttendeesUpdated, onSlotsReceived, onSlotSelected,
  selectedSlotTimeZone, onSlotTimeZoneSelected,
  isMockCycle, onScorecardProceed, onTeamsMeetingUrlCaptured,
}: {
  cycle: NonNullable<ReturnType<typeof getMockCycleById>>
  schedulingPhase: SchedulingPhase
  attendees: CycleAttendee[]
  slots: SlotProposal[]
  selectedSlot: SlotProposal | null
  selectedSlotTimeZone: 'IST' | 'UTC' | 'GMT'
  onPhaseChange: (p: SchedulingPhase) => void
  onAttendeesUpdated: (a: CycleAttendee[]) => void
  onSlotsReceived: (slots: SlotProposal[]) => void
  onSlotSelected: (id: string | null) => void
  onSlotTimeZoneSelected: (tz: 'IST' | 'UTC' | 'GMT') => void
  isMockCycle: boolean
  onScorecardProceed: () => void
  onTeamsMeetingUrlCaptured: (url: string | null) => void
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
                  isComplete && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200 ring-1 ring-emerald-200 dark:ring-emerald-500/30',
                  isActive && 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-200/70 dark:ring-indigo-500/30',
                  isUpcoming && 'bg-slate-100 text-slate-500 dark:bg-slate-800/70 dark:text-slate-300'
                )}>
                  {isComplete && <CheckCircle2 size={11} />}
                  <span className="truncate hidden sm:inline">{step.label}</span>
                  <span className="sm:hidden">{idx + 1}</span>
                </div>
                {idx < SCHEDULING_STEPS.length - 1 && (
                  <div className={cn('h-px w-4 shrink-0 mx-0.5', isComplete ? 'bg-emerald-400 dark:bg-emerald-500/60' : 'bg-slate-300 dark:bg-slate-700')} />
                )}
              </div>
            )
          })}
        </div>
      </div>
      {schedulingPhase === 'attendance_confirmation' && (
        <AttendanceConfirmationPanel
          cycleId={cycle.cycle_id}
          attendees={attendees}
          onAttendeesChanged={onAttendeesUpdated}
          onConfirmationComplete={async (confirmed) => {
            onAttendeesUpdated(confirmed)

            // Persist workflow state for backend-enforced actions (e.g., rank-slots).
            // Only do this when we actually have attendees to confirm.
            if (!isMockCycle && confirmed.length > 0) {
              await completeAttendanceConfirmation(cycle.cycle_id)
            }

            onPhaseChange('attendee_refresh')
          }}
        />
      )}
      {schedulingPhase === 'attendee_refresh' && (
        <AttendeeRefreshPanel
          cycleId={cycle.cycle_id}
          attendees={attendees}
          onAttendeesChanged={onAttendeesUpdated}
          onDispatchComplete={() => {}}
          onBackToAttendance={() => onPhaseChange('attendance_confirmation')}
          onResponsesSimulated={(updated, rankedSlots) => {
            onAttendeesUpdated(updated)
            onSlotsReceived(rankedSlots)
            onPhaseChange('slot_ranking')
          }}
        />
      )}
      {schedulingPhase === 'slot_ranking' && (
        <SlotRankingPanel
          cycleId={cycle.cycle_id}
          slots={slots}
          onBackToAttendees={() => onPhaseChange('attendee_refresh')}
          onSlotApproved={(slotId, tz) => {
            onSlotSelected(slotId)
            onSlotTimeZoneSelected(tz)
            onPhaseChange('invite_approval')
          }}
          onManualScheduled={(manualSlot, tz) => {
            // Coordinator bypassed the ranked slots and set their own time.
            // Route to Invite Approval so they can review/edit the invite before
            // it is sent (the Teams meeting is created on approval, like a ranked slot).
            onSlotsReceived([manualSlot])
            onSlotSelected(manualSlot.slot_id)
            onSlotTimeZoneSelected(tz)
            onPhaseChange('invite_approval')
          }}
        />
      )}
      {schedulingPhase === 'invite_approval' && (
        selectedSlot ? (
          <InviteApprovalPanel
            cycleId={cycle.cycle_id}
            slot={selectedSlot}
            attendees={attendees}
            vendorName={cycle.vendor_name}
            quarter={cycle.quarter}
            year={cycle.year}
            timeZoneOverride={selectedSlotTimeZone}
            onBack={() => {
              onSlotSelected(null)
              onPhaseChange('slot_ranking')
            }}
            onInviteSent={(teamsMeetingUrl) => {
              // Persist the Teams join URL so the Meeting tab can open it via "Start Meeting".
              onTeamsMeetingUrlCaptured(teamsMeetingUrl)
              // For mock cycles seed pre-built RSVP data; for new cycles keep attendees as-is
              if (isMockCycle) {
                onAttendeesUpdated(MOCK_ATTENDEES_RSVP)
              }
              onPhaseChange('confirmation_tracking')
            }}
          />
        ) : null
      )}
      {schedulingPhase === 'confirmation_tracking' && (
        selectedSlot ? (
          <ConfirmationTracker
            cycleId={cycle.cycle_id}
            attendees={attendees.length > 0 ? attendees : MOCK_ATTENDEES_RSVP}
            slot={selectedSlot}
            timeZoneOverride={selectedSlotTimeZone}
            onProceed={onScorecardProceed}
            onRescheduled={isMockCycle ? undefined : (newSlot, tz, teamsUrl) => {
              onSlotsReceived([newSlot])
              onSlotSelected(newSlot.slot_id)
              onSlotTimeZoneSelected(tz)
              onTeamsMeetingUrlCaptured(teamsUrl)
            }}
          />
        ) : null
      )}
    </div>
  )
}

/* ── Scorecard Tab ────────────────────────────────────────── */
function ScorecardTab({
  cycle, dispatched, onDispatched, onCompiledFetched, cycleId, attendees, onAttendeesChanged,
  onScorecardCompiled, onProceedToAlignment,
}: {
  cycle: NonNullable<ReturnType<typeof getMockCycleById>>
  dispatched: boolean
  onDispatched: () => void
  compiledScorecard: CompiledScorecard | null
  onCompiledFetched: (cs: CompiledScorecard) => void
  cycleId: string
  attendees: CycleAttendee[]
  onAttendeesChanged: (a: CycleAttendee[]) => void
  /** Advance the cycle to SCORECARD_COMPILED (unlocks the Alignment tab). */
  onScorecardCompiled: () => void
  /** Advance to SCORECARD_COMPILED and navigate to the Alignment tab. */
  onProceedToAlignment: () => void
}) {
  const [subTab, setSubTab] = useState<'collection' | 'finalize'>('collection')
  const [weighted, setWeighted] = useState<WeightedScorecard | null>(null)
  const [config, setConfig] = useState<ScorecardConfig | null>(null)
  const [autoFetched, setAutoFetched] = useState(false)

  const refreshWeighted = useCallback(async () => {
    try {
      setWeighted(await getWeightedScorecard(cycleId))
    } catch { /* backend may not be ready */ }
  }, [cycleId])

  // Load the per-SPR scorecard configuration (measures + weights).
  useEffect(() => {
    let mounted = true
    getScorecardConfig(cycleId).then((c) => { if (mounted) setConfig(c) }).catch(() => {})
    return () => { mounted = false }
  }, [cycleId])

  // Refresh the weighted (new) scorecard, auto-advance once every key team has
  // submitted, and keep the legacy 2-column compiled in sync for Alignment.
  const handleSubmissionsUpdated = useCallback(async (data?: TeamSubmissionsData) => {
    void refreshWeighted()
    // All key internal-stakeholder teams submitted → compile & unlock Alignment.
    if (data && data.total > 0 && data.pending === 0) onScorecardCompiled()
    try {
      const cs = await getCompiledScorecard(cycleId)
      if (cs.internal_respondents > 0 || cs.vendor_respondents > 0) onCompiledFetched(cs)
    } catch { /* ignore */ }
  }, [cycleId, onCompiledFetched, refreshWeighted, onScorecardCompiled])

  useEffect(() => { void refreshWeighted() }, [refreshWeighted])
  useEffect(() => {
    if (!dispatched || autoFetched) return
    void handleSubmissionsUpdated()
    setAutoFetched(true)
  }, [dispatched, autoFetched, handleSubmissionsUpdated])

  const subTabBtn = (key: 'collection' | 'finalize', label: string) => (
    <button
      onClick={() => { setSubTab(key); if (key === 'finalize') void refreshWeighted() }}
      className={cn(
        'flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
        subTab === key
          ? 'bg-violet-600 text-white'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex w-full gap-2.5 align-centre bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1.5 w-full">
        {subTabBtn('collection', 'Scorecard Collection')}
        {subTabBtn('finalize', 'Comparison & Finalize')}
      </div>

      {subTab === 'collection' && (
        <>
          <ScorecardConfigPanel cycleId={cycleId} dispatched={dispatched} onSaved={setConfig} />
          <ScorecardDispatchPanel
            vendorName={cycle.vendor_name}
            cycleId={cycleId}
            quarter={cycle.quarter}
            year={cycle.year}
            attendees={attendees}
            onDispatched={onDispatched}
            onAttendeesChanged={onAttendeesChanged}
            alreadyDispatched={dispatched}
            structure={config?.categories}
          />
          <SubmissionTracker cycleId={cycleId} onSubmissionsUpdated={handleSubmissionsUpdated} />
        </>
      )}

      {subTab === 'finalize' && (
        <>
          {weighted && weighted.teams.length > 0 && (
            <TeamScorecardsSection data={weighted} />
          )}
          {weighted ? (
            <WeightedScorecardTable data={weighted} />
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Loading consolidated scorecard…
            </div>
          )}
          {weighted && weighted.submitted_count > 0 && (
            <FinalizeScorecardTable cycleId={cycleId} consolidated={weighted} />
          )}
        </>
      )}

      {/* Proceed to Internal Alignment — HITL gate once scorecards are out/collected */}
      {dispatched && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              Ready to move to Internal Alignment?
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
              {(weighted?.submitted_count ?? 0)} team{(weighted?.submitted_count ?? 0) !== 1 ? 's' : ''} submitted so far.
              Proceeding compiles the scorecard and unlocks the Internal Alignment tab.
            </p>
          </div>
          <button
            onClick={onProceedToAlignment}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Proceed to Internal Alignment
            <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Alignment Tab ────────────────────────────────────────── */
function AlignmentTab({
  cycleId, cycle, actions, onActionsExtracted, compiledScores, compiledScorecard,
  alignmentSlots, alignmentMeetingResult, onAlignmentSlotsFound, onAlignmentMeetingScheduled,
}: {
  cycleId: string
  cycle: NonNullable<ReturnType<typeof getMockCycleById>>
  actions: ExtractedAction[]
  onActionsExtracted: (a: ExtractedAction[]) => void
  compiledScores: CompiledCategoryScore[] | null
  compiledScorecard?: CompiledScorecard | null
  alignmentSlots: SlotProposal[]
  alignmentMeetingResult: { teamsUrl: string | null; webLink: string | null; attendeeCount: number } | null
  onAlignmentSlotsFound: (slots: SlotProposal[]) => void
  onAlignmentMeetingScheduled: (result: { teamsUrl: string | null; webLink: string | null; attendeeCount: number }) => void
}) {
  const [, setAlignmentNotesText] = useState('')

  // Scorecards are collected from internal-stakeholder TEAMS only (no vendor
  // self-report). Alignment therefore works off the consolidated weighted
  // scorecard: surface low consolidated scores and where internal teams diverge.
  const [weighted, setWeighted] = useState<WeightedScorecard | null>(null)
  const [serverInsights, setServerInsights] = useState<AlignmentInsight[] | null>(null)
  useEffect(() => {
    getWeightedScorecard(cycleId).then(setWeighted).catch(() => { /* not ready */ })
    // Runtime AI insights from the consolidated internal scorecard (LLM narrates when enabled).
    getAlignmentInsights(cycleId)
      .then((r) => setServerInsights(r.data?.insights ?? null))
      .catch(() => setServerInsights(null))
  }, [cycleId])
  const hasWeighted = !!weighted && weighted.teams.length > 0

  // Legacy 2-column comparison (kept only as a fallback for mock cycles).
  const comparisons = compiledScorecard
    ? buildComparisonsFromScorecard(compiledScorecard)
    : compiledScores
      ? buildCategoryComparisons(compiledScores)
      : []

  const legacyFlags = compiledScorecard
    ? buildFlagsFromScorecard(compiledScorecard)
    : compiledScores
      ? buildAlignmentFlags(compiledScores)
      : []

  const flags = hasWeighted
    ? buildFlagsFromWeighted(weighted!)
    : legacyFlags.length > 0 ? legacyFlags : MOCK_ALIGNMENT_FLAGS

  // Prefer the backend insights (runtime from consolidated data, LLM-narrated when
  // enabled); fall back to the deterministic client builder, then legacy mock.
  const insights = serverInsights && serverInsights.length > 0
    ? serverInsights
    : hasWeighted
      ? buildInsightsFromWeighted(weighted!)
      : generateAlignmentInsights(comparisons, MOCK_SCORE_DELTAS)

  const STATIC_BULLETS = [
    'Review the consolidated internal scorecard above and agree the position on any low-scoring or divergent measures before the vendor meeting.',
  ]
  const whatChangedBullets = hasWeighted
    ? buildWhatChangedFromWeighted(weighted!)
    : comparisons.length > 0
      ? generateWhatChangedBullets(comparisons, flags)
      : STATIC_BULLETS

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <ChangeHighlightsPanel
        deltas={MOCK_SCORE_DELTAS}
        whatChangedBullets={whatChangedBullets}
        insights={insights.length > 0 ? insights : undefined}
      />
      <AlignmentFlagsPanel flags={flags} />
      <FaceOffModelEditor positions={MOCK_FACE_OFF} />
      <ScheduleAlignmentMeeting
        cycleId={cycleId}
        slots={alignmentSlots}
        meetingResult={alignmentMeetingResult}
        onSlotsFound={onAlignmentSlotsFound}
        onMeetingScheduled={onAlignmentMeetingScheduled}
      />
      <NotesInputPanel cycleId={cycleId} onActionsExtracted={onActionsExtracted} onNotesChange={setAlignmentNotesText} />
      {/* {alignmentNotesText.trim() && (
        <MeetingMinutesViewer
          cycleId={cycleId}
          notes={[{
            note_id: `alignment-notes-${cycleId}`,
            meeting_id: `alignment-mtg-${cycleId}`,
            note_type: 'DECISION' as const,
            content: alignmentNotesText,
            raised_by: 'Internal Stakeholders',
            timestamp: new Date().toISOString(),
          }]}
          vendorName={cycle.vendor_name}
          quarter={cycle.quarter}
          year={cycle.year}
          onApproved={() => setAlignmentMinutesApproved(true)}
        />
      )} */}
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
  cycleId, cycle, vendorBrief, onBriefGenerated, onBriefApproved,
  pushbackItems, pushbackResponses, onPushbackAdd, onGenerateResponses, onSelectResponse, onPushbackStatusChange,
}: {
  cycleId: string
  cycle: NonNullable<ReturnType<typeof getMockCycleById>>
  vendorBrief: VendorBrief | null
  onBriefGenerated: (b: VendorBrief) => void
  onBriefApproved: () => void
  pushbackItems: PushbackItem[]
  pushbackResponses: Record<string, PushbackResponse[]>
  onPushbackAdd: (item: Omit<PushbackItem, 'pushback_id' | 'cycle_id' | 'created_at'>) => void
  onGenerateResponses: (id: string, responses: PushbackResponse[]) => void
  onSelectResponse: (pid: string, rid: string) => void
  onPushbackStatusChange: (id: string, s: PushbackItem['status']) => void
}) {
  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <VendorBriefPanel
        cycleId={cycleId}
        vendorName={cycle.vendor_name}
        quarter={cycle.quarter}
        year={cycle.year}
        brief={vendorBrief}
        onBriefGenerated={onBriefGenerated}
        onBriefApproved={onBriefApproved}
      />
      <PushbackInput onAdd={onPushbackAdd} />
      <PushbackResponseCards
        cycleId={cycleId}
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
  cycleId, cycle, meetingNotes, minutesApproved, teamsMeetingUrl, onNoteAdd, onTranscriptParsed, onMinutesApproved, allActions, onActionStatusChange,
}: {
  cycleId: string
  cycle: NonNullable<ReturnType<typeof getMockCycleById>>
  meetingNotes: MeetingNote[]
  minutesApproved: boolean
  teamsMeetingUrl: string | null
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
          
        ]}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <LiveCapturePanel notes={meetingNotes} onAdd={onNoteAdd} teamsMeetingUrl={teamsMeetingUrl} />
        <TranscriptInput cycleId={cycleId} onParsed={onTranscriptParsed} />
      </div>
      <MeetingMinutesViewer
        cycleId={cycleId}
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
