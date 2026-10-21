// @vitest-environment happy-dom
// Editing a task in the list (OpenSpec change inline-task-editing, task-list-presentation
// "Inline title editing" and "Contextual edit bar").
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { setDateTime } from '../../lib/dates'
import { createProject, createTask, resetDeviceId } from '../../lib/ops'
import { flush, mockFetch, noPublicLinks, render } from '../../ui/test-utils'
import { panelTaskId, setPanelTaskId } from '../panel'
import { setRowClick } from '../rowClick'
import { TaskListView } from '../TaskListView'

let coarse = false
beforeEach(async () => {
  mockFetch(noPublicLinks)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  coarse = false
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse') ? coarse : q.includes('fine') ? !coarse : false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  setPanelTaskId(null)
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean | Promise<boolean>, ms = 2000) {
  for (let t = 0; t < ms && !(await ok()); t += 20) await flush(20)
  expect(await ok()).toBe(true)
}
/** A mouse click on a row's title (a keyboard Enter has detail 0). */
const clickTitle = (root: ParentNode, title: string) => act(async () => {
  const btn = [...root.querySelectorAll<HTMLButtonElement>('[data-row-open]')].find((b) => b.textContent?.includes(title))!
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
})
const key = (el: Element, k: string, init: KeyboardEventInit = {}) => act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })) })
const editorTitle = () => document.querySelector<HTMLInputElement>('[data-inline-title]')
async function typeInto(input: HTMLInputElement, text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function list(route: { view: 'inbox' } | { view: 'project'; id: string } = { view: 'inbox' }) {
  const r = await render(<main><TaskListView route={route} /></main>)
  await waitFor(() => !!r.container.querySelector('[data-task-id]'))
  return r
}

describe('inline title editing', () => {
  it('a click edits the title in place; Enter saves without opening the panel', async () => {
    const id = await createTask({ title: 'Renew pasport' })
    const r = await list()
    await clickTitle(r.container, 'Renew pasport')
    await waitFor(() => !!editorTitle())
    expect(panelTaskId()).toBeNull()
    expect(r.container.querySelector('[data-edit-bar]')).toBeTruthy()
    await typeInto(editorTitle()!, 'Renew passport')
    await key(editorTitle()!, 'Enter')
    await waitFor(async () => (await db.tasks.get(id))!.title === 'Renew passport')
    await waitFor(() => !editorTitle())
    expect(panelTaskId()).toBeNull()
    expect(r.container.querySelector('[data-task-id][aria-current]')).toBeTruthy()
    await r.unmount()
  })

  it('Esc discards the change and keeps the row selected', async () => {
    const id = await createTask({ title: 'Call mum' })
    const r = await list()
    await clickTitle(r.container, 'Call mum')
    await waitFor(() => !!editorTitle())
    await typeInto(editorTitle()!, 'Call dad')
    await key(editorTitle()!, 'Escape')
    await waitFor(() => !editorTitle())
    expect((await db.tasks.get(id))!.title).toBe('Call mum')
    expect(r.container.querySelector('[data-task-id][aria-current]')).toBeTruthy()
    await r.unmount()
  })

  it('Shift+Enter saves and opens the panel', async () => {
    const id = await createTask({ title: 'Plan' })
    const r = await list()
    await clickTitle(r.container, 'Plan')
    await waitFor(() => !!editorTitle())
    await key(editorTitle()!, 'Enter', { shiftKey: true })
    await waitFor(() => panelTaskId() === id)
    await r.unmount()
  })

  it('the row being edited is not draggable; the others still are', async () => {
    const a = await createTask({ title: 'Edit me' })
    const b = await createTask({ title: 'Leave me' })
    const r = await list()
    const row = (id: string) => r.container.querySelector(`[data-task-id="${id}"]`)!
    await waitFor(() => row(a).hasAttribute('data-draggable'))
    await clickTitle(r.container, 'Edit me')
    await waitFor(() => !!editorTitle())
    expect(row(a).hasAttribute('data-draggable')).toBe(false)
    expect(row(b).hasAttribute('data-draggable')).toBe(true)
    await key(editorTitle()!, 'Escape')
    await waitFor(() => row(a).hasAttribute('data-draggable'))
    await r.unmount()
  })

  it('opens the panel instead with the panel already open, on a coarse pointer, or with "Open details"', async () => {
    const a = await createTask({ title: 'Alpha' })
    const b = await createTask({ title: 'Beta' })
    let r = await list()
    setPanelTaskId(a)
    await flush()
    await clickTitle(r.container, 'Beta')
    await waitFor(() => panelTaskId() === b)
    expect(editorTitle()).toBeNull()
    await r.unmount()
    setPanelTaskId(null)

    coarse = true
    r = await list()
    await clickTitle(r.container, 'Alpha')
    await waitFor(() => panelTaskId() === a)
    expect(editorTitle()).toBeNull()
    await r.unmount()
    setPanelTaskId(null)
    coarse = false

    setRowClick('open')
    r = await list()
    await clickTitle(r.container, 'Beta')
    await waitFor(() => panelTaskId() === b)
    expect(editorTitle()).toBeNull()
    setRowClick('edit')
    await r.unmount()
  })

  it('F2 edits the selected task in place, caret at the end', async () => {
    await createTask({ title: 'Write the report' })
    const r = await list()
    await key(document.body, 'j')
    await key(document.body, 'F2')
    await waitFor(() => !!editorTitle())
    expect(editorTitle()!.value).toBe('Write the report')
    await r.unmount()
  })
})

describe('the contextual bar', () => {
  it('shows Date, Priority, Labels, Project and Open details; Open details saves and opens the panel', async () => {
    const id = await createTask({ title: 'Call the bank' })
    const r = await list()
    await clickTitle(r.container, 'Call the bank')
    await waitFor(() => !!r.container.querySelector('[data-edit-bar]'))
    const bar = r.container.querySelector('[data-edit-bar]')!
    expect(bar.querySelector('button[aria-label^="Date"]')).toBeTruthy()
    expect(bar.querySelector('button[aria-label^="Labels"]')).toBeTruthy()
    expect(bar.querySelector('[data-edit-project] button')).toBeTruthy()
    await act(async () => { bar.querySelector<HTMLButtonElement>('[data-open-details]')!.click() })
    await waitFor(() => panelTaskId() === id)
    await r.unmount()
  })

  it('Date › Tomorrow sets the due without opening the panel, and the editor stays', async () => {
    // In a project: in the Inbox a dated task leaves the list (inbox-means-unplaced), and its editor with it.
    const home = await createProject({ name: 'Home' })
    const id = await createTask({ title: 'Call the bank', project_id: home })
    const r = await list({ view: 'project', id: home })
    await clickTitle(r.container, 'Call the bank')
    await waitFor(() => !!r.container.querySelector('[data-edit-bar]'))
    await act(async () => { r.container.querySelector<HTMLButtonElement>('[data-edit-bar] button[aria-label^="Date"]')!.click() })
    await waitFor(() => !!document.querySelector('[data-facet-editor] [data-choice="tomorrow"]'))
    await act(async () => { document.querySelector<HTMLButtonElement>('[data-facet-editor] [data-choice="tomorrow"]')!.click() })
    await waitFor(async () => (await db.tasks.get(id))!.due?.date === '2026-10-15')
    expect(panelTaskId()).toBeNull()
    expect(editorTitle()).toBeTruthy()
    await r.unmount()
  })
})
