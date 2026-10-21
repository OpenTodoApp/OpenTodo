// Shared data types. Field names mirror the server op schema exactly
// (internal/sync/ops.go); never rename a field without a migration plan.

export type Entity = 'project' | 'task' | 'label' | 'view' | 'reminder' | 'section' | 'comment' | 'project_prefs' | 'user_prefs' | 'attachment' | 'field' | 'review' | 'time_entry' | 'place'
export const ENTITIES: readonly Entity[] = ['project', 'task', 'label', 'view', 'reminder', 'section', 'comment', 'project_prefs', 'user_prefs', 'attachment', 'field', 'review', 'time_entry', 'place']

export interface Op {
  id: string
  entity: Entity
  entityId: string
  field: string
  value: unknown
  ts: number
  device: string
  seq?: number
  /**
   * Account id of the author, stamped by the server on served ops
   * (comments-and-activity). Never sent: the server ignores it on input.
   */
  actor?: string
}

/** Per-field last-writer-wins clock stored next to each row. */
export type Clock = Record<string, { ts: number; device: string }>

export interface Due {
  /** Calendar date, YYYY-MM-DD: floating (the viewer's day) unless `tz` is set. */
  date: string
  /** Optional wall-clock time, HH:MM: floating unless `tz` is set. */
  time?: string
  /**
   * IANA time zone (absolute-datetimes): when present (only together with `time`)
   * the due is zoned and denotes the instant `date time` in that zone. Use
   * `localDueOf` from dates.ts to read it in the viewer's zone.
   */
  tz?: string
}

export interface Project {
  id: string
  name: string
  color: string
  position: number
  archived: boolean
  parent_id: string | null
  /** An icon name from the app's set (ux-overhaul "Project icon"); null shows the colour dot. */
  icon?: string | null
  created_at: number
  deleted_at: number | null
  /** The project's note (OpenSpec project-notes): Markdown projection of notes_doc. Read with `?? ''`. */
  description?: string
  /** The mergeable note document (an envelope), or '' / absent. */
  notes_doc?: string
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
   * The day the task must be finished by, a bare "YYYY-MM-DD" with no time or zone,
   * separate from the planned `due` date (OpenSpec change `deadlines`). Optional:
   * rows stored before the field read as undefined; read it with `?? null`.
   */
  deadline?: string | null
  /**
   * When the task becomes relevant (OpenSpec change `someday-and-evening`): null
   * (anytime), a date "YYYY-MM-DD" before which it is deferred, or "someday"
   * (parked). Optional on rows stored before the field; read with `?? null`.
   */
  start?: string | null
  /** This Evening: grouped below the day's tasks in Today. Read with `?? false`. */
  evening?: boolean
  /**
   * The tasks this one waits for, in its own sharing scope (OpenSpec change
   * `task-dependencies`). Blocked while any of them is live and open. Optional on
   * rows stored before the field; read with `?? []`.
   */
  blocked_by?: string[]
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
  /**
   * Calendar properties the app does not model (OpenSpec `caldav`): the unmapped
   * iCalendar lines of the task's VTODO (alarms, X- properties, unsupported
   * RRULEs), kept so CalDAV clients do not lose them. Opaque; never shown or edited.
   */
  ical_extra: string | null
  /**
   * The note as a mergeable rich-text document (OpenSpec `collaborative-rich-text`):
   * "" or an envelope "ydoc:v1:<base64 Yjs update>" (docs/sync.md "Mergeable
   * documents"). `description` is its Markdown projection, written in the same
   * batch. Rows synced before the field existed hold undefined; read it with `?? ''`.
   */
  notes_doc?: string
  /**
   * The series is tracked as a habit (OpenSpec `habits`): streaks and a month
   * history are derived on the device from its occurrence records. Only offered for
   * calendar rules. Rows synced before the field existed hold undefined; read it
   * with `?? false`.
   */
  habit?: boolean
  /**
   * On an occurrence record of a habit: the occurrence was skipped, not done
   * (OpenSpec `habits`, design D2). A skipped record is not a completion: it is
   * hidden from Completed and `completed` and never counts towards `for N times`.
   * Read it with `?? false`.
   */
  skipped?: boolean
  /**
   * Account id of whoever completed the task, or null when unknown (OpenSpec change
   * `completed-date-filters`, design D5). Written in the same batch as `completed_at`
   * and cleared on reopen; meaningful only while `completed_at` is set. Optional on
   * rows stored before the field; read it with `?? null`.
   */
  completed_by?: string | null
  /**
   * Custom field values keyed by definition id (OpenSpec `custom-fields`, design D2).
   * Each entry is its own op `fields.<id>` on the wire, so entries converge one by one;
   * `applyOps` folds them in here and `mutateMany` unfolds a partial `fields` patch.
   * Rows stored before the change hold `undefined`: read it with `?? {}`. A value may
   * belong to a definition of another project or a deleted one; only the live
   * definitions of the task's project are shown.
   */
  fields?: Record<string, FieldValue>
  /**
   * Where the task came from (OpenSpec change `task-origin`): a page, a mail, an
   * issue or an import, or null. One last-writer-wins value like `due`. Rows
   * stored before the field read as undefined, and a value this device could not
   * decrypt is the placeholder string: read it with `originOf(task)` from
   * `lib/taskOrigin.ts`.
   */
  origin?: Origin | string | null
  /**
   * Where the task happens (OpenSpec change `task-locations`), or null. One
   * last-writer-wins value like `origin`; with `place_id` it shows the place's
   * current members while the place exists. Rows stored before the field read
   * as undefined, and a value this device could not decrypt is the placeholder
   * string: read it with `locationOf(task)` from `lib/locations.ts`.
   */
  location?: TaskLocation | string | null
  _clock: Clock
  /** Local-only end-to-end encryption bookkeeping (OpenSpec `e2ee`). */
  _e2ee?: RowEncryption
}

