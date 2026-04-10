export type AgentStatus = 'idle' | 'running' | 'awaiting_approval' | 'complete' | 'failed'

export interface AgentResponse<T = unknown> {
  status: 'success' | 'failed' | 'partial' | 'pending_approval'
  agent: string
  summary: string
  data: T
  warnings: string[]
  next_actions: string[]
  requires_approval: boolean
  run_id: string
}
