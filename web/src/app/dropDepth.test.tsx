// @vitest-environment happy-dom
// The depth of a drop between two rows of a tree list (OpenSpec change drop-depth,
// GitHub issue 1037): straight down keeps the dragged task's level, a move to the right
// nests it one level per indent, and the drop line starts at that level.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import type { Task, User } from '../lib/types'
import { render, waitFor } from '../ui/test-utils'
import { resetPanel } from './panel'
import { navigate } from './router'
import { Shell } from './Shell'

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
  vi.restoreAllMocks()
  resetPanel()
})

const row = (id: string) => document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!
const task = async (id: string) => (await db.tasks.get(id)) as Task

/** The issue's tree: D, then A > B > C, then E, in one project. */
async function tree() {
  const project = await createProject({ name: 'Doghouse' })
  const d = await createTask({ title: 'D', project_id: project })
  const a = await createTask({ title: 'A', project_id: project })
  const b = await createTask({ title: 'B', project_id: project, parent_id: a })
  const c = await createTask({ title: 'C', project_id: project, parent_id: b })
  const e = await createTask({ title: 'E', project_id: project })
  return { project, d, a, b, c, e }
}

/** Press on `el`, move into the bottom quarter of `over` with `dx` sideways, and release. */
async function dragBelow(el: HTMLElement, over: HTMLElement, dx: number) {
  // Every row spans 100–140 px, so 136 px is its bottom quarter: after it.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ top: 100, height: 40, bottom: 140, left: 0, right: 600, width: 600, x: 0, y: 100, toJSON: () => ({}) }))
  document.elementFromPoint = () => over
  await act(async () => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 100, clientY: 20 }))
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 100 + dx, clientY: 136 }))
  })
  await waitFor(() => !!document.querySelector('[data-drop-indicator]'), 'the drop line')
  const line = document.querySelector<HTMLElement>('[data-drop-indicator]')
  const shown = { zone: line?.dataset.dropIndicator, depth: line?.dataset.dropDepth ?? '0' }
  await act(async () => {
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 100 + dx, clientY: 136 }))
  })
  return shown
}

describe('drop depth (issue 1037)', () => {
  it('straight down below the last subtask keeps a top-level task at the top level, between A and E', async () => {
    const t = await tree()
    navigate({ view: 'project', id: t.project })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!row(t.c) && !!row(t.d))
    expect(await dragBelow(row(t.d), row(t.c), 0)).toEqual({ zone: 'after', depth: '0' })
    await waitFor(async () => (await task(t.d)).position > (await task(t.a)).position)
    const [d, a, e] = [await task(t.d), await task(t.a), await task(t.e)]
    expect(d.parent_id).toBeNull()
    expect(d.position).toBeLessThan(e.position)
    expect(a.position).toBeLessThan(d.position)
    await r.unmount()
  })

  it('two indents to the right make it a sibling of C, and the line starts there', async () => {
    const t = await tree()
    navigate({ view: 'project', id: t.project })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!row(t.c) && !!row(t.d))
    expect(await dragBelow(row(t.d), row(t.c), 50)).toEqual({ zone: 'after', depth: '2' })
    await waitFor(async () => (await task(t.d)).parent_id === t.b)
    expect((await task(t.d)).position).toBeGreaterThan((await task(t.c)).position)
    await r.unmount()
  })

  it('one more indent nests it under C', async () => {
    const t = await tree()
    navigate({ view: 'project', id: t.project })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!row(t.c) && !!row(t.d))
    expect(await dragBelow(row(t.d), row(t.c), 80)).toEqual({ zone: 'after', depth: '3' })
    await waitFor(async () => (await task(t.d)).parent_id === t.c)
    await r.unmount()
  })
})
