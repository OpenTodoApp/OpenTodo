import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { setBlockedBy } from './dependencies'
import { createLabel } from './labels'
import { applyOps, createProject, createSubtask, createTask, resetDeviceId, setTaskCompleted, updateTask } from './ops'
import { createSection } from './sections'
import {
  countTasks, duplicateProject, duplicateTask, fileFromTree, planTree, shiftDays, shiftDue, summarise, TemplateFileError, TemplateTooLargeError,
  treeFromFile, treeFromProject, type TemplateTree, type TTask,
} from './templates'
import type { Op } from './types'

// Project templates (OpenSpec change project-templates, tasks 1.1–1.4, 2.1, 2.2).

let n = 0
beforeEach(() => {
  useDatabase(`templates-${Date.now()}-${n++}`)
  resetDeviceId()
})

async function tripProject() {
  const p = await createProject({ name: 'Trip to Rome' })
  const before = await createSection(p, 'Before')
  const during = await createSection(p, 'During')
  const done = await createTask({ title: 'Old step', project_id: p })
  await setTaskCompleted(done, true)
  const pack = await createTask({ title: 'Pack', project_id: p, section_id: before, due: { date: '2026-10-01' } })
  await createSubtask(pack, 'Socks')
  const shoes = await createSubtask(pack, 'Shoes')
  await setTaskCompleted(shoes, true)
  await createTask({ title: 'Water plants', project_id: p, section_id: during, recurrence: 'every week', due: { date: '2026-10-04', time: '09:00' } })
  return { p, before, during, pack }
}

describe('treeFromProject (1.1)', () => {
  it('keeps sections, open tasks with open subtasks and the recurring task, never completed work', async () => {
    const { p } = await tripProject()
    const tree = await treeFromProject(p)
    const [root] = tree.projects
    expect(root.sections.map((s) => s.name)).toEqual(['Before', 'During'])
    expect(root.sections[0].tasks.map((t) => t.title)).toEqual(['Pack'])
    expect(root.sections[0].tasks[0].subtasks.map((t) => t.title)).toEqual(['Socks'])
    expect(root.sections[1].tasks[0]).toMatchObject({ title: 'Water plants', recurrence: 'every week' })
    expect(countTasks(tree)).toBe(3)
  })
})

describe('date shifting (1.2)', () => {
  it('moves dates by whole days, keeping time and zone', () => {
    expect(shiftDays('2026-10-01', '2026-11-10')).toBe(40)
    expect(shiftDue({ date: '2026-10-04', time: '09:00', tz: 'Europe/Rome' }, 40)).toEqual({ date: '2026-11-13', time: '09:00', tz: 'Europe/Rome' })
    expect(shiftDue({ date: '2026-10-14' }, shiftDays('2026-10-14', '2026-12-01'))).toEqual({ date: '2026-12-01' })
    expect(shiftDays('2026-10-01', null)).toBe(0)
  })
})

describe('planTree (1.3)', () => {
  it('uses fresh ids, reuses labels by name ignoring case and refuses huge trees', async () => {
    const errand = await createLabel({ name: 'Errand' })
    const tree: TemplateTree = { labels: [{ name: 'errand' }, { name: 'new one' }], projects: [{ name: 'P', color: '#000', sections: [], children: [],
      tasks: [{ key: 'src-1', title: 'A', description: '', priority: 2, due: null, labels: ['errand', 'new one'], estimate_minutes: null, recurrence: null, subtasks: [] }] }] }
    const plan = planTree(tree, { labels: await db.labels.toArray() })
    const task = plan.changes.find((c) => c.entity === 'task')!
    expect(task.entityId).not.toBe('src-1')
    expect((task.patch.labels as string[])[0]).toBe(errand)
    expect(plan.changes.filter((c) => c.entity === 'label')).toHaveLength(1)
    // A declared label nobody uses is created too, once.
    const extra = planTree({ ...tree, labels: [...tree.labels, { name: 'Unused' }, { name: 'errand' }] }, { labels: await db.labels.toArray() })
    expect(extra.changes.filter((c) => c.entity === 'label').map((c) => c.patch.name)).toEqual(['new one', 'Unused'])
    expect(task.patch).not.toHaveProperty('assignee_id')
    const big: TTask[] = Array.from({ length: 1001 }, (_, i) => ({ title: `t${i}`, description: '', priority: 4, due: null, labels: [], estimate_minutes: null, recurrence: null, subtasks: [] }))
    expect(() => planTree({ labels: [], projects: [], tasks: big }, { labels: [] })).toThrow(TemplateTooLargeError)
    expect(await db.tasks.count()).toBe(0)
  })
})

