// @vitest-environment happy-dom
// Drops across project groups and onto tasks in a view grouped by Project (OpenSpec
// change view-project-drops, GitHub issue 1211): a drop in another project's group
// moves the task there and places it in the view's order; with Nest subtasks a drop
// onto a task nests it; a viewer's project takes no drop; other groupings keep
// drops within a group.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { createLabel } from '../lib/labels'
import { addDaysISO, logicalToday } from '../lib/dates'
import { setListDisplay } from '../lib/listDisplay'
import { createProject, createTask, mutate, resetDeviceId } from '../lib/ops'
import { createView } from '../lib/views'
import { undoBatch } from '../lib/undo'
import { mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { SavedViewRoute } from './SavedViewView'
import { TaskListView } from './TaskListView'

describe('Today grouped by Project', () => {
  async function todayFixture() {
    const home = await createProject({ name: 'Home' })
    const work = await createProject({ name: 'Work' })
    const due = { date: logicalToday() }
    const a = await createTask({ title: 'A', project_id: home, due })
    const b = await createTask({ title: 'B', project_id: home, due })
    const z = await createTask({ title: 'Z', project_id: work, due })
    const x = await createTask({ title: 'X', project_id: work, due })
    const y = await createTask({ title: 'Y', project_id: work, due })
    const inbox = await createTask({ title: 'Unassigned', due })
    await setListDisplay({ kind: 'today' }, { groupBy: 'project', sortBy: 'title' })
    return { home, work, a, b, x, y, z, inbox, due }
  }

  const group = (key: string) => document.querySelector<HTMLElement>(`[data-drop-target="today-group:day:${key}"]`)
  const order = (key: string) => [...(group(key)?.querySelectorAll('[data-task-id]') ?? [])].map((el) => el.getAttribute('data-task-id'))

  it('honors the drop line, preserves visible title order, and undoes the move and sort', async () => {
    const f = await todayFixture()
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    try {
      await waitFor(() => order(f.work).join() === [f.x, f.y, f.z].join())
      const shown = await drag(f.b, rowOf(f.y), 102)
      expect(shown).toEqual({ line: 'before', note: 'Move to Work' })
      await waitFor(() => order(f.work).join() === [f.x, f.b, f.y, f.z].join())
      expect(await db.tasks.get(f.b)).toMatchObject({ project_id: f.work, due: f.due })
      expect(await db.userPrefs.get('me')).toMatchObject({ today_sort_by: 'position' })
      const entry = (await db.assistantUndo.toArray()).find((e) => e.label === 'Moved to Work')!
      await act(async () => { await undoBatch(entry.id) })
      await waitFor(() => order(f.home).join() === [f.a, f.b].join())
      expect(await db.userPrefs.get('me')).toMatchObject({ today_sort_by: 'title', today_manual_order: [] })
    } finally { await r.unmount() }
  })

  it('keeps the sort for a group drop, accepts displayed Inbox and nests in the destination', async () => {
    const f = await todayFixture()
    await setListDisplay({ kind: 'today' }, { subtasks: true })
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    try {
      await waitFor(() => !!group('inbox') && !!rowOf(f.b) && !!rowOf(f.y))
      await drag(f.b, group('inbox')!, 120)
      await waitFor(() => order('inbox').includes(f.b))
      expect(await db.tasks.get(f.b)).toMatchObject({ project_id: null, due: f.due })
      expect(await db.userPrefs.get('me')).toMatchObject({ today_sort_by: 'title' })
      await drag(f.b, rowOf(f.y), 120)
      await waitFor(async () => (await db.tasks.get(f.b))?.parent_id === f.y)
      expect(await db.tasks.get(f.b)).toMatchObject({ project_id: f.work, due: f.due })
      expect(await db.userPrefs.get('me')).toMatchObject({ today_sort_by: 'title' })
    } finally { await r.unmount() }
  })

  it('offers Reorder in the editable project group but not on an Earlier row or a nested subtask', async () => {
    const f = await todayFixture()
    const late = await createTask({ title: 'Late', project_id: f.home, due: { date: addDaysISO(f.due.date, -1) } })
    const child = await createTask({ title: 'Child', project_id: f.home, parent_id: f.a, due: f.due })
    await setListDisplay({ kind: 'today' }, { subtasks: true })
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    const action = (id: string) => document.querySelector<HTMLElement>(`[data-action="${id}"]`)
    const open = async (id: string) => {
      await act(async () => {
        rowOf(id).dispatchEvent(new MouseEvent('contextmenu', { clientX: 20, clientY: 20, bubbles: true, cancelable: true }))
      })
      await waitFor(() => !!action('trash'), 'the task menu')
    }
    const close = async () => {
      await act(async () => { document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
      await waitFor(() => !action('trash'), 'the task menu to close')
    }
    try {
      await waitFor(() => !!rowOf(late) && !!rowOf(child) && !!rowOf(f.a))
      await open(f.a)
      await waitFor(() => !!action('reorder'), 'Reorder for the top-level task')
      await close()
      await open(late)
      expect(action('reorder')).toBeNull()
      await close()
      await open(child)
      expect(action('reorder')).toBeNull()
    } finally { await r.unmount() }
  })

  it('refuses drops into Earlier and a project shared with the user as a viewer', async () => {
    const f = await todayFixture()
    const late = await createTask({ title: 'Late', project_id: f.work, due: { date: addDaysISO(f.due.date, -1) } })
    await db.memberships.put({ projectId: f.work, role: 'viewer', ownerId: 'owner', members: [] })
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    try {
      await waitFor(() => !!rowOf(f.b) && !!rowOf(late) && !!rowOf(f.y))
      expect(group(f.work)).toBeNull()
      expect(rowOf(f.y).hasAttribute('data-draggable')).toBe(false)
      expect(rowOf(f.b).hasAttribute('data-draggable')).toBe(true)
      expect(await drag(f.b, rowOf(f.y), 102)).toEqual({ line: null, note: null })
      expect(await drag(f.b, rowOf(late), 102)).toEqual({ line: null, note: null })
      expect((await db.tasks.get(f.b))?.project_id).toBe(f.home)
      expect((await db.userPrefs.get('me'))?.today_sort_by).toBe('title')
    } finally { await r.unmount() }
  })

  it('accepts an existing subtask in another group as a parent directly and through an indented gap', async () => {
    const f = await todayFixture()
    const child = await createTask({ title: 'Child', project_id: f.work, parent_id: f.y, due: f.due })
    await setListDisplay({ kind: 'today' }, { subtasks: true })
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    try {
      await waitFor(() => !!rowOf(child) && !!rowOf(f.a) && !!rowOf(f.b))
      expect(rowOf(child).getAttribute('data-drop-target')).toBe(`task:${child}`)
      expect(await drag(f.a, rowOf(child), 120)).toEqual({ line: null, note: 'Move to Work' })
      await waitFor(async () => (await db.tasks.get(f.a))?.parent_id === child)
      expect(await drag(f.b, rowOf(child), 136, 50)).toEqual({ line: 'after', note: 'Move to Work', depth: '2' })
      await waitFor(async () => (await db.tasks.get(f.b))?.parent_id === child)
      expect(await db.tasks.get(f.b)).toMatchObject({ project_id: f.work, due: f.due })
      expect((await db.tasks.get(f.b))!.position).toBeLessThan((await db.tasks.get(f.a))!.position)
      expect(await db.userPrefs.get('me')).toMatchObject({ today_sort_by: 'title' })
      const undoForB = async () => (await db.assistantUndo.toArray()).find((e) =>
        e.label === 'Moved to Work' && e.inverse.some((change) => change.entity === 'task' && change.entityId === f.b))
      await waitFor(async () => !!(await undoForB()), 'the Undo entry for the second drop')
      await undoBatch((await undoForB())!.id)
      expect((await db.tasks.get(f.a))?.parent_id).toBe(child)
      expect(await db.tasks.get(f.b)).toMatchObject({ project_id: f.home, parent_id: null, due: f.due })
    } finally { await r.unmount() }
  })
})

let n = 0
beforeEach(() => {
  mockFetch(noPublicLinks)
  useDatabase(`view-project-drops-${Date.now()}-${n++}`)
  resetDeviceId()
  localStorage.clear()
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

const rowOf = (id: string) => document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!
const targetOf = (group: string, id: string) => document.querySelector<HTMLElement>(`[data-drop-target="vrow:${group}:${id}"]`)

/** Press on a task's row, move to `y` (rows span 100–140 px) over another row, read the line, release. */
async function drag(from: string, over: HTMLElement, y: number, dx = 0) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ top: 100, height: 40, bottom: 140, left: 0, right: 600, width: 600, x: 0, y: 100, toJSON: () => ({}) }))
  document.elementFromPoint = () => over
  await act(async () => {
    rowOf(from).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 100, clientY: 20 }))
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 100 + dx, clientY: y }))
  })
  const line = document.querySelector<HTMLElement>('[data-drop-indicator]')
  const ring = document.querySelector('[data-drop-note]')
  const shown = { line: line?.dataset.dropIndicator ?? null, note: ring?.textContent ?? null, ...(line?.dataset.dropDepth !== undefined ? { depth: line.dataset.dropDepth } : {}) }
  await act(async () => { window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 100 + dx, clientY: y })) })
  return shown
}

