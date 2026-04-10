/** Polling intervals (in milliseconds) — adjust here to change across the app */
export const POLLING_INTERVALS = {
  SUBMISSION_TRACKER_MS: 5 * 60 * 1000, // 5 minutes
} as const

export const WORKFLOW_STATES = [
  'CYCLE_CREATED',
  'ATTENDEE_REFRESH_SENT',
  'AVAILABILITY_COLLECTED',
  'MEETING_SCHEDULED',
  'SCORECARD_REQUEST_SENT',
  'SCORECARD_COLLECTION',
  'SCORECARD_COMPILED',
  'INTERNAL_ALIGNMENT',
  'VENDOR_PREP',
  'MEETING_IN_PROGRESS',
  'POST_MEETING_COMPLETE',
  'ARCHIVED',
] as const

export type WorkflowState = (typeof WORKFLOW_STATES)[number]

export const WORKFLOW_STATE_LABELS: Record<WorkflowState, string> = {
  CYCLE_CREATED: 'Created',
  ATTENDEE_REFRESH_SENT: 'Attendees Notified',
  AVAILABILITY_COLLECTED: 'Availability Collected',
  MEETING_SCHEDULED: 'Meeting Scheduled',
  SCORECARD_REQUEST_SENT: 'Scorecard Sent',
  SCORECARD_COLLECTION: 'Collecting Scores',
  SCORECARD_COMPILED: 'Scorecard Compiled',
  INTERNAL_ALIGNMENT: 'Internal Alignment',
  VENDOR_PREP: 'Vendor Prep',
  MEETING_IN_PROGRESS: 'Meeting In Progress',
  POST_MEETING_COMPLETE: 'Post-Meeting',
  ARCHIVED: 'Archived',
}

export const TAB_KEYS = [
  'overview',
  'scheduling',
  'scorecard',
  'alignment',
  'vendor-prep',
  'meeting',
  'actions',
] as const

export type TabKey = (typeof TAB_KEYS)[number]

export const TAB_LABELS: Record<TabKey, string> = {
  overview: 'Overview',
  scheduling: 'Scheduling',
  scorecard: 'Scorecard',
  alignment: 'Alignment',
  'vendor-prep': 'Vendor Prep',
  meeting: 'Meeting',
  actions: 'Actions',
}

/** Returns the minimum workflow state index required to access a tab */
export const TAB_MIN_STATE_INDEX: Record<TabKey, number> = {
  overview: 0,
  scheduling: 0,
  scorecard: 3, // MEETING_SCHEDULED
  alignment: 6, // SCORECARD_COMPILED
  'vendor-prep': 7, // INTERNAL_ALIGNMENT
  meeting: 8, // VENDOR_PREP
  actions: 10, // POST_MEETING_COMPLETE
}

/**
 * Returns the most appropriate tab to land on given the cycle's current workflow state.
 * Used to restore the user to the right tab after a page refresh or navigation.
 */
export function getDefaultTabFromState(state: WorkflowState): TabKey {
  const idx = WORKFLOW_STATES.indexOf(state)
  if (idx >= WORKFLOW_STATES.indexOf('POST_MEETING_COMPLETE')) return 'actions'
  if (idx >= WORKFLOW_STATES.indexOf('MEETING_IN_PROGRESS')) return 'meeting'
  if (idx >= WORKFLOW_STATES.indexOf('VENDOR_PREP')) return 'vendor-prep'
  if (idx >= WORKFLOW_STATES.indexOf('INTERNAL_ALIGNMENT')) return 'alignment'
  if (idx >= WORKFLOW_STATES.indexOf('SCORECARD_REQUEST_SENT')) return 'scorecard'
  return 'scheduling'
}
