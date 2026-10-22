// Reads of the local store for screens (OpenSpec change web-layering). Screens in
// src/app never open IndexedDB themselves (eslint.config.js enforces it): they
// read through the hooks and helpers here, so every list of projects, labels or
// memberships comes from one shared live snapshot and one visibility rule.
//
// The visibility rule for projects (one rule, three lists):
// - useProjects(): live projects, neither deleted nor in the Trash; archived ones
//   included, so their names, colours and tasks still resolve. Pickers and quick
//   add get this list and leave archived projects out themselves (entity-pickers,
//   natural-language-capture).
// - visibleProjects(useProjects()) (lib/projects.ts): what the sidebar and other
//   browsing lists show, neither deleted nor archived.
// - useAllProjects(): every row, deleted ones too, only for the Trash, history and
//   statistics, which must name or exclude what is in the Trash.
// Snapshots are shared and read-only: sort a copy, never the array itself.
import { useLiveQuery } from 'dexie-react-hooks'
import { GRID_PREFS_META_KEY, normalizeGridPrefs, type GridPrefs } from './calendar'
import { db, getMeta, setMeta, type AttachmentBlob } from './db'
import { rememberFieldNames } from './fieldNames'
import { t } from './i18n'
import { activeLabels } from './labels'
import { derived, liveSnapshot } from './liveSnapshot'
import { compareByPosition } from './ordering'
import { REVIEW_ID } from './review'
import { USER_PREFS_ID } from './userPrefs'
import { ownIn, projectsIn, readWorkspaceState, type WorkspaceState } from './workspaces'
import type {
  AppNotification, Attachment, CalendarSubscription, WorkspaceGroup, WorkspaceMember, IssueConnection, Comment, FieldDef, Label, Membership, Project, ProjectPrefs, Reminder, Review, Section, Task, UserPrefs, View,
} from './types'

export type { AttachmentBlob }

// ---- shared snapshots ----

// Projects, labels and views are those of the device's current workspace
// (OpenSpec change workspaces, design D5): the partition happens here, once,
// so every list, count and picker built on these snapshots follows it.
const projectRows = liveSnapshot('projects', async () => projectsIn(await readWorkspaceState(), await db.projects.toArray()))
const labelRows = liveSnapshot('labels', async () => ownIn(await readWorkspaceState(), await db.labels.toArray()))
const membershipRows = liveSnapshot('memberships', () => db.memberships.toArray())
const viewRows = liveSnapshot('views', async () => ownIn(await readWorkspaceState(), await db.views.toArray()))
// Every workspace's rows, for what crosses workspaces: the palette, the project
// picker grouped by workspace, moving between workspaces.
const everyProjectRow = liveSnapshot('projects of every workspace', () => db.projects.toArray())
const everyLabelRow = liveSnapshot('labels of every workspace', () => db.labels.toArray())
const workspaceState = liveSnapshot('workspaces', readWorkspaceState)
const workspaceMemberRows = liveSnapshot('workspace members', () => db.workspaceMembers.toArray())
const groupRows = liveSnapshot('groups', () => db.groups.toArray())
const NO_WS_MEMBERS: WorkspaceMember[] = []
const NO_GROUPS: WorkspaceGroup[] = []

/** The cached members of every workspace of the account (workspaces D8). */
export function useWorkspaceMembers(): WorkspaceMember[] {
  return workspaceMemberRows.use() ?? NO_WS_MEMBERS
}

/** The cached groups of every workspace of the account. */
export function useWorkspaceGroups(): WorkspaceGroup[] {
  return groupRows.use() ?? NO_GROUPS
}
const prefsRow = liveSnapshot('user prefs', async () => (await db.userPrefs.get(USER_PREFS_ID)) ?? null)
const reviewRow = liveSnapshot('review', async () => (await db.review.get(REVIEW_ID)) ?? null)
const projectPrefRows = liveSnapshot('project prefs', () => db.prefs.toArray())

// Stable empty values for callers that render before the first snapshot arrives.
const NO_PROJECTS: Project[] = []
const NO_LABELS: Label[] = []
const NO_MEMBERSHIPS: Membership[] = []
const NO_VIEWS: View[] = []
const NO_MEMBER_MAP = new Map<string, Membership>()

