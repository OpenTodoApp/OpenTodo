// @vitest-environment happy-dom
// Edit and Open details on a row (OpenSpec change row-edit-action): Edit in the revealed
// actions and the row menu opens the F2 editor, Open details opens the task as Enter
// does, and an edit on another row keeps the task beside the list until the cursor moves.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createProject, createTask, resetDeviceId } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import { setTaskOpen } from '../../lib/userPrefs'
import { minWidthPx, mockFetch, noPublicLinks, render, waitFor } from '../../ui/test-utils'
import { PanelHost } from '../PanelHost'
import { closeTaskPanel, resetPanel } from '../panel'
import { TaskListView } from '../TaskListView'
import { SavedViewRoute } from '../SavedViewView'
import { FilterView } from '../FilterView'
import { createView } from '../../lib/views'
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

const row = (id: string) => document.querySelector<HTMLElement>(`li[data-task-id="${id}"]`)!
const title = (id: string) => row(id).querySelector<HTMLElement>('[data-row-title]')!
const action = (id: string, name: string) => row(id).querySelector<HTMLElement>(`[data-row-action="${name}"]`)
const editor = () => document.querySelector<HTMLInputElement>('[data-inline-title]')
const panel = () => document.querySelector('[data-detail-for]')?.getAttribute('data-detail-for') ?? null
const menuItem = (id: string) => document.querySelector<HTMLElement>(`[role="menuitem"][data-action="${id}"]`)

async function click(el: Element, { pointerType = 'mouse', at = 1_000 } = {}) {
  await act(async () => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType, pointerId: 1, button: 0 }))
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType, pointerId: 1, button: 0 }))
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
    Object.defineProperty(event, 'timeStamp', { value: at })
    el.dispatchEvent(event)
  })
}
const key = (k: string, target: Element | null = document.activeElement) => act(async () => {
  (target ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: k }))
})

async function list(view: 'project' | 'inbox' = 'project') {
  const project = view === 'project' ? await createProject({ name: 'House' }) : ''
  const fields = project ? { project_id: project } : {}
  const a = await createTask({ title: 'Order the tiles', ...fields })
  const b = await createTask({ title: 'Call the plumber', ...fields })
  const c = await createTask({ title: 'Paint the hall', ...fields })
  const r = await render(<main><TaskListView route={project ? { view: 'project', id: project } : { view: 'inbox' }} /><PanelHost user={{ id: 'me' }} /></main>)
  await waitFor(() => !!row(a) && !!row(b) && !!row(c), 'task rows')
  return { a, b, c, r }
}

describe('Edit in the revealed actions', () => {
  it('takes Show details\' place and opens the F2 editor on the row', async () => {
    const { b, r } = await list()
    const names = [...row(b).querySelectorAll('[data-row-action]')].map((el) => el.getAttribute('data-row-action'))
    expect(names).toEqual(['edit', 'schedule', 'priority', 'more'])
    expect(action(b, 'edit')!.getAttribute('aria-label')).toBe('Edit')
    await click(action(b, 'edit')!)
    await waitFor(() => editor()?.value === 'Call the plumber', 'the editor')
    expect(document.activeElement).toBe(editor())
    // The F2 editor with its bar, not the compact touch one.
    expect(document.querySelector('[data-inline-compact]')).toBeNull()
    expect(row(b).getAttribute('aria-current')).toBe('true')
    expect(openedTask()).toBeNull()
    await r.unmount()
  })

  it('F2 on the cursor row opens the same editor as Edit', async () => {
    const { a, r } = await list()
    await key('j', document.body)
    await waitFor(() => row(a).getAttribute('aria-current') === 'true', 'the cursor')
    await key('F2')
    await waitFor(() => editor()?.value === 'Order the tiles', 'the editor')
    expect(document.querySelector('[data-inline-compact]')).toBeNull()
    await r.unmount()
  })

  it('gives a viewer\'s row Show details only', async () => {
    const project = await createProject({ name: 'Shared house' })
    const task = await createTask({ title: 'Order the tiles', project_id: project })
    await db.memberships.put({ projectId: project, role: 'viewer', ownerId: 'someone', members: [] })
    const r = await render(<TaskListView route={{ view: 'project', id: project }} />)
    await waitFor(() => !!row(task) && !!action(task, 'details'), 'the row')
    expect(action(task, 'edit')).toBeNull()
    await r.unmount()
  })
})

