export type AgentStatus = 'active' | 'suspended'
export type AgentPermission =
  | 'transactions'
  | 'orders'
  | 'users'
  | 'currency'
  | 'payments'
  | 'cardholders'

export interface Agent {
  id: string
  name: string
  email: string
  status: AgentStatus
  permissions: AgentPermission[]
  createdAt: { seconds: number; nanoseconds: number } | null
  updatedAt?: { seconds: number; nanoseconds: number } | null
}

export interface PermissionRequest {
  id: string
  agentId: string
  agentName: string
  agentEmail: string
  permission: AgentPermission
  status: 'pending' | 'approved' | 'denied'
  requestedAt: { seconds: number; nanoseconds: number } | null
  resolvedAt?: { seconds: number; nanoseconds: number } | null
}
