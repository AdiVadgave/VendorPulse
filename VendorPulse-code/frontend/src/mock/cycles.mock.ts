import type { GovernanceCycle, Vendor } from '@/types/cycle.types'

export const MOCK_VENDORS: Vendor[] = [
  {
    vendor_id: 'v1',
    name: 'NovaTech Services',
    category: 'IT Infrastructure',
    status: 'active',
  },
  {
    vendor_id: 'v2',
    name: 'CoreSystems Ltd',
    category: 'Software Development',
    status: 'active',
  },
  {
    vendor_id: 'v3',
    name: 'Meridian IT',
    category: 'Managed Services',
    status: 'active',
  },
]

export const MOCK_CYCLES: GovernanceCycle[] = [
  {
    cycle_id: 'c1',
    vendor_id: 'v1',
    vendor_name: 'NovaTech Services',
    quarter: 'Q1',
    year: 2026,
    workflow_state: 'POST_MEETING_COMPLETE',
    created_at: '2026-03-01T09:00:00Z',
    updated_at: '2026-03-28T11:30:00Z',
  },
  {
    cycle_id: 'c2',
    vendor_id: 'v2',
    vendor_name: 'CoreSystems Ltd',
    quarter: 'Q1',
    year: 2026,
    workflow_state: 'SCORECARD_COMPILED',
    created_at: '2026-03-02T10:00:00Z',
    updated_at: '2026-03-18T11:00:00Z',
  },
  {
    cycle_id: 'c3',
    vendor_id: 'v3',
    vendor_name: 'Meridian IT',
    quarter: 'Q1',
    year: 2026,
    workflow_state: 'CYCLE_CREATED',
    created_at: '2026-03-10T08:00:00Z',
    updated_at: '2026-03-10T08:00:00Z',
  },
]

export function getCycleById(id: string): GovernanceCycle | undefined {
  return MOCK_CYCLES.find((c) => c.cycle_id === id)
}

export function getVendorById(id: string): Vendor | undefined {
  return MOCK_VENDORS.find((v) => v.vendor_id === id)
}