async function twoProjects() {
  const home = await createProject({ name: 'Home' })
  const work = await createProject({ name: 'Work' })
  const paint = await createTask({ title: 'Buy paint', project_id: home, priority: 1 })
  const report = await createTask({ title: 'Report', project_id: work, priority: 1 })
  const deck = await createTask({ title: 'Deck', project_id: work, priority: 1 })
  return { home, work, paint, report, deck }
}

describe('a view grouped by Project', () => {
  it('a drop between two rows of another group moves the task there; Undo puts it back', async () => {
    const s = await twoProjects()
    const view = await createView({ name: 'This week', query: 'p1', group_by: 'project' })
    const r = await render(<SavedViewRoute id={view} />)
    await waitFor(() => !!targetOf(s.work, s.report) && !!rowOf(s.paint), 'both groups')
    const shown = await drag(s.paint, targetOf(s.work, s.report)!, 136)
    expect(shown).toEqual({ line: 'after', note: 'Move to Work' })
    await waitFor(async () => (await db.tasks.get(s.paint))?.project_id === s.work, 'moved to Work')
    const order = (await db.views.get(view))?.manual_order as string[]
    expect(order.indexOf(s.paint)).toBe(order.indexOf(s.report) + 1)
    await waitFor(async () => (await db.assistantUndo.toArray()).some((e) => e.label === 'Moved to Work'), 'the undo entry')
    const entry = (await db.assistantUndo.toArray()).find((e) => e.label === 'Moved to Work')!
    await undoBatch(entry.id)
    expect((await db.tasks.get(s.paint))?.project_id).toBe(s.home)
    await r.unmount()
  })

  it('with Nest subtasks a drop onto a task of another project nests it there', async () => {
    const s = await twoProjects()
    const view = await createView({ name: 'This week', query: 'p1', group_by: 'project' })
    await mutate('view', view, { subtasks: 'nested' })
    const r = await render(<SavedViewRoute id={view} />)
    await waitFor(() => !!targetOf(s.work, s.report) && !!rowOf(s.paint), 'both groups')
    const shown = await drag(s.paint, targetOf(s.work, s.report)!, 120)
    expect(shown.line).toBeNull()
    await waitFor(async () => (await db.tasks.get(s.paint))?.parent_id === s.report, 'nested')
    expect((await db.tasks.get(s.paint))?.project_id).toBe(s.work)
    await r.unmount()
  })

  it('indents the gap under an existing subtask in another project and honors the sibling position', async () => {
    const s = await twoProjects()
    await mutate('task', s.deck, { parent_id: s.report })
    const first = await createTask({ title: 'First slide', project_id: s.work, parent_id: s.deck, priority: 1 })
    const view = await createView({ name: 'This week', query: 'p1', group_by: 'project' })
    await mutate('view', view, { subtasks: 'nested' })
    const r = await render(<SavedViewRoute id={view} />)
    try {
      await waitFor(() => !!targetOf(s.work, first) && !!rowOf(s.paint), 'both groups and the nested rows')
      expect(await drag(s.paint, targetOf(s.work, s.deck)!, 136, 50)).toEqual({ line: 'after', note: 'Move to Work', depth: '2' })
      await waitFor(async () => (await db.tasks.get(s.paint))?.parent_id === s.deck, 'nested under the subtask')
      const task = (await db.tasks.get(s.paint))!
      expect(task.project_id).toBe(s.work)
      expect(task.position).toBeLessThan((await db.tasks.get(first))!.position)
      const entry = (await db.assistantUndo.toArray()).find((e) => e.label === 'Moved to Work')!
      await undoBatch(entry.id)
      expect(await db.tasks.get(s.paint)).toMatchObject({ project_id: s.home, parent_id: null })
    } finally { await r.unmount() }
  })

  it('a project shared with the person as a viewer takes no drop', async () => {
    const s = await twoProjects()
    await db.memberships.put({ projectId: s.work, role: 'viewer', ownerId: 'ana', members: [] })
    const view = await createView({ name: 'This week', query: 'p1', group_by: 'project' })
    const r = await render(<SavedViewRoute id={view} />)
    await waitFor(() => !!targetOf(s.work, s.report) && !!rowOf(s.paint), 'both groups')
    await db.outbox.clear()
    expect(await drag(s.paint, targetOf(s.work, s.report)!, 136)).toEqual({ line: null, note: null })
    expect((await db.tasks.get(s.paint))?.project_id).toBe(s.home)
    expect(await db.outbox.count()).toBe(0)
    await r.unmount()
  })
})

