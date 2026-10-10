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
  /** Duration estimate in minutes (positive integer, at most 10080) or null. */
  estimate_minutes: number | null
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
  /** Server has an https (or localhost) base URL, so passkey ceremonies work. */
  passkeysAvailable?: boolean
}

/** A registered passkey as listed by GET /api/v1/passkeys. Server-only account data, never synced. */
export interface Passkey {
  id: string
  name: string
  createdAt: number
  lastUsedAt: number | null
  suspiciousAt: number | null
  backedUp: boolean
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
  'position', 'created_at', 'completed_at', 'deleted_at', 'estimate_minutes',
] as const
export const LABEL_FIELDS = ['name', 'color', 'position', 'created_at', 'deleted_at'] as const

/** Event names of the server audit log (closed catalogue, see docs/api.md#audit-log). */
export const AUDIT_EVENT_NAMES = [
  'login.succeeded', 'login.failed', 'logout',
  'mfa.enrolled', 'mfa.disabled', 'mfa.reset', 'mfa.challenge_failed',
  'passkey.registered', 'passkey.deleted',
  'token.created', 'token.revoked',
  'invitation.created', 'invitation.accepted', 'invitation.revoked',
  'role.changed', 'settings.changed',
  'identity.linked', 'identity.unlinked',
  'export.requested', 'audit.exported',
  'backup.created', 'backup.restored',
] as const
export type AuditEventName = (typeof AUDIT_EVENT_NAMES)[number]

/** One server audit event. Server-side only: fetched live, never stored in IndexedDB. */
export interface AuditEvent {
  id: number
  ts: number
  name: AuditEventName
  outcome: 'success' | 'failure'
  actorId: string | null
  actorEmail: string | null
  targetId: string | null
  targetEmail: string | null
  ip: string | null
  userAgent: string
  details: Record<string, string>
}

/** Filters of GET /api/v1/audit and /api/v1/audit/export. Times are Unix ms. */
export interface AuditFilters {
  name?: AuditEventName
  actor?: string
  target?: string
  outcome?: 'success' | 'failure'
  from?: number
  to?: number
}

export interface AuditSettings {
  retentionDays: number
  logIp: boolean
}

// ---- Import (server-side jobs, never synced; see docs/import.md) ----

export type ImportFormat = 'opentodo' | 'json-items' | 'json-lists' | 'json-generic' | 'csv'
export const IMPORT_FORMATS: readonly ImportFormat[] = ['opentodo', 'json-items', 'json-lists', 'json-generic', 'csv']

export interface ImportOptions {
  format?: ImportFormat
  /** Project id for rows without a project; omitted = Inbox. */
  targetProject?: string
  /** IANA time zone used to turn zoned date-times into floating ones. */
  timeZone?: string
  sections?: 'label' | 'ignore'
  duplicates?: 'skip' | 'import'
  errors?: 'skip_rows' | 'abort'
  existing?: 'skip' | 'overwrite'
}

export interface ImportTotals {
  rows: number
  create: number
  update: number
  skip: number
  error: number
  possibleDuplicates: number
  warnings: number
  newProjects: number
  newLabels: number
  entities: number
  written: number
  ops: number
}

export type ImportOutcome = 'create' | 'update' | 'skip' | 'error'

export interface ImportRow {
  row?: number
  sourceId?: string
  kind: 'project' | 'task' | 'label'
  title: string
  project?: string
  outcome: ImportOutcome
  reason?: string
  warnings?: string[]
}

export interface ImportPreview {
  format: ImportFormat
  version?: number
  columns?: { recognised: string[]; ignored: string[] }
  options: ImportOptions
  totals: ImportTotals
  rows: ImportRow[]
  truncated: boolean
}

export type ImportStatus = 'running' | 'done' | 'failed' | 'undone'

export interface ImportJob {
  id: string
  format: ImportFormat
  status: ImportStatus
  options: ImportOptions
  totals: ImportTotals
  errors: { row?: number; sourceId?: string; reason: string }[]
  message?: string
  createdAt: number
  finishedAt: number | null
  undoneAt: number | null
}
