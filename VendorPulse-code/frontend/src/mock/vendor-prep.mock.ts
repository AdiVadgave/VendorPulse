import type { VendorBrief, PushbackItem, PushbackResponse } from '@/types/vendor-prep.types'

export const MOCK_VENDOR_BRIEF: VendorBrief = {
  overall_score: 3.8,
  overall_trend: 'improving',
  category_ratings: [
    {
      category: 'Delivery Quality',
      score: 3.83,
      rationale: 'Consistent delivery against agreed timelines. Two tickets re-opened in Q1 but resolved within SLA window on second attempt.',
      trend: 'up',
    },
    {
      category: 'SLA Compliance',
      score: 3.67,
      rationale: 'One major incident exceeded the 4-hour SLA response window in February. 9 of 10 incidents closed within SLA in Q1.',
      trend: 'up',
    },
    {
      category: 'Innovation',
      score: 4.0,
      rationale: 'Two AI automation pilots proposed — received mixed internal feedback on roadmap alignment. One pilot approved, one under review.',
      trend: 'up',
    },
    {
      category: 'Communication',
      score: 3.67,
      rationale: 'General communication quality is good. Escalation handling needs improvement — delayed executive escalation in one incident.',
      trend: 'down',
    },
    {
      category: 'Value for Money',
      score: 3.83,
      rationale: 'Q1 pricing increase of 8% was flagged by Shell Commercial Lead as needing stronger justification against agreed rate card.',
      trend: 'up',
    },
  ],
  key_concerns: [
    'Innovation score outlier — internal disagreement on roadmap alignment needs resolution',
    'SLA breach in February incident — vendor must provide root cause analysis and preventive measures',
    'Q1 pricing increase lacks contract-aligned justification from rate card',
  ],
  positive_areas: [
    'Delivery Quality improved by 0.83 points vs Q4 2025',
    'Innovation proposals demonstrate proactive engagement',
    'Overall trajectory is improving — 4th consecutive quarter of score increase',
  ],
  open_actions: 3,
  generated_at: '2026-03-25T10:00:00Z',
}

export const MOCK_PUSHBACK_ITEMS: PushbackItem[] = [
  {
    pushback_id: 'pb1',
    cycle_id: 'c1',
    category: 'DATA_DISPUTE',
    description: 'The February SLA incident was caused by a Shell network outage, not a vendor failure. The 4-hour response clock should not have started until network was restored.',
    raised_by: 'Raj Patel',
    needs_legal_review: false,
    status: 'OPEN',
    created_at: '2026-03-25T11:00:00Z',
  },
  {
    pushback_id: 'pb2',
    cycle_id: 'c1',
    category: 'SCOPE_DISAGREEMENT',
    description: 'The AI automation pilot scope was agreed verbally by Shell IT lead in Q3 2025 but is not reflected in the formal contract. NovaTech invested significant resources based on that verbal agreement.',
    raised_by: 'Lisa Wang',
    needs_legal_review: true,
    status: 'OPEN',
    created_at: '2026-03-25T11:30:00Z',
  },
  {
    pushback_id: 'pb3',
    cycle_id: 'c1',
    category: 'PROCESS_CONCERN',
    description: 'Pricing increase reflects CPI indexation clause in Section 7.4 of the MSA — this should not require additional justification.',
    raised_by: 'David Kim',
    needs_legal_review: false,
    status: 'OPEN',
    created_at: '2026-03-25T12:00:00Z',
  },
]

export const MOCK_PUSHBACK_RESPONSES: Record<string, PushbackResponse[]> = {
  pb1: [
    {
      response_id: 'pr1a',
      pushback_id: 'pb1',
      stance: 'factual',
      content: 'Shell\'s incident log confirms the network outage occurred at 14:32 and vendor was notified at 14:35. Per SLA Appendix B, Section 3.1, the response clock starts at time of notification regardless of root cause. We will share the full incident timeline for review.',
      is_selected: false,
    },
    {
      response_id: 'pr1b',
      pushback_id: 'pb1',
      stance: 'neutral',
      content: 'We appreciate NovaTech raising this. To ensure accuracy, we propose a joint incident review with both teams to reconcile timelines. If the data confirms vendor response was compliant, we will adjust the SLA record accordingly and revisit the score.',
      is_selected: false,
    },
    {
      response_id: 'pr1c',
      pushback_id: 'pb1',
      stance: 'escalation',
      content: 'Shell\'s incident records are authoritative and were shared at the time of closure. If NovaTech believes there is a data error, the formal dispute process in the SLA agreement (Section 9.2) should be followed within 10 business days of the incident close date.',
      is_selected: false,
    },
  ],
  pb2: [
    {
      response_id: 'pr2a',
      pushback_id: 'pb2',
      stance: 'factual',
      content: 'Shell has no record of a formal verbal agreement in Q3 2025 authorising expanded AI pilot scope. The contractual SOW dated 2025-07-01 defines the scope. Any scope changes require a formal Change Request as per Section 5.3 of the MSA.',
      is_selected: false,
    },
    {
      response_id: 'pr2b',
      pushback_id: 'pb2',
      stance: 'neutral',
      content: 'We understand NovaTech invested effort based on an expectation set. We would like to review meeting notes from Q3 to understand the conversation context. This item requires legal review and we will schedule a separate working session within 5 days.',
      is_selected: false,
    },
    {
      response_id: 'pr2c',
      pushback_id: 'pb2',
      stance: 'escalation',
      content: 'This item involves contractual interpretation and has been flagged for Shell Legal review. NovaTech should submit a formal written claim referencing the specific interaction date and participants. Shell will respond within the contractual dispute window.',
      is_selected: false,
    },
  ],
  pb3: [
    {
      response_id: 'pr3a',
      pushback_id: 'pb3',
      stance: 'factual',
      content: 'Shell acknowledges Section 7.4 of the MSA contains a CPI indexation clause. However, the 8% increase exceeds the CPI index cap of 5% stipulated in Clause 7.4(b). The excess 3% requires separate commercial justification.',
      is_selected: false,
    },
    {
      response_id: 'pr3b',
      pushback_id: 'pb3',
      stance: 'neutral',
      content: 'We acknowledge the CPI indexation clause. Could NovaTech share the specific index source used to arrive at 8%? Our Commercial team will cross-reference with the Clause 7.4(b) cap and we can resolve this in the next working session.',
      is_selected: false,
    },
    {
      response_id: 'pr3c',
      pushback_id: 'pb3',
      stance: 'escalation',
      content: 'The 8% figure exceeds the contractual CPI cap and will not be accepted without full justification. Shell Commercial Lead has been notified. Any invoices at the increased rate will be held pending resolution of this commercial dispute.',
      is_selected: false,
    },
  ],
}