/**
 * A task's location (task-locations D1): at least a name, an address or a
 * coordinate pair; `lat` and `lon` both present or both absent.
 */
export interface TaskLocation {
  name?: string
  address?: string
  lat?: number
  lon?: number
  place_id?: string
}

/** A coordinate pair (a place's `geo`). */
export interface Geo {
  lat: number
  lon: number
}

/**
 * A saved place (OpenSpec change `task-locations`): personal like a label.
 * `geo` is one value, so an encrypted account encrypts it whole; a value this
 * device could not decrypt is the placeholder string.
 */
export interface Place {
  id: string
  name: string
  address: string
  geo: Geo | string | null
  position: number
  created_at: number
  deleted_at: number | null
  _clock: Clock
  _e2ee?: RowEncryption
}

/** A task's origin kind; the list is closed (the server refuses any other). */
export type OriginKind = 'url' | 'email' | 'issue' | 'import'

/**
 * A task's origin (task-origin D1): `url` needs `url`, the other kinds need
 * `id`; `provider` is 1–32 of a-z, 0-9 and "-"; `title` at most 500 characters.
 */
export interface Origin {
  kind: OriginKind
  provider?: string
  id?: string
  url?: string
  title?: string
}

/** A custom field value: text, link, date (YYYY-MM-DD) and choice are strings; null clears. */
export type FieldValue = string | number | boolean | null

/** A custom field definition's type; carried as a string so a later type is additive. */
export type FieldType = 'text' | 'number' | 'date' | 'choice' | 'link' | 'checkbox'

/**
 * A custom field definition of one project (OpenSpec `custom-fields`, design D1).
 * `project_id` and `type` never change after creation; `options` holds a choice
 * field's options, one per line, in display order (`""` otherwise).
 */
export interface FieldDef {
  id: string
  name: string
  project_id: string
  type: FieldType | string
  options: string
  position: number
  created_at: number
  deleted_at: number | null
  _clock: Clock
  /** Local-only end-to-end encryption bookkeeping (OpenSpec `e2ee`). */
  _e2ee?: RowEncryption
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
  /** A palette colour, or null (icons-and-section-style). */
  color?: string | null
  /** A name from the icon catalogue, or null (icons-and-section-style). */
  icon?: string | null
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
  /** List views only: what a drop into a board column showing this view changes (OpenSpec change `rule-boards`). */
  on_drop: OnDropRule | null
  created_at: number
  deleted_at: number | null
  _clock: Clock
}

export const RULE_DUE = ['today', 'tomorrow', 'next-week', 'clear'] as const
export const RULE_START = ['someday', 'clear'] as const
export const RULE_STATE = ['complete', 'reopen'] as const

/**
 * A saved list view's on-drop rule (rule-boards D2): at most one choice per kind.
 * Synced as one whole value; a key this build does not know is kept in the row
 * and ignored when planning.
 */
export interface OnDropRule {
  add_labels?: string[]
  remove_labels?: string[]
  priority?: Priority
  due?: (typeof RULE_DUE)[number]
  start?: (typeof RULE_START)[number]
  section?: { project_id: string; section_id: string | null }
  state?: (typeof RULE_STATE)[number]
}

/** 'deadline' (OpenSpec change `deadlines`): offset from 09:00 local on the task's deadline. */
export type ReminderKind = 'relative' | 'absolute' | 'deadline'

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

/**
 * A threaded markdown comment on a task (OpenSpec `comments-and-activity`). It
 * syncs in its task's scope. The server sets the rules: `author_id` is the
 * submitting account, only the author edits (`body`, `mentions`, `edited_at`),
 * the author, project admins and the owner may set `deleted_at`, and `mentions`
 * keeps current members only (always empty on a personal task).
 */
export interface Comment {
  id: string
  task_id: string
  parent_id: string | null
  body: string
  author_id: string
  mentions: string[]
  created_at: number
  edited_at: number | null
  deleted_at: number | null
  /** The name a guest typed on a task page (task-pages D6); null for members' comments. */
  guest_name?: string | null
  /** The task page a guest reply came through (task-pages D6); null otherwise. */
  page_id?: string | null
  _clock: Clock
}

/**
 * One stretch of work on a task (OpenSpec `time-tracking`, D1). It syncs in its
 * task's scope; the server sets the rules: `user_id` is the submitting account and
 * never changes, only the author edits (`started_at`, `ended_at`, `note`), the
 * author, project admins and the owner may set `deleted_at`, and viewers cannot
 * create entries. `ended_at` is null while the entry runs; a user has at most one
 * running entry, a rule every device applies (lib/time.ts `repairs`). `note` is
 * user-written text and encrypted for an encrypted account.
 */
