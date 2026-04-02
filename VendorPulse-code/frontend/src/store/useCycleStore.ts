import { create } from 'zustand'
import type { TabKey } from '@/utils/constants'
import type { WorkflowState } from '@/utils/constants'
import { MOCK_CYCLES } from '@/mock/cycles.mock'

interface CycleStore {
  activeCycleId: string | null
  activeVendorId: string | null
  activeTab: TabKey
  /** Per-cycle workflow state overrides — advances as user completes steps */
  workflowStates: Record<string, WorkflowState>
  setActiveCycleId: (id: string) => void
  setActiveVendorId: (id: string) => void
  setActiveTab: (tab: TabKey) => void
  getWorkflowState: (cycleId: string) => WorkflowState
  advanceWorkflow: (cycleId: string, newState: WorkflowState) => void
}

/** Seed the store with the mock cycle states */
const initialWorkflowStates: Record<string, WorkflowState> = Object.fromEntries(
  MOCK_CYCLES.map((c) => [c.cycle_id, c.workflow_state])
)

export const useCycleStore = create<CycleStore>()((set, get) => ({
  activeCycleId: null,
  activeVendorId: null,
  activeTab: 'overview',
  workflowStates: initialWorkflowStates,

  setActiveCycleId: (id) => set({ activeCycleId: id }),
  setActiveVendorId: (id) => set({ activeVendorId: id }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  getWorkflowState: (cycleId) => {
    const override = get().workflowStates[cycleId]
    if (override) return override
    return MOCK_CYCLES.find((c) => c.cycle_id === cycleId)?.workflow_state ?? 'CYCLE_CREATED'
  },

  advanceWorkflow: (cycleId, newState) =>
    set((s) => ({
      workflowStates: { ...s.workflowStates, [cycleId]: newState },
    })),
}))
