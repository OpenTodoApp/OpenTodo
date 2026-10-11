import { beforeEach, describe, expect, it } from 'vitest'
import { archiveCandidates, archivedProjects, getAutoArchive, projectFinishedBy, runAutoArchive, setAutoArchive, unarchiveProject, undoAutoArchive } from './archive'
import { db, useDatabase } from './db'
import { archiveProject, createProject, createTask, resetDeviceId, setTaskCompleted } from './ops'
import type { Membership, Project, Task } from './types'

let n = 0
beforeEach(() => {
  useDatabase(`archive-${Date.now()}-${n++}`)
  resetDeviceId()
})

const DAY = 86_400_000
const NOW = 1_800_000_000_000

function project(id: string, extra: Partial<Project> = {}): Project {
  return { id, name: id, color: '#000', position: 0, archived: false, parent_id: null, created_at: 0, deleted_at: null, _clock: {}, ...extra }
}

function task(id: string, projectId: string | null, extra: Partial<Task> = {}): Task {
  return {
    id, title: id, description: '', project_id: projectId, parent_id: null, priority: 4, due: null, labels: [], position: 0,
    created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, section_id: null, ical_extra: null, _clock: {}, ...extra,
  }
}

describe('archiveCandidates', () => {
  it('selects projects with tasks and no open task for 30 days', () => {
    const projects = [project('done'), project('recent'), project('open'), project('empty'), project('archived', { archived: true }), project('shared')]
    const tasks = [
      task('a', 'done', { completed_at: NOW - 31 * DAY }),
      task('b', 'done', { completed_at: NOW - 40 * DAY }),
      task('c', 'recent', { completed_at: NOW - 5 * DAY }),
      task('d', 'open', { completed_at: NOW - 40 * DAY }),
      task('e', 'open'),
      task('f', 'archived', { completed_at: NOW - 40 * DAY }),
      task('g', null, { completed_at: NOW - 40 * DAY }), // Inbox never qualifies
      task('h', 'empty', { deleted_at: 1 }),
      task('i', 'shared', { completed_at: NOW - 40 * DAY }),
    ]
    const memberships = new Map<string, Membership>([['shared', { projectId: 'shared', role: 'editor', ownerId: 'x', members: [] }]])
    expect(archiveCandidates(projects, tasks, NOW, memberships).map((p) => p.id)).toEqual(['done'])
    expect(archiveCandidates(projects, tasks, NOW, new Map(), new Set(['done'])).map((p) => p.id)).toEqual(['shared'])
  })
})

describe('auto-archive on this device', () => {
  it('archives candidates once a day unless opted out', async () => {
    const trip = await createProject({ name: 'Trip 2026' })
    const t = await createTask({ title: 'Book', project_id: trip })
    await db.tasks.update(t, { completed_at: NOW - 31 * DAY })
    expect(await getAutoArchive()).toBe(true)
    await setAutoArchive(false)
    expect(await runAutoArchive(NOW)).toEqual([])
    expect((await db.projects.get(trip))?.archived).toBe(false)
    await setAutoArchive(true)
    const archived = await runAutoArchive(NOW)
    expect(archived.map((p) => p.name)).toEqual(['Trip 2026'])
    expect((await db.projects.get(trip))?.archived).toBe(true)
    // Written as an ordinary op, so other devices converge.
    expect((await db.outbox.toArray()).some((o) => o.entityId === trip && o.field === 'archived' && o.value === true)).toBe(true)
    // Undo un-archives and keeps the project out of later passes.
    await undoAutoArchive(trip)
    expect((await db.projects.get(trip))?.archived).toBe(false)
    expect(await runAutoArchive(NOW + 2 * DAY)).toEqual([])
  })

  it('offers archiving when the last open task is completed', async () => {
    const trip = await createProject({ name: 'Trip 2026' })
    const a = await createTask({ title: 'A', project_id: trip })
    const b = await createTask({ title: 'B', project_id: trip })
    await setTaskCompleted(a, true)
    expect(await projectFinishedBy(a)).toBeNull()
    await setTaskCompleted(b, true)
    expect((await projectFinishedBy(b))?.id).toBe(trip)
    const inbox = await createTask({ title: 'Inbox' })
    await setTaskCompleted(inbox, true)
    expect(await projectFinishedBy(inbox)).toBeNull()
  })
})

describe('archived projects list (unarchive-projects)', () => {
  it('lists archived, non-deleted projects by name with parent, open count and permission', () => {
    const projects = [
      project('home', { name: 'Home', archived: true }),
      project('garden', { name: 'Garden', archived: true, parent_id: 'home' }),
      project('trip', { name: 'Trip 2026', archived: true }),
      project('live', { name: 'Live' }),
      project('gone', { name: 'Gone', archived: true, deleted_at: 1 }),
      project('shared', { name: 'Club', archived: true }),
    ]
    const tasks = [task('a', 'garden'), task('b', 'garden'), task('c', 'garden', { completed_at: 1 }), task('d', 'garden', { deleted_at: 1 }), task('e', 'trip')]
    const memberships = new Map<string, Membership>([['shared', { projectId: 'shared', role: 'editor', ownerId: 'x', members: [] }]])
    const rows = archivedProjects(projects, tasks, memberships)
    expect(rows.map((r) => [r.project.name, r.parentName, r.open, r.canRestore])).toEqual([
      ['Club', null, 0, false],
      ['Garden', 'Home', 2, true],
      ['Home', null, 0, true],
      ['Trip 2026', null, 1, true],
    ])
  })

  it('restores one project of an archived subtree as an op and keeps it out of automatic archiving', async () => {
    const home = await createProject({ name: 'Home' })
    const garden = await createProject({ name: 'Garden', parent_id: home })
    const t = await createTask({ title: 'Mow', project_id: home })
    await db.tasks.update(t, { completed_at: NOW - 40 * DAY })
    await archiveProject(home)
    expect((await db.projects.get(garden))?.archived).toBe(true)
    await db.outbox.clear()

    await unarchiveProject(home)
    expect((await db.projects.get(home))?.archived).toBe(false)
    // The sub-project stays archived until restored on its own.
    expect((await db.projects.get(garden))?.archived).toBe(true)
    const queued = await db.outbox.toArray()
    expect(queued.map((o) => [o.entityId, o.field, o.value])).toEqual([[home, 'archived', false]])
    // No open task for 40 days, but restored by hand: the daily pass leaves it alone.
    expect(await runAutoArchive(NOW)).toEqual([])
    expect((await db.projects.get(home))?.archived).toBe(false)
  })
})
