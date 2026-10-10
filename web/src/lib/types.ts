// Shared data types. Field names mirror the server op schema exactly
// (internal/sync/ops.go); never rename a field without a migration plan.

export type Entity = 'project' | 'task' | 'label' | 'view' | 'reminder' | 'section'
export const ENTITIES: readonly Entity[] = ['project', 'task', 'label', 'view', 'reminder', 'section']

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
  /**
   * Recurrence rule in canonical form (docs/recurrence.md) or null. A task with a
   * rule is a series: completing it records an occurrence and moves `due` forward.
   */
  recurrence: string | null
  /** On a completed occurrence record or a detached copy: the id of its series; otherwise null. */
  series_id: string | null
  /**
   * Account id of the assignee or null (OpenSpec `task-assignment`). The server
   * accepts only a current member of the task's shared project, or the author for
   * a personal task, and refuses anything else with reason `not_a_member`.
   */
  assignee_id: string | null
  /**
   * Section of the task's project or null (OpenSpec `board-view`). A reference to a
   * deleted section, a section of another project or one not received yet is shown
   * as "No section" and never repaired by a write (design D3).
   */
  section_id: string | null
  _clock: Clock
}

/**
 * A named, ordered container inside one project (OpenSpec `board-view`): a heading
 * in the list view, a column on the board. `project_id` never changes after creation.
 */
