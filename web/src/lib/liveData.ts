// Live reads for screens (OpenSpec change web-component-structure): the IndexedDB
// queries the task list, the calendar and the task panel run, as hooks and
// selectors here in the data layer, so components under src/app never query the
// database themselves. Each hook keeps the query, the default and the dependencies
// the screen used before, so what it re-renders on is unchanged.
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta } from './db'
import { cachedWindow, showEvents, type EventsWindow } from './calendarFeeds'
import { DEFAULT_GRID_PREFS, GRID_PREFS_META_KEY, normalizeGridPrefs, type GridPrefs } from './calendar'
import { byPosition } from './ordering'
import { loadCollapsedSections, loadListColumns, loadViewMode, type ProjectViewMode } from './sections'
import { membershipMap } from './sharing'
import type { CalendarEvent, CalendarSubscription, Label, Membership, Project, Section, Task } from './types'

const NO_PROJECTS: Project[] = []
const NO_LABELS: Label[] = []
const NO_MEMBERSHIPS: Membership[] = []
const NO_SECTIONS: Section[] = []
const NO_STRINGS: string[] = []
const NO_EVENTS: CalendarEvent[] = []
const NO_SUBSCRIPTIONS: CalendarSubscription[] = []
const NO_TASKS: Task[] = []

/** Projects that are not in the trash (archived ones included). */
export function useLiveProjects(): Project[] {
  return useLiveQuery(() => db.projects.filter((p) => !p.deleted_at).toArray(), [], NO_PROJECTS)
}

/** Every label on the device, deleted ones included (a label view names a deleted label). */
export function useAllLabels(): Label[] {
  return useLiveQuery(() => db.labels.toArray(), [], NO_LABELS)
}

/** Cached memberships of shared projects (project-sharing), also offline. */
export function useMemberships(): Membership[] {
  return useLiveQuery(() => db.memberships.toArray(), [], NO_MEMBERSHIPS)
}

/** The memberships keyed by project id. */
export function useMembershipMap(): Map<string, Membership> {
  return useLiveQuery(() => membershipMap(), [], EMPTY_MEMBERSHIP_MAP)
}
const EMPTY_MEMBERSHIP_MAP = new Map<string, Membership>()

/** Every section row of a project, deleted ones included (they still resolve a task's section). */
export function useProjectSectionRows(projectId: string | null): Section[] {
  return useLiveQuery(
    () => (projectId ? db.sections.where('project_id').equals(projectId).toArray() : Promise.resolve(NO_SECTIONS)), [projectId], NO_SECTIONS,
  )
}

/** The live sections of a project, by position. */
export function useLiveSections(projectId: string | null): Section[] {
  return useLiveQuery(
    () => (projectId ? db.sections.where('project_id').equals(projectId).filter((s) => !s.deleted_at).toArray().then((l) => l.sort(byPosition)) : Promise.resolve(NO_SECTIONS)),
    [projectId], NO_SECTIONS,
  )
}

/** The project's layout on this device (board-view); 'list' outside a project. */
export function useProjectViewMode(projectId: string | null): ProjectViewMode {
  return useLiveQuery(() => (projectId ? loadViewMode(projectId) : Promise.resolve('list' as const)), [projectId], 'list')
}

/** Section keys folded on this device. */
export function useCollapsedSections(projectId: string | null): string[] {
  return useLiveQuery(() => (projectId ? loadCollapsedSections(projectId) : Promise.resolve(NO_STRINGS)), [projectId], NO_STRINGS)
}

/** Whether the project's list shows custom fields as columns on this device. */
export function useListColumnsPref(projectId: string | null): boolean {
  return useLiveQuery(() => (projectId ? loadListColumns(projectId) : Promise.resolve(false)), [projectId], false)
}

/**
 * Tasks of one project in any state, or of the Inbox (no project): the parent
 * picker applies its own rules. A project's come from the project_id index; Inbox
 * tasks are not indexed.
 */
export function useProjectTasks(projectId: string | null): Task[] {
  return useLiveQuery(
    () => (projectId ? db.tasks.where('project_id').equals(projectId).toArray() : db.tasks.filter((tk) => !tk.project_id).toArray()),
    [projectId], NO_TASKS,
  )
}

/** Number of live reminders of a task. */
export function useReminderCount(taskId: string): number {
  return useLiveQuery(() => db.reminders.where('task_id').equals(taskId).filter((r) => !r.deleted_at).count(), [taskId], 0)
}

/** Cached events of subscribed calendars (calendar-feeds). */
export function useCalendarEvents(): CalendarEvent[] {
  return useLiveQuery(() => db.calendarEvents.toArray(), [], NO_EVENTS)
}

/** Calendar subscriptions of this account. */
export function useCalendarSubscriptions(): CalendarSubscription[] {
  return useLiveQuery(() => db.calendarSubscriptions.toArray(), [], NO_SUBSCRIPTIONS)
}

/** Whether this device shows subscribed calendars in the grid (on unless turned off). */
export function useShowEvents(): boolean {
  return useLiveQuery(showEvents, [], true)
}

/** The range of days the device cache of subscribed calendars covers, and when it was fetched. */
export function useCachedEventsWindow(): EventsWindow | null {
  return useLiveQuery(cachedWindow, [], null)
}

/** The calendar grid preferences of this device (Dexie meta, never synced). */
export function useGridPrefs(): GridPrefs {
  return useLiveQuery(() => getMeta<unknown>(GRID_PREFS_META_KEY, null).then(normalizeGridPrefs), [], DEFAULT_GRID_PREFS)
}

/** The grid preferences read once, for code that runs before the live query delivers. */
export async function readGridPrefs(): Promise<GridPrefs> {
  return normalizeGridPrefs(await getMeta<unknown>(GRID_PREFS_META_KEY, null))
}

/** One stored task row (tombstones included), read now rather than live. */
export function getTask(id: string): Promise<Task | undefined> {
  return db.tasks.get(id)
}
