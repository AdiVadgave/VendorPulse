import type { MeetingNote, MeetingMinutes } from '@/types/meeting.types'

export const MOCK_MEETING_NOTES: MeetingNote[] = [
  {
    note_id: 'mn1',
    meeting_id: 'm1',
    note_type: 'QUESTION',
    content: 'Can NovaTech provide the root cause analysis for the February SLA breach within 5 business days?',
    raised_by: 'Alex Thompson',
    timestamp: '10:05',
  },
  {
    note_id: 'mn2',
    meeting_id: 'm1',
    note_type: 'OBJECTION',
    content: 'NovaTech disputes the SLA scoring for the February incident — claims Shell network outage was root cause.',
    raised_by: 'Raj Patel',
    timestamp: '10:12',
  },
  {
    note_id: 'mn3',
    meeting_id: 'm1',
    note_type: 'DECISION',
    content: 'Joint incident review to be scheduled within 7 days to reconcile incident timelines and determine SLA applicability.',
    raised_by: 'Sarah Chen',
    timestamp: '10:20',
  },
  {
    note_id: 'mn4',
    meeting_id: 'm1',
    note_type: 'APPRECIATION',
    content: 'Shell recognises NovaTech\'s proactive delivery improvement this quarter — Delivery Quality score up from Q4.',
    raised_by: 'Sarah Chen',
    timestamp: '10:28',
  },
  {
    note_id: 'mn5',
    meeting_id: 'm1',
    note_type: 'QUESTION',
    content: 'What is NovaTech\'s timeline for the AI automation pilot Phase 2 go-live?',
    raised_by: 'Priya Sharma',
    timestamp: '10:35',
  },
  {
    note_id: 'mn6',
    meeting_id: 'm1',
    note_type: 'OBJECTION',
    content: 'AI pilot scope change requires formal contract amendment — NovaTech cannot proceed without a signed SOW.',
    raised_by: 'Emma Davies',
    timestamp: '10:40',
  },
  {
    note_id: 'mn7',
    meeting_id: 'm1',
    note_type: 'ACTION',
    content: 'NovaTech to submit written scope proposal for AI pilot Phase 2 by 15 April 2026. Shell Legal to review.',
    raised_by: 'Alex Thompson',
    timestamp: '10:45',
  },
  {
    note_id: 'mn8',
    meeting_id: 'm1',
    note_type: 'DECISION',
    content: 'Pricing dispute to be escalated to Shell Commercial team. Invoices at 8% increase rate held pending resolution.',
    raised_by: 'Emma Davies',
    timestamp: '10:52',
  },
  {
    note_id: 'mn9',
    meeting_id: 'm1',
    note_type: 'ACTION',
    content: 'Alex Thompson to schedule joint incident review for February SLA event within 7 days.',
    raised_by: 'Alex Thompson',
    timestamp: '10:58',
  },
]

export const MOCK_MEETING_MINUTES: MeetingMinutes = {
  minutes_id: 'min1',
  meeting_id: 'm1',
  cycle_id: 'c1',
  meeting_date: '2026-03-28',
  attendees: [
    'Alex Thompson (Shell VMO)',
    'Sarah Chen (Shell IDT)',
    'Priya Sharma (Shell IDT)',
    'Tom Baker (Shell VMO)',
    "James O'Brien (Shell IDT)",
    'Emma Davies (Shell VMO)',
    'Raj Patel (NovaTech)',
    'Lisa Wang (NovaTech)',
  ],
  executive_summary:
    'The Q1 2026 EGB/QBR for NovaTech Services concluded with an overall positive trajectory, scoring 3.8 against a 5-point scale. Key discussions centred on a disputed SLA incident in February, an AI automation pilot scope clarification, and a pricing increase query. Three action items were agreed and one commercial item escalated to Shell Legal.',
  agenda_summaries: [
    {
      topic: 'Q1 2026 Scorecard Review',
      summary: 'Scores reviewed across five categories. Innovation received the highest score (4.0) with one notable outlier. Communication dipped slightly vs Q4 2025 due to escalation handling concerns. Overall trend remains improving.',
    },
    {
      topic: 'SLA Compliance Discussion',
      summary: 'February incident SLA breach disputed by NovaTech on grounds of Shell network outage as root cause. Joint incident review agreed within 7 days to determine SLA applicability.',
    },
    {
      topic: 'AI Automation Pilot Scope',
      summary: 'NovaTech raised verbal agreement from Q3 2025 for expanded AI pilot scope. Shell confirmed no formal record of agreement. Formal written proposal required for contractual processing.',
    },
    {
      topic: 'Pricing Review',
      summary: '8% pricing increase disputed as exceeding contractual CPI cap of 5%. Escalated to Shell Commercial team. Invoices held pending resolution.',
    },
  ],
  key_decisions: [
    'Joint SLA incident review to be scheduled within 7 days',
    'Pricing dispute escalated to Shell Commercial Lead — invoices at 8% increase held',
    'AI pilot scope change to follow formal SOW amendment process',
    'Q2 2026 EGB/QBR tentatively set for late June 2026',
  ],
  qa_log: [
    {
      question: 'Can NovaTech provide root cause analysis for the February SLA breach within 5 business days?',
      raised_by: 'Alex Thompson',
      response: 'Raj Patel confirmed NovaTech will submit RCA by 2 April 2026.',
    },
    {
      question: 'What is the timeline for AI automation pilot Phase 2 go-live?',
      raised_by: 'Priya Sharma',
      response: 'Lisa Wang stated Phase 2 can commence 4 weeks after formal SOW is signed.',
    },
  ],
  action_items: [
    {
      description: 'Submit root cause analysis for February SLA incident',
      owner: 'Raj Patel (NovaTech)',
      due_date: '2026-04-02',
    },
    {
      description: 'Schedule joint SLA incident timeline review session',
      owner: 'Alex Thompson',
      due_date: '2026-04-04',
    },
    {
      description: 'Submit written AI pilot Phase 2 scope proposal for Shell Legal review',
      owner: 'Lisa Wang (NovaTech)',
      due_date: '2026-04-15',
    },
    {
      description: 'Review pricing CPI clause and index source with Shell Commercial Lead',
      owner: 'Emma Davies',
      due_date: '2026-04-07',
    },
  ],
  generated_at: '2026-03-28T11:30:00Z',
}

export const MOCK_MEETING_ACTIONS = [
  {
    action_id: 'ma1',
    source: 'meeting' as const,
    description: 'Submit root cause analysis for February SLA incident',
    owner: 'Raj Patel (NovaTech)',
    due_date: '2026-04-02',
    status: 'OPEN' as const,
  },
  {
    action_id: 'ma2',
    source: 'meeting' as const,
    description: 'Schedule joint SLA incident timeline review session',
    owner: 'Alex Thompson',
    due_date: '2026-04-04',
    status: 'OPEN' as const,
  },
  {
    action_id: 'ma3',
    source: 'meeting' as const,
    description: 'Submit written AI pilot Phase 2 scope proposal for Shell Legal review',
    owner: 'Lisa Wang (NovaTech)',
    due_date: '2026-04-15',
    status: 'OPEN' as const,
  },
  {
    action_id: 'ma4',
    source: 'meeting' as const,
    description: 'Review pricing CPI clause and index source with Shell Commercial Lead',
    owner: 'Emma Davies',
    due_date: '2026-04-07',
    status: 'OPEN' as const,
  },
]