export interface TimeEntry {
  id: string
  task_id: string
  user_id: string
  /** Unix ms. */
  started_at: number
  /** Unix ms, or null while the entry runs. */
  ended_at: number | null
  /** The device that started or logged it ("server" for the REST API). */
  device_id: string
  note: string
  created_at: number
  deleted_at: number | null
  _clock: Clock
}

/**
 * A file or link on a task or one of its comments (OpenSpec `attachments`, D1).
 * The metadata syncs as ops; a file's bytes travel separately (D3): the device
 * keeps them in `attachmentBlobs` until the server stores them and says so with
 * `uploaded_at`. A non-null `url` makes it a link.
 */
export interface Attachment {
  id: string
  task_id: string
  comment_id: string | null
  name: string
  mime: string
  /** Stored byte count (the envelope for an encrypted file); 0 for a link. */
  size: number
  /** Hex SHA-256 of the stored bytes; "" for a link. */
  sha256: string
  url: string | null
  encrypted: boolean
  author_id: string
  created_at: number
  /** Written by the server only, once the file is stored. */
  uploaded_at: number | null
  deleted_at: number | null
  _clock: Clock
}

/**
 * One user's personal preferences for a project (OpenSpec `activity-feed`, D1),
 * keyed by the project id. Always stored in the author's personal scope by the
 * server, also for shared projects, so it follows the user to their own devices
 * and never reaches other members. Stored locally in the `prefs` table.
 */
export interface ProjectPrefs {
  id: string
  /** Activity of the project up to this event time (Unix ms) has been seen; 0 = never marked. */
  feed_seen_at: number
  /** When this user last marked the project reviewed in the review's project walk (open-loops-method D4), Unix ms; 0 = never. */
  reviewed_at: number
  _clock: Clock
}

/** Date and time preference values (OpenSpec `date-time-preferences`); unknown values read as 'system'. */
export type DateFormatPref = 'system' | 'day-month' | 'month-day' | 'iso'
/** Interface language preference (app-localization D1): 'system' or a shipped language code. */
export type LanguagePref = 'system' | 'en' | 'de' | 'fr' | 'es' | 'it' | 'pt'
export type TimeFormatPref = 'system' | '12h' | '24h'
export type WeekStartPref = 'system' | 'mon' | 'sun' | 'sat'

/** The user's date and time preferences: the synced `user_prefs` entity, one row with id "me" in the personal scope. */
export interface UserPrefs {
  id: string
  date_format: DateFormatPref
  time_format: TimeFormatPref
  week_start: WeekStartPref
  /** Day start (day-boundary): `HH:MM` from 00:00 to 06:00; empty, malformed or out-of-range values read as midnight. */
  day_start: string
  /** Appearance (theming): unknown values read as the defaults. */
  theme_mode: ThemeModePref
  theme_accent: string
  /** Promoted sidebar destinations (ux-overhaul): comma-separated view ids; unknown ones are ignored. */
  sidebar_destinations: string
  /** Row density (ux-overhaul): comfortable (default) or compact; unknown values read as comfortable. */
  density: string
  /** Row detail (calm-rows): calm (default) or detailed; unknown values read as calm. */
  row_detail: string
  /** Favourites (sidebar-favourites D1): ordered, comma-separated `kind:id` entries; unknown kinds and missing items are ignored. */
  favourites: string
  /** The first-run card (ux-overhaul, first-run): "done" once finished or skipped on any device. */
  first_run: string
  /** Interface language (app-localization D1): 'system' or a shipped code; unknown values read as 'system'. */
  language: string
  /** The owner's welcome note (welcome-note): "seen" once closed on any device. */
  welcome: string
  /** How you work (open-loops-method D2): lists | companion | first; unknown or empty values read as lists. */
  method_mode: string
  /**
   * Focus timer preferences (focus-mode D5): mode pomodoro | flowtime | countdown,
   * auto-start none | breaks | work | both, sound off | on; lengths in minutes
   * (1-180), the long-break cycle (1-12) and the break reminder (0 = off, else
   * 15-240). Empty, zero, unknown or out-of-range values read as the defaults.
   */
  focus_mode: string
  focus_auto_start: string
  focus_sound: string
  focus_work_minutes: number
  focus_short_break_minutes: number
  focus_long_break_minutes: number
  focus_long_break_every: number
  focus_break_after_minutes: number
  /** Maps on this user's devices (task-locations D6): 'off' turns them off; '' and anything else read as on. */
  maps?: string
  _clock: Clock
}

export type ThemeModePref = 'system' | 'light' | 'dark'

/**
 * When the user last finished a weekly review (OpenSpec change `stats-and-review`,
 * design D4): the synced personal `review` entity, one row with id "me". Not
 * content: never encrypted, and it derives no activity event.
 */
export interface Review {
  id: string
  /** Unix ms of the latest finish; 0 = never. */
  completed_at: number
  /** The last Daily check and Monthly look (open-loops-method D5), Unix ms; 0 = never. */
  daily_at: number
  monthly_at: number
  /** Today's focus (open-loops-method D5): the local date it was chosen on and up to three comma-separated task ids. */
  focus_date: string
  focus: string
  /** The latest Close the day (close-the-day D5), Unix ms; 0 = never. */
  closed_at: number
  /** The one-line note for tomorrow written at that close; content (encrypted for encrypted accounts). */
  tomorrow_note: string
  /** The latest carry-over as JSON (ux-feedback-2 D1), "" = none: what Reopen the day puts back. Not content. */
  carry_over: string
  _clock: Clock
}

