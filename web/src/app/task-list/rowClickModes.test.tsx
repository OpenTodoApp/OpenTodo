// @vitest-environment happy-dom
// What a click and a double-click on a task row do (OpenSpec change row-click-modes):
// "Click a task to" offers Edit in place, Open details and Expand the row (D1); a
// double-click opens the task's page in every mode, except in a title already being
// edited (D2); with the side panel the details follow the selection in every list,
// the Inbox included, and focus stays on the list (D3).
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createLabel } from '../../lib/labels'
import { createProject, createTask, resetDeviceId } from '../../lib/ops'
import { saveViewMode } from '../../lib/sections'
import { setCurrentUserId } from '../../lib/sharing'
import { setTaskOpen } from '../../lib/userPrefs'
import { minWidthPx, mockFetch, noPublicLinks, render, waitFor } from '../../ui/test-utils'
import { KeyboardView } from '../PreferencesPanels'
import { PanelHost } from '../PanelHost'
import { closeTaskPanel, resetPanel } from '../panel'
import { ROW_CLICK_KEY, rowClick, setRowClick, type RowClick } from '../rowClick'
import { openedTask, resetTaskPage } from '../taskPage.testkit'
import { TaskListView } from '../TaskListView'
import type { ListRoute } from './useListModel'

let width = 1280
beforeEach(async () => {
  mockFetch(noPublicLinks)
  width = 1280
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: /pointer:\s*fine/.test(q) ? true : /pointer:\s*coarse/.test(q) ? false : minWidthPx(q) <= width,
    media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }))
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
  await db.delete()
  await db.open()
  resetDeviceId()
  setCurrentUserId('me')
  localStorage.clear()
  resetPanel()
  resetTaskPage()
})
afterEach(() => {
  setRowClick('edit')
  resetPanel()
  vi.unstubAllGlobals()
})

const rowOf = (title: string) => [...document.querySelectorAll<HTMLElement>('li[data-task-id]')].find((li) => li.querySelector('[data-row-title]')?.textContent === title)!
const titleOf = (title: string) => rowOf(title).querySelector<HTMLButtonElement>('[data-row-open]')!
const editorTitle = () => document.querySelector<HTMLInputElement>('[data-inline-title]')
const docked = () => document.querySelector('[data-detail-variant="panel"]')?.getAttribute('data-detail-for') ?? null
const detailsOf = (title: string) => rowOf(title)?.querySelector('[role="group"]') ?? null

/** One mouse event as a browser sends it; `at` pins its timeStamp (the double-click window). */
function fire(el: Element, type: 'click' | 'dblclick', detail: number, at?: number) {
  return act(async () => {
    const ev = new MouseEvent(type, { bubbles: true, cancelable: true, detail })
    if (at !== undefined) Object.defineProperty(ev, 'timeStamp', { value: at })
    el.dispatchEvent(ev)
  })
}
/** A double-click: two clicks (detail 1 and 2), then the dblclick, on the element under the pointer at each step. */
async function doubleClick(first: () => Element, second = first, at = 1_000) {
  await fire(first(), 'click', 1, at)
  await fire(second(), 'click', 2, at + 120)
  await fire(second(), 'dblclick', 2, at + 120)
}
/** Enter on the focused row as a browser presses it: the keydown, then the button's click with detail 0. */
async function enter() {
  const el = document.activeElement as HTMLElement
  const down = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  await act(async () => { el.dispatchEvent(down) })
  if (!down.defaultPrevented && el.tagName === 'BUTTON') await fire(el, 'click', 0)
}
const press = (k: string) => act(async () => { (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })) })

/** A project's list by default: from 1024 px the Inbox keeps its own split, where a click docks the task. */
async function list(route?: ListRoute, titles = ['Order the tiles', 'Call the plumber'], extra: Record<string, unknown> = {}) {
  if (!route) {
    route = { view: 'project', id: await createProject({ name: 'House' }) }
    extra = { project_id: route.id, ...extra }
  }
  const ids: string[] = []
  for (const title of titles) ids.push(await createTask({ title, ...extra }))
  const r = await render(<main><TaskListView route={route} /><PanelHost user={{ id: 'me' }} /></main>)
  await waitFor(() => document.querySelectorAll('li[data-task-id]').length === titles.length, 'the rows')
  return { ids, r }
}

