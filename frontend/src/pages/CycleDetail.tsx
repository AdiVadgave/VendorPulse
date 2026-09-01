import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router'
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
  Plus,
  Trash2,
  AlertTriangle,
  FileText,
  Activity,
} from 'lucide-react'
import { format } from 'date-fns'
import { getMockCycleById as getMockCycleById } from '@/mock/cycles.mock'
import { wallClockToUtcIso } from '@/lib/graphScheduling'
import {
  MOCK_ATTENDEES_INITIAL,
  MOCK_SLOT_PROPOSALS,
} from '@/mock/scheduling.mock'
import { completeAttendanceConfirmation, fetchAttendeesSeeded, fetchCycle, fetchSlots } from '@/lib/schedulingApi'
import { getCompiledScorecard, getWeightedScorecard, getScorecardConfig, getScorecardBriefing } from '@/lib/scorecardApi'
import type { ScorecardBriefing } from '@/lib/scorecardApi'
import { compiledScorecardToLegacy } from '@/mock/scorecard.mock'
import type { CompiledCategoryScore, CompiledScorecard, WeightedScorecard, TeamSubmissionsData, ScorecardConfig } from '@/types/scorecard.types'
import {
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
} from '@/mock/meeting.mock'

import WorkflowProgressBar from '@/components/shared/WorkflowProgressBar'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import AttendanceConfirmationPanel from '@/components/modules/scheduling/AttendanceConfirmationPanel'
import AttendeeRefreshPanel from '@/components/modules/scheduling/AttendeeRefreshPanel'
import ManualMeetingPanel from '@/components/modules/scheduling/ManualMeetingPanel'
import FindSlotsControl from '@/components/modules/scheduling/FindSlotsControl'
import SlotRankingPanel from '@/components/modules/scheduling/SlotRankingPanel'
import InviteApprovalPanel from '@/components/modules/scheduling/InviteApprovalPanel'
import ManualTimeCard from '@/components/modules/scheduling/ManualTimeCard'
import AddAttendeesToMeetingPanel from '@/components/modules/scheduling/AddAttendeesToMeetingPanel'
import ConfirmationTracker from '@/components/modules/scheduling/ConfirmationTracker'

import ScorecardDispatchPanel from '@/components/modules/scorecard/ScorecardDispatchPanel'
import SubmissionTracker from '@/components/modules/scorecard/SubmissionTracker'
import FinalizeScorecardTable from '@/components/modules/scorecard/FinalizeScorecardTable'
import TeamScorecardsSection from '@/components/modules/scorecard/TeamScorecardsSection'
import ScorecardConfigPanel from '@/components/modules/scorecard/ScorecardConfigPanel'
import ConsolidatedScorecardPanel from '@/components/modules/scorecard/ConsolidatedScorecardPanel'

import ChangeHighlightsPanel from '@/components/modules/alignment/ChangeHighlightsPanel'
import AlignmentFlagsPanel from '@/components/modules/alignment/AlignmentFlagsPanel'
import FaceOffModelEditor from '@/components/modules/alignment/FaceOffModelEditor'
import AlignmentMeetingPanel from '@/components/modules/alignment/AlignmentMeetingPanel'

import VendorBriefPanel from '@/components/modules/vendor-prep/VendorBriefPanel'
import PushbackInput from '@/components/modules/vendor-prep/PushbackInput'
import PushbackResponseCards from '@/components/modules/vendor-prep/PushbackResponseCards'
import UnresolvedItemTracker from '@/components/modules/vendor-prep/UnresolvedItemTracker'
import VendorPrepMeetingPanel from '@/components/modules/vendor-prep/VendorPrepMeetingPanel'

import MeetingBriefingCard from '@/components/modules/meeting/MeetingBriefingCard'
import LiveCapturePanel from '@/components/modules/meeting/LiveCapturePanel'
import TranscriptInput from '@/components/modules/meeting/TranscriptInput'
import MeetingMinutesViewer from '@/components/modules/meeting/MeetingMinutesViewer'

