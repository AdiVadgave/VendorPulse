import type { StakeholderRole } from './cycle.types'

export type InviteStatus = 'ACCEPTED' | 'DECLINED' | 'PENDING'

export type AttendanceConfirmationStatus = 'PENDING' | 'CONFIRMED' | 'REPLACED' | 'DECLINED'

export interface CycleAttendee {
  attendee_id: string
  stakeholder_id: string
  cycle_id?: string
  name: string
  email: string
  role: StakeholderRole
  organisation: string
  is_key: boolean
  invite_status: InviteStatus
  availability_submitted: boolean
  user_id?: string
  replaced_by?: string
  replaced_by_email?: string
  replacement_note?: string
  // Attendance confirmation fields
  confirmation_status?: AttendanceConfirmationStatus
  confirmation_note?: string
}

export interface SlotProposal {
  slot_id: string
  cycle_id: string
  proposed_time: string
  proposed_time_zone?: string
  duration_minutes?: number
  organiser_available: boolean
  exec_sponsor_available: boolean
  rank_score: number
  is_approved: boolean
  attendance_count: number
  total_attendees: number
  conflict_count: number
  attending: string[]
  conflicts: string[]
}

export type SchedulingPhase =
  | 'attendance_confirmation'
  | 'attendee_refresh'
  | 'slot_ranking'
  | 'invite_approval'
  | 'confirmation_tracking'