describe('a view grouped by Label', () => {
  it('keeps a drop within the row\'s group', async () => {
    const errand = await createLabel({ name: 'errand' })
    const call = await createLabel({ name: 'call' })
    const a = await createTask({ title: 'Pharmacy', labels: [errand], priority: 1 })
    const b = await createTask({ title: 'Plumber', labels: [call], priority: 1 })
    const view = await createView({ name: 'Out', query: 'p1', group_by: 'label' })
    const r = await render(<SavedViewRoute id={view} />)
    await waitFor(() => !!targetOf(call, b) && !!rowOf(a), 'both groups')
    expect(await drag(a, targetOf(call, b)!, 136)).toEqual({ line: null, note: null })
    expect((await db.tasks.get(a))?.labels).toEqual([errand])
    await r.unmount()
  })
})

describe('a label page grouped by Project', () => {
  it('a drop in another project\'s group moves the task there', async () => {
    const s = await twoProjects()
    const errand = await createLabel({ name: 'errand' })
    for (const id of [s.paint, s.report, s.deck]) await mutate('task', id, { labels: [errand] })
    const r = await render(<TaskListView route={{ view: 'label', id: errand }} />)
    await waitFor(() => !!document.querySelector(`[data-drop-target="task:${s.report}"]`) && !!rowOf(s.paint), 'both groups')
    const shown = await drag(s.paint, document.querySelector<HTMLElement>(`[data-drop-target="task:${s.report}"]`)!, 136)
    expect(shown).toEqual({ line: 'after', note: 'Move to Work' })
    await waitFor(async () => (await db.tasks.get(s.paint))?.project_id === s.work, 'moved to Work')
    const order = (await db.labels.get(errand))?.manual_order as string[]
    expect(order.indexOf(s.paint)).toBe(order.indexOf(s.report) + 1)
    await r.unmount()
  })
})
