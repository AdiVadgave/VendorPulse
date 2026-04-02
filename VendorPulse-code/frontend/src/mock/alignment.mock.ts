import type { ScoreDelta, AlignmentFlag, FaceOffPosition, ExtractedAction } from '@/types/alignment.types'

export const MOCK_SCORE_DELTAS: ScoreDelta[] = [
  {
    category: 'DELIVERY_QUALITY',
    current_avg: 3.83,
    previous_avg: 3.0,
    delta: 0.83,
    direction: 'up',
    significant: false,
  },
  {
    category: 'SLA_COMPLIANCE',
    current_avg: 3.67,
    previous_avg: 3.0,
    delta: 0.67,
    direction: 'up',
    significant: false,
  },
  {
    category: 'INNOVATION',
    current_avg: 4.0,
    previous_avg: 3.0,
    delta: 1.0,
    direction: 'up',
    significant: true,
  },
  {
    category: 'COMMUNICATION',
    current_avg: 3.67,
    previous_avg: 4.0,
    delta: -0.33,
    direction: 'down',
    significant: false,
  },
  {
    category: 'VALUE_FOR_MONEY',
    current_avg: 3.83,
    previous_avg: 3.0,
    delta: 0.83,
    direction: 'up',
    significant: false,
  },
]

export const MOCK_ALIGNMENT_FLAGS: AlignmentFlag[] = [
  {
    flag_id: 'af1',
    category: 'INNOVATION',
    spread: 3.0,
    high_stakeholder: 'Alex Thompson',
    high_score: 5,
    low_stakeholder: 'Priya Sharma',
    low_score: 2,
    prompt_question:
      'Alex Thompson scores Innovation at 5; Priya Sharma at 2 — resolve internally before vendor call. Does the AI automation proposal meet our technical roadmap requirements?',
  },
  {
    flag_id: 'af2',
    category: 'COMMUNICATION',
    spread: 1.5,
    high_stakeholder: 'Sarah Chen',
    high_score: 4,
    low_stakeholder: 'Priya Sharma',
    low_score: 3,
    prompt_question:
      'Sarah Chen rates Communication at 4; Priya Sharma at 3 — align on escalation handling expectations before meeting.',
  },
]

export const MOCK_FACE_OFF: FaceOffPosition[] = [
  { position_number: 1, shell_name: 'Alex Thompson', shell_role: 'VMO Coordinator', vendor_name: 'Raj Patel', vendor_role: 'Account Director' },
  { position_number: 2, shell_name: 'Sarah Chen', shell_role: 'EGB Chair', vendor_name: 'Lisa Wang', vendor_role: 'Delivery Director' },
  { position_number: 3, shell_name: 'Priya Sharma', shell_role: 'Internal Lead', vendor_name: 'David Kim', vendor_role: 'Commercial Manager' },
  { position_number: 4, shell_name: "James O'Brien", shell_role: 'Technical Lead', vendor_name: 'Chen Wei', vendor_role: 'Technical Architect' },
  { position_number: 5, shell_name: 'Tom Baker', shell_role: 'Vendor Manager', vendor_name: 'Anita Ross', vendor_role: 'Operations Lead' },
  { position_number: 6, shell_name: 'Emma Davies', shell_role: 'Commercial Lead', vendor_name: '', vendor_role: '' },
]

export const MOCK_ALIGNMENT_ACTIONS: ExtractedAction[] = [
  {
    action_id: 'ac1',
    description: 'Align on AI automation proposal scope — schedule follow-up with Priya and Alex before vendor prep call',
    owner: 'Alex Thompson',
    due_date: '2026-03-28',
    source: 'alignment',
    status: 'OPEN',
  },
  {
    action_id: 'ac2',
    description: 'Prepare factual data to support SLA compliance score discussion with vendor',
    owner: 'Priya Sharma',
    due_date: '2026-03-26',
    source: 'alignment',
    status: 'OPEN',
  },
  {
    action_id: 'ac3',
    description: 'Review Q4 innovation KPI commitments from contract — confirm which were delivered vs outstanding',
    owner: "James O'Brien",
    due_date: '2026-03-25',
    source: 'alignment',
    status: 'OPEN',
  },
]
