import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { TabKey } from '@/utils/constants'
import type { WorkflowState } from '@/utils/constants'
import { WORKFLOW_STATES } from '@/utils/constants'
import type { GovernanceCycle } from '@/types/cycle.types'
import { MOCK_CYCLES } from '@/mock/cycles.mock'

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

const initialWorkflowStates: Record<string, WorkflowState> = Object.fromEntries(
  MOCK_CYCLES.map((c) => [c.cycle_id, c.workflow_state])
)

export const useCycleStore = create<CycleStore>()(
  persist(
    (set, get) => ({
      activeCycleId: null,
      activeVendorId: null,
      activeTab: 'overview',
      cycles: [...MOCK_CYCLES],
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

      advanceWorkflow: (cycleId, newState) =>
        set((s) => ({
          cycles: s.cycles.map((c) =>
            c.cycle_id === cycleId ? { ...c, workflow_state: newState } : c
          ),
          workflowStates: { ...s.workflowStates, [cycleId]: newState },
        })),

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
