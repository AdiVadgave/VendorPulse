import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { TabKey } from '@/utils/constants'
import type { WorkflowState } from '@/utils/constants'
import { WORKFLOW_STATES } from '@/utils/constants'
import type { GovernanceCycle } from '@/types/cycle.types'
import { MOCK_CYCLES } from '@/mock/cycles.mock'
import { getMockCycleById } from '@/mock/cycles.mock'
import { setBackendWorkflowState } from '@/lib/schedulingApi'
import { ssoConfigured } from '@/lib/auth/msalConfig'

function workflowIndex(state: WorkflowState | undefined): number {
  if (!state) return -1
  return WORKFLOW_STATES.indexOf(state)
}

function pickMostAdvanced(
  localState: WorkflowState | undefined,
  backendState: WorkflowState
): WorkflowState {
  const localIdx = workflowIndex(localState)
  const backendIdx = workflowIndex(backendState)
  if (localIdx === -1) return backendState
  if (backendIdx === -1) return localState ?? backendState
  return (localIdx >= backendIdx ? localState : backendState) ?? backendState
}

interface CycleStore {
  activeCycleId: string | null
  activeVendorId: string | null
  activeTab: TabKey
  /** All known cycles — seeded from mock, extended with API-created ones */
  cycles: GovernanceCycle[]
  /** Per-cycle workflow state overrides — advances as user completes steps */
  workflowStates: Record<string, WorkflowState>
  /** Per-cycle last active top-level tab (used to restore UX on return) */
  lastTabs: Record<string, TabKey>
  setActiveCycleId: (id: string) => void
  setActiveVendorId: (id: string) => void
  setActiveTab: (tab: TabKey) => void
  setLastTab: (cycleId: string, tab: TabKey) => void
  getCycleById: (id: string) => GovernanceCycle | undefined
  getWorkflowState: (cycleId: string) => WorkflowState
  advanceWorkflow: (cycleId: string, newState: WorkflowState) => void
  /** Add a newly API-created cycle to the store */
  addCycle: (cycle: GovernanceCycle) => void
  /** Replace all cycles from backend list */
  setCycles: (cycles: GovernanceCycle[]) => void
  /** Remove a cycle by id */
  removeCycle: (cycleId: string) => void
  /** Update an existing cycle's data and workflow state, or add it if not present */
  upsertCycle: (cycle: GovernanceCycle) => void
}

// In a real Shell deployment (SSO configured) cycles come from the backend, so
// never seed demo fixtures — they would render as real data before the first
// fetch and on any route that reads the store without fetching. Keep the demo
// seed only for local dev / demo builds (SSO off).
const SEED_CYCLES: GovernanceCycle[] = ssoConfigured ? [] : [...MOCK_CYCLES]

const initialWorkflowStates: Record<string, WorkflowState> = Object.fromEntries(
  SEED_CYCLES.map((c) => [c.cycle_id, c.workflow_state])
)

export const useCycleStore = create<CycleStore>()(
  persist(
    (set, get) => ({
      activeCycleId: null,
      activeVendorId: null,
      activeTab: 'overview',
      cycles: [...SEED_CYCLES],
      workflowStates: initialWorkflowStates,
      lastTabs: {},

      setActiveCycleId: (id) => set({ activeCycleId: id }),
      setActiveVendorId: (id) => set({ activeVendorId: id }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setLastTab: (cycleId, tab) =>
        set((s) => ({
          lastTabs: { ...s.lastTabs, [cycleId]: tab },
        })),

      getCycleById: (id) => get().cycles.find((c) => c.cycle_id === id),

      getWorkflowState: (cycleId) => {
        const override = get().workflowStates[cycleId]
        if (override) return override
        return get().cycles.find((c) => c.cycle_id === cycleId)?.workflow_state ?? 'CYCLE_CREATED'
      },

      advanceWorkflow: (cycleId, newState) => {
        let didAdvance = false
        let resolvedState: WorkflowState | undefined
        set((s) => {
          // Forward-only: never regress a cycle that has already reached a later state.
          // Without this guard, late-arriving callbacks (e.g. the compiled-scorecard
          // auto-fetch firing after a refresh on a POST_MEETING_COMPLETE cycle) would
          // overwrite the persisted progress with an earlier state.
          const nextState = pickMostAdvanced(s.workflowStates[cycleId], newState)
          resolvedState = nextState
          if (s.workflowStates[cycleId] === nextState) return s
          didAdvance = true
          return {
            cycles: s.cycles.map((c) =>
              c.cycle_id === cycleId ? { ...c, workflow_state: nextState } : c
            ),
            workflowStates: { ...s.workflowStates, [cycleId]: nextState },
          }
        })
        // Sync to backend in the background so progress survives localStorage clears
        // and cross-device use. Skip mock cycles — they don't exist server-side.
        if (didAdvance && resolvedState && !getMockCycleById(cycleId)) {
          void setBackendWorkflowState(cycleId, resolvedState)
        }
      },

      addCycle: (cycle) =>
        set((s) => ({
          cycles: [cycle, ...s.cycles],
          workflowStates: { ...s.workflowStates, [cycle.cycle_id]: cycle.workflow_state },
        })),

      setCycles: (cycles) =>
        set((s) => {
          const mergedCycles = cycles.map((cycle) => {
            const mergedState = pickMostAdvanced(s.workflowStates[cycle.cycle_id], cycle.workflow_state)
            return mergedState === cycle.workflow_state
              ? cycle
              : { ...cycle, workflow_state: mergedState }
          })

          return {
            cycles: mergedCycles,
            workflowStates: Object.fromEntries(
              mergedCycles.map((cycle) => [cycle.cycle_id, cycle.workflow_state])
            ) as Record<string, WorkflowState>,
          }
        }),

      removeCycle: (cycleId) =>
        set((s) => {
          const nextStates = { ...s.workflowStates }
          delete nextStates[cycleId]
          return {
            cycles: s.cycles.filter((cycle) => cycle.cycle_id !== cycleId),
            workflowStates: nextStates,
          }
        }),

      upsertCycle: (cycle) =>
        set((s) => {
          const mergedState = pickMostAdvanced(s.workflowStates[cycle.cycle_id], cycle.workflow_state)
          const nextCycle =
            mergedState === cycle.workflow_state ? cycle : { ...cycle, workflow_state: mergedState }
          const exists = s.cycles.some((c) => c.cycle_id === cycle.cycle_id)
          return {
            cycles: exists
              ? s.cycles.map((c) => (c.cycle_id === nextCycle.cycle_id ? nextCycle : c))
              : [nextCycle, ...s.cycles],
            workflowStates: { ...s.workflowStates, [nextCycle.cycle_id]: nextCycle.workflow_state },
          }
        }),
    }),
    {
      name: 'vendorpulse-cycle-workflow-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ workflowStates: state.workflowStates, lastTabs: state.lastTabs }),
    }
  )
)
