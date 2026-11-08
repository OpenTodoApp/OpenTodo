// @vitest-environment happy-dom
// "Add task below" and "Add subtask" in a task's row menu (OpenSpec change add-below,
// GitHub issue 1036): an inline line where the new tasks appear, each entry right after
// the previous one, Escape closing it; nothing for a completed task or outside a tree list.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { compareByPosition } from '../lib/ordering'
import type { Task, User } from '../lib/types'
import { render, waitFor } from '../ui/test-utils'
import { addItems, type ListReorder } from './bulk/BulkActions'
import { resetPanel } from './panel'
import { navigate } from './router'
import { Shell } from './Shell'
import { belowLine } from './task-list/belowLine'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', createdAt: 0 } as User

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 21, 10, 0))
  await db.delete()
  await db.open()
  await db.meta.put({ key: 'userId', value: 'u1' })
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  history.replaceState(null, '', '/')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
})

const row = (id: string) => document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)
const menuItem = (id: string) => document.querySelector<HTMLElement>(`[data-action="${id}"]`)
const line = () => document.querySelector<HTMLInputElement>('[data-add-line] input')
const titles = async (parent: string | null) => (await db.tasks.toArray()).filter((t) => (t.parent_id ?? null) === parent && !t.deleted_at).sort(compareByPosition).map((t) => t.title)

/** The issue's outline: A with B and B's C, then E. */
async function outline() {
  const project = await createProject({ name: 'Doghouse' })
  const a = await createTask({ title: 'A', project_id: project })
  const b = await createTask({ title: 'B', project_id: project, parent_id: a })
  const c = await createTask({ title: 'C', project_id: project, parent_id: b })
  const e = await createTask({ title: 'E', project_id: project })
  return { project, a, b, c, e }
}

async function openMenuItem(id: string, action: string) {
  await waitFor(() => {
    const el = row(id)
    if (el) act(() => { el.dispatchEvent(new MouseEvent('contextmenu', { clientX: 20, clientY: 20, bubbles: true, cancelable: true })) })
    return !!menuItem(action)
  }, `the ${action} item`)
  await act(async () => { menuItem(action)!.click() })
}

async function typeLine(title: string) {
  await waitFor(() => !!line() && document.activeElement === line(), 'the focused add line')
  const input = line()!
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(input, title)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => { input.form!.requestSubmit() })
}

describe('add below (issue 1036)', () => {
  it('Add task below on A: the line follows A’s subtasks, and each task lands after the last one', async () => {
    const t = await outline()
    navigate({ view: 'project', id: t.project })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!row(t.c), 'the outline')
    await openMenuItem(t.a, 'add-below')
    // Drawn after C, the last row of A's subtree, at A's level.
    await waitFor(() => !!line(), 'the line')
    expect(line()!.closest('li')!.previousElementSibling?.getAttribute('data-task-id')).toBe(t.c)
    await typeLine('Prepare')
    await waitFor(async () => (await titles(null)).join() === 'A,Prepare,E', 'Prepare after A')
    await typeLine('Buy paint')
    await waitFor(async () => (await titles(null)).join() === 'A,Prepare,Buy paint,E', 'Buy paint after Prepare')
    // The line moved down with them and keeps the focus.
    await waitFor(() => line()?.closest('li')?.previousElementSibling?.textContent?.includes('Buy paint') ?? false, 'the line under Buy paint')
    act(() => { line()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    await waitFor(() => !line(), 'the line closed')
    await r.unmount()
  })

  it('Add task below on a subtask adds siblings in its parent', async () => {
    const t = await outline()
    navigate({ view: 'project', id: t.project })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!row(t.c), 'the outline')
    await openMenuItem(t.b, 'add-below')
    await typeLine('Buy supplies')
    await waitFor(async () => (await titles(t.a)).join() === 'B,Buy supplies', 'a second subtask of A')
    await r.unmount()
  })

  it('Add subtask opens the subtask line under the row', async () => {
    const t = await outline()
    navigate({ view: 'project', id: t.project })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!row(t.c), 'the outline')
    await openMenuItem(t.c, 'add-subtask')
    await typeLine('Pick a colour')
    await waitFor(async () => (await titles(t.c)).join() === 'Pick a colour', 'a subtask of C')
    await r.unmount()
  })
})

describe('the items', () => {
  const edges = { first: false, last: false }
  const add = { below: vi.fn(), under: vi.fn() }
  it('are offered for a task that can move in a tree list only', () => {
    const r: ListReorder = { move: vi.fn(), edges: async () => edges, add }
    expect(addItems('a', r, edges).map((i) => i.id)).toEqual(['add-below', 'add-subtask'])
    // A completed task or a viewer's (no edges), a list without a tree (no add), no task.
    expect(addItems('a', r, null)).toEqual([])
    expect(addItems('a', { ...r, add: undefined }, edges)).toEqual([])
    expect(addItems(undefined, r, edges)).toEqual([])
  })

  it('the line sits after the last added task and its subtasks', () => {
    const rows = ['a', 'b', 'c', 'e'].map((id, i) => ({ task: { id } as Task, depth: [0, 1, 2, 0][i], parent: null, hasChildren: false, collapsed: false, breadcrumb: null }))
    expect(belowLine(rows, { anchor: 'a', last: 'a' })?.at).toBe('c')
    expect(belowLine(rows, { anchor: 'b', last: 'b' })?.at).toBe('c')
    expect(belowLine(rows, { anchor: 'a', last: 'e' })?.at).toBe('e')
    // The new task is not listed yet.
    expect(belowLine(rows, { anchor: 'a', last: 'x' })?.at).toBeNull()
    expect(belowLine(rows, null)).toBeNull()
  })
})