const liveOf = derived((all: Project[]) => all.filter((p) => !p.deleted_at).sort(compareByPosition))
const allSorted = derived((all: Project[]) => all.slice().sort(compareByPosition))
const activeOf = derived((all: Label[]) => activeLabels(all))
const memberMapOf = derived((all: Membership[]) => new Map(all.map((m) => [m.projectId, m])))
const reviewedAtOf = derived((all: ProjectPrefs[]) => new Map(all.filter((p) => p.reviewed_at > 0).map((p) => [p.id, p.reviewed_at])))
const NO_STAMPS = new Map<string, number>()

const NO_WORKSPACES: WorkspaceState = { current: '', defaultId: '', list: [] }

/** The device's workspaces and the current one (OpenSpec change workspaces). */
export function useWorkspaceState(): WorkspaceState {
  return workspaceState.use() ?? NO_WORKSPACES
}

/** Live projects of every workspace, in position order (the palette and grouped pickers). */
export function useProjectsOfEveryWorkspace(): Project[] {
  const all = everyProjectRow.use()
  return all ? liveOf(all) : NO_PROJECTS
}

/** Every label row of every workspace (moving a project re-matches labels by name). */
export function useLabelsOfEveryWorkspace(): Label[] {
  return everyLabelRow.use() ?? NO_LABELS
}

/** Live projects in position order: not deleted, archived ones included (see the rule above). */
export function useProjects(): Project[] {
  const all = projectRows.use()
  return all ? liveOf(all) : NO_PROJECTS
}

/** Like useProjects, but undefined until the first read (for screens that wait for it). */
export function useProjectsLoaded(): Project[] | undefined {
  const all = projectRows.use()
  return all ? liveOf(all) : undefined
}

/** Every project row, deleted ones too, in position order: only for the Trash, history and statistics. */
export function useAllProjects(): Project[] {
  const all = projectRows.use()
  return all ? allSorted(all) : NO_PROJECTS
}

/** Non-deleted labels in sidebar order. */
export function useLabels(): Label[] {
  const all = labelRows.use()
  return all ? activeOf(all) : NO_LABELS
}

/**
 * Every label row, deleted ones too: for parsing and wording that must still name
 * a deleted label (filters, history), and for quick add, which skips deleted ones.
 */
export function useAllLabels(): Label[] {
  return labelRows.use() ?? NO_LABELS
}

/** The cached memberships of shared projects (project-sharing). */
export function useMemberships(): Membership[] {
  return membershipRows.use() ?? NO_MEMBERSHIPS
}

/** The cached memberships by project id. */
export function useMembershipMap(): Map<string, Membership> {
  const all = membershipRows.use()
  return all ? memberMapOf(all) : NO_MEMBER_MAP
}

/** One project's membership: null for a personal project, undefined while loading. */
export function useMembership(projectId: string): Membership | null | undefined {
  const all = membershipRows.use()
  return all ? memberMapOf(all).get(projectId) ?? null : undefined
}

/** Every saved view row, deleted ones too (lib/views.ts activeViews narrows them). */
export function useViewRows(): View[] {
  return viewRows.use() ?? NO_VIEWS
}

/** Like useViewRows, but undefined until the first read. */
export function useViewRowsLoaded(): View[] | undefined {
  return viewRows.use()
}

/** The synced user preferences row: undefined while loading, null when there is none yet. */
export function useUserPrefsRow(): UserPrefs | null | undefined {
  return prefsRow.use()
}

/** This user's review stamp per project (project_prefs.reviewed_at, open-loops-method D4); empty while loading. */
export function useReviewedAt(): ReadonlyMap<string, number> {
  const rows = projectPrefRows.use()
  return rows ? reviewedAtOf(rows) : NO_STAMPS
}

/** The weekly review row: undefined while loading, null when there is none yet. */
export function useReviewRow(): Review | null | undefined {
  return reviewRow.use()
}

// ---- custom field definitions ----

