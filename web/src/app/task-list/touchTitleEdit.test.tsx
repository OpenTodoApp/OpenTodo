// @vitest-environment happy-dom
// touch-title-editing (#1554): the short left swipe at any width on touch, Return reads
// Done and saves, a tap outside saves and does nothing else, Cancel discards, subtasks
// like their parents.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createProject, createTask, resetDeviceId } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import { minWidthPx, mockFetch, noPublicLinks, render, visibleText, waitFor } from '../../ui/test-utils'
import { PanelHost } from '../PanelHost'
import { resetPanel } from '../panel'
import { TaskListView } from '../TaskListView'
import { openedTask, resetTaskPage } from '../taskPage.testkit'

let width: number
beforeEach(async () => {
  mockFetch(noPublicLinks)
  width = 390
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: /pointer:\s*fine/.test(q) ? false : /pointer:\s*coarse/.test(q) ? true : minWidthPx(q) <= width,
    media: q, onchange: null, addEventListener() {}, removeEventListener() {},
  }))
  Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => width })
  await db.delete()
  await db.open()
  resetDeviceId()
  setCurrentUserId('me')
  localStorage.clear()
  resetPanel()
  resetTaskPage()
})
afterEach(() => {
  resetPanel()
  vi.unstubAllGlobals()
})

const row = (id: string) => document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!
const title = (id: string) => row(id).querySelector<HTMLElement>('[data-row-title]')!
const editor = () => document.querySelector<HTMLInputElement>('[data-inline-title]')
const pointer = (type: string, x: number, y = 100) => new PointerEvent(type, { bubbles: true, pointerType: 'touch', pointerId: 7, button: 0, clientX: x, clientY: y })

/** A finger drags the row left by `dx` px and lifts. */
async function swipeLeft(el: HTMLElement, dx: number) {
  await act(async () => {
    el.dispatchEvent(pointer('pointerdown', 300))
    for (let x = 300; x >= 300 - dx; x -= 8) window.dispatchEvent(pointer('pointermove', x))
    window.dispatchEvent(pointer('pointermove', 300 - dx))
    window.dispatchEvent(pointer('pointerup', 300 - dx))
  })
}

/** A finger taps `el`: press, release and the click that follows. */
async function tap(el: HTMLElement, moveBy = 0) {
  await act(async () => {
    el.dispatchEvent(pointer('pointerdown', 200))
    if (moveBy) window.dispatchEvent(pointer('pointermove', 200, 100 + moveBy))
    el.dispatchEvent(pointer('pointerup', 200, 100 + moveBy))
    if (!moveBy) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
  })
}

async function type(text: string) {
  await act(async () => {
    const field = editor()!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, text)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function list() {
  const project = await createProject({ name: 'House' })
  const a = await createTask({ title: 'Order the tiles', project_id: project })
  const b = await createTask({ title: 'Call the plumber', project_id: project })
  const sub = await createTask({ title: 'Measure the floor', project_id: project, parent_id: a })
  const r = await render(<main><TaskListView route={{ view: 'project', id: project }} /><PanelHost user={{ id: 'me' }} /></main>)
  await waitFor(() => !!row(a) && !!row(b) && !!row(sub), 'task rows')
  return { a, b, sub, r }
}

async function editBySwipe(id: string) {
  await swipeLeft(row(id), 70)
  await waitFor(() => !!editor() && document.activeElement === editor(), 'focused touch title editor')
  expect(row(id).contains(editor())).toBe(true)
}

describe('touch title editing', () => {
  it.each([390, 1024])('a short left swipe edits the title at %i px', async (w) => {
    width = w
    const { a, r } = await list()
    await editBySwipe(a)
    expect(editor()!.getAttribute('enterkeyhint')).toBe('done')
    expect([...row(a).querySelectorAll('button')].map(visibleText)).toEqual(expect.arrayContaining(['Save', 'Cancel']))
    expect(openedTask()).toBeNull()
    await r.unmount()
  })

  it('Return saves and ends the edit', async () => {
    const { a, r } = await list()
    await editBySwipe(a)
    await type('Order more tiles')
    await act(async () => { editor()!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' })) })
    await waitFor(() => !editor(), 'editor closed')
    await waitFor(async () => (await db.tasks.get(a))?.title === 'Order more tiles', 'saved title')
    await r.unmount()
  })

  it('a tap on another row saves and does not open it', async () => {
    const { a, b, r } = await list()
    await editBySwipe(a)
    await type('Order more tiles')
    await tap(title(b))
    await waitFor(() => !editor(), 'editor closed')
    await waitFor(async () => (await db.tasks.get(a))?.title === 'Order more tiles', 'saved title')
    expect(openedTask()).toBeNull()
    await r.unmount()
  })

  it('a scroll that starts outside leaves the editor open', async () => {
    const { a, b, r } = await list()
    await editBySwipe(a)
    await tap(title(b), 40)
    expect(editor()).not.toBeNull()
    expect(openedTask()).toBeNull()
    await r.unmount()
  })

  it('Cancel discards the change', async () => {
    const { a, r } = await list()
    await editBySwipe(a)
    await type('Order more tiles')
    const cancel = [...row(a).querySelectorAll('button')].find((button) => visibleText(button) === 'Cancel')!
    await act(async () => cancel.click())
    await waitFor(() => !editor(), 'editor closed')
    expect((await db.tasks.get(a))?.title).toBe('Order the tiles')
    await r.unmount()
  })

  it('a subtask edits like its parent', async () => {
    const { a, sub, r } = await list()
    await editBySwipe(sub)
    await type('Measure the hall')
    await tap(title(a))
    await waitFor(async () => (await db.tasks.get(sub))?.title === 'Measure the hall', 'saved subtask title')
    expect((await db.tasks.get(a))?.title).toBe('Order the tiles')
    expect(openedTask()).toBeNull()
    await r.unmount()
  })
})