describe('duplicate (1.4)', () => {
  it('duplicates a project offline with a start day; the copy is last among projects', async () => {
    await createProject({ name: 'Other' })
    const { p } = await tripProject()
    const copy = await duplicateProject(p, { name: 'Trip to Rome copy', startDay: '2026-11-10' })
    const projects = (await db.projects.toArray()).filter((x) => !x.parent_id).sort((a, b) => a.position - b.position)
    expect(projects.at(-1)!.id).toBe(copy)
    const tasks = (await db.tasks.toArray()).filter((t) => t.project_id === copy)
    expect(tasks.find((t) => t.title === 'Pack')?.due).toEqual({ date: '2026-11-10' })
    expect(tasks.find((t) => t.title === 'Water plants')?.due).toEqual({ date: '2026-11-13', time: '09:00' })
    expect(tasks.some((t) => t.completed_at)).toBe(false)
    expect(tasks).toHaveLength(3)
    // Every op is queued for upload.
    const queued = new Set((await db.outbox.toArray()).map((o) => o.entityId))
    for (const t of tasks) expect(queued.has(t.id)).toBe(true)
  })

  it('duplicates a task tree right after the original, keeping dates without a start day', async () => {
    const p = await createProject({ name: 'Work' })
    const first = await createTask({ title: 'First', project_id: p, due: { date: '2026-10-20' } })
    for (const s of ['a', 'b', 'c']) await createSubtask(first, s)
    const second = await createTask({ title: 'Second', project_id: p })
    const copy = await duplicateTask(first)
    const top = (await db.tasks.toArray()).filter((t) => t.project_id === p && !t.parent_id).sort((a, b) => a.position - b.position)
    expect(top.map((t) => t.id)).toEqual([first, copy, second])
    expect((await db.tasks.get(copy))?.due).toEqual({ date: '2026-10-20' })
    expect((await db.tasks.toArray()).filter((t) => t.parent_id === copy).map((t) => t.title).sort()).toEqual(['a', 'b', 'c'])
  })

  it('keeps blockers inside the copied tree and drops the rest', async () => {
    const p = await createProject({ name: 'Plan' })
    const outside = await createTask({ title: 'Outside', project_id: p })
    const a = await createTask({ title: 'A', project_id: p })
    const b = await createTask({ title: 'B', project_id: p })
    await setBlockedBy(b, [a, outside])
    await updateTask(outside, { project_id: null })
    const copy = await duplicateProject(p)
    const tasks = (await db.tasks.toArray()).filter((t) => t.project_id === copy)
    const ca = tasks.find((t) => t.title === 'A')!
    expect(tasks.find((t) => t.title === 'B')?.blocked_by).toEqual([ca.id])
  })

  it('two devices duplicating offline end with two complete copies', async () => {
    const { p } = await tripProject()
    const ops: Op[] = (await db.outbox.toArray()).map(({ local: _l, ...o }) => o as Op)
    const before = await db.outbox.count()
    await duplicateProject(p)
    const mine = (await db.outbox.toArray()).slice(before).map(({ local: _l, ...o }) => o as Op)
    // A second device with the same original duplicates too.
    const other = useDatabase(`templates-other-${n++}`)
    resetDeviceId()
    await applyOps(ops)
    await duplicateProject(p)
    const theirs = (await other.outbox.toArray()).map(({ local: _l, ...o }) => o as Op)
    await applyOps(mine)
    const live = (await other.projects.toArray()).filter((x) => !x.deleted_at)
    expect(live).toHaveLength(3)
    for (const c of live.filter((x) => x.id !== p)) expect((await other.tasks.toArray()).filter((t) => t.project_id === c.id)).toHaveLength(3)
    expect(theirs.length).toBeGreaterThan(0)
  })
})