const fieldRows = liveSnapshot('fields', async () => {
  const all = await db.fields.toArray()
  // The names of deleted definitions stay known for history wording.
  rememberFieldNames(all)
  return all
})
const NO_FIELDS: FieldDef[] = []
const liveFieldsOf = derived((all: FieldDef[]) => all.filter((d) => !d.deleted_at))

/** Every live field definition, in no particular order (use liveFields per project). */
export function useFieldDefs(): FieldDef[] {
  const all = fieldRows.use()
  return all ? liveFieldsOf(all) : NO_FIELDS
}

/** Every field definition row of one project, deleted ones too (liveFields narrows them). */
export function useProjectFieldRows(projectId: string | null | undefined): FieldDef[] {
  return useLiveQuery(() => (projectId ? db.fields.where('project_id').equals(projectId).toArray() : NO_FIELDS), [projectId], NO_FIELDS)
}

// ---- tasks ----

/**
 * One task row: undefined while loading (or for no id), null when there is none
 * (deleted rows included). The answer carries the id it was read for, so a
 * previous task's answer is never returned for a new id.
 */
export function useTask(id: string | null | undefined): Task | null | undefined {
  const read = useLiveQuery(async () => (id ? { id, task: (await db.tasks.get(id)) ?? null } : undefined), [id])
  return id && read?.id === id ? read.task : undefined
}

/** The live (not deleted) subtasks of a task, in position order. */
export function useSubtasks(parentId: string): Task[] {
  return useLiveQuery(() => db.tasks.where('parent_id').equals(parentId).filter((tk) => !tk.deleted_at).sortBy('position'), [parentId], NO_TASK_ROWS)
}

const NO_TASK_ROWS: Task[] = []

/** Every task row of a project, deleted ones too. */
export function useProjectTaskRows(projectId: string): Task[] {
  return useLiveQuery(() => db.tasks.where('project_id').equals(projectId).toArray(), [projectId], NO_TASK_ROWS)
}

/** Every task row of the given projects, deleted ones too. */
export function useTaskRowsOfProjects(projectIds: readonly string[]): Task[] {
  const key = projectIds.join()
  return useLiveQuery(() => (projectIds.length ? db.tasks.where('project_id').anyOf(projectIds as string[]).toArray() : NO_TASK_ROWS), [key], NO_TASK_ROWS)
}

/** The task rows with these ids that exist (deleted ones included), in the given order. */
export function useTasksById(ids: readonly string[]): Task[] {
  return useLiveQuery(async () => (await db.tasks.bulkGet(ids as string[])).filter((tk): tk is Task => !!tk), [ids], NO_TASK_ROWS)
}

/** The occurrence records of a recurring task (series-id equals the task's id). */
export function useSeriesRecords(seriesId: string): Task[] {
  return useLiveQuery(() => db.tasks.filter((tk) => tk.series_id === seriesId).toArray(), [seriesId], NO_TASK_ROWS)
}

/** Deleted tasks (the Trash). */
export function useDeletedTasks(): Task[] {
  return useLiveQuery(() => db.tasks.filter((task) => !!task.deleted_at).toArray(), [], NO_TASK_ROWS)
}

/** Every task row, deleted ones too (statistics decide themselves what counts). */
export function useAllTaskRows(): Task[] {
  return useLiveQuery(() => db.tasks.toArray(), [], NO_TASK_ROWS)
}

/** Whether any live task exists; undefined while loading. Stops at the first one. */
export function useHasTask(): boolean | undefined {
  return useLiveQuery(async () => !!(await db.tasks.filter((task) => !task.deleted_at).first()), [])
}

/** Number of live top-level tasks (0 while loading). */
export function useTopLevelTaskCount(): number {
  return useLiveQuery(() => db.tasks.filter((task) => !task.deleted_at && !task.parent_id).count(), [], 0)
}

/** One task row, read once (deleted rows included). */
export function getTask(id: string): Promise<Task | undefined> {
  return db.tasks.get(id)
}

/** One project row, read once (deleted rows included). */
export function getProject(id: string): Promise<Project | undefined> {
  return db.projects.get(id)
}

