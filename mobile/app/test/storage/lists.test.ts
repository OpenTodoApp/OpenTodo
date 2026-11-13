/**
 * @jest-environment node
 */
// Today and Inbox from the index (src/storage/lists.ts) against the web's way, every
// visible task through the same shared rules (lib/listGroups' tasksForView over
// lib/trash's visibleTaskSets): the same lists, in the same order, over a generated
// account with zoned do-on times, deadlines, start dates, Someday, subtasks, deleted
// and archived projects and two workspaces. Also checks that SQLite reads the
// candidates through the phone's indexes, not by scanning the table.
import { DatabaseSync } from 'node:sqlite'
import { refreshViewerZone } from '@shared/dates'
import { groupUpcoming, todayList, upcomingList, withoutArchived } from '@shared/dayLists'
import { db, useDatabase as openDatabaseNamed } from '@shared/db'
import { inboxTasks } from '@shared/inbox'
import { resetModuleState } from '@shared/moduleState'
import { installPlatform, platform } from '@shared/platform'
import { visibleTaskSets } from '@shared/trash'
import type { Project, Task } from '@shared/types'
import { CURRENT_WORKSPACE_KEY } from '@shared/workspaces'
import { sqliteDatabase } from '../../src/storage/adapter'
import { inboxList, todayTasks, upcomingDays } from '../../src/storage/lists'
import { nodeSqlite } from './nodeSqlite'

const TODAY = '2026-11-10'

function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function day(offset: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

function account(seed: number) {
  const r = prng(seed)
  const pick = <T,>(list: T[]) => list[Math.floor(r() * list.length)]
  const projects: Partial<Project>[] = Array.from({ length: 12 }, (_, i) => ({
    id: `p${i}`, name: `P${i}`, position: i, archived: i === 3, deleted_at: i === 4 ? 1 : null, workspace_id: i % 5 === 0 ? 'w2' : null,
  }))
  const tasks: Partial<Task>[] = []
  for (let i = 0; i < 1500; i++) {
    const parent = i > 20 && r() < 0.2 ? `t${Math.floor(r() * i)}` : null
    const zoned = r() < 0.15
    const due = r() < 0.5 ? { date: day(Math.floor(r() * 9) - 4), ...(zoned ? { time: pick(['00:30', '23:30', '12:00']), tz: pick(['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Tokyo']) } : {}) } : null
    tasks.push({
      id: `t${i}`, title: `Task ${i}`, description: '', labels: [], priority: pick([1, 2, 3, 4]) as Task['priority'], position: Math.floor(r() * 1000), created_at: i,
      project_id: r() < 0.4 ? null : pick(projects).id!, parent_id: parent,
      due, deadline: r() < 0.15 ? day(Math.floor(r() * 7) - 3) : null,
      start: r() < 0.2 ? pick(['someday', day(-2), day(0), day(3)]) : null,
      sector: r() < 0.05 ? '2026-W46' : undefined,
      completed_at: r() < 0.25 ? 100 + i : null, deleted_at: r() < 0.05 ? 1 : null,
      assignee_id: null, section_id: null,
    } as Partial<Task>)
  }
  return { projects, tasks }
}

/** The adapter as the database, in a viewer zone far from most do-on times' zones. */
function useAdapter(zone = 'Europe/Rome') {
  const web = platform
  installPlatform({ ...web, database: (declared) => sqliteDatabase(declared, nodeSqlite()), timeZone: { current: () => zone, onChange: () => () => undefined } })
  openDatabaseNamed(`lists-${Math.random()}`)
  refreshViewerZone()
}

afterEach(() => resetModuleState())

/** The web's lists: every visible task of the workspace through tasksForView's rules. */
async function webLists() {
  const [{ here }, projects] = await Promise.all([visibleTaskSets(), db.projects.toArray()])
  const all = withoutArchived(here, projects)
  const upcoming = groupUpcoming(upcomingList(all, TODAY), TODAY).filter((d) => d.date > TODAY && d.date <= day(14))
  return { today: todayList(all, TODAY), inbox: inboxTasks(all, here), upcoming }
}

const ids = (list: Task[]) => list.map((t) => t.id)

describe('Today and Inbox from the index', () => {
  it.each([[1, 'Europe/Rome'], [2, 'Pacific/Kiritimati'], [3, 'Pacific/Pago_Pago']] as const)('match the web lists (account %i, viewer in %s)', async (seed, zone) => {
    useAdapter(zone)
    const { projects, tasks } = account(seed)
    await db.projects.bulkPut(projects as Project[])
    await db.tasks.bulkPut(tasks as Task[])
    const want = await webLists()
    expect(want.today.length).toBeGreaterThan(50)
    expect(want.inbox.length).toBeGreaterThan(50)
    expect(ids(await todayTasks(TODAY))).toEqual(ids(want.today))
    expect(ids(await inboxList())).toEqual(ids(want.inbox))
    // Upcoming: the same days, each with the same tasks in the same order.
    const upcoming = await upcomingDays(TODAY)
    expect(want.upcoming.flatMap((d) => d.tasks).length).toBeGreaterThan(20)
    expect(upcoming.map((d) => [d.date, ids(d.tasks)])).toEqual(want.upcoming.map((d) => [d.date, ids(d.tasks)]))
  })

  it('match the web lists in another workspace', async () => {
    useAdapter()
    const { projects, tasks } = account(4)
    await db.projects.bulkPut(projects as Project[])
    await db.tasks.bulkPut(tasks as Task[])
    await db.workspaces.bulkPut([
      { id: 'w1', name: 'Personal', icon: '', color: '', default: true, role: 'owner', ownerId: 'u' },
      { id: 'w2', name: 'Work', icon: '', color: '', default: false, role: 'owner', ownerId: 'u' },
    ])
    await db.meta.put({ key: CURRENT_WORKSPACE_KEY, value: 'w2' })
    const want = await webLists()
    expect(want.today.length).toBeGreaterThan(5)
    expect(ids(await todayTasks(TODAY))).toEqual(ids(want.today))
    expect(ids(await inboxList())).toEqual(ids(want.inbox))
  })

  it('reads the candidates through the phone indexes', async () => {
    const sql = nodeSqlite()
    const web = platform
    installPlatform({ ...web, database: (declared) => sqliteDatabase(declared, sql) })
    openDatabaseNamed('plan')
    await db.tasks.put({ id: 'x' } as Task)
    const detail = (where: string, params: string[] = []) => nodeDetail(sql.dir, where, params)
    for (const path of ['due.date', 'deadline', 'start']) {
      expect(detail(`"i:completed_at" IS NULL AND "i:${path}" <= ?`, [TODAY])).toContain(`INDEX tasks:phone:completed_at+${path}`)
    }
    expect(detail(`"i:completed_at" IS NULL AND "i:project_id" IS NULL`)).toContain('INDEX tasks:phone:completed_at+project_id')
  })
})

function nodeDetail(dir: string, where: string, params: string[]): string {
  const d = new DatabaseSync(`${dir}/plan.sqlite`)
  const rows = d.prepare(`EXPLAIN QUERY PLAN SELECT pk FROM tasks WHERE ${where}`).all(...params) as { detail: string }[]
  d.close()
  return rows.map((r) => r.detail).join(' | ')
}
