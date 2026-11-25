// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { logicalToday } from '../../lib/dates'
import { createProject, createTask, resetDeviceId } from '../../lib/ops'
import { saveViewMode } from '../../lib/sections'
import { setCurrentUserId } from '../../lib/sharing'
import { setTaskOpen } from '../../lib/userPrefs'
import { setRowClick, setServerRowClick } from '../../lib/rowClickPref'
import { createView } from '../../lib/views'
import { minWidthPx, mockFetch, noPublicLinks, render, visibleText, waitFor } from '../../ui/test-utils'
import { FilterView } from '../FilterView'
import { NextView } from '../method/MethodListView'
import { PanelHost } from '../PanelHost'
import { closeTaskPanel, resetPanel } from '../panel'
import { KeyboardView } from '../PreferencesPanels'
import { SavedViewRoute } from '../SavedViewView'
import { TaskListView } from '../TaskListView'
import { openedTask, resetTaskPage } from '../taskPage.testkit'

let width: number
let coarse: boolean
beforeEach(async () => {
  mockFetch(noPublicLinks)
  width = 1440
  coarse = false
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: /pointer:\s*fine/.test(q) ? !coarse : /pointer:\s*coarse/.test(q) ? coarse : minWidthPx(q) <= width,
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
const panel = () => document.querySelector('[data-detail-for]')?.getAttribute('data-detail-for')

async function click(el: Element, { pointerType = 'mouse', detail = 1, ctrlKey = false, at = 1_000 } = {}) {
  await act(async () => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType, pointerId: 1, button: 0, ctrlKey }))
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType, pointerId: 1, button: 0, ctrlKey }))
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, detail, ctrlKey })
    Object.defineProperty(event, 'timeStamp', { value: at })
    el.dispatchEvent(event)
  })
}
const key = (k: string) => act(async () => {
  (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: k }))
})

async function list(view: 'project' | 'today' | 'inbox' | 'board' = 'project') {
  const project = view === 'project' || view === 'board'
  const id = project ? await createProject({ name: 'House' }) : ''
  if (view === 'board') await saveViewMode(id, 'board')
  const fields = project ? { project_id: id } : view === 'today' ? { due: { date: logicalToday() } } : {}
  const a = await createTask({ title: 'Order the tiles', ...fields })
  const b = await createTask({ title: 'Call the plumber', ...fields })
  const r = await render(<main><TaskListView route={project ? { view: 'project', id } : { view }} /><PanelHost user={{ id: 'me' }} /></main>)
  await waitFor(() => !!row(a) && !!row(b), 'task rows')
  return { a, b, r }
}