/** Every project and label row, read once (template planning matches names against them). */
export async function projectsAndLabels(): Promise<{ projects: Project[]; labels: Label[] }> {
  const [projects, labels] = await Promise.all([db.projects.toArray(), db.labels.toArray()])
  return { projects, labels }
}

/** Every project row, read once (deleted ones too). */
export function allProjectRows(): Promise<Project[]> {
  return db.projects.toArray()
}

// ---- sections ----

const NO_SECTIONS: Section[] = []

/** Every section row of a project, deleted ones too (none for no project). */
export function useSectionRows(projectId: string | null | undefined): Section[] {
  return useLiveQuery(() => (projectId ? db.sections.where('project_id').equals(projectId).toArray() : NO_SECTIONS), [projectId], NO_SECTIONS)
}

/** Every live (not deleted) section of every project. */
export function useLiveSections(): Section[] {
  return useLiveQuery(() => db.sections.filter((s) => !s.deleted_at).toArray(), [], NO_SECTIONS)
}

/** Where a task's section sits among its project's live sections, and how many open tasks it holds. */
export interface SectionPlace {
  row: Section
  first: boolean
  last: boolean
  /** Open, live tasks in the section. */
  count: number
}

/** The task's section place, live; undefined when the task is in no section. */
export function useSectionPlace(sectionId: string | null | undefined, projectId: string | null | undefined): SectionPlace | undefined {
  return useLiveQuery(async () => {
    if (!sectionId || !projectId) return undefined
    const sections = (await db.sections.where('project_id').equals(projectId).toArray()).filter((s) => !s.deleted_at).sort((a, b) => a.position - b.position)
    const i = sections.findIndex((s) => s.id === sectionId)
    if (i < 0) return undefined
    const count = await db.tasks.filter((tk) => tk.section_id === sectionId && !tk.deleted_at && !tk.completed_at).count()
    return { row: sections[i], first: i === 0, last: i === sections.length - 1, count }
  }, [sectionId, projectId])
}

// ---- reminders, comments, attachments ----

const NO_REMINDERS: Reminder[] = []

/** Every reminder row of a task, deleted ones too. */
export function useReminderRows(taskId: string | null | undefined): Reminder[] {
  return useLiveQuery(() => (taskId ? db.reminders.where('task_id').equals(taskId).toArray() : NO_REMINDERS), [taskId], NO_REMINDERS)
}

/** Re-puts reminder rows the service worker wrote straight into IndexedDB, so live queries notice them. */
export async function touchReminders(ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    const r = await db.reminders.get(id)
    if (r) await db.reminders.put(r)
  }
}

const NO_COMMENTS: Comment[] = []

/** Every comment row of a task, deleted ones too (threads keep a deleted root with live replies). */
export function useCommentRows(taskId: string): Comment[] {
  return useLiveQuery(() => db.comments.where('task_id').equals(taskId).toArray(), [taskId], NO_COMMENTS)
}

/** Number of live comments on a task (0 while loading). */
export function useLiveCommentCount(taskId: string): number {
  return useLiveQuery(() => db.comments.where('task_id').equals(taskId).filter((c) => !c.deleted_at).count(), [taskId], 0)
}

const NO_ATTACHMENTS: Attachment[] = []
const byCreated = (a: Attachment, b: Attachment) => a.created_at - b.created_at || (a.id < b.id ? -1 : 1)

/** The live attachments of a task itself (not of its comments), oldest first. */
export function useTaskAttachments(taskId: string): Attachment[] {
  return useLiveQuery(
    async () => (await db.attachments.where('task_id').equals(taskId).toArray()).filter((a) => !a.deleted_at && !a.comment_id).sort(byCreated),
    [taskId], NO_ATTACHMENTS,
  )
}

const NO_BY_COMMENT = new Map<string, Attachment[]>()

