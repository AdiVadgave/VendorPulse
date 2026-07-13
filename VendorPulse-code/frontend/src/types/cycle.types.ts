import type { WorkflowState } from '@/utils/constants'

export interface Vendor {
  vendor_id: string
  name: string
  category: string
  status: 'active' | 'inactive' | 'under_review'
}

// Cycle type — currently SPR (Supplier Performance Review) is the only option.
export type CycleType = 'SPR'

export const CYCLE_TYPE_LABELS: Record<CycleType, string> = {
  SPR: 'Supplier Performance Review',
}

// Meetings that can make up a governance cycle.
export type MeetingType =
  | 'INTERNAL_ALIGNMENT'
  | 'SUPPLIER_PREP'
  | 'LEADERSHIP_ALIGNMENT'
  | 'MAIN_GOVERNANCE'

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  INTERNAL_ALIGNMENT: 'Internal Alignment Call',
  SUPPLIER_PREP: 'Supplier Prep Call',
  LEADERSHIP_ALIGNMENT: 'Leadership Alignment Call',
  MAIN_GOVERNANCE: 'Main Governance Meeting',
}

// Where each meeting type is actually scheduled within the app.
export const MEETING_TYPE_TAB: Record<MeetingType, string> = {
  INTERNAL_ALIGNMENT: 'Alignment tab',
  SUPPLIER_PREP: 'Vendor Prep tab',
  LEADERSHIP_ALIGNMENT: 'Alignment tab',
  MAIN_GOVERNANCE: 'Scheduling tab',
}

export interface CycleMeeting {
  meeting_key: string
  meeting_type: MeetingType
  title: string
  enabled: boolean
  order: number
}

export interface GovernanceCycle {
  cycle_id: string
  vendor_id: string
  vendor_name: string
  cycle_type?: CycleType
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'
  year: number
  workflow_state: WorkflowState
  created_at: string
  updated_at: string
  meeting_plan?: CycleMeeting[]
  scorecard_dispatched_at?: string | null
  scorecard_dispatched_to?: string[] | null
  scorecard_dispatched?: boolean
  meeting_scheduled?: boolean
  teams_meeting_url?: string | null
  teams_meeting_web_link?: string | null
  teams_meeting_event_id?: string | null
  teams_meeting_scheduled_at?: string | null
}

export type StakeholderRole =
  | 'VMO_COORDINATOR'
  | 'INTERNAL_LEAD'
  | 'VENDOR_MANAGER'
  | 'EGB_CHAIR'
  | 'TECHNICAL_LEAD'
  | 'COMMERCIAL_LEAD'

export const ROLE_LABELS: Record<StakeholderRole, string> = {
  VMO_COORDINATOR: 'VMO Coordinator',
  INTERNAL_LEAD: 'Internal Lead',
  VENDOR_MANAGER: 'Vendor Manager',
  EGB_CHAIR: 'EGB Chair',
  TECHNICAL_LEAD: 'Technical Lead',
  COMMERCIAL_LEAD: 'Commercial Lead',
}

export interface ActionItem {
  action_id: string
  cycle_id: string
  source_module: 'MODULE_C' | 'MODULE_D' | 'MODULE_E'
  description: string
  owner: string
  due_date: string
  status: 'OPEN' | 'CLOSED' | 'IN_PROGRESS'
}