describe('click selects before editing', () => {
  it.each(['open', 'expand'])('ignores the stored %s choice and selects before editing', async (oldChoice) => {
    localStorage.setItem('opentodo.rowClick', oldChoice)
    const { a, r } = await list()
    await click(title(a))
    expect(row(a).getAttribute('aria-current')).toBe('true')
    expect(openedTask()).toBeNull()
    expect(editor()).toBeNull()
    await click(title(a), { at: 5_000 })
    await waitFor(() => editor()?.value === 'Order the tiles')
    await r.unmount()
  })

  it.each([
    ['today', 'page'], ['project', 'page'], ['inbox', 'page'],
    ['today', 'panel'], ['project', 'panel'], ['inbox', 'panel'],
  ] as const)('selects and then adds a subtask with a in %s (%s)', async (view, placement) => {
    await setTaskOpen(placement)
    const { a, r } = await list(view)
    await click(title(a))
    await key('a')
    await waitFor(() => !!document.querySelector('[data-add-line]'))
    expect(editor()).toBeNull()
    expect(openedTask()).toBeNull()
    await r.unmount()
  })

  it('edits next to the Inbox split on the second click', async () => {
    const { a, r } = await list('inbox')
    await click(title(a))
    await waitFor(() => panel() === a)
    await click(title(a), { at: 5_000 })
    await waitFor(() => !!editor())
    expect(panel()).toBe(a)
    await r.unmount()
  })

  it('reopens a closed side panel when clicking a different task', async () => {
    await setTaskOpen('panel')
    const { a, b, r } = await list()
    await click(title(a))
    await waitFor(() => panel() === a)
    await act(async () => closeTaskPanel())
    await click(title(b))
    await waitFor(() => panel() === b)
    expect(editor()).toBeNull()
    await r.unmount()
  })

  it('opens on accessibility activation and on a touch tap on a hybrid', async () => {
    const { a, b, r } = await list()
    await act(async () => row(a).querySelector<HTMLButtonElement>('[data-row-open]')!.click())
    await waitFor(() => openedTask() === a)
    resetTaskPage()
    await click(title(b), { pointerType: 'touch' })
    await waitFor(() => openedTask() === b)
    expect(editor()).toBeNull()
    await r.unmount()
  })

  it('selects a board card without opening its page', async () => {
    const { a, r } = await list('board')
    await click(title(a))
    expect(row(a).getAttribute('aria-current')).toBe('true')
    expect(openedTask()).toBeNull()
    await click(title(a), { at: 5_000 })
    expect(editor()).toBeNull()
    expect(openedTask()).toBeNull()
    await r.unmount()
  })

  it.each(['filter', 'saved view', 'next'] as const)('selects without editing in %s', async (view) => {
    const project = await createProject({ name: 'House' })
    const task = await createTask({ title: 'Order the tiles', project_id: project, priority: 1 })
    const saved = await createView({ name: 'Priority', query: 'p1' })
    const r = await render(view === 'filter' ? <FilterView initialQuery="p1" /> : view === 'saved view' ? <SavedViewRoute id={saved} /> : <NextView />)
    await waitFor(() => !!row(task))
    await click(title(task))
    expect(row(task).getAttribute('aria-current')).toBe('true')
    expect(openedTask()).toBeNull()
    await click(title(task), { at: 5_000 })
    expect(editor()).toBeNull()
    expect(openedTask()).toBeNull()
    await r.unmount()
  })

  it('selects on empty space and edits only a selected title', async () => {
    const { a, r } = await list()
    await click(row(a))
    await click(row(a), { at: 5_000 })
    expect(row(a).getAttribute('aria-current')).toBe('true')
    expect(editor()).toBeNull()
    expect(openedTask()).toBeNull()
    await click(title(a), { at: 8_000 })
    await waitFor(() => !!editor())
    await act(async () => {
      const event = new MouseEvent('dblclick', { detail: 2, bubbles: true })
      Object.defineProperty(event, 'timeStamp', { value: 10_000 })
      editor()?.dispatchEvent(event)
    })
    expect(openedTask()).toBeNull()
    expect(editor()).not.toBeNull()
    await r.unmount()
  })

  it('Ctrl+click ticks the row without starting the title editor', async () => {
    const { a, b, r } = await list()
    await click(title(a))
    await click(title(b), { ctrlKey: true })
    expect(row(b).getAttribute('data-ticked')).toBe('true')
    expect(row(b).getAttribute('aria-current')).toBe('true')
    expect(editor()).toBeNull()
    expect(openedTask()).toBeNull()
    await r.unmount()
  })

  it('lets a project viewer select the row but does not offer title editing', async () => {
    const project = await createProject({ name: 'Shared house' })
    const task = await createTask({ title: 'Order the tiles', project_id: project })
    await db.memberships.put({ projectId: project, role: 'viewer', ownerId: 'someone', members: [] })
    const r = await render(<TaskListView route={{ view: 'project', id: project }} />)
    await waitFor(() => !!row(task))
    await click(title(task))
    await click(title(task), { at: 5_000 })
    expect(row(task).getAttribute('aria-current')).toBe('true')
    expect(editor()).toBeNull()
    expect(row(task).querySelector('[data-row-edit-title]')).toBeNull()
    await act(async () => row(task).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
    await waitFor(() => !!document.querySelector('[role="menu"]'))
    expect(document.querySelector('[data-action="edit-title"]')).toBeNull()
    await r.unmount()
  })

  it.each([false, true])('double-click opens the task when it starts selected: %s', async (selected) => {
    const { a, r } = await list()
    if (selected) await click(title(a))
    await click(title(a), { at: 5_000 })
    const target = editor() ?? title(a)
    expect(!!editor()).toBe(selected)
    await click(target, { detail: 2, at: 5_120 })
    await act(async () => {
      const event = new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 })
      Object.defineProperty(event, 'timeStamp', { value: 5_120 })
      target.dispatchEvent(event)
    })
    await waitFor(() => openedTask() === a)
    expect((await db.tasks.get(a))?.title).toBe('Order the tiles')
    await r.unmount()
  })

  it.each(['Save', 'Cancel'])('opens the touch title editor and can %s', async (decision) => {
    width = 390
    coarse = true
    const { a, r } = await list()
    await act(async () => row(a).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
    const action = () => document.querySelector<HTMLElement>('[role="menuitem"][data-action="edit-title"]')
    await waitFor(() => !!action(), 'Edit in the row menu')
    await act(async () => action()?.click())
    await waitFor(() => document.activeElement === editor() && !!editor(), 'focused title field')
    await act(async () => {
      const field = editor()!
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, 'Order more tiles')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const button = [...row(a).querySelectorAll('button')].find((button) => visibleText(button) === decision)
    expect(button).toBeDefined()
    await act(async () => button!.click())
    await waitFor(() => !editor() && row(a).contains(document.activeElement), 'focus returned to row')
    await waitFor(async () => (await db.tasks.get(a))?.title === (decision === 'Save' ? 'Order more tiles' : 'Order the tiles'))
    expect(openedTask()).toBeNull()
    await r.unmount()
  })

  it('offers three Keyboard switches and no click preference', async () => {
    const r = await render(<KeyboardView vim={false} onVim={() => {}} />)
    expect(r.container.querySelectorAll('[role="switch"]')).toHaveLength(3)
    expect(r.container.querySelector('[data-row-click]')).toBeNull()
    await r.unmount()
  })
})

describe('Click a task to (click-default)', () => {
  it('follows the server default "Open details": a click opens the page and never edits', async () => {
    setServerRowClick('open')
    const { a, r } = await list()
    await click(title(a))
    await waitFor(() => openedTask() === a)
    expect(editor()).toBeNull()
    await r.unmount()
  })

  it('with "Open details" a click shows the task in the side panel, a second click does not edit', async () => {
    setServerRowClick('open')
    await setTaskOpen('panel')
    const { a, b, r } = await list()
    await click(title(a))
    await waitFor(() => panel() === a)
    await click(title(a), { at: 5_000 })
    expect(editor()).toBeNull()
    await click(title(b), { at: 9_000 })
    await waitFor(() => panel() === b)
    expect(editor()).toBeNull()
    await r.unmount()
  })

  it('the account choice "Select, then edit the title" wins over the server default', async () => {
    setServerRowClick('open')
    await setRowClick('select')
    const { a, r } = await list()
    await click(title(a))
    expect(row(a).getAttribute('aria-current')).toBe('true')
    expect(openedTask()).toBeNull()
    await click(title(a), { at: 5_000 })
    await waitFor(() => editor()?.value === 'Order the tiles')
    await r.unmount()
  })

  it('the account choice "Open details" wins over the server default', async () => {
    await setRowClick('open')
    const { a, r } = await list('today')
    await click(title(a))
    await waitFor(() => openedTask() === a)
    expect(editor()).toBeNull()
    await r.unmount()
  })
})