describe('"Click a task to"', () => {
  it('offers three choices on this device; Expand the row is kept, the default is not stored', async () => {
    let chosen: RowClick = 'edit'
    const r = await render(<KeyboardView vim={false} onVim={() => {}} click="edit" onClick={(v) => { chosen = v }} />)
    const select = document.querySelector<HTMLSelectElement>('[data-row-click]')!
    expect([...select.options].map((o) => o.value)).toEqual(['edit', 'open', 'expand'])
    expect([...select.options].map((o) => o.textContent)).toEqual(['Edit in place', 'Open details', 'Expand the row'])
    await act(async () => {
      select.value = 'expand'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(chosen).toBe('expand')
    await r.unmount()
    setRowClick('expand')
    expect(localStorage.getItem(ROW_CLICK_KEY)).toBe('expand')
    expect(rowClick()).toBe('expand')
    setRowClick('edit')
    expect(localStorage.getItem(ROW_CLICK_KEY)).toBeNull()
  })

  it('Expand the row: a click on the title or the empty area expands it and a second click hides it; Enter still opens the page', async () => {
    setRowClick('expand')
    const { ids: [a], r } = await list(undefined, ['Order the tiles', 'Call the plumber'], { description: 'Ask for the grey ones' })
    await fire(titleOf('Order the tiles'), 'click', 1)
    await waitFor(() => !!detailsOf('Order the tiles'), 'the details under the row')
    expect(titleOf('Order the tiles').getAttribute('aria-expanded')).toBe('true')
    expect(rowOf('Order the tiles').getAttribute('aria-current')).toBe('true')
    expect(editorTitle()).toBeNull()
    expect(openedTask()).toBeNull()
    // A later click (not the second of a double-click) hides them again.
    await fire(titleOf('Order the tiles'), 'click', 1, 5_000)
    await waitFor(() => !detailsOf('Order the tiles'), 'the details hidden')
    // The row's empty area does the same.
    await fire(rowOf('Order the tiles'), 'click', 1, 9_000)
    await waitFor(() => !!detailsOf('Order the tiles'), 'expanded from the empty area')
    // The keyboard is unchanged: Enter on the row opens the task's page.
    titleOf('Order the tiles').focus()
    await enter()
    await waitFor(() => openedTask() === a, 'the task page')
    await r.unmount()
  })

  it('Expand the row: a board card still opens', async () => {
    setRowClick('expand')
    const project = await createProject({ name: 'Errands' })
    await saveViewMode(project, 'board')
    const { ids: [a], r } = await list({ view: 'project', id: project }, ['Order the tiles', 'Call the plumber'], { project_id: project })
    await waitFor(() => !!rowOf('Order the tiles') && !rowOf('Order the tiles').querySelector('[data-row-expand]'), 'the cards')
    await fire(titleOf('Order the tiles'), 'click', 1)
    await waitFor(() => openedTask() === a, 'the card opened')
    expect(detailsOf('Order the tiles')).toBeNull()
    await r.unmount()
  })

  it('Open details: a click opens the task', async () => {
    setRowClick('open')
    const { ids: [a], r } = await list()
    await fire(titleOf('Order the tiles'), 'click', 1)
    await waitFor(() => openedTask() === a, 'opened')
    expect(detailsOf('Order the tiles')).toBeNull()
    await r.unmount()
  })
})

describe('a double-click opens the page', () => {
  it.each<RowClick>(['edit', 'open', 'expand'])('with "%s", on the title', async (mode) => {
    setRowClick(mode)
    // The side panel, so "Open details" keeps the list on screen after the first click.
    if (mode === 'open') await setTaskOpen('panel')
    const { ids: [a], r } = await list()
    // In Edit in place the first click turns the title into a field, which takes the second click.
    await doubleClick(() => titleOf('Order the tiles'), () => editorTitle() ?? titleOf('Order the tiles'))
    await waitFor(() => openedTask() === a, 'the task page')
    await r.unmount()
  })

  it('on the row\'s empty area, and never on its controls', async () => {
    // Expand the row, so the first click keeps the list on screen.
    setRowClick('expand')
    const { ids: [a], r } = await list()
    const check = () => rowOf('Order the tiles').querySelector<HTMLButtonElement>('button[aria-label^="Complete"]')!
    await fire(check(), 'dblclick', 2)
    expect(openedTask()).toBeNull()
    await doubleClick(() => rowOf('Order the tiles'))
    await waitFor(() => openedTask() === a, 'the task page')
    await r.unmount()
  })

  it('in a title already being edited it selects a word instead', async () => {
    const { r } = await list()
    await fire(titleOf('Order the tiles'), 'click', 1, 1_000)
    await waitFor(() => !!editorTitle(), 'the inline editor')
    // Seconds later, a double-click in the field: the browser selects the word; the page stays closed.
    await fire(editorTitle()!, 'click', 1, 6_000)
    await fire(editorTitle()!, 'click', 2, 6_100)
    await fire(editorTitle()!, 'dblclick', 2, 6_100)
    expect(openedTask()).toBeNull()
    expect(editorTitle()).not.toBeNull()
    await r.unmount()
  })

  it('in Expand the row the second click does not hide the details again', async () => {
    setRowClick('expand')
    const { ids: [a], r } = await list()
    let hidden = 0
    await fire(titleOf('Order the tiles'), 'click', 1, 1_000)
    await waitFor(() => !!detailsOf('Order the tiles'), 'expanded')
    await fire(titleOf('Order the tiles'), 'click', 2, 1_100)
    if (!detailsOf('Order the tiles')) hidden++
    await fire(titleOf('Order the tiles'), 'dblclick', 2, 1_100)
    await waitFor(() => openedTask() === a, 'the task page')
    expect(hidden).toBe(0)
    await r.unmount()
  })
})

describe('with the side panel the details follow the selection', () => {
  beforeEach(async () => { await setTaskOpen('panel') })

  it.each<[string, () => Promise<ListRoute>]>([
    ['Today', async () => ({ view: 'today' })],
    ['a project', async () => ({ view: 'project', id: await createProject({ name: 'House' }) })],
    ['a label', async () => ({ view: 'label', id: await createLabel({ name: 'errand' }) })],
  ])('in %s, with j and k and with a click, and focus stays on the list', async (_name, make) => {
    const route = await make()
    const extra = route.view === 'today' ? { due: { date: new Date().toISOString().slice(0, 10) } }
      : route.view === 'project' ? { project_id: route.id } : route.view === 'label' ? { labels: [route.id] } : {}
    const { ids: [a, b], r } = await list(route, ['Order the tiles', 'Call the plumber'], extra)
    await press('j')
    await waitFor(() => docked() !== null, 'the panel shows the cursor task')
    const first = docked()
    await press('j')
    await waitFor(() => docked() !== first, 'the panel follows j')
    expect(document.activeElement?.closest('li[data-task-id]')?.getAttribute('data-task-id')).toBe(docked())
    await fire(titleOf('Order the tiles'), 'click', 1, 5_000)
    await waitFor(() => docked() === a, 'the panel follows a click')
    expect([a, b]).toContain(document.activeElement?.closest('li[data-task-id]')?.getAttribute('data-task-id'))
    expect(document.activeElement?.closest('[data-detail-variant="panel"]')).toBeNull()
    await r.unmount()
  })

  it('Expand the row: a click expands the row and the panel shows its task; a closed panel stays closed', async () => {
    setRowClick('expand')
    const { ids: [a, b], r } = await list({ view: 'today' }, ['Order the tiles', 'Call the plumber'], { due: { date: new Date().toISOString().slice(0, 10) } })
    await fire(titleOf('Order the tiles'), 'click', 1, 1_000)
    await waitFor(() => !!detailsOf('Order the tiles') && docked() === a, 'expanded, and shown in the panel')
    await act(async () => { closeTaskPanel() })
    await waitFor(() => docked() === null, 'closed')
    await fire(titleOf('Call the plumber'), 'click', 1, 5_000)
    await waitFor(() => !!detailsOf('Call the plumber'), 'the other row expanded')
    expect(detailsOf('Order the tiles')).toBeNull()
    expect(docked()).toBeNull()
    // Enter reopens the panel with the selected task, as before.
    titleOf('Call the plumber').focus()
    await enter()
    await waitFor(() => docked() === b, 'reopened by Enter')
    await r.unmount()
  })

  it('the Inbox keeps following, and Expand the row works there too', async () => {
    setRowClick('expand')
    const { ids: [a], r } = await list({ view: 'inbox' })
    await press('j')
    await waitFor(() => docked() !== null, 'the cursor task docked')
    await fire(titleOf('Order the tiles'), 'click', 1, 5_000)
    await waitFor(() => docked() === a && !!detailsOf('Order the tiles'), 'expanded and docked')
    await r.unmount()
  })
})

describe('the Inbox split without the side panel', () => {
  it('still follows the cursor with j, and a click docks the task instead of editing it', async () => {
    const { ids: [a], r } = await list({ view: 'inbox' })
    await press('j')
    await waitFor(() => !!document.querySelector('[data-detail-for]'), 'the split shows the cursor task')
    const shown = document.querySelector('[data-detail-for]')!.getAttribute('data-detail-for')
    expect(document.querySelector('li[aria-current="true"]')!.getAttribute('data-task-id')).toBe(shown)
    await press('j')
    await waitFor(() => document.querySelector('[data-detail-for]')?.getAttribute('data-detail-for') !== shown, 'the split follows j')
    await fire(titleOf('Order the tiles'), 'click', 1, 5_000)
    await waitFor(() => document.querySelector('[data-detail-for]')?.getAttribute('data-detail-for') === a, 'the clicked task')
    expect(editorTitle()).toBeNull()
    expect(openedTask()).toBeNull()
    await r.unmount()
  })
})