describe('template files (2.1, 2.2)', () => {
  it('round-trips a tree and writes the same file twice', async () => {
    const { p } = await tripProject()
    const tree = await treeFromProject(p)
    const a = fileFromTree(tree, { day: '2026-10-14', exportedAt: '2026-10-14T10:00:00Z' })
    const b = fileFromTree(await treeFromProject(p), { day: '2026-10-14', exportedAt: '2026-10-14T10:00:00Z' })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a).toMatchObject({ format: 'opentodo-export', version: 1, template: { day: '2026-10-14' } })
    expect(a.reminders).toEqual([])
    const back = treeFromFile(JSON.parse(JSON.stringify(a)))
    const strip = (t: TemplateTree) => JSON.parse(JSON.stringify(t, (k, v) => (k === 'key' || k === 'day' ? undefined : v)))
    expect(strip(back)).toEqual(strip(tree))
    expect(back.day).toBe('2026-10-14')
    expect(summarise(back)).toMatchObject({ projects: 1, sections: 2, tasks: 3, dated: 2, recurring: 1 })
  })

  it('reads a website download and refuses other files', () => {
    const site = {
      format: 'opentodo-export', version: 1, exportedAt: '2026-10-14T08:00:00.000Z',
      labels: [{ id: 'l1', name: 'packing', color: '#22c55e' }],
      projects: [{ id: 'p1', name: 'Trip planning', color: '#3b82f6', parent_id: null, position: 1 }],
      sections: [{ id: 's1', name: 'Before you go', project_id: 'p1', position: 1 }],
      tasks: [
        { id: 't1', title: 'Book flights', project_id: 'p1', section_id: 's1', parent_id: null, priority: 1, due: { date: '2026-10-14' }, labels: ['l1'], position: 1 },
        { id: 't2', title: 'Done already', project_id: 'p1', section_id: null, completed_at: 5, position: 2 },
      ],
    }
    const tree = treeFromFile(site)
    expect(tree.day).toBe('2026-10-14')
    expect(tree.projects[0].sections[0].tasks[0]).toMatchObject({ title: 'Book flights', labels: ['packing'] })
    expect(countTasks(tree)).toBe(1)
    expect(() => treeFromFile('title,due\nA,2026-10-14')).toThrow(TemplateFileError)
    expect(() => treeFromFile({ projects: [], sections: [], items: [] })).toThrow(TemplateFileError)
    expect(() => treeFromFile({ ...site, tasks: [{ id: 'x', title: 'X', project_id: 'p1', section_id: 'gone' }] })).toThrow(/section that is not in the file/)
  })

  it('starts the same template twice as two projects', async () => {
    const tree = treeFromFile({ format: 'opentodo-export', version: 1, exportedAt: '2026-10-14T08:00:00Z', labels: [],
      projects: [{ id: 'p1', name: 'Checklist', color: '#000', position: 1 }], sections: [],
      tasks: [{ id: 't1', title: 'Step', project_id: 'p1', due: { date: '2026-10-21' }, position: 1 }] })
    const labels = await db.labels.toArray()
    for (const _ of [1, 2]) await (await import('./ops')).mutateMany(planTree(tree, { labels, startDay: '2026-12-01' }).changes)
    const projects = await db.projects.toArray()
    expect(projects).toHaveLength(2)
    expect((await db.tasks.toArray()).map((t) => t.due?.date)).toEqual(['2026-12-08', '2026-12-08'])
  })
})

describe('the server reads what the client writes (2.2)', () => {
  // A fixed tree, written to internal/importer/testdata/template/trip.json, which the
  // Go importer test previews; the fixture must stay byte-identical to the writer.
  const tree: TemplateTree = {
    labels: [{ name: 'packing', color: '#22c55e' }],
    projects: [{ name: 'Trip to Rome', color: '#3b82f6', tasks: [], children: [], sections: [
      { name: 'Before', tasks: [{ title: 'Pack', description: '', priority: 2, due: { date: '2026-10-14' }, labels: ['packing'], estimate_minutes: 30, recurrence: null,
        subtasks: [{ title: 'Socks', description: '', priority: 4, due: null, labels: [], estimate_minutes: null, recurrence: null, subtasks: [] }] }] },
    ] }],
  }
  it('matches the committed fixture', async () => {
    const { readFileSync, writeFileSync, existsSync } = await import('node:fs')
    const path = new URL('../../../internal/importer/testdata/template/trip.json', import.meta.url)
    const text = JSON.stringify(fileFromTree(tree, { day: '2026-10-14', exportedAt: '2026-10-14T08:00:00.000Z' }), null, 2) + '\n'
    if (!existsSync(path)) writeFileSync(path, text)
    expect(readFileSync(path, 'utf8')).toBe(text)
  })
})