/** The live attachments of a task's comments, by comment id, oldest first. */
export function useCommentAttachments(taskId: string): Map<string, Attachment[]> {
  return useLiveQuery(async () => {
    const byComment = new Map<string, Attachment[]>()
    const rows = (await db.attachments.where('task_id').equals(taskId).toArray()).filter((a) => a.comment_id && !a.deleted_at)
    for (const a of rows.sort((x, y) => x.created_at - y.created_at)) {
      const list = byComment.get(a.comment_id!)
      if (list) list.push(a)
      else byComment.set(a.comment_id!, [a])
    }
    return byComment
  }, [taskId], NO_BY_COMMENT)
}

const NO_BLOBS = new Map<string, AttachmentBlob>()

/** The locally held file contents of these attachments, by id. */
export function useAttachmentBlobs(rows: readonly Pick<Attachment, 'id'>[]): Map<string, AttachmentBlob> {
  return useLiveQuery(async () => {
    const list = await db.attachmentBlobs.bulkGet(rows.map((r) => r.id))
    return new Map(list.filter((b): b is AttachmentBlob => !!b).map((b) => [b.id, b]))
  }, [rows], NO_BLOBS)
}

/** Whether this device holds the file of an attachment. */
export async function hasAttachmentBlob(id: string): Promise<boolean> {
  return !!(await db.attachmentBlobs.get(id))
}

// ---- notifications, calendar, meta ----

const NO_NOTIFICATIONS: AppNotification[] = []

/** The newest in-app notifications, newest first. */
export function useNotifications(limit = 50): AppNotification[] {
  return useLiveQuery(() => db.notifications.orderBy('createdAt').reverse().limit(limit).toArray(), [limit], NO_NOTIFICATIONS)
}

/** The calendar subscriptions cached with the last event refresh (for offline). */
export function cachedCalendarSubscriptions(): Promise<CalendarSubscription[]> {
  return db.calendarSubscriptions.toArray()
}

const ISSUE_CONNECTIONS_META_KEY = 'issueConnections'

/** The issue connections of the last load (issue-import D13): shown offline. Never a token: the server sends none. */
export function cachedIssueConnections(): Promise<IssueConnection[]> {
  return getMeta<IssueConnection[]>(ISSUE_CONNECTIONS_META_KEY, [])
}

/** Keeps the issue connections of a load for the offline panel. */
export function cacheIssueConnections(list: IssueConnection[]): Promise<void> {
  return setMeta(ISSUE_CONNECTIONS_META_KEY, list)
}

/** A device-local setting from the meta table, live; `fallback` while loading or unset. */
export function useMeta<T>(key: string, fallback: T): T {
  return useLiveQuery(() => getMeta<T>(key, fallback), [key], fallback)
}

// ---- names for history ----

/**
 * Names for the reference fields that history shows (assignee, project, section,
 * parent task), from local data; `parents` are the task ids a change names.
 */
export function useReferenceNames(parents: readonly string[]): Map<string, string> {
  return useLiveQuery(async () => {
    const m = new Map<string, string>()
    for (const ms of await db.memberships.toArray()) for (const u of ms.members) m.set(`assignee_id:${u.userId}`, u.name || u.email)
    for (const p of await db.projects.toArray()) m.set(`project_id:${p.id}`, p.name)
    for (const x of await db.sections.toArray()) m.set(`section_id:${x.id}`, x.name)
    for (const task of await db.tasks.bulkGet(parents as string[])) if (task) m.set(`parent_id:${task.id}`, task.title || t('Untitled'))
    return m
  }, [parents], NO_NAMES)
}

const NO_NAMES = new Map<string, string>()

// ---- device-local settings (the meta table, never synced) ----

/** Saves the Day and Week view preferences of this device (time-blocking D7). */
export function saveGridPrefs(prefs: GridPrefs): Promise<void> {
  return setMeta(GRID_PREFS_META_KEY, normalizeGridPrefs(prefs))
}

const noteFoldKey = (projectId: string) => `project-note-folded:${projectId}`

/** Whether a project's note is folded on this device (folded until opened). */
export function useProjectNoteFolded(projectId: string): boolean {
  return useMeta(noteFoldKey(projectId), true)
}

/** Folds or unfolds a project's note on this device. */
export function setProjectNoteFolded(projectId: string, folded: boolean): Promise<void> {
  return setMeta(noteFoldKey(projectId), folded)
}
