// Today and Inbox from an index (design D4): the start screens ask SQLite for the rows
// that can be in the list, never for the whole tasks table, and the shared rules decide
// which are (dayLists' todayList and withoutArchived, inbox's inboxTasks, trash's
// isTaskVisible, workspaces' tasksIn), so the phone shows exactly what the web shows.
// The web reads every task into one snapshot (liveTasks) and runs the same rules on it;
// test/storage/lists.test.ts checks both give the same lists.
//
// - Today's candidates: open tasks with a do-on date up to two days ahead (a do-on time
//   in another zone can be up to two days earlier here), a deadline or a start date
//   up to today (Someday sorts after every date, so it never matches).
// - Upcoming's candidates: open tasks with a do-on date, a deadline or a start date in
//   the days the phone shows (the next 14), the do-on date two days wider for the zones.
// - Inbox's candidates: open tasks without a project.
// - The parents of the candidates, up the tree: the Inbox rule and the workspace of a
//   subtask look at them.
import { addDaysISO } from '@shared/dates'
import { groupToday, groupUpcoming, todayList, upcomingList, withoutArchived, type TodayAssigneeFilter, type TodayGroups } from '@shared/dayLists'
import { db } from '@shared/db'
import { todaySlots } from '@shared/closedListPrefs'
import { blockedMap, blockersOf } from '@shared/dependencies'
import { inboxTasks } from '@shared/inbox'
import { deletedProjectIds, isTaskVisible } from '@shared/trash'
import type { Project, Task } from '@shared/types'
import { USER_PREFS_ID } from '@shared/userPrefs'
import { readWorkspaceState, tasksIn } from '@shared/workspaces'
import type { SqliteTable } from './adapter'
import { columnOf, quote } from './schema'

const MAX_DEPTH = 64
/** The personal review row (today's focus and the taken slots). */
const REVIEW_ID = 'me'

// The database in use (db.ts's, the account's): the shared rules below read it too.
const tasksTable = () => db.tasks as unknown as SqliteTable

const open = `${columnOf('completed_at')} IS NULL`

async function withParents(candidates: Task[]): Promise<Task[]> {
  const pool = new Map(candidates.map((t) => [t.id, t]))
  let missing = [...new Set(candidates.map((t) => t.parent_id).filter((p): p is string => !!p && !pool.has(p)))]
  for (let depth = 0; missing.length && depth < MAX_DEPTH; depth++) {
    const found = (await db.tasks.bulkGet(missing)).filter((t): t is Task => !!t)
    for (const t of found) pool.set(t.id, t)
    missing = [...new Set(found.map((t) => t.parent_id).filter((p): p is string => !!p && !pool.has(p)))]
  }
  return [...pool.values()]
}

/** The candidates the current workspace shows, and every visible task their rules may look at. */
async function visible(candidates: Task[]): Promise<{ list: Task[]; known: Task[]; projects: Project[] }> {
  const [projects, state, pool] = await Promise.all([db.projects.toArray(), readWorkspaceState(), withParents(candidates)])
  const gone = deletedProjectIds(projects)
  const known = tasksIn(state, projects, pool.filter((t) => isTaskVisible(t, gone)))
  const ids = new Set(candidates.map((t) => t.id))
  return { list: known.filter((t) => ids.has(t.id)), known, projects }
}

/** Today's tasks, in Today's order: the shared todayList over the indexed candidates. */
export async function todayTasks(today: string, hide?: TodayAssigneeFilter | null): Promise<Task[]> {
  const t = quote('tasks')
  const range = (path: string) => `SELECT pk FROM ${t} WHERE ${open} AND ${columnOf(path)} <= ?`
  const candidates = await tasksTable().select(
    `pk IN (${range('due.date')} UNION ${range('deadline')} UNION ${range('start')})`,
    [addDaysISO(today, 2), today, today],
  ) as unknown as Task[]
  const { list, projects } = await visible(candidates)
  return todayList(withoutArchived(list, projects), today, hide)
}

/** Today's groups, and the tasks its closed list keeps waiting for a slot (in the order they come in). */
export interface TodayView extends TodayGroups { waiting: Task[] }

/**
 * Today in its groups (the shared groupToday): Earlier, the day, This Evening, and the
 * tasks that wait for another one. The blockers are read by id, so a task blocked by one
 * that is not in Today is still known as blocked, and pass the same visibility rules as
 * the lists. With a Today limit (today-closed-list), the shared slot rule decides which
 * tasks are listed and which wait for a slot.
 */
export async function todayGroups(today: string, hide?: TodayAssigneeFilter | null): Promise<TodayView> {
  const list = await todayTasks(today, hide)
  const have = new Set(list.map((task) => task.id))
  const missing = [...new Set(list.flatMap(blockersOf))].filter((id) => !have.has(id))
  const found = missing.length ? (await db.tasks.bulkGet(missing)).filter((task): task is Task => !!task) : []
  // A blocker the lists do not show (a deleted or archived project, another workspace) blocks nothing, as on the web.
  const shown = await visible(found)
  const blocked = blockedMap([...list, ...withoutArchived(shown.list, shown.projects)])
  const [prefs, review] = await Promise.all([db.userPrefs.get(USER_PREFS_ID), db.review.get(REVIEW_ID)])
  const fill = todaySlots(list, today, prefs, review, (id) => !blocked.has(id))
  const out = new Set(fill.waiting)
  const byId = new Map(list.map((task) => [task.id, task]))
  return {
    ...groupToday(out.size ? list.filter((task) => !out.has(task.id)) : list, today, blocked),
    waiting: fill.waiting.map((id) => byId.get(id)!),
  }
}

/** The Inbox: the shared inboxTasks over the open tasks without a project. */
export async function inboxList(): Promise<Task[]> {
  const candidates = await tasksTable().select(`${open} AND ${columnOf('project_id')} IS NULL`) as unknown as Task[]
  const { list, known, projects } = await visible(candidates)
  return inboxTasks(withoutArchived(list, projects), known)
}

/** The days Upcoming shows on the phone, after today (native-app-everyday D1). */
export const UPCOMING_DAYS = 14

export interface UpcomingDay { date: string; tasks: Task[] }

/**
 * Upcoming: the shared upcomingList over the indexed candidates, grouped by day with
 * the shared groupUpcoming, for the next `days` days.
 */
export async function upcomingDays(today: string, days = UPCOMING_DAYS): Promise<UpcomingDay[]> {
  const t = quote('tasks')
  const horizon = addDaysISO(today, days)
  const range = (path: string) => `SELECT pk FROM ${t} WHERE ${open} AND ${columnOf(path)} > ? AND ${columnOf(path)} <= ?`
  const candidates = await tasksTable().select(
    `pk IN (${range('due.date')} UNION ${range('deadline')} UNION ${range('start')})`,
    [addDaysISO(today, -2), addDaysISO(horizon, 2), today, horizon, today, horizon],
  ) as unknown as Task[]
  const { list, projects } = await visible(candidates)
  return groupUpcoming(upcomingList(withoutArchived(list, projects), today), today).filter((d) => d.date > today && d.date <= horizon)
}