export type ActivityKind =
  | 'created' | 'completed' | 'reopened' | 'deleted' | 'restored' | 'rescheduled' | 'assigned' | 'unassigned'
  | 'moved' | 'dependencies' | 'archived' | 'unarchived' | 'edited' | 'commented' | 'comment_edited' | 'comment_deleted'

/** One field transition inside an activity event. */
export interface ActivityChange {
  field: string
  from: unknown
  to: unknown
}

/**
 * An activity event derived from ops (comments-and-activity, design D4); the
 * same rule runs on the server (internal/activity). `id` is the id of the
 * group's first op, so a page fetched from the server and a locally derived
 * event for the same group share it.
 */
export interface ActivityEvent {
  id: string
  kind: ActivityKind
  actor: string
  entity: 'task' | 'project' | 'comment'
  entityId: string
  taskId?: string
  ts: number
  opIds: string[]
  changes: ActivityChange[]
  /** Only for a public link's ticks: the device public:<link-id> (public-links). */
  device?: string
  /** Server pages only: display names resolved by the server. */
  actorName?: string
  taskTitle?: string
  /** Feed (activity-feed): the shared project the event belongs to; set by the feed route and the local feed. */
  projectId?: string
  projectName?: string
}

/**
 * One op as recorded in the local `activity` table: who wrote it and the field's
 * value before this device applied it. `projectKey` is the project the op
 * belongs to ('inbox' for the Inbox), used for per-project views and retention;
 * `taskId` is the task (or the commented task) for per-task views.
 */
export interface ActivityEntry {
  id: string
  actor: string
  entity: 'task' | 'project' | 'comment'
  entityId: string
  field: string
  value: unknown
  ts: number
  device: string
  from?: unknown
  projectKey: string
  taskId?: string
}

