// Shared data types. Field names mirror the server op schema exactly
// (internal/sync/ops.go); never rename a field without a migration plan.

export type Entity = 'project' | 'task' | 'label'
export const ENTITIES: readonly Entity[] = ['project', 'task', 'label']

export interface Op {
  id: string
  entity: Entity
  entityId: string
  field: string
  value: unknown
  ts: number
  device: string
  seq?: number
}

/** Per-field last-writer-wins clock stored next to each row. */
export type Clock = Record<string, { ts: number; device: string }>

export interface Due {
  /** Floating calendar date, YYYY-MM-DD, interpreted in the viewer's time zone. */
  date: string
  /** Optional floating wall-clock time, HH:MM. */
  time?: string
}

export interface Project {
  id: string
  name: string
  color: string
  position: number
  archived: boolean
  parent_id: string | null
  created_at: number
  deleted_at: number | null
  _clock: Clock
}

export type Priority = 1 | 2 | 3 | 4

export interface Task {
  id: string
  title: string
  description: string
  project_id: string | null
  parent_id: string | null
  priority: Priority
  due: Due | null
  /** Ids of labels (see Label). Unknown or deleted ids are kept but never displayed. */
  labels: string[]
  position: number
  created_at: number
  completed_at: number | null
  deleted_at: number | null
  _clock: Clock
}

export interface Label {
  id: string
  name: string
  color: string
  position: number
  created_at: number
  deleted_at: number | null
  _clock: Clock
}

export interface User {
  id: string
  email: string
  name: string
  role: 'owner' | 'member'
  createdAt: number
}

export interface AuthStatus {
  setupRequired: boolean
  signupAllowed: boolean
  authenticated: boolean
  user: User | null
  version: string
}

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

/** Owner's view of an invitation (server-side account data, never synced). Never carries the secret. */
export interface Invitation {
  id: string
  status: InvitationStatus
  email: string | null
  role: 'member'
  createdBy: string
  createdByName: string
  createdAt: number
  expiresAt: number
  acceptedAt: number | null
  acceptedBy: { id: string; email: string; name: string } | null
  revokedAt: number | null
}

/** What an anonymous invitee may learn about an invitation before accepting. */
export interface InvitationPreview {
  inviterName: string
  email: string | null
  expiresAt: number
}

/** Events an outbound webhook can subscribe to (OpenSpec `webhooks`). */
export type WebhookEvent =
  | 'task.created' | 'task.updated' | 'task.completed' | 'task.reopened' | 'task.deleted'
  | 'project.created' | 'project.updated' | 'project.archived' | 'project.deleted'

/** A user's webhook (server-side configuration, never synced). `secret` is present only in the create response. */
export interface Webhook {
  id: string
  url: string
  events: WebhookEvent[]
  projectId: string | null
  enabled: boolean
  disabledReason: string | null
  consecutiveFailures: number
  createdAt: number
  updatedAt: number
  secret?: string
}

export type WebhookDeliveryStatus = 'pending' | 'retry' | 'delivered' | 'failed'

/** One entry of a webhook's delivery log. */
export interface WebhookDelivery {
  id: string
  webhookId: string
  event: WebhookEvent | 'ping'
  status: WebhookDeliveryStatus
  attempts: number
  nextAttemptAt: number | null
  statusCode: number | null
  error: string | null
  responseExcerpt: string | null
  durationMs: number | null
  createdAt: number
  deliveredAt: number | null
}

export interface WebhookInput {
  url?: string
  events?: WebhookEvent[]
  projectId?: string | null
  enabled?: boolean
}

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'unauthenticated'

export const PROJECT_FIELDS = ['name', 'color', 'position', 'archived', 'parent_id', 'created_at', 'deleted_at'] as const
export const TASK_FIELDS = [
  'title', 'description', 'project_id', 'parent_id', 'priority', 'due', 'labels',
  'position', 'created_at', 'completed_at', 'deleted_at',
] as const
export const LABEL_FIELDS = ['name', 'color', 'position', 'created_at', 'deleted_at'] as const
