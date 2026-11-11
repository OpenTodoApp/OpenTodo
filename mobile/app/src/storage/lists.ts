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
// - Inbox's candidates: open tasks without a project.
// - The parents of the candidates, up the tree: the Inbox rule and the workspace of a
//   subtask look at them.
import { addDaysISO } from '@shared/dates'
import { todayList, withoutArchived, type TodayAssigneeFilter } from '@shared/dayLists'
import { db } from '@shared/db'
import { inboxTasks } from '@shared/inbox'
import { deletedProjectIds, isTaskVisible } from '@shared/trash'
import type { Project, Task } from '@shared/types'
import { readWorkspaceState, tasksIn } from '@shared/workspaces'
import type { SqliteTable } from './adapter'
import { columnOf, quote } from './schema'

const MAX_DEPTH = 64

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

/** The Inbox: the shared inboxTasks over the open tasks without a project. */
export async function inboxList(): Promise<Task[]> {
  const candidates = await tasksTable().select(`${open} AND ${columnOf('project_id')} IS NULL`) as unknown as Task[]
  const { list, known, projects } = await visible(candidates)
  return inboxTasks(withoutArchived(list, projects), known)
}
