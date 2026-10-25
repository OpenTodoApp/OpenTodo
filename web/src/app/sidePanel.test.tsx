// @vitest-environment happy-dom
// Task details in a side panel (OpenSpec change task-side-panel): with "Open tasks: In a
// side panel" every list keeps the task beside it from 1024 px. The panel follows the
// cursor while open, never closes by itself, stays closed once closed until a task is
// opened again, and can be resized; the page stays the default and narrow screens keep it.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logicalToday } from '../lib/dates'
import { db } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import { setCurrentUserId } from '../lib/sharing'
import { readTaskOpen, setTaskOpen } from '../lib/userPrefs'
import { click, flush, key, minWidthPx, mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { FilterView } from './FilterView'
import { PANEL_WIDTH_KEY, resetPanel, SIDE_PANEL_CLOSED_KEY } from './panel'
import { PanelHost } from './PanelHost'
import { TaskListView } from './TaskListView'
import type { ListRoute } from './task-list/useListModel'

const original = window.matchMedia
let width = 1280
function viewport(px: number) {
  width = px
  window.matchMedia = ((q: string) => ({
    matches: /pointer:\s*fine/.test(q) ? true : /pointer:\s*coarse/.test(q) ? false : minWidthPx(q) <= width,
    media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

beforeEach(async () => {
  mockFetch(noPublicLinks)
  await db.delete()
  await db.open()
  resetDeviceId()
  setCurrentUserId('me')
  localStorage.clear()
  resetPanel()
  history.replaceState(null, '', '/')
  document.documentElement.style.removeProperty('--task-panel-w')
  viewport(1280)
})
afterEach(async () => {
  // Reads a page left scheduled (the task page's trail) finish before the next case deletes the database.
  await new Promise((r) => setTimeout(r, 50))
  window.matchMedia = original
  resetPanel()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** Enter as a browser presses it: the keydown, then, on a focused button nobody stopped, its click (detail 0). */
async function enter() {
  const el = (document.activeElement ?? document.body) as HTMLElement
  const down = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  await act(async () => { el.dispatchEvent(down) })
  if (!down.defaultPrevented && el.tagName === 'BUTTON') await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 })) })
}

const emptyPane = () => document.querySelector<HTMLElement>('[data-split-empty]')
const docked = () => document.querySelector<HTMLElement>('[data-detail-variant="panel"]')?.getAttribute('data-detail-for') ?? null
const row = (title: string) => [...document.querySelectorAll<HTMLElement>('li[data-task-id]')].find((li) => li.querySelector('[data-row-title]')?.textContent === title)!
const here = () => document.activeElement ?? document.body

async function list(route: ListRoute, panel = true) {
  if (panel) await setTaskOpen('panel')
  const project = route.view === 'project' ? route.id : null
  const due = route.view === 'today' ? { due: { date: logicalToday() } } : {}
  const a = await createTask({ title: 'Order the tiles', project_id: project, ...due })
  const b = await createTask({ title: 'Call the plumber', project_id: project, ...due })
  const r = await render(<><TaskListView route={route} /><PanelHost user={{ id: 'me' }} /></>)
  await waitFor(() => document.querySelectorAll('li[data-task-id]').length === 2, 'two rows')
  await flush(20)
  return { a, b, r }
}

describe('the preference', () => {
  it('reads empty and unknown values as the page', () => {
    expect(readTaskOpen(null)).toBe('page')
    expect(readTaskOpen({ task_open: '' })).toBe('page')
    expect(readTaskOpen({ task_open: 'sideways' })).toBe('page')
    expect(readTaskOpen({ task_open: 'panel' })).toBe('panel')
  })

  it('keeps the page by default: Enter opens the task page and nothing docks', async () => {
    const { r } = await list({ view: 'today' }, false)
    expect(emptyPane()).toBeNull()
    await key(document.body, 'j')
    await enter()
    await waitFor(() => location.pathname.startsWith('/task/'), 'the task page')
    expect(docked()).toBeNull()
    await r.unmount()
  })
})

describe('the side panel', () => {
  it('shows "No task selected", then follows the cursor', async () => {
    const { a, b, r } = await list({ view: 'today' })
    // The choice is an ordinary op on the user's prefs row, so it syncs (D1).
    expect((await db.userPrefs.get('me'))?.task_open).toBe('panel')
    expect((await db.outbox.toArray()).some((o) => o.entity === 'user_prefs' && o.field === 'task_open' && o.value === 'panel')).toBe(true)
    await waitFor(() => !!emptyPane(), 'the empty pane')
    expect(emptyPane()!.textContent).toContain('Select a task to see its details here.')
    await key(document.body, 'j')
    await waitFor(() => docked() !== null, 'a docked task')
    const first = docked()
    expect([a, b]).toContain(first)
    await key(here(), 'j')
    await waitFor(() => docked() !== null && docked() !== first, 'the next task')
    expect(location.search).toContain(`task=${docked()}`)
    await r.unmount()
  })

  it('a click on a title shows the task instead of editing it in place', async () => {
    const { b, r } = await list({ view: 'today' })
    await click(row('Call the plumber').querySelector('[data-row-open]')!)
    await waitFor(() => docked() === b, 'the clicked task docked')
    expect(document.querySelector('[data-inline-editor]')).toBeNull()
    expect(location.pathname).toBe('/')
    await r.unmount()
  })

  it('never closes by itself: Escape on the list keeps the task', async () => {
    const { r } = await list({ view: 'today' })
    await key(document.body, 'j')
    await waitFor(() => docked() !== null, 'a docked task')
    const shown = docked()
    await key(here(), 'Escape')
    await flush(5)
    expect(document.querySelector('li[aria-current="true"]')).toBeNull()
    expect(docked()).toBe(shown)
    await r.unmount()
  })

  it('stays closed once closed, until Enter opens a task again; a second Enter opens its page', async () => {
    const { r } = await list({ view: 'today' })
    await key(document.body, 'j')
    await waitFor(() => docked() !== null, 'a docked task')
    await click(document.querySelector('[data-detail-variant="panel"] [data-panel-header] [data-overlay-close]')!)
    await waitFor(() => docked() === null && !emptyPane(), 'the panel closed')
    expect(localStorage.getItem(SIDE_PANEL_CLOSED_KEY)).toBe('1')
    await key(here(), 'j')
    await key(here(), 'k')
    await flush(5)
    expect(docked()).toBeNull()
    expect(emptyPane()).toBeNull()
    const cursor = document.querySelector('li[aria-current="true"]')!.getAttribute('data-task-id')
    await enter()
    await waitFor(() => docked() === cursor, 'reopened with the cursor task')
    expect(localStorage.getItem(SIDE_PANEL_CLOSED_KEY)).toBeNull()
    await enter()
    await waitFor(() => location.pathname === `/task/${cursor}`, 'the task page')
    await r.unmount()
  })

  it('remembers being closed across a remount', async () => {
    localStorage.setItem(SIDE_PANEL_CLOSED_KEY, '1')
    const { r } = await list({ view: 'today' })
    await key(document.body, 'j')
    await flush(5)
    expect(docked()).toBeNull()
    expect(emptyPane()).toBeNull()
    await r.unmount()
  })

  it('Escape inside the panel closes it', async () => {
    const { r } = await list({ view: 'today' })
    await key(document.body, 'j')
    await waitFor(() => docked() !== null, 'a docked task')
    const close = document.querySelector<HTMLElement>('[data-detail-variant="panel"] [data-overlay-close]')!
    close.focus()
    await key(close, 'Escape')
    await waitFor(() => docked() === null, 'closed')
    expect(localStorage.getItem(SIDE_PANEL_CLOSED_KEY)).toBe('1')
    await r.unmount()
  })

  it('the empty pane has its own Close', async () => {
    const { r } = await list({ view: 'today' })
    await waitFor(() => !!emptyPane(), 'the empty pane')
    await click(emptyPane()!.querySelector('[data-side-panel-close]')!)
    await waitFor(() => !emptyPane(), 'closed')
    await r.unmount()
  })

  it('applies to projects too', async () => {
    const project = 'p1'
    await db.projects.put({ id: project, name: 'House', color: '#808080', parent_id: null, order: 0, created_at: 1, deleted_at: null } as never)
    const { a, r } = await list({ view: 'project', id: project })
    await click(row('Order the tiles').querySelector('[data-row-open]')!)
    await waitFor(() => docked() === a, 'docked in the project')
    await r.unmount()
  })

  it('the Inbox keeps the side panel with its own empty pane and Escape keeps the task', async () => {
    const { r } = await list({ view: 'inbox' })
    await waitFor(() => !!emptyPane(), 'the empty pane')
    expect(emptyPane()!.textContent).toContain('process all 2')
    expect(emptyPane()!.querySelector('[data-side-panel-close]')).not.toBeNull()
    await key(document.body, 'j')
    await waitFor(() => docked() !== null, 'a docked task')
    const shown = docked()
    await key(here(), 'Escape')
    await flush(5)
    expect(docked()).toBe(shown)
    await r.unmount()
  })

  it('a narrow window keeps the page', async () => {
    viewport(900)
    const { r } = await list({ view: 'today' })
    expect(emptyPane()).toBeNull()
    await key(document.body, 'j')
    await enter()
    await waitFor(() => location.pathname.startsWith('/task/'), 'the task page')
    expect(docked()).toBeNull()
    await r.unmount()
  })

  it('the Filter view docks its results', async () => {
    await setTaskOpen('panel')
    const a = await createTask({ title: 'Plan sprint', priority: 1 })
    const r = await render(<><FilterView initialQuery="p1" /><PanelHost user={{ id: 'me' }} /></>)
    await waitFor(() => !!row('Plan sprint'), 'the result')
    await click(row('Plan sprint').querySelector('[data-row-open]')!)
    await waitFor(() => docked() === a, 'docked beside the results')
    await r.unmount()
  })
})

describe('the resize handle', () => {
  it('widens with ← and resets with Home, kept on this device', async () => {
    const { r } = await list({ view: 'today' })
    await waitFor(() => !!emptyPane(), 'the empty pane')
    const handle = emptyPane()!.querySelector<HTMLElement>('[data-panel-resize]')!
    expect(handle.getAttribute('role')).toBe('separator')
    expect(handle.getAttribute('aria-label')).toBe('Resize the task panel')
    handle.focus()
    await key(handle, 'ArrowLeft', { shiftKey: true })
    const stored = Number(localStorage.getItem(PANEL_WIDTH_KEY))
    expect(stored).toBeGreaterThanOrEqual(22 * 16)
    expect(document.documentElement.style.getPropertyValue('--task-panel-w')).toBe(`${stored}px`)
    await key(handle, 'Home')
    expect(localStorage.getItem(PANEL_WIDTH_KEY)).toBeNull()
    expect(document.documentElement.style.getPropertyValue('--task-panel-w')).toBe('')
    await r.unmount()
  })

  it('applies the stored width when a split opens', async () => {
    localStorage.setItem(PANEL_WIDTH_KEY, '640')
    const { r } = await list({ view: 'today' })
    await waitFor(() => !!emptyPane(), 'the empty pane')
    expect(document.documentElement.style.getPropertyValue('--task-panel-w')).toBe('640px')
    await r.unmount()
  })
})
