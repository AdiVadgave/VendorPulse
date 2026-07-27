import type { GovernanceCycle, Vendor } from '@/types/cycle.types'

// Demo/mock fixtures removed — the app now shows only real cycles/vendors from the
// backend API. These arrays are intentionally empty so no fake cycles (NovaTech,
// CoreSystems, Meridian IT) seed into the sidebar/dashboard. The helper functions
// below are kept so existing imports keep compiling.
export const MOCK_VENDORS: Vendor[] = []

export const MOCK_CYCLES: GovernanceCycle[] = []

export function getCycleById(id: string): GovernanceCycle | undefined {
  return MOCK_CYCLES.find((c) => c.cycle_id === id)
}

export function getVendorById(id: string): Vendor | undefined {
  return MOCK_VENDORS.find((v) => v.vendor_id === id)
}

// Alias expected by some pages
export function getMockCycleById(id: string): GovernanceCycle | undefined {
  return getCycleById(id)
}