export interface Section {
  id: string
  name: string
  project_id: string
  position: number
  created_at: number
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

export type ViewKind = 'list' | 'dashboard'
export type GroupBy = 'project' | 'due' | 'priority' | 'label' | 'none'
export type SortBy = 'due' | 'priority' | 'position' | 'created' | 'title'
export type SortDir = 'asc' | 'desc'

export const VIEW_KINDS: readonly ViewKind[] = ['list', 'dashboard']
export const GROUP_BY_OPTIONS: readonly GroupBy[] = ['project', 'due', 'priority', 'label', 'none']
export const SORT_BY_OPTIONS: readonly SortBy[] = ['due', 'priority', 'position', 'created', 'title']
export const SORT_DIR_OPTIONS: readonly SortDir[] = ['asc', 'desc']

/**
 * A saved view (OpenSpec `custom-views`): a filter query plus presentation options.
 * The enumerations are stored as received; a value this build does not know (sent by
 * a newer client) is kept in the row and mapped to the default when read, see
 * `viewOptions` in lib/views.ts. `panels` holds view ids and is only used by dashboards.
 */
export interface View {
  id: string
  name: string
  query: string
  kind: string
  group_by: string
  sort_by: string
  sort_dir: string
  pinned: boolean
  position: number
  color: string
  panels: string[]
  created_at: number
  deleted_at: number | null
  _clock: Clock
}

export type ReminderKind = 'relative' | 'absolute'

/**
 * A reminder on a task (OpenSpec change `reminders`). `fire_at` is always the
 * resolved instant (Unix ms): for a relative reminder it is the task's due time
 * (09:00 local for a date-only due) plus `offset_minutes`, recomputed by the device
 * that changes the due date; null while the task has no due date. `delivered_at`
 * is written by the server when a push went out; a delivery older than `fire_at`
 * belongs to an earlier firing (a snooze or a moved due date).
 */
export interface Reminder {
  id: string
  task_id: string
  kind: ReminderKind
  offset_minutes: number | null
  fire_at: number | null
  delivered_at: number | null
  dismissed_at: number | null
  created_at: number
  deleted_at: number | null
  _clock: Clock
}

/** A device's push subscription as the server reports it (never the endpoint or keys). */
export interface PushSubscriptionStatus {
  id: string
  deviceId: string
  includeContent: boolean
  createdAt: number
  lastOkAt: number | null
  lastError: string
  failures: number
  /** The push service failed repeatedly: the device should re-enable notifications. */
  needsRenewal: boolean
}

/** Account role on the server (OpenSpec `user-management`). */
export type AccountRole = 'owner' | 'admin' | 'member'

export interface User {
  id: string
  email: string
  name: string
  role: AccountRole
  createdAt: number
}

/**
 * An entry of the server's user list (owner and admins only). Fetched live and
 * kept in component state: never written to IndexedDB or any cache.
 */
export interface AdminUser extends User {
  lastLoginAt: number | null
  status: 'active' | 'deactivated'
}

/** What a reset link reveals to its holder. */
export interface ResetPreview {
  email: string
  expiresAt: number
}

export interface AuthStatus {
  setupRequired: boolean
  signupAllowed: boolean
  authenticated: boolean
  user: User | null
  version: string
  /** Server has an https (or localhost) base URL, so passkey ceremonies work. */
  passkeysAvailable?: boolean
  /** Second-factor state of the signed-in account (absent when anonymous). */
  mfa?: MfaStatus
}

/** Owner policy for the second factor (OpenSpec `mfa-totp`). */
export type MfaPolicy = 'none' | 'owner' | 'all'

/** Second-factor state as reported by /me, /mfa and auth/status. Server account data, never synced. */
export interface MfaStatus {
  enrolled: boolean
  recoveryCodesRemaining: number
  policy: MfaPolicy
  /** The owner's policy covers this account. */
  required: boolean
  /** The session may only enrol until a second factor is confirmed. */
  restricted: boolean
}

/** A browser remembered for 30 days after the second step. */
export interface TrustedDevice {
  id: string
  userAgent: string
  createdAt: number
  expiresAt: number
  lastUsedAt: number | null
}

/** Answer of the password (or passkey) step: a session, or a second-step challenge. */
export type LoginResult = { user: User; mfaRequired?: undefined } | { mfaRequired: true; challenge: string; expiresAt: number; user?: undefined }

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

/** 'reseeding': the server was restored from a backup and this device is re-sending its local state. */
export type SyncState = 'idle' | 'syncing' | 'reseeding' | 'offline' | 'error' | 'unauthenticated' | 'restricted'

export const PROJECT_FIELDS = ['name', 'color', 'position', 'archived', 'parent_id', 'created_at', 'deleted_at'] as const
export const TASK_FIELDS = [
  'title', 'description', 'project_id', 'parent_id', 'priority', 'due', 'labels',
  'position', 'created_at', 'completed_at', 'deleted_at', 'estimate_minutes', 'recurrence', 'series_id',
  'assignee_id', 'section_id',
] as const
export const SECTION_FIELDS = ['name', 'project_id', 'position', 'created_at', 'deleted_at'] as const
export const LABEL_FIELDS = ['name', 'color', 'position', 'created_at', 'deleted_at'] as const

// ---- backups (owner-only server settings; never synced) ----

export type BackupDestination = 'local' | 's3' | 'webdav'
export type BackupFrequency = 'off' | 'hourly' | 'daily' | 'weekly'

export interface BackupSettings {
  destination: BackupDestination
  local: { dir: string }
  s3: { endpoint: string; region: string; bucket: string; prefix: string; accessKey: string; pathStyle: boolean }
  webdav: { url: string; username: string; allowHttp: boolean }
  schedule: { frequency: BackupFrequency; time: string; weekday: number }
  retention: { keepLast: number; maxAgeDays: number }
  compress: boolean
  scheduleSince?: number
}

/** Which secrets the server holds. Values are never sent to the client. */
export interface BackupSecretFlags {
  hasS3SecretKey: boolean
  hasWebdavPassword: boolean
  hasPassphrase: boolean
}

/** Secret changes: absent keeps, '' clears, a value replaces. */
export interface BackupSecretUpdate {
  s3SecretKey?: string
  webdavPassword?: string
  passphrase?: string
}

export interface BackupRun {
  id: string
  kind: 'manual' | 'scheduled'
  startedAt: number
  finishedAt: number | null
  status: 'running' | 'succeeded' | 'failed'
  bytes: number
  destination: string
  archiveName: string
  error: string
  durationMs: number | null
}

export interface BackupStatus {
  enabled: boolean
  destination: BackupDestination
  schedule: BackupSettings['schedule']
  encrypted: boolean
  running: BackupRun | null
  nextRunAt: number | null
  lastRun: BackupRun | null
  history: BackupRun[]
}
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
  'user.deactivated', 'user.reactivated', 'user.deleted',
  'password.reset_issued', 'password.reset_completed', 'password.changed',
  'owner.transferred',
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

export const REMINDER_FIELDS = [
  'task_id', 'kind', 'offset_minutes', 'fire_at', 'delivered_at', 'dismissed_at', 'created_at', 'deleted_at',
] as const

export const VIEW_FIELDS = [
  'name', 'query', 'kind', 'group_by', 'sort_by', 'sort_dir', 'pinned', 'position', 'color', 'panels',
  'created_at', 'deleted_at',
] as const

// ---- project sharing (OpenSpec `project-sharing`) ----

/** A role on a shared project; an unshared project is implicitly the user's own ('owner'). */
export type ProjectRole = 'owner' | 'admin' | 'editor' | 'viewer'
export const MEMBER_ROLES: readonly Exclude<ProjectRole, 'owner'>[] = ['viewer', 'editor', 'admin']

export interface ProjectMember {
  userId: string
  name: string
  email: string
  role: ProjectRole
}

/**
 * The caller's view of one shared project, sent in every sync response and cached
 * in the local `memberships` table so roles render the same offline. Authorization
 * data owned by the server, never written through ops.
 */
export interface Membership {
  projectId: string
  role: ProjectRole
  ownerId: string
  members: ProjectMember[]
}

/** A pushed op the server refused (forbidden, scope_change or not_a_member); it was not stored. */
export interface Rejection {
  id: string
  reason: string
}

/** POST /api/v1/sync response. Every field after `serverTime` is optional (older servers). */
export interface SyncResponse {
  applied: number
  ops: Op[]
  cursor: number
  hasMore: boolean
  serverTime: number
  generation?: string
  rejected?: Rejection[]
  memberships?: Membership[]
  /** Entities purged on the server since the cursor (trash-and-history); delete them locally. */
  purged?: { entity: Entity; entityId: string }[]
  /** Days an item stays in the Trash before the server purges it; 0 = never (additive). */
  trashRetentionDays?: number
}

/** One field write in a history change set (trash-and-history). */
export interface HistoryChange {
  opId: string
  field: string
  from: unknown
  to: unknown
  /** The write arrived after a newer one and never became the stored value. */
  lost?: boolean
}

/** Writes made at one timestamp by one device ("server" = REST API). */
export interface ChangeSet {
  ts: number
  device: string
  userId: string
  changes: HistoryChange[]
}

export interface HistoryPage {
  entity: 'task' | 'project'
  id: string
  changeSets: ChangeSet[]
  more: boolean
  before?: number
}

export interface PurgeCounts {
  tasks: number
  projects: number
  reminders: number
  /** Sections of purged projects (board-view); absent from older servers. */
  sections?: number
}

/** Payload of an `assigned` notification (task-assignment); names resolved by the server. */
export interface AssignedPayload {
  assigneeId: string
  actorId: string
  actorName: string
  taskId: string
  taskTitle: string
  projectId?: string
  projectName?: string
  at: number
}

/**
 * An in-app notification (GET /api/v1/notifications), cached in the local
 * `notifications` table so it shows offline. Server-side account data, not an op.
 * `readPending` marks a local "read" not yet confirmed by the server.
 */
export interface AppNotification {
  id: string
  kind: string
  payload: AssignedPayload
  createdAt: number
  readAt: number | null
  readPending?: boolean
}