export interface ActivityPage {
  events: ActivityEvent[]
  more: boolean
  cursor?: string
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

/** Answer of POST /api/v1/push/test (OpenSpec `push-test-delivery`). */
export interface PushTestResponse {
  outcome: 'sent' | 'no_subscription' | 'gone' | 'failed'
  testId?: string
  subscription?: PushSubscriptionStatus | null
  /** The push service's HTTP status, for `failed` (absent when it could not be reached). */
  status?: number
  error?: string
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
  /** The first account needs OPENTODO_SETUP_TOKEN (owner-bootstrap); absent on older servers. */
  setupTokenRequired?: boolean
  /** Without a token, setup from outside the server's local network needs the
   * one-time code printed in the server log (trusted-client-identity); absent on older servers. */
  setupCodeRequired?: boolean
  signupAllowed: boolean
  authenticated: boolean
  user: User | null
  version: string
  /** Server has an https (or localhost) base URL, so passkey ceremonies work. */
  passkeysAvailable?: boolean
  /** Host passkeys are bound to (the base URL's host); absent on older servers. */
  passkeyDomain?: string
  /** Second-factor state of the signed-in account (absent when anonymous). */
  mfa?: MfaStatus
  /** Single sign-on (OpenSpec `oidc-login`); absent on servers without it. */
  oidc?: OidcStatus
  /** End-to-end encryption of the signed-in account (OpenSpec `e2ee`); absent on older servers. */
  encryption?: EncryptionStatus
  /** Oldest web client that understands ciphertext values (OpenSpec `e2ee`, design D9). */
  minClientVersion?: number
  /** Public demo instance (OpenSpec `demo-mode`, `demo-sandboxes`); absent on a normal server. */
  demo?: DemoInfo
  /** Outgoing email (OpenSpec `outgoing-email`): email actions are shown only when enabled; absent on older servers. */
  outgoingEmail?: { enabled: boolean }
  /** A tenant of a hosted service (OpenSpec `multi-tenant-host`): the operator owns server settings; absent when self-hosted. */
  hosted?: boolean
}

/** Outgoing email settings (owner only); the password is never returned. */
export interface SmtpSettings {
  configured: boolean
  host: string
  port: number
  security: SmtpSecurity
  username: string
  passwordSet: boolean
  from: string
  /** host, port, security, username, password, from → "env" (locked) or "settings". */
  managedBy: Record<string, 'env' | 'settings'>
  lastTest: { at: number; outcome: 'sent' | 'failed'; stage?: SmtpStage; reply?: string } | null
}

export type SmtpSecurity = 'tls' | 'starttls' | 'none' | ''
export type SmtpStage = 'connect' | 'tls' | 'auth' | 'send'

/** A change to the outgoing email settings: omitted fields are kept, `password: ''` removes it. */
export interface SmtpSettingsInput {
  host?: string
  port?: number
  security?: SmtpSecurity
  username?: string
  password?: string
  from?: string
}

export type SmtpTestResult = { outcome: 'sent'; to: string } | { outcome: 'failed'; to: string; stage: SmtpStage; reply: string }

/** A pending sign-up waiting for its emailed confirmation. */
export interface PendingSignup {
  email: string
  expiresAt: number
}

/**
 * A demo instance (OpenSpec `demo-sandboxes`): a short-lived, single-use token
 * that creates a private sandbox, the sandbox lifetimes in hours and the next
 * nightly reset (Unix ms). No credentials.
 */
export interface DemoInfo {
  token: string
  sandboxHours: { idle: number; max: number }
  resetsAt: number
}

/** The server's attachment limits and this account's usage, from `/me` (OpenSpec attachments D5). */
export interface AttachmentLimits {
  enabled: boolean
  max_file_bytes: number
  /** 0 = no total. */
  quota_bytes: number
  used_bytes: number
}

/** One end of a subscribed calendar event, shaped like a task's due (no `tz`: floating). */
export interface CalendarWhen {
  date: string
  time?: string
  tz?: string
}

/** An occurrence from a subscribed calendar (OpenSpec calendar-feeds): server data, cached, never an op. */
export interface CalendarEvent {
  id: string
  subscriptionId: string
  uid: string
  summary: string
  location: string
  start: CalendarWhen
  end: CalendarWhen
  allDay: boolean
  free: boolean
}

/** A subscribed calendar and its status. */
export interface CalendarSubscription {
  id: string
  url?: string
  name: string
  color: string
  enabled: boolean
  lastSuccessAt: number | null
  lastError?: string
  stoppedReason?: string
  warnings?: string[]
  eventCount?: number
}

/** The filter of an issue connection (OpenSpec issue-connections "Filter"). */
export interface IssueFilter {
  scope: 'assigned' | 'repositories'
  repositories: string[]
  labels: string[]
}

/** The counts of one issue poll. */
export interface IssueRun {
  created: number
  completed: number
  reopened: number
  renamed: number
  unlinked: number
  partial: boolean
}

/** One issue connection as the server reports it: never the token, only token_set. */
export interface IssueConnection {
  id: string
  provider: 'github' | 'gitlab'
  host: string
  name: string
  project_id: string | null
  filter: IssueFilter
  map_labels: boolean
  enabled: boolean
  interval_minutes: number
  state: 'off' | 'pending' | 'ok' | 'failed' | 'stopped'
  next_poll_at: number
  last_poll_at: number | null
  last_success_at: number | null
  last_error: string
  last_error_at: number | null
  stopped_reason: string
  account_login: string
  can_read_issues: boolean | null
  last_run: IssueRun | null
  task_count: number
  token_set: boolean
  created_at: number
  updated_at: number
}

/** The body of creating or changing an issue connection; `token` only when typed. */
export interface IssueConnectionInput {
  provider?: 'github' | 'gitlab'
  host?: string
  token?: string
  name?: string
  project_id?: string | null
  filter?: IssueFilter
  map_labels?: boolean
  interval_minutes?: number
  enabled?: boolean
}

/** The answer of a hand-triggered sync or token check. */
export interface IssueActionResult {
  ok: boolean
  reason?: string
  run?: IssueRun
  login?: string
  can_read_issues?: boolean
  connection?: IssueConnection
}

/** The user's task feed URL, without the secret. */
export interface CalendarFeed {
  createdAt: number
  lastUsedAt: number | null
}

/** The owner's attachment settings (Settings → People → Attachments). */
export interface AttachmentSettings {
  enabled: boolean
  max_file_mb: number
  /** 0 = no total. */
  quota_mb: number
}

/** The profile's view of end-to-end encryption (OpenSpec `e2ee`). */
export interface EncryptionStatus {
  enabled: boolean
  keyVersion: number
}

/**
 * Local-only encryption bookkeeping on a synced row (OpenSpec `e2ee`); never
 * sent. `wire[field]` is the form the server holds for the field's current
 * value as far as this device knows: 'p' plaintext, 'c' ciphertext, 'x'
 * ciphertext this device cannot decrypt (the envelope is kept in `raw[field]`
 * and the field shows a placeholder).
 */
export interface RowEncryption {
  wire?: Record<string, 'p' | 'c' | 'x'>
  raw?: Record<string, string>
}

/** Whether a provider is configured, as the sign-in screen needs it. */
export interface OidcStatus {
  enabled: boolean
  displayName: string
  /** Members must use the provider; the owner keeps local sign-in (`?owner=1`). */
  ssoOnly: boolean
}

/** Owner view of the provider configuration. The secret is never returned, only masked. */
export interface OidcSettings {
  enabled: boolean
  issuer: string
  clientId: string
  /** `••••` plus the last four characters, or empty when unset. */
  clientSecret: string
  clientSecretSet: boolean
  displayName: string
  scopes: string
  allowProvision: boolean
  ssoOnly: boolean
  providerLogout: boolean
  /** Paste this into the provider's client configuration. */
  redirectUri: string
  /** False when the redirect URI was derived from the request (set OPENTODO_BASE_URL). */
  baseUrlConfigured: boolean
  /** Field name to "env" (locked by an OPENTODO_OIDC_* variable) or "settings". */
  managedBy: Record<string, 'env' | 'settings'>
}

/** A settings change; omitted fields are kept. `clientSecret: ''` removes the secret. */
export type OidcSettingsInput = Partial<Pick<OidcSettings,
  'issuer' | 'clientId' | 'clientSecret' | 'displayName' | 'scopes' | 'allowProvision' | 'ssoOnly' | 'providerLogout'>>

/** Result of POST /api/v1/settings/oidc/test. */
export interface OidcTestResult {
  ok: boolean
  issuer: string
  authorizationHost: string
  tokenHost: string
  endSessionSupported: boolean
}

/** A provider identity linked to the account. Server account data, never synced. */
export interface LinkedIdentity {
  id: string
  issuer: string
  email: string
  createdAt: number
  lastLoginAt: number | null
}

/** Owner policy for the second factor (OpenSpec `mfa-totp`). */
export type MfaPolicy = 'none' | 'owner' | 'all'

/**
 * A server configuration problem the server started despite (OpenSpec
 * `trusted-proxies-lenient`), such as an invalid OPENTODO_TRUSTED_PROXIES entry.
 * Only the owner's session receives these, in /api/v1/me `config_warnings`.
 */
export interface ConfigWarning {
  /** The environment variable, e.g. OPENTODO_TRUSTED_PROXIES. */
  variable: string
  /** What was ignored, what is accepted and how to fix it. */
  message: string
  /** The ignored values, when the warning is about specific entries. */
  ignored?: string[]
}

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

/** A pending project invite link as the project's owner and admins see it (OpenSpec `project-invite-links`). Never carries the secret. */
export interface ProjectInvite {
  id: string
  projectId: string
  role: Exclude<ProjectRole, 'owner'>
  email: string | null
  createdBy: string
  createdByName: string
  createdAt: number
  expiresAt: number
}

/** What anyone holding a project invite link may learn before joining. */
export interface ProjectInvitePreview extends InvitationPreview {
  projectName: string
  role: Exclude<ProjectRole, 'owner'>
  /** Whether the link may create a new account (server owner/admin link, open sign-up, or the owner switch). */
  canCreateAccount: boolean
  /** Present when the request carried a session: whether that account is on the project already. */
  alreadyMember?: boolean
}

/** Events an outbound webhook can subscribe to (OpenSpec `webhooks`). */
export type WebhookEvent =
  | 'task.created' | 'task.updated' | 'task.completed' | 'task.reopened' | 'task.deleted'
  | 'project.created' | 'project.updated' | 'project.archived' | 'project.deleted'
  | 'import.completed' | 'import.undone'

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
/** The CalDAV endpoint's state (OpenSpec `caldav`); only the owner may change `enabled`. */
/**
 * The weekly email digest (OpenSpec `stats-and-review`, design D5): server data,
 * never synced. `weekday` 0 = Sunday; `nextSendAt` is Unix ms or null.
 */
export interface EmailDigest {
  /** False without outgoing email (also on a demo). */
  available: boolean
  /** The account uses end-to-end encryption: the digest would contain task titles. */
  encryption: boolean
  enabled: boolean
  weekday: number
  hour: number
  timeZone: string
  language: string
  nextSendAt: number | null
  /** sent, skipped, encrypted_account, rate_limited or a failed stage (connect, tls, auth, send). */
  lastOutcome?: string
  /** The local date (YYYY-MM-DD) the last digest was sent or given up for. */
  lastSentFor?: string
  lastAttemptAt: number | null
}

export type EmailDigestInput = Partial<Pick<EmailDigest, 'enabled' | 'weekday' | 'hour' | 'timeZone' | 'language'>>

/** Settings → Email to task (OpenSpec `email-to-task`): the account's secret inbox address. */
export interface EmailInbox {
  /** False when the operator has not configured OPENTODO_EMAIL_*; then address is null. */
  enabledByOperator: boolean
  address: string | null
  enabled: boolean
  /** Sender addresses allowed to create tasks; empty means anyone who knows the address. */
  allowlist: string[]
  /** Most tasks created from email per rolling hour. */
  hourlyLimit: number
}

export interface CaldavSetting {
  enabled: boolean
  /** The signed-in account encrypts its content (OpenSpec `e2ee`): CalDAV refuses it. */
  encryption?: boolean
  /** The address calendar apps are configured with (…/dav/). */
  url: string
  /** False when the address is plain http: app passwords would travel unencrypted. */
  secure: boolean
}

/** A CalDAV-only credential (never the secret, which is shown once on creation). */
export interface AppPassword {
  id: string
  name: string
  createdAt: number
  lastUsedAt: number | null
  revokedAt: number | null
}

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
// 'limited': a demo sandbox used up its write budget (429 demo_limit), or a hosted
// server refused changes for one of its limits (multi-tenant-host); they are kept.
export type SyncState = 'idle' | 'syncing' | 'reseeding' | 'offline' | 'error' | 'unauthenticated' | 'restricted' | 'locked' | 'limited'

export const PROJECT_FIELDS = ['name', 'color', 'position', 'archived', 'parent_id', 'created_at', 'deleted_at'] as const
export const TASK_FIELDS = [
  'title', 'description', 'project_id', 'parent_id', 'priority', 'due', 'labels',
  'position', 'created_at', 'completed_at', 'deleted_at', 'estimate_minutes', 'recurrence', 'series_id',
  'assignee_id', 'section_id', 'notes_doc', 'deadline', 'start', 'evening', 'blocked_by', 'completed_by',
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
// ---- web restore (backup-restore-web; owner only, never synced) ----

export interface RestoreArchive {
  name: string
  size: number
  createdAt: number
  encrypted: boolean
}

export interface BackupManifest {
  appVersion: string
  schemaVersion: number
  createdAt: string
  encrypted: boolean
}

export interface RestoreCounts {
  accounts: number
  projects: number
  tasks: number
  ops: number
}

export type RestoreSourceKind = 'archive' | 'upload' | 'safety-copy'

/** A prepared (verified) or uploaded archive. */
export interface StagedRestore {
  id: string
  source: RestoreSourceKind
  archive: string
  size: number
  encrypted: boolean
  manifest?: BackupManifest
  counts?: RestoreCounts
  verified: boolean
  createdAt: number
  expiresAt: number
}

export interface LastRestore {
  source: RestoreSourceKind
  archive: string
  actorId: string
  requestedAt: number
  finishedAt: number
  ok: boolean
  error?: string
  safetyCopy?: string
}

export interface SafetyCopy {
  name: string
  size: number
  createdAt: number
}

export interface RestoreState {
  staged: StagedRestore | null
  last: LastRestore | null
  safetyCopies: SafetyCopy[]
  undoAvailable: boolean
  /** -1 when the server cannot tell. */
  freeBytes: number
  uploadLimit: number
}

export type RestoreSource = { archive: string } | { upload: string } | { safetyCopy: string }

/** Event names of the server audit log (closed catalogue, see docs/api.md#audit-log). */
export const AUDIT_EVENT_NAMES = [
  'login.succeeded', 'login.failed', 'logout',
  'mfa.enrolled', 'mfa.disabled', 'mfa.reset', 'mfa.challenge_failed',
  'passkey.registered', 'passkey.deleted',
  'token.created', 'token.revoked', 'app_password.created', 'app_password.revoked',
  'calendar_feed.created', 'calendar_feed.rotated', 'calendar_feed.revoked',
  'email_inbox.created', 'email_inbox.rotated', 'email_inbox.updated',
  'issue_connection.created', 'issue_connection.updated', 'issue_connection.deleted',
  'invitation.created', 'invitation.accepted', 'invitation.revoked',
  'project_invite.created', 'project_invite.revoked', 'project_invite.accepted',
  'public_link.created', 'public_link.revoked',
  'role.changed', 'settings.changed',
  'identity.linked', 'identity.unlinked',
  'export.requested', 'audit.exported',
  'backup.created', 'backup.restored', 'backup.restore_requested', 'backup.restore_failed', 'backup.safety_copy_deleted',
  'user.deactivated', 'user.reactivated', 'user.deleted',
  'password.reset_issued', 'password.reset_completed', 'password.changed',
  'sessions.revoked',
  'owner.transferred',
  'agent.write',
  'email.sent',
  'email.failed',
  'relay.enabled',
  'relay.disabled',
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

export type ImportFormat =
  | 'opentodo' | 'things-db' | 'json-items' | 'json-lists' | 'json-generic'
  | 'todoist-csv' | 'todoist-backup' | 'ticktick-csv' | 'linear-csv' | 'csv'
export const IMPORT_FORMATS: readonly ImportFormat[] = [
  'opentodo', 'todoist-backup', 'todoist-csv', 'things-db', 'ticktick-csv', 'linear-csv', 'json-items', 'json-lists', 'json-generic', 'csv',
]

export interface ImportOptions {
  format?: ImportFormat
  /** Project id for rows without a project; omitted = Inbox. */
  targetProject?: string
  /** IANA time zone used to turn zoned date-times into floating ones. */
  timeZone?: string
  /** `section` (default) creates sections in the task's project; `label` turns them into labels. */
  sections?: 'section' | 'label' | 'ignore'
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
  /** Created sections, recurring tasks and live reminders (import-completeness); absent on older jobs. */
  newSections?: number
  recurring?: number
  reminders?: number
  /** Tasks with a deadline (deadlines); absent on older jobs. */
  deadlines?: number
  /** Created time entries (time-tracking); absent on older jobs. */
  timeEntries?: number
  entities: number
  written: number
  ops: number
}

export type ImportOutcome = 'create' | 'update' | 'skip' | 'error'

export interface ImportRow {
  row?: number
  /** Archive entry the row came from (ZIP uploads such as a Todoist backup). */
  file?: string
  sourceId?: string
  kind: 'project' | 'task' | 'label' | 'section' | 'reminder' | 'view'
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
  /** File-level remarks, e.g. records that are not imported (absent on older servers). */
  notes?: string[]
  /** Set when the file is a template (project-templates D7). */
  template?: { day?: string }
}

export type ImportStatus = 'running' | 'done' | 'failed' | 'undone'

export interface ImportJob {
  id: string
  format: ImportFormat
  status: ImportStatus
  options: ImportOptions
  totals: ImportTotals
  errors: { row?: number; sourceId?: string; reason: string }[]
  /** Projects this import creates that were boards in the source app (named-importers D8); only on the start response. */
  viewHints?: { projectId: string; view: 'board' }[]
  message?: string
  createdAt: number
  finishedAt: number | null
  undoneAt: number | null
}

export const REMINDER_FIELDS = [
  'task_id', 'kind', 'offset_minutes', 'fire_at', 'delivered_at', 'dismissed_at', 'created_at', 'deleted_at',
] as const

export const VIEW_FIELDS = [
  'name', 'query', 'kind', 'group_by', 'sort_by', 'sort_dir', 'pinned', 'position', 'color', 'panels', 'on_drop',
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
  /** The server's clock when it refused an op as stamped too far ahead (`clock_skew`, sync-convergence). */
  serverTime?: number
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
  /** A served page of a joined project's history; echoed as `backfillAck` once applied (sync-convergence). */
  backfillSeq?: number
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

/** Writes made at one timestamp by one device ("server" or "server:<boot id>" = REST API). */
export interface ChangeSet {
  ts: number
  device: string
  userId: string
  changes: HistoryChange[]
  /** Server-computed name of the writer, set for AI assistant writes (mcp-write-tools). */
  device_label?: string
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
  /** Comments of purged tasks (comments-and-activity; absent on older servers). */
  comments?: number
  /** Time entries of purged tasks (time-tracking; absent on older servers). */
  timeEntries?: number
}

export const COMMENT_FIELDS = ['task_id', 'parent_id', 'body', 'author_id', 'mentions', 'created_at', 'edited_at', 'deleted_at'] as const

/** Payload of a `mentioned` notification (comments-and-activity); names resolved by the server. */
export interface MentionedPayload {
  recipientId: string
  actorId: string
  actorName: string
  commentId: string
  taskId: string
  taskTitle: string
  projectId?: string
  projectName?: string
  excerpt: string
  at: number
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

/** Payload of an `unblocked` notification (task-dependencies): the assignee's task is ready to start. */
export interface UnblockedPayload {
  assigneeId: string
  actorId: string
  actorName: string
  taskId: string
  taskTitle: string
  projectId?: string
  projectName?: string
  blockerId: string
  blockerTitle: string
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
  /** AssignedPayload for kind `assigned`, MentionedPayload for `mentioned`, UnblockedPayload for `unblocked`, PagePayload for `page_replied` and `page_completed`. */
  payload: AssignedPayload | MentionedPayload | UnblockedPayload | PagePayload
  createdAt: number
  readAt: number | null
  readPending?: boolean
}

/**
 * A guest's reply or completion on one of the user's task pages (OpenSpec task-pages D9).
 * For an encrypted task the title and the guest's name are absent: the device shows
 * the title from its own copy.
 */
export interface PagePayload {
  pageId: string
  taskId: string
  taskTitle?: string
  guestName?: string
  completed?: boolean
  encrypted?: boolean
  at: number
  projectId?: undefined
  projectName?: undefined
  actorName?: undefined
}

/** A public link as its managers see it (OpenSpec `public-links`); never the secret. */
export interface PublicLink {
  id: string
  projectId: string
  rights: 'view' | 'tick'
  name: string | null
  createdBy: string
  createdByName?: string
  createdAt: number
  expiresAt: number | null
  lastUsedAt: number | null
}

/** What guests may do on a task page (OpenSpec `task-pages`): read, reply, or reply and tick. */
export type TaskPageRights = 'view' | 'reply' | 'tick'

/** A publish request; snapshot and wrappedKey only for a task with end-to-end encryption. */
export interface PublishTaskPageInput {
  rights: TaskPageRights
  label?: string
  expiresInDays?: number
  includeMap?: boolean
  snapshot?: string
  wrappedKey?: string
}

/** The answer to publishing: the link is returned once. */
export interface TaskPageCreated {
  id: string
  taskId: string
  rights: TaskPageRights
  label: string | null
  includeMap: boolean
  encrypted: boolean
  publishedAt: number
  expiresAt: number | null
  link: string
}

/** A task's active page as its publisher, owner and admins see it: never the secret or a key. */
export interface TaskPageStatus {
  id: string
  taskId: string
  rights: TaskPageRights
  label: string | null
  includeMap: boolean
  createdBy: string
  publishedAt: number
  expiresAt: number | null
  lastOpenedAt: number | null
  replies: number
  ticks: number
  encrypted: boolean
  snapshotAt: number | null
  pendingReplies: number
}

/** One of the user's own pages, with the wrapped share key of an encrypted one (task-pages D3). */
export interface OwnTaskPage extends Omit<TaskPageStatus, 'encrypted'> {
  encrypted: boolean
  snapshotVersion: number
  wrappedKey?: string
}

/** What a task page shows (live from the server, or decrypted from a snapshot). */
export interface TaskPageContent {
  /** The published task's id: what "Mark as done" ticks. */
  id: string
  title: string
  description: string
  due: { date: string; time?: string } | null
  deadline: string | null
  completed_at: number | null
  subtasks: { id: string; title: string; completed_at: number | null; depth: number }[]
  links: { id: string; name: string; url: string }[]
  files: { id: string; name: string; size: number | null }[]
  location: TaskLocation | null
  comments: { id: string; name: string; guest: boolean; body: string; createdAt: number }[]
}

/** A task page as the guest's browser receives it. */
export type TaskPageResponse = { rights: TaskPageRights; serverTime: number; label: string | null } & (
  | ({ mode: 'live' } & TaskPageContent)
  | { mode: 'encrypted'; snapshot: string; snapshotAt: number | null }
)

/** What a guest sees through a public link: the project's open tasks (and those completed in the last day). */
export interface PublicList {
  projectName: string
  projectColor: string
  rights: 'view' | 'tick'
  sections: { id: string; name: string; position: number }[]
  tasks: { id: string; title: string; due: Due | null; priority: Priority; section_id: string | null; parent_id: string | null; position: number; completed_at: number | null }[]
  serverTime: number
}

