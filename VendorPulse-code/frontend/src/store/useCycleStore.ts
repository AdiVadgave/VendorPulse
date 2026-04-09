import { create } from 'zustand'
import type { TabKey } from '@/utils/constants'
import type { WorkflowState } from '@/utils/constants'
import type { GovernanceCycle } from '@/types/cycle.types'
import { MOCK_CYCLES } from '@/mock/cycles.mock'

interface CycleStore {
  activeCycleId: string | null
  activeVendorId: string | null
  activeTab: TabKey
  /** All known cycles — seeded from mock, extended with API-created ones */
  cycles: GovernanceCycle[]
  /** Per-cycle workflow state overrides — advances as user completes steps */
  workflowStates: Record<string, WorkflowState>
  setActiveCycleId: (id: string) => void
  setActiveVendorId: (id: string) => void
  setActiveTab: (tab: TabKey) => void
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

export const useCycleStore = create<CycleStore>()((set, get) => ({
  activeCycleId: null,
  activeVendorId: null,
  activeTab: 'overview',
  cycles: [...MOCK_CYCLES],
  workflowStates: initialWorkflowStates,

  setActiveCycleId: (id) => set({ activeCycleId: id }),
  setActiveVendorId: (id) => set({ activeVendorId: id }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  getCycleById: (id) => get().cycles.find((c) => c.cycle_id === id),

  getWorkflowState: (cycleId) => {
    const override = get().workflowStates[cycleId]
    if (override) return override
    return get().cycles.find((c) => c.cycle_id === cycleId)?.workflow_state ?? 'CYCLE_CREATED'
  },

  advanceWorkflow: (cycleId, newState) =>
    set((s) => ({
      workflowStates: { ...s.workflowStates, [cycleId]: newState },
    })),

  addCycle: (cycle) =>
    set((s) => ({
      cycles: [cycle, ...s.cycles],
      workflowStates: { ...s.workflowStates, [cycle.cycle_id]: cycle.workflow_state },
    })),

  setCycles: (cycles) =>
    set(() => ({
      cycles,
      workflowStates: Object.fromEntries(
        cycles.map((cycle) => [cycle.cycle_id, cycle.workflow_state])
      ) as Record<string, WorkflowState>,
    })),

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
      const exists = s.cycles.some((c) => c.cycle_id === cycle.cycle_id)
      return {
        cycles: exists
          ? s.cycles.map((c) => (c.cycle_id === cycle.cycle_id ? cycle : c))
          : [cycle, ...s.cycles],
        workflowStates: { ...s.workflowStates, [cycle.cycle_id]: cycle.workflow_state },
      }
    }),
}))