import ActionLog, { type ActionEdit } from '@/components/shared/ActionLog'
import ActionQueuePanel from '@/components/shared/ActionQueuePanel'
import AddActionForm from '@/components/shared/AddActionForm'
import EmptyState from '@/components/shared/EmptyState'
import { cn } from '@/utils/cn'
import type { TabKey, WorkflowState } from '@/utils/constants'
import { WORKFLOW_STATES, TAB_KEYS, TAB_LABELS, TAB_MIN_STATE_INDEX, ACTION_ORIGIN, getDefaultTabFromState } from '@/utils/constants'
import { useCycleStore } from '@/store/useCycleStore'
import type { SchedulingPhase, CycleAttendee, SlotProposal } from '@/types/scheduling.types'
// scorecard types imported via CompiledCategoryScore and CompiledScorecard above
import type { ExtractedAction, AlignmentInsight } from '@/types/alignment.types'
import { getAlignmentInsights, listAlignmentMeetings, deleteAlignmentMeeting } from '@/lib/alignmentApi'
import {
  getActions, addAction, addActionsBulk, updateAction, deleteAction,
  type ActionItem, type NewActionInput,
} from '@/lib/actionsApi'
import {
  getPushback, addPushback, updatePushbackStatus, updatePushback, deletePushback,
  savePushbackResponses,
} from '@/lib/pushbackApi'
import type { VendorBrief, PushbackItem, PushbackResponse } from '@/types/vendor-prep.types'
import type { MeetingNote, MeetingMinutes } from '@/types/meeting.types'
import { getMeetingArtifact } from '@/lib/meetingApi'

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

  // --- Shared action queue (Modules C–E) ---
  // ONE persistent queue carried across every meeting in the flow
  // (Internal Alignment → Vendor Meeting → further Alignment → final QBR).
  // Backend-persisted; mutations sync best-effort so demo cycles still work offline.
  const [actions, setActions] = useState<ActionItem[]>([])

  // --- Module D state ---
  const [vendorBrief, setVendorBrief] = useState<VendorBrief | null>(
    isMockCycle && cycle?.workflow_state === 'POST_MEETING_COMPLETE' ? MOCK_VENDOR_BRIEF : null
  )
  const [, setBriefApproved] = useState(isMockCycle && cycle?.workflow_state === 'POST_MEETING_COMPLETE')
  const [pushbackItems, setPushbackItems] = useState<PushbackItem[]>(MOCK_PUSHBACK_ITEMS)
  const [pushbackResponses, setPushbackResponses] = useState<Record<string, PushbackResponse[]>>({})

  // --- Module E state ---
  const [meetingNotes, setMeetingNotes] = useState<MeetingNote[]>(
    isMockCycle && cycle?.workflow_state === 'POST_MEETING_COMPLETE' ? MOCK_MEETING_NOTES : []
  )
  // Persisted minutes for the QBR/vendor meeting — hydrated on load so the MoM isn't
  // regenerated after a refresh.
  const [meetingMinutes, setMeetingMinutes] = useState<MeetingMinutes | null>(null)
  const [vendorMeetingTeamsUrl, setVendorMeetingTeamsUrl] = useState<string | null>(
    cycle?.teams_meeting_url ?? null
  )
  // Graph event id of the scheduled meeting — lets the coordinator invite newly-added
  // attendees to the SAME event later (delegated Calendars.ReadWrite PATCH).
  const [scheduledEventId, setScheduledEventId] = useState<string | null>(
    cycle?.teams_meeting_event_id ?? null
  )
  const [minutesApproved, setMinutesApproved] = useState(false)

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
        if (backendCycle.teams_meeting_event_id) {
          setScheduledEventId(backendCycle.teams_meeting_event_id)
        }
        // Read the merged state *after* the upsert so we honor any locally-advanced progress.
        const localState = useCycleStore.getState().workflowStates[cycleId]
        const state = (localState ?? backendCycle.workflow_state) as WorkflowState
        const idx = WORKFLOW_STATES.indexOf(state)
        setSchedulingPhase(getInitialSchedulingPhase(state))
        // Rehydrate the manually-scheduled meeting slot so the Confirmation view
        // survives a page refresh (selectedSlot is otherwise in-session only).
        if (idx >= WORKFLOW_STATES.indexOf('MEETING_SCHEDULED') && backendCycle.teams_meeting_scheduled_at) {
          const tz = (backendCycle.meeting_time_zone as 'IST' | 'UTC' | 'GMT') ?? 'IST'
          const restored: SlotProposal = {
            slot_id: `manual-${cycleId}`,
            cycle_id: cycleId,
            proposed_time: backendCycle.teams_meeting_scheduled_at,
            proposed_time_zone: tz,
            duration_minutes: backendCycle.meeting_duration_minutes ?? 60,
            organiser_available: true,
            exec_sponsor_available: true,
            rank_score: 100,
            is_approved: true,
            attendance_count: 0,
            total_attendees: 0,
            conflict_count: 0,
            attending: [],
            tentative: [],
            conflicts: [],
          }
          setApiSlots([restored])
          setSelectedSlotId(restored.slot_id)
          setSelectedSlotTimeZone(tz)
        }
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

  // ── Shared action queue: load once, mutate optimistically + sync best-effort ──
  // Declared before the early returns below so hook order stays stable across renders.
  useEffect(() => {
    if (!cycleId) return
    getActions(cycleId)
      .then((r) => setActions(r.actions))
      .catch(() => { /* backend not ready / demo cycle — start empty */ })
  }, [cycleId])

  // Load persisted vendor pushback items (+ their drafted responses) on mount, so
  // the state survives a refresh. Demo/mock cycles fall back to their seeded items.
  useEffect(() => {
    if (!cycleId) return
    getPushback(cycleId)
      .then((r) => {
        // PushbackItemWithResponses is a superset of PushbackItem — safe to store directly.
        setPushbackItems(r.items)
        const map: Record<string, PushbackResponse[]> = {}
        for (const it of r.items) {
          if (it.responses?.length) map[it.pushback_id] = it.responses
        }
        setPushbackResponses(map)
      })
      .catch(() => { /* backend not ready / demo cycle — keep seeded items */ })
  }, [cycleId])

  // Restore the Meeting tab's parsed transcript + generated minutes on mount, so a
  // refresh shows "Transcript parsed" (not a re-prompt) and doesn't regenerate the MoM.
  useEffect(() => {
    if (!cycleId) return
    getMeetingArtifact(cycleId)
      .then((a) => {
        if (a.notes?.length) setMeetingNotes(a.notes)
        if (a.minutes) setMeetingMinutes(a.minutes)
      })
      .catch(() => { /* backend not ready / demo cycle — keep seeded notes */ })
  }, [cycleId])

  const dedupeMerge = (prev: ActionItem[], incoming: ActionItem[]) => {
    const seen = new Set(prev.map((a) => a.action_id))
    return [...prev, ...incoming.filter((a) => !seen.has(a.action_id))]
  }

  // Called by every meeting when its transcript yields action items.
  const addActionsToQueue = useCallback((extracted: ExtractedAction[], origin?: string) => {
    if (!cycleId || extracted.length === 0) return
    const withOrigin: ActionItem[] = extracted.map((a) => ({ ...a, origin: origin ?? null }))
    setActions((prev) => dedupeMerge(prev, withOrigin))
    addActionsBulk(
      cycleId,
      extracted.map((a) => ({
        action_id: a.action_id, description: a.description, owner: a.owner,
        due_date: a.due_date, source: a.source, status: a.status, origin: origin ?? null,
      }))
    ).catch(() => { /* keep optimistic local copy */ })
  }, [cycleId])

  const handleAddAction = useCallback((input: NewActionInput) => {
    if (!cycleId) return
    const fallbackId = `act-${Date.now().toString(36)}`
    addAction(cycleId, input)
      .then((r) => setActions((prev) => dedupeMerge(prev, [r.action])))
      .catch(() => {
        const local: ActionItem = {
          action_id: input.action_id ?? fallbackId,
          description: input.description, owner: input.owner ?? 'TBD',
          due_date: input.due_date ?? null, source: input.source ?? 'alignment',
          status: input.status ?? 'OPEN', origin: input.origin ?? null,
        }
        setActions((prev) => dedupeMerge(prev, [local]))
      })
  }, [cycleId])

  const handleActionEdit = useCallback((id: string, updates: ActionEdit) => {
    if (!cycleId) return
    setActions((prev) => prev.map((a) => (a.action_id === id ? { ...a, ...updates } : a)))
    updateAction(cycleId, id, updates).catch(() => { /* keep optimistic local copy */ })
  }, [cycleId])

  const handleActionDelete = useCallback((id: string) => {
    if (!cycleId) return
    setActions((prev) => prev.filter((a) => a.action_id !== id))
    deleteAction(cycleId, id).catch(() => { /* already removed locally */ })
  }, [cycleId])

  const handleActionStatusChange = useCallback((id: string, status: ExtractedAction['status']) => {
    if (!cycleId) return
    setActions((prev) => prev.map((a) => (a.action_id === id ? { ...a, status } : a)))
    updateAction(cycleId, id, { status }).catch(() => { /* keep optimistic local copy */ })
  }, [cycleId])

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

  async function handlePushbackAdd(item: Omit<PushbackItem, 'pushback_id' | 'cycle_id' | 'created_at'>) {
    if (!cycleId) return
    // Optimistic insert with a temporary id; reconcile to the server id on success.
    const tempId = `pb-temp-${Date.now()}`
    const optimistic: PushbackItem = {
      ...item, pushback_id: tempId, cycle_id: cycleId, created_at: new Date().toISOString(),
    }
    setPushbackItems((prev) => [...prev, optimistic])
    try {
      const { item: saved } = await addPushback(cycleId, {
        category: item.category,
        description: item.description,
        raised_by: item.raised_by,
        needs_legal_review: item.needs_legal_review,
        status: item.status,
      })
      setPushbackItems((prev) => prev.map((p) => (p.pushback_id === tempId ? saved : p)))
    } catch {
      /* keep the optimistic item so the coordinator's entry isn't lost offline */
    }
  }

  function handlePushbackStatusChange(id: string, status: PushbackItem['status']) {
    setPushbackItems((prev) => prev.map((p) => (p.pushback_id === id ? { ...p, status } : p)))
    if (cycleId) updatePushbackStatus(cycleId, id, status).catch(() => { /* optimistic */ })
  }

  function handlePushbackEdit(
    id: string,
    patch: Partial<Pick<PushbackItem, 'category' | 'description' | 'raised_by' | 'needs_legal_review'>>
  ) {
    setPushbackItems((prev) => prev.map((p) => (p.pushback_id === id ? { ...p, ...patch } : p)))
    if (cycleId) updatePushback(cycleId, id, patch).catch(() => { /* optimistic */ })
  }

  function handlePushbackDelete(id: string) {
    setPushbackItems((prev) => prev.filter((p) => p.pushback_id !== id))
    setPushbackResponses((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    if (cycleId) deletePushback(cycleId, id).catch(() => { /* optimistic */ })
  }

  function handleGeneratePushbackResponses(pushbackId: string, generated: PushbackResponse[]) {
    setPushbackResponses((prev) => ({ ...prev, [pushbackId]: generated }))
    if (cycleId) {
      savePushbackResponses(
        cycleId,
        pushbackId,
        generated.map((r) => ({ stance: r.stance, content: r.content, is_selected: r.is_selected })),
      )
        .then((res) => setPushbackResponses((prev) => ({ ...prev, [pushbackId]: res.responses })))
        .catch(() => { /* keep in-memory copy */ })
    }
  }

  // Edit the drafted responses (content + which one is selected) from the Unresolved Item Tracker.
  function handleEditPushbackResponses(pushbackId: string, edited: PushbackResponse[]) {
    setPushbackResponses((prev) => ({ ...prev, [pushbackId]: edited }))
    if (cycleId) {
      savePushbackResponses(
        cycleId,
        pushbackId,
        edited.map((r) => ({ stance: r.stance, content: r.content, is_selected: r.is_selected })),
      )
        .then((res) => setPushbackResponses((prev) => ({ ...prev, [pushbackId]: res.responses })))
        .catch(() => { /* keep in-memory copy */ })
    }
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

  // Module E: advance to POST_MEETING_COMPLETE when minutes are approved.
  // Action items now come from the transcript extraction (shared queue), not mocks.
  function handleMinutesApproved() {
    setMinutesApproved(true)
    advanceWorkflow(cycle!.cycle_id, 'POST_MEETING_COMPLETE')
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
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
              <span>{cycle.quarter} {cycle.year}</span>
              <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
              <span>EGB/QBR Governance Cycle</span>
              <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 hidden sm:inline-block" />
              <span className="hidden sm:inline-flex items-center gap-1"><Clock size={11} /> Updated {format(new Date(cycle.updated_at), 'd MMM yyyy')}</span>
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
          <OverviewTab cycle={cycle} currentStateIndex={currentStateIndex} />
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
            meetingUrl={vendorMeetingTeamsUrl}
            meetingScheduled={currentStateIndex >= WORKFLOW_STATES.indexOf('MEETING_SCHEDULED')}
            scheduledEventId={scheduledEventId}
            onEventUpdated={(eid, url) => {
              if (eid) setScheduledEventId(eid)
              if (url) setVendorMeetingTeamsUrl(url)
            }}
            onTeamsMeetingUrlCaptured={setVendorMeetingTeamsUrl}
            onEventIdCaptured={setScheduledEventId}
            onMeetingScheduled={() => advanceWorkflow(cycle!.cycle_id, 'MEETING_SCHEDULED')}
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
            onScorecardRedo={() => setScorecardDispatched(false)}
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
            actions={actions}
            compiledScores={compiledScores}
            compiledScorecard={compiledScorecard}
            onActionsExtracted={(extracted, origin) => {
              addActionsToQueue(extracted, origin)
              // Module C: advance to INTERNAL_ALIGNMENT when actions are extracted
              advanceWorkflow(cycle!.cycle_id, 'INTERNAL_ALIGNMENT')
            }}
            // Unlock Vendor Prep as soon as the alignment meeting is scheduled — the
            // coordinator can line up the vendor-prep call in parallel, without waiting
            // for the alignment transcript to be parsed.
            onAlignmentScheduled={() => advanceWorkflow(cycle!.cycle_id, 'INTERNAL_ALIGNMENT')}
          />
        )}

        {activeTab === 'vendor-prep' && (
          <VendorPrepTab
            cycleId={cycle.cycle_id}
            cycle={cycle}
            vendorBrief={vendorBrief}
            onBriefGenerated={setVendorBrief}
            onBriefReady={() => {
              setBriefApproved(true)
              advanceWorkflow(cycle!.cycle_id, 'VENDOR_PREP')
            }}
            pushbackItems={pushbackItems}
            pushbackResponses={pushbackResponses}
            onPushbackAdd={handlePushbackAdd}
            onGenerateResponses={handleGeneratePushbackResponses}
            onEditResponses={handleEditPushbackResponses}
            onPushbackStatusChange={handlePushbackStatusChange}
            onPushbackEdit={handlePushbackEdit}
            onPushbackDelete={handlePushbackDelete}
            onActionsExtracted={(extracted) => addActionsToQueue(extracted, ACTION_ORIGIN.vendorPrep)}
            alreadyExtracted={actions.some((a) => a.origin === ACTION_ORIGIN.vendorPrep)}
          />
        )}

        {activeTab === 'meeting' && (
          <MeetingTab
            cycleId={cycle.cycle_id}
            cycle={cycle}
            meetingNotes={meetingNotes}
            initialMinutes={meetingMinutes}
            minutesApproved={minutesApproved}
            teamsMeetingUrl={vendorMeetingTeamsUrl}
            onNoteAdd={handleNoteAdd}
            onTranscriptParsed={handleTranscriptParsed}
            onMinutesApproved={handleMinutesApproved}
            onActionsExtracted={(extracted) => addActionsToQueue(extracted, ACTION_ORIGIN.vendorMeeting)}
            alreadyExtracted={meetingNotes.length > 0}
          />
        )}

        {/* Shared action queue — always visible across the meeting flow so the
            coordinator can see what is still pending as it carries forward. */}
        {(activeTab === 'alignment' || activeTab === 'vendor-prep' || activeTab === 'meeting') && (
          <div className="max-w-5xl mx-auto mt-5">
            <ActionQueuePanel
              actions={actions}
              source={activeTab === 'vendor-prep' ? 'vendor_prep' : activeTab === 'meeting' ? 'meeting' : 'alignment'}
              originLabel={
                activeTab === 'vendor-prep' ? ACTION_ORIGIN.vendorPrep
                  : activeTab === 'meeting' ? ACTION_ORIGIN.vendorMeeting
                    : ACTION_ORIGIN.internalAlignment
              }
              onAdd={handleAddAction}
              onStatusChange={handleActionStatusChange}
              onEdit={handleActionEdit}
              onDelete={handleActionDelete}
            />
          </div>
        )}

        {activeTab === 'actions' && (
          <ActionsTab
            actions={actions}
            workflowState={workflowState}
            onStatusChange={handleActionStatusChange}
            onEdit={handleActionEdit}
            onDelete={handleActionDelete}
            onAdd={handleAddAction}
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
  const currentStateLabel = (WORKFLOW_STATES[currentStateIndex] ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
  const progressPct = Math.round(((currentStateIndex + 1) / WORKFLOW_STATES.length) * 100)
  const description = (cycle.description ?? '').trim()

  const stats = [
    { label: 'Current Stage', value: currentStateLabel, sub: `Step ${currentStateIndex + 1} of ${WORKFLOW_STATES.length}`, icon: <Activity size={16} /> },
    { label: 'Governance Cycle', value: `${cycle.quarter} ${cycle.year}`, sub: `${cycle.cycle_type ?? 'SPR'} · Supplier Performance Review`, icon: <CalendarClock size={16} /> },
    { label: 'Vendor', value: cycle.vendor_name, sub: 'Supplier under review', icon: <Building2 size={16} /> },
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Hero summary — vendor, timeline, progress, and the cycle description. */}
      <div className="bg-gradient-to-br from-indigo-50 via-white to-violet-50 dark:from-indigo-950/40 dark:via-slate-900 dark:to-violet-950/30 border border-indigo-100 dark:border-indigo-900/50 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Building2 size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">{cycle.vendor_name}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {cycle.cycle_type ?? 'SPR'} · {cycle.quarter} {cycle.year} · EGB/QBR Governance Cycle
              </p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
            {currentStateLabel}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
            <span>Cycle progress</span>
            <span className="font-medium text-slate-700 dark:text-slate-300">{progressPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200/70 dark:bg-slate-800 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {/* Description */}
        <div className="mt-5 flex items-start gap-2.5">
          <FileText size={15} className="text-indigo-500 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-0.5">Description</p>
            {description ? (
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{description}</p>
            ) : (
              <p className="text-sm text-slate-400 dark:text-slate-500 italic">
                No description was added for this cycle.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Key facts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((card) => (
          <div key={card.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 mb-2">
              {card.icon}
              <p className="text-xs font-medium">{card.label}</p>
            </div>
            <p className="text-base font-bold text-slate-900 dark:text-white truncate" title={card.value}>{card.value}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Workflow Steps</h3>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {currentStateIndex + 1} of {WORKFLOW_STATES.length} complete
          </span>
        </div>
        <ol className="relative">
          {WORKFLOW_STATES.map((state, idx) => {
            const done = idx < currentStateIndex
            const current = idx === currentStateIndex
            const isLast = idx === WORKFLOW_STATES.length - 1
            const label = state.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
            return (
              <li key={state} className="relative flex items-start gap-3 pb-4 last:pb-0">
                {/* Connecting rail (coloured up to the completed point). */}
                {!isLast && (
                  <span
                    className={cn(
                      'absolute left-3 top-6 -bottom-0.5 w-px -translate-x-1/2',
                      done ? 'bg-emerald-300 dark:bg-emerald-800' : 'bg-slate-200 dark:bg-slate-700'
                    )}
                  />
                )}
                <span
                  className={cn(
                    'relative z-10 w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold ring-4 ring-white dark:ring-slate-900',
                    done ? 'bg-emerald-500 text-white'
                      : current ? 'bg-indigo-600 text-white'
                        : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                  )}
                >
                  {done ? <CheckCircle2 size={13} /> : idx + 1}
                </span>
                <div className="flex-1 min-w-0 flex items-center justify-between gap-2 pt-0.5">
                  <span
                    className={cn(
                      'text-sm truncate',
                      current ? 'text-slate-900 dark:text-white font-semibold'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    {label}
                  </span>
                  {current ? (
                    <span className="shrink-0 text-xs bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 px-2 py-0.5 rounded-full font-medium">
                      In progress
                    </span>
                  ) : done ? (
                    <span className="shrink-0 text-xs text-emerald-600 dark:text-emerald-400 font-medium">Done</span>
                  ) : (
                    <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">Upcoming</span>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

/* ── Scheduling Tab ───────────────────────────────────────── */
function SchedulingTab({
  cycle, schedulingPhase, attendees, slots, selectedSlot, onPhaseChange,
  onAttendeesUpdated, onSlotsReceived, onSlotSelected,
  selectedSlotTimeZone, onSlotTimeZoneSelected,
  isMockCycle, onScorecardProceed, onTeamsMeetingUrlCaptured, onMeetingScheduled, meetingUrl,
  meetingScheduled, scheduledEventId, onEventUpdated, onEventIdCaptured,
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
  onMeetingScheduled: () => void
  meetingUrl: string | null
  /** True once the cycle has reached MEETING_SCHEDULED (a meeting exists). */
  meetingScheduled: boolean
  /** Graph event id of the scheduled meeting, for inviting late-added attendees. */
  scheduledEventId: string | null
  /** After a meeting update (add-attendees / re-create): refresh stored id + link. */
  onEventUpdated: (eventId: string | null, meetingUrl: string | null) => void
  /** Capture the Graph event id when the initial invite is sent. */
  onEventIdCaptured: (eventId: string | null) => void
}) {
  const currentPhaseIndex = PHASE_ORDER.indexOf(schedulingPhase)

  // Inline "add attendee" panel on the Confirmation page — lets the coordinator add
  // (and invite) attendees to an already-scheduled meeting without navigating back.
  const [showAddAttendee, setShowAddAttendee] = useState(false)
  const addAttendeeRef = useRef<HTMLDivElement>(null)
  // When opened, scroll the add-attendee section into view so it's obvious where to go.
  useEffect(() => {
    if (showAddAttendee) {
      addAttendeeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [showAddAttendee])

  // Schedule at a coordinator-chosen time (shared by the Attendees page and the
  // Slot Ranking panel). Builds a synthetic slot and jumps to Invite Approval,
  // where the Teams meeting is actually created via delegated Graph.
  function scheduleManual(startISO: string, tz: 'IST' | 'UTC' | 'GMT', dur: number) {
    const manual: SlotProposal = {
      slot_id: 'manual-slot',
      cycle_id: cycle.cycle_id,
      // Convert the wall-clock entry in the chosen zone to a real UTC instant.
      proposed_time: wallClockToUtcIso(startISO, tz),
      proposed_time_zone: tz,
      duration_minutes: dur,
      organiser_available: true,
      exec_sponsor_available: true,
      rank_score: 100,
      is_approved: false,
      attendance_count: attendees.length,
      total_attendees: attendees.length,
      conflict_count: 0,
      attending: attendees.map((a) => a.name),
      tentative: [],
      conflicts: [],
      ranking_rationale: 'Manually chosen time',
    }
    onSlotsReceived([...slots, manual])
    onSlotSelected('manual-slot')
    onSlotTimeZoneSelected(tz)
    onPhaseChange('invite_approval')
  }
  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
        <div className="flex items-center">
          {SCHEDULING_STEPS.map((step, idx) => {
            const phaseIdx = PHASE_ORDER.indexOf(step.key)
            const isComplete = phaseIdx < currentPhaseIndex
            const isActive = phaseIdx === currentPhaseIndex
            const isUpcoming = phaseIdx > currentPhaseIndex
            // Once the meeting is scheduled, lock every step except Confirmation —
            // the coordinator adds attendees from the Confirmation tab, not by
            // walking back through Attendees / Slot Ranking / Invite Approval.
            const locked = meetingScheduled && step.key !== 'confirmation_tracking'
            return (
              <div key={step.key} className="flex items-center flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => { if (!locked) onPhaseChange(step.key) }}
                  disabled={locked}
                  title={locked ? 'Meeting scheduled — only Confirmation is available' : `Go to ${step.label}`}
                  className={cn(
                  'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium flex-1 justify-center transition-all',
                  locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:opacity-90',
                  isComplete && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200 ring-1 ring-emerald-200 dark:ring-emerald-500/30',
                  isActive && 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-200/70 dark:ring-indigo-500/30',
                  isUpcoming && 'bg-slate-100 text-slate-500 dark:bg-slate-800/70 dark:text-slate-300',
                  isUpcoming && !locked && 'hover:bg-slate-200 dark:hover:bg-slate-700'
                )}>
                  {isComplete && !locked && <CheckCircle2 size={11} />}
                  {locked && <Lock size={11} />}
                  <span className="truncate hidden sm:inline">{step.label}</span>
                  <span className="sm:hidden">{idx + 1}</span>
                </button>
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

            // Persist the confirmation on the backend: this also DROPS anyone marked
            // "Not attending" so the removal sticks. Fire whenever there were
            // carried-over attendees to reconcile (even if all were declined), not
            // only when at least one is confirmed.
            if (!isMockCycle && attendees.length > 0) {
              await completeAttendanceConfirmation(cycle.cycle_id)
            }

            onPhaseChange('attendee_refresh')
          }}
        />
      )}
      {schedulingPhase === 'attendee_refresh' && (
        <div className="space-y-4">
          <AttendeeRefreshPanel
            cycleId={cycle.cycle_id}
            attendees={attendees}
            onAttendeesChanged={onAttendeesUpdated}
            onDispatchComplete={() => {}}
            onBackToAttendance={() => onPhaseChange('attendance_confirmation')}
          />
          {/* Delegated Graph: find free slots across the attendees' calendars. */}
          <FindSlotsControl
            cycleId={cycle.cycle_id}
            attendees={attendees}
            onSlotsFound={(found) => {
              onSlotsReceived(found)
              onPhaseChange('slot_ranking')
            }}
          />
          {/* Prefer a specific time — available right here, no need to Find Slots first. */}
          <ManualTimeCard onSchedule={scheduleManual} defaultTimeZone={selectedSlotTimeZone} />
        </div>
      )}
      {schedulingPhase === 'slot_ranking' && (
        <SlotRankingPanel
          slots={slots}
          onSlotApproved={(slotId, tz) => {
            onSlotSelected(slotId)
            onSlotTimeZoneSelected(tz)
            onPhaseChange('invite_approval')
          }}
          onBackToAttendees={() => onPhaseChange('attendee_refresh')}
          onScheduleManual={scheduleManual}
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
            onBack={() => onPhaseChange('slot_ranking')}
            onInviteSent={(teamsUrl, eventId) => {
              onTeamsMeetingUrlCaptured(teamsUrl)
              onEventIdCaptured(eventId)
              onMeetingScheduled()
              onPhaseChange('confirmation_tracking')
            }}
          />
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-sm text-slate-500 dark:text-slate-400">
            No slot selected.{' '}
            <button onClick={() => onPhaseChange('slot_ranking')} className="text-indigo-600 dark:text-indigo-400 underline">Back to slots</button>.
          </div>
        )
      )}
      {schedulingPhase === 'schedule_meeting' && (
        <ManualMeetingPanel
          cycleId={cycle.cycle_id}
          attendees={attendees}
          existingEventId={scheduledEventId}
          existingMeetingUrl={meetingUrl}
          vendorName={cycle.vendor_name}
          quarter={cycle.quarter}
          year={cycle.year}
          onBack={() => onPhaseChange('confirmation_tracking')}
          onScheduled={({ startTime, timeZone, durationMinutes, meetingUrl, eventId }) => {
            // Build a synthetic approved slot from the new date so the
            // Confirmation view can render the scheduled time + attendee list.
            const manualSlot: SlotProposal = {
              slot_id: `manual-${cycle.cycle_id}`,
              cycle_id: cycle.cycle_id,
              proposed_time: startTime,
              proposed_time_zone: timeZone,
              duration_minutes: durationMinutes,
              organiser_available: true,
              exec_sponsor_available: true,
              rank_score: 100,
              is_approved: true,
              attendance_count: attendees.length,
              total_attendees: attendees.length,
              conflict_count: 0,
              attending: attendees.map((a) => a.name),
              tentative: [],
              conflicts: [],
            }
            onSlotsReceived([manualSlot])
            onSlotSelected(manualSlot.slot_id)
            onSlotTimeZoneSelected(timeZone)
            if (meetingUrl) onTeamsMeetingUrlCaptured(meetingUrl)
            onEventIdCaptured(eventId)
            onMeetingScheduled()  // advance the workflow store to MEETING_SCHEDULED
            onPhaseChange('confirmation_tracking')
          }}
        />
      )}
      {schedulingPhase === 'confirmation_tracking' && (
        selectedSlot ? (
          <ConfirmationTracker
            cycleId={cycle.cycle_id}
            attendees={attendees}
            slot={selectedSlot}
            timeZoneOverride={selectedSlotTimeZone}
            meetingUrl={meetingUrl}
            eventId={scheduledEventId}
            onProceed={onScorecardProceed}
            onReschedule={() => onPhaseChange('schedule_meeting')}
            onAddAttendee={() => setShowAddAttendee((v) => !v)}
            addAttendeeOpen={showAddAttendee}
            addAttendeeSlot={
              showAddAttendee ? (
                <div ref={addAttendeeRef} className="scroll-mt-4">
                  <AddAttendeesToMeetingPanel
                    cycleId={cycle.cycle_id}
                    attendees={attendees}
                    onAttendeesChanged={onAttendeesUpdated}
                    slot={selectedSlot}
                    eventId={scheduledEventId}
                    meetingUrl={meetingUrl}
                    vendorName={cycle.vendor_name}
                    quarter={cycle.quarter}
                    year={cycle.year}
                    timeZone={selectedSlotTimeZone}
                    onUpdated={onEventUpdated}
                    onClose={() => setShowAddAttendee(false)}
                  />
                </div>
              ) : null
            }
          />
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-sm text-slate-500 dark:text-slate-400">
            No meeting scheduled yet.{' '}
            <button onClick={() => onPhaseChange('schedule_meeting')} className="text-indigo-600 dark:text-indigo-400 underline">Schedule the meeting</button>.
          </div>
        )
      )}
    </div>
  )
}

/* ── Scorecard Tab ────────────────────────────────────────── */
function ScorecardTab({
  cycle, dispatched, onDispatched, onScorecardRedo, onCompiledFetched, cycleId, attendees, onAttendeesChanged,
  onScorecardCompiled, onProceedToAlignment,
}: {
  cycle: NonNullable<ReturnType<typeof getMockCycleById>>
  dispatched: boolean
  onDispatched: () => void
  /** Redo: reopen the scorecard config lock after discarding prior submissions. */
  onScorecardRedo: () => void
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
  // Bumped on redo to force the submission tracker to refetch (submissions cleared).
  const [redoNonce, setRedoNonce] = useState(0)

  // Redo: unlock the config, reset the finalize view, and remount the tracker.
  const handleRedo = useCallback(() => {
    onScorecardRedo()
    setWeighted(null)
    setRedoNonce((n) => n + 1)
  }, [onScorecardRedo])

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
    <div className={cn('mx-auto space-y-5', subTab === 'finalize' ? 'max-w-[1600px]' : 'max-w-5xl')}>
      <div className="flex w-full gap-2.5 align-centre bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1.5 w-full">
        {subTabBtn('collection', 'Scorecard Collection')}
        {subTabBtn('finalize', 'Comparison & Finalize')}
      </div>

      {subTab === 'collection' && (
        <>
          <ScorecardConfigPanel cycleId={cycleId} dispatched={dispatched} onSaved={setConfig} attendees={attendees} />
          <ScorecardDispatchPanel
            vendorName={cycle.vendor_name}
            cycleId={cycleId}
            quarter={cycle.quarter}
            year={cycle.year}
            attendees={attendees}
            onDispatched={onDispatched}
            onRedo={handleRedo}
            onAttendeesChanged={onAttendeesChanged}
            alreadyDispatched={dispatched}
            structure={config?.categories}
          />
          <SubmissionTracker
            key={`tracker-${redoNonce}`}
            cycleId={cycleId}
            vendorName={cycle.vendor_name}
            quarter={cycle.quarter}
            year={cycle.year}
            attendees={attendees}
            onSubmissionsUpdated={handleSubmissionsUpdated}
          />
        </>
      )}

      {subTab === 'finalize' && (
        <>
          {weighted && weighted.teams.length > 0 && (
            <TeamScorecardsSection data={weighted} />
          )}
          {weighted ? (
            <ConsolidatedScorecardPanel cycleId={cycleId} weighted={weighted} />
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
  cycleId, cycle, actions, onActionsExtracted, compiledScores, compiledScorecard, onAlignmentScheduled,
}: {
  cycleId: string
  cycle: NonNullable<ReturnType<typeof getMockCycleById>>
  actions: (ExtractedAction & { origin?: string | null })[]
  onActionsExtracted: (a: ExtractedAction[], origin?: string) => void
  compiledScores: CompiledCategoryScore[] | null
  compiledScorecard?: CompiledScorecard | null
  /** Called when any alignment meeting is scheduled — unlocks Vendor Prep early. */
  onAlignmentScheduled: () => void
}) {
  // Alignment meetings — a cycle can run several. Start with one; the VMO can add
  // more (with a confirm step) and delete any added by mistake. `indices` holds the
  // stable 1-based meeting indexes (kept even if non-contiguous after a delete).
  const [indices, setIndices] = useState<number[]>([1])
  const [activeMeeting, setActiveMeeting] = useState(1)
  const [confirmAdd, setConfirmAdd] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [busyDelete, setBusyDelete] = useState(false)
  useEffect(() => {
    listAlignmentMeetings(cycleId)
      .then((r) => {
        if (r.count > 0) {
          const scheduled = r.meetings.map((m) => m.meeting_index)
          const merged = Array.from(new Set([1, ...scheduled])).sort((a, b) => a - b)
          setIndices(merged)
        }
      })
      .catch(() => { /* backend may not be ready */ })
  }, [cycleId])

  function handleConfirmAdd() {
    const next = Math.max(...indices) + 1
    setIndices((prev) => [...prev, next])
    setActiveMeeting(next)
    setConfirmAdd(false)
  }

  async function handleDeleteMeeting(idx: number) {
    setBusyDelete(true)
    try {
      await deleteAlignmentMeeting(cycleId, idx).catch(() => { /* nothing scheduled — local only */ })
      const remaining = indices.filter((n) => n !== idx)
      const finalIndices = remaining.length > 0 ? remaining : [1]
      setIndices(finalIndices)
      if (activeMeeting === idx) setActiveMeeting(finalIndices[0])
    } finally {
      setBusyDelete(false)
      setConfirmDelete(null)
    }
  }

  // Scorecards are collected from internal-stakeholder TEAMS only (no vendor
  // self-report). Alignment therefore works off the consolidated weighted
  // scorecard: surface low consolidated scores and where internal teams diverge.
  const [weighted, setWeighted] = useState<WeightedScorecard | null>(null)
  const [serverInsights, setServerInsights] = useState<AlignmentInsight[] | null>(null)
  // Alignment comparisons are computed at runtime from the CURRENT consolidated
  // scorecard, so any edit made after the alignment meeting is reflected. Refetch
  // on mount (i.e. each time this tab is opened) and whenever the window/tab
  // regains focus — e.g. after the scorecard was changed elsewhere.
  const loadAlignment = useCallback(() => {
    getWeightedScorecard(cycleId).then(setWeighted).catch(() => { /* not ready */ })
    // Runtime AI insights from the consolidated internal scorecard (LLM narrates when enabled).
    getAlignmentInsights(cycleId)
      .then((r) => setServerInsights(r.data?.insights ?? null))
      .catch(() => setServerInsights(null))
  }, [cycleId])

  useEffect(() => {
    loadAlignment()
    const onFocus = () => loadAlignment()
    const onVisible = () => { if (document.visibilityState === 'visible') loadAlignment() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadAlignment])
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
    : legacyFlags

  // Prefer the backend insights (runtime from consolidated data, LLM-narrated when
  // enabled); fall back to the deterministic client builder, then legacy mock.
  const insights = serverInsights && serverInsights.length > 0
    ? serverInsights
    : hasWeighted
      ? buildInsightsFromWeighted(weighted!)
      : generateAlignmentInsights(comparisons, [])

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
        deltas={[]}
        whatChangedBullets={whatChangedBullets}
        insights={insights.length > 0 ? insights : undefined}
      />
      <AlignmentFlagsPanel flags={flags} />
      <FaceOffModelEditor positions={MOCK_FACE_OFF} />

      {/* Alignment meetings — schedule + transcript + AI minutes per meeting.
          Segmented tab bar (matches the scorecard two-part control). */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Alignment Meetings</h3>
        </div>

        {/* Segmented control: one segment per meeting + trailing "Add" action. */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1.5 mb-4">
          {indices.map((n, pos) => (
            <div key={n} className="relative flex-1 min-w-[180px]">
              <button
                onClick={() => setActiveMeeting(n)}
                className={cn(
                  'w-full px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors',
                  activeMeeting === n
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800'
                )}
              >
                Alignment Meeting {pos + 1}
              </button>
              {indices.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(n) }}
                  title="Delete this alignment meeting"
                  className={cn(
                    'absolute -top-1.5 -right-1.5 p-1 rounded-full border shadow-sm transition-colors',
                    activeMeeting === n
                      ? 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'
                      : 'bg-white dark:bg-slate-800 text-slate-400 hover:text-rose-600 border-slate-200 dark:border-slate-700'
                  )}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
          {!confirmAdd ? (
            <button
              onClick={() => setConfirmAdd(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-lg text-violet-700 dark:text-violet-400 hover:bg-white/70 dark:hover:bg-slate-800 transition-colors"
            >
              <Plus size={15} /> Add another alignment meeting
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-1">
              <span className="text-xs text-slate-600 dark:text-slate-300 pl-1">Add a new alignment meeting?</span>
              <button
                onClick={handleConfirmAdd}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmAdd(false)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Delete confirmation banner. */}
        {confirmDelete !== null && (
          <div className="flex items-center justify-between gap-3 mb-4 px-4 py-3 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30">
            <span className="text-sm text-rose-700 dark:text-rose-300">
              Delete Alignment Meeting {indices.indexOf(confirmDelete) + 1}? Any scheduled Teams meeting will be cancelled.
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleDeleteMeeting(confirmDelete)}
                disabled={busyDelete}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {busyDelete ? 'Deleting…' : 'Delete'}
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={busyDelete}
                className="px-3 py-1.5 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {indices.map((n) => (
          <div key={n} className={activeMeeting === n ? '' : 'hidden'}>
            <AlignmentMeetingPanel
              cycleId={cycleId}
              index={n}
              vendorName={cycle.vendor_name}
              quarter={cycle.quarter}
              year={cycle.year}
              qbrMeetingDate={cycle.teams_meeting_scheduled_at ?? null}
              onActionsExtracted={(acts) => onActionsExtracted(acts, ACTION_ORIGIN.alignmentMeeting(indices.indexOf(n) + 1))}
              alreadyExtracted={actions.some((a) => a.origin === ACTION_ORIGIN.alignmentMeeting(indices.indexOf(n) + 1))}
              onScheduled={onAlignmentScheduled}
            />
          </div>
        ))}
      </div>
      {/* The shared action queue is rendered once, persistently, below the tab. */}
    </div>
  )
}

/* ── Vendor Prep Tab ──────────────────────────────────────── */
function VendorPrepTab({
  cycleId, cycle, vendorBrief, onBriefGenerated, onBriefReady,
  pushbackItems, pushbackResponses, onPushbackAdd, onGenerateResponses, onEditResponses, onPushbackStatusChange,
  onPushbackEdit, onPushbackDelete, onActionsExtracted, alreadyExtracted,
}: {
  cycleId: string
  cycle: NonNullable<ReturnType<typeof getMockCycleById>>
  vendorBrief: VendorBrief | null
  onBriefGenerated: (b: VendorBrief) => void
  onBriefReady: () => void
  pushbackItems: PushbackItem[]
  pushbackResponses: Record<string, PushbackResponse[]>
  onPushbackAdd: (item: Omit<PushbackItem, 'pushback_id' | 'cycle_id' | 'created_at'>) => void
  onGenerateResponses: (id: string, responses: PushbackResponse[]) => void
  onEditResponses: (id: string, responses: PushbackResponse[]) => void
  onPushbackStatusChange: (id: string, s: PushbackItem['status']) => void
  onPushbackEdit: (id: string, patch: Partial<Pick<PushbackItem, 'category' | 'description' | 'raised_by' | 'needs_legal_review'>>) => void
  onPushbackDelete: (id: string) => void
  onActionsExtracted: (a: ExtractedAction[]) => void
  alreadyExtracted: boolean
}) {
  // The pushback section (log the vendor's objections + AI responses + tracker) now
  // lives AFTER the vendor-prep meeting — it surfaces once the meeting transcript is
  // parsed (rendered inside VendorPrepMeetingPanel), because that's when the vendor's
  // actual objections are known. Its state/handlers still live here in CycleDetail.
  const pushbackSection = (
    <>
      <PushbackInput onAdd={onPushbackAdd} />
      <PushbackResponseCards
        cycleId={cycleId}
        items={pushbackItems}
        responses={pushbackResponses}
        onGenerate={onGenerateResponses}
      />
      <UnresolvedItemTracker
        items={pushbackItems}
        responses={pushbackResponses}
        onStatusChange={onPushbackStatusChange}
        onEdit={onPushbackEdit}
        onEditResponses={onEditResponses}
        onDelete={onPushbackDelete}
      />
    </>
  )

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <VendorBriefPanel
        cycleId={cycleId}
        vendorName={cycle.vendor_name}
        quarter={cycle.quarter}
        year={cycle.year}
        brief={vendorBrief}
        onBriefGenerated={onBriefGenerated}
        onBriefReady={onBriefReady}
      />
      <FaceOffModelEditor positions={MOCK_FACE_OFF} />
      <VendorPrepMeetingPanel
        cycleId={cycleId}
        vendorName={cycle.vendor_name}
        quarter={cycle.quarter}
        year={cycle.year}
        qbrMeetingDate={cycle.teams_meeting_scheduled_at ?? null}
        onActionsExtracted={onActionsExtracted}
        alreadyExtracted={alreadyExtracted}
        pushbackSlot={pushbackSection}
      />
    </div>
  )
}

/* ── Meeting Tab ──────────────────────────────────────────── */
function MeetingTab({
  cycleId, cycle, meetingNotes, initialMinutes, teamsMeetingUrl, onNoteAdd, onTranscriptParsed, onMinutesApproved, onActionsExtracted, alreadyExtracted,
}: {
  cycleId: string
  cycle: NonNullable<ReturnType<typeof getMockCycleById>>
  meetingNotes: MeetingNote[]
  initialMinutes: MeetingMinutes | null
  minutesApproved: boolean
  teamsMeetingUrl: string | null
  onNoteAdd: (n: Omit<MeetingNote, 'note_id' | 'meeting_id'>) => void
  onTranscriptParsed: (notes: MeetingNote[]) => void
  onMinutesApproved: () => void
  onActionsExtracted: (a: ExtractedAction[]) => void
  alreadyExtracted: boolean
}) {
  // Pre-meeting briefing — computed live from the consolidated scorecard (this cycle
  // vs the previous one). No hardcoded metrics.
  const [briefing, setBriefing] = useState<ScorecardBriefing | null>(null)
  useEffect(() => {
    getScorecardBriefing(cycleId).then(setBriefing).catch(() => setBriefing(null))
  }, [cycleId])

  // Parsing the QBR/vendor-meeting transcript both stores the notes and feeds any
  // ACTION items into the shared queue (carried forward from the earlier meetings).
  function handleParsed(notes: MeetingNote[]) {
    onTranscriptParsed(notes)
    const acts: ExtractedAction[] = notes
      .filter((n) => n.note_type === 'ACTION')
      .map((n, i) => ({
        action_id: n.note_id || `meeting-act-${i}`,
        description: n.content,
        owner: n.raised_by || 'TBD',
        due_date: null,
        source: 'meeting',
        status: 'OPEN',
      }))
    if (acts.length) onActionsExtracted(acts)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <MeetingBriefingCard
        vendorName={cycle.vendor_name}
        overallScore={briefing?.overall_score ?? null}
        trend={briefing?.trend ?? 'stable'}
        mostImproved={briefing?.most_improved ?? null}
        mostConcerning={briefing?.most_concerning ?? null}
        recurringIssueCount={briefing?.recurring_issue_count ?? 0}
        predictedChallenges={briefing?.predicted_challenges ?? []}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <LiveCapturePanel notes={meetingNotes} onAdd={onNoteAdd} teamsMeetingUrl={teamsMeetingUrl} />
        <TranscriptInput cycleId={cycleId} onParsed={handleParsed} alreadyExtracted={alreadyExtracted} />
      </div>
      <MeetingMinutesViewer
        cycleId={cycleId}
        notes={meetingNotes}
        initialMinutes={initialMinutes}
        vendorName={cycle.vendor_name}
        quarter={cycle.quarter}
        year={cycle.year}
        onApproved={onMinutesApproved}
      />
      {/* The shared action queue is rendered once, persistently, below the tab. */}
    </div>
  )
}

/* ── Actions Tab ──────────────────────────────────────────── */
function ActionsTab({
  actions,
  workflowState,
  onStatusChange,
  onEdit,
  onDelete,
  onAdd,
  onArchive,
}: {
  actions: (ExtractedAction & { cycle_ref?: string; origin?: string | null })[]
  workflowState: WorkflowState
  onStatusChange: (id: string, s: ExtractedAction['status']) => void
  onEdit: (id: string, updates: ActionEdit) => void
  onDelete: (id: string) => void
  onAdd: (a: NewActionInput) => void
  onArchive: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const openCount = actions.filter((a) => a.status !== 'CLOSED').length
  const isArchived = workflowState === 'ARCHIVED'
  // Archiving is only allowed once the final QBR meeting is done.
  const finalMeetingDone =
    WORKFLOW_STATES.indexOf(workflowState) >= WORKFLOW_STATES.indexOf('POST_MEETING_COMPLETE')

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">Unified Action Log</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            All actions across Alignment, Vendor Prep, and Meeting modules — carried across the whole cycle
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setAdding((a) => !a)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20"
          >
            <Plus size={13} /> Add action
          </button>
          <AgentStatusBadge status="complete" />
        </div>
      </div>

      {adding && (
        <AddActionForm
          source="alignment"
          originLabel={ACTION_ORIGIN.manual}
          onAdd={(a) => { onAdd(a); setAdding(false) }}
          onCancel={() => setAdding(false)}
        />
      )}

      {actions.length === 0 ? (
        <EmptyState
          title="No actions yet"
          description="Action items appear here once extracted from a meeting transcript — or add one manually with “Add action”."
        />
      ) : (
        <ActionLog actions={actions} showCycleRef onStatusChange={onStatusChange} onEdit={onEdit} onDelete={onDelete} />
      )}

      {/* Archive — only available once the final QBR meeting is completed, and
          gated behind an explicit confirmation. */}
      {!isArchived && (
        !finalMeetingDone ? (
          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Lock size={16} className="text-slate-400 dark:text-slate-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Archive Cycle</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Archiving unlocks once the final QBR meeting is completed.
                </p>
              </div>
            </div>
            <button
              disabled
              className="shrink-0 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 text-sm font-medium rounded-lg cursor-not-allowed"
            >
              Archive Cycle
            </button>
          </div>
        ) : confirmArchive ? (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-5">
            <div className="flex items-start gap-3 mb-3">
              <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Archive this cycle?</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  This marks the governance process complete and moves the cycle to ARCHIVED.
                  {openCount > 0 && ` ${openCount} action item${openCount > 1 ? 's are' : ' is'} still open.`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onArchive}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Yes, archive cycle
              </button>
              <button
                onClick={() => setConfirmArchive(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 text-sm font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Final meeting complete</p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                  Archive this cycle to mark the governance process complete.
                </p>
              </div>
            </div>
            <button
              onClick={() => setConfirmArchive(true)}
              className="shrink-0 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Archive Cycle
            </button>
          </div>
        )
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
