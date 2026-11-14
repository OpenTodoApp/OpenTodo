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
import { createProject, createTask, mutate, resetDeviceId } from '../lib/ops'
import { createView } from '../lib/views'
import { undoBatch } from '../lib/undo'
import { mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { SavedViewRoute } from './SavedViewView'
import { TaskListView } from './TaskListView'

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
async function drag(from: string, over: HTMLElement, y: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ top: 100, height: 40, bottom: 140, left: 0, right: 600, width: 600, x: 0, y: 100, toJSON: () => ({}) }))
  document.elementFromPoint = () => over
  await act(async () => {
    rowOf(from).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 100, clientY: 20 }))
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: y }))
  })
  const line = document.querySelector<HTMLElement>('[data-drop-indicator]')
  const ring = document.querySelector('[data-drop-note]')
  const shown = { line: line?.dataset.dropIndicator ?? null, note: ring?.textContent ?? null }
  await act(async () => { window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: y })) })
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