describe('Edit and Open details in the row menu', () => {
  it('lists Edit with F2 and Open details with Enter; Open details opens the page', async () => {
    const { b, r } = await list()
    await click(action(b, 'more')!)
    await waitFor(() => !!menuItem('edit-title') && !!menuItem('open-details'), 'the two items')
    expect(menuItem('edit-title')!.textContent).toContain('Edit')
    expect(menuItem('edit-title')!.textContent).toContain('F2')
    expect(menuItem('open-details')!.textContent).toContain('Open details')
    await act(async () => menuItem('open-details')!.click())
    await waitFor(() => openedTask() === b, 'the page')
    expect(editor()).toBeNull()
    await r.unmount()
  })

  it('shows and hides the details from the menu, as → does', async () => {
    const { b, r } = await list()
    await click(action(b, 'more')!)
    await waitFor(() => menuItem('show-details')?.textContent?.includes('Show details') === true, 'Show details')
    await act(async () => menuItem('show-details')!.click())
    await waitFor(() => !!row(b).querySelector('[data-row-details]'), 'the details')
    await click(action(b, 'more')!, { at: 3_000 })
    await waitFor(() => menuItem('show-details')?.textContent?.includes('Hide details') === true, 'Hide details')
    await act(async () => menuItem('show-details')!.click())
    await waitFor(() => !row(b).querySelector('[data-row-details]'), 'the details hidden')
    await r.unmount()
  })

  it('opens the task in the side panel with that preference', async () => {
    await setTaskOpen('panel')
    const { b, r } = await list()
    await act(async () => row(b).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
    await waitFor(() => !!menuItem('open-details'), 'Open details')
    await act(async () => menuItem('open-details')!.click())
    await waitFor(() => panel() === b, 'the side panel')
    expect(openedTask()).toBeNull()
    await r.unmount()
  })

  it('offers Edit and Open details on a phone, and Edit opens the compact editor', async () => {
    width = 390
    coarse = true
    const { b, r } = await list()
    await act(async () => row(b).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
    await waitFor(() => !!menuItem('edit-title') && !!menuItem('open-details'), 'the two items')
    expect(menuItem('show-details')).toBeNull()
    await act(async () => menuItem('edit-title')!.click())
    await waitFor(() => !!editor() && !!document.querySelector('[data-inline-compact]'), 'the compact editor')
    expect(openedTask()).toBeNull()
    await r.unmount()
  })
})

describe('the task beside the list stays while another row is edited', () => {
  it.each(['panel', 'inbox split'] as const)('keeps A in the %s while B is edited, then follows j', async (where) => {
    if (where === 'panel') await setTaskOpen('panel')
    const { a, b, c, r } = await list(where === 'panel' ? 'project' : 'inbox')
    await click(title(a))
    await waitFor(() => panel() === a, 'A beside the list')
    await click(action(b, 'edit')!, { at: 3_000 })
    await waitFor(() => !!editor(), 'the editor on B')
    expect(row(b).getAttribute('aria-current')).toBe('true')
    expect(panel()).toBe(a)
    await key('Escape', editor())
    await waitFor(() => !editor(), 'the editor closed')
    expect(panel()).toBe(a)
    // The next cursor move shows its task again.
    await key('j', row(b).querySelector('[data-row-open]'))
    await waitFor(() => panel() === c, 'C follows the cursor')
    await r.unmount()
  })

  it('keeps A while B\'s menu is used, and a click on B shows B', async () => {
    await setTaskOpen('panel')
    const { a, b, r } = await list()
    await click(title(a))
    await waitFor(() => panel() === a, 'A in the panel')
    await click(action(b, 'more')!, { at: 3_000 })
    await waitFor(() => !!menuItem('edit-title'), 'the menu')
    expect(panel()).toBe(a)
    await act(async () => menuItem('edit-title')!.click())
    await waitFor(() => !!editor(), 'the editor on B')
    expect(panel()).toBe(a)
    await key('Enter', editor())
    await waitFor(() => !editor(), 'saved')
    expect(panel()).toBe(a)
    // A click on the selected row's empty area shows it beside the list.
    await click(row(b), { at: 6_000 })
    await waitFor(() => panel() === b, 'B in the panel')
    expect(editor()).toBeNull()
    await r.unmount()
  })

  it('opens B in the panel from the editor with Shift+Enter and stays there', async () => {
    await setTaskOpen('panel')
    const { a, b, r } = await list()
    await click(title(a))
    await waitFor(() => panel() === a, 'A in the panel')
    await click(action(b, 'edit')!, { at: 3_000 })
    await waitFor(() => !!editor(), 'the editor on B')
    await act(async () => {
      editor()!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', shiftKey: true }))
    })
    await waitFor(() => panel() === b, 'B in the panel')
    await r.unmount()
  })

  it('keeps a closed side panel closed after the edit, and a row click reopens it', async () => {
    await setTaskOpen('panel')
    const { a, b, r } = await list()
    await click(title(a))
    await waitFor(() => panel() === a, 'A in the panel')
    await click(action(b, 'edit')!, { at: 3_000 })
    await waitFor(() => !!editor(), 'the editor on B')
    await act(async () => closeTaskPanel())
    await waitFor(() => panel() === null, 'the panel closed')
    await key('Escape', editor())
    await waitFor(() => !editor(), 'the editor closed')
    expect(panel()).toBeNull()
    expect(row(b).getAttribute('aria-current')).toBe('true')
    await click(row(b), { at: 6_000 })
    await waitFor(() => panel() === b, 'B in the panel')
    await r.unmount()
  })

  it('closing the Inbox split while A is kept clears the cursor', async () => {
    const { a, b, r } = await list('inbox')
    await click(title(a))
    await waitFor(() => panel() === a, 'A in the split')
    await click(action(b, 'more')!, { at: 3_000 })
    await waitFor(() => !!menuItem('edit-title'), 'the menu')
    await act(async () => menuItem('edit-title')!.click())
    await waitFor(() => !!editor(), 'the editor on B')
    await key('Escape', editor())
    await waitFor(() => !editor(), 'the editor closed')
    expect(panel()).toBe(a)
    await act(async () => closeTaskPanel())
    await waitFor(() => !document.querySelector('li[data-task-id][aria-current]'), 'no cursor')
    await r.unmount()
  })
})

describe('lists without the inline editor', () => {
  it.each(['filter', 'saved view'] as const)('the %s row menu has no Edit, Show details or Open details', async (where) => {
    const t1 = await createTask({ title: 'Order the tiles', priority: 1 })
    const view = await createView({ name: 'Everything', query: 'p1' })
    const r = await render(where === 'filter' ? <FilterView initialQuery="p1" /> : <SavedViewRoute id={view} />)
    await waitFor(() => !!row(t1), 'the row')
    await act(async () => row(t1).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
    await waitFor(() => !!document.querySelector('[role="menu"]'), 'the menu')
    for (const id of ['edit-title', 'show-details', 'open-details']) expect(menuItem(id)).toBeNull()
    expect(action(t1, 'details')).toBeTruthy()
    await r.unmount()
  })
})
