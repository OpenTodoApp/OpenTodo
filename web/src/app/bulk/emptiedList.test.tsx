// @vitest-environment happy-dom
// A bulk action that empties the list (issue 841, OpenSpec change bulk-menu-after-empty-list):
// on a label page with the side panel, every task ticked and the label removed from them
// through Actions → Labels, the menu closes, no single-task menu takes its place and the
// last ticked task does not open in the panel.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { createLabel } from '../../lib/labels'
import { createTask, resetDeviceId } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import { setTaskOpen } from '../../lib/userPrefs'
import { click, flush, minWidthPx, mockFetch, noPublicLinks, render, waitFor } from '../../ui/test-utils'
import { resetPanel } from '../panel'
import { PanelHost } from '../PanelHost'
import { TaskListView } from '../TaskListView'
import { hideBulkToast } from './toastStore'
import { UndoToast } from './UndoToast'

const original = window.matchMedia
beforeEach(async () => {
  mockFetch(noPublicLinks)
  await db.delete()
  await db.open()
  resetDeviceId()
  setCurrentUserId('me')
  localStorage.clear()
  resetPanel()
  history.replaceState(null, '', '/')
  window.matchMedia = ((q: string) => ({
    matches: /pointer:\s*fine/.test(q) ? true : /pointer:\s*coarse/.test(q) ? false : minWidthPx(q) <= 1280,
    media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
})
afterEach(() => {
  window.matchMedia = original
  hideBulkToast()
  resetPanel()
})

const menuItems = () => document.querySelectorAll('[role^="menuitem"]')
const docked = () => document.querySelector('[data-detail-for]')?.getAttribute('data-detail-for') ?? null

it('removing the label from every ticked task closes the menu and opens nothing (#841)', async () => {
  await setTaskOpen('panel')
  const label = await createLabel({ name: 'errand' })
  for (const title of ['Task one', 'Task two']) await createTask({ title, labels: [label] })
  const r = await render(<><TaskListView route={{ view: 'label', id: label }} /><PanelHost user={{ id: 'me' }} /><UndoToast /></>)
  try {
    await waitFor(() => document.querySelectorAll('li[data-task-id]').length === 2, 'two rows')
    await flush()
    for (const box of [...document.querySelectorAll<HTMLElement>('[data-tick]')]) await click(box)
    await waitFor(() => document.querySelector('[data-selection-bar] [role="status"]')?.textContent === '2 selected', 'both ticked')
    await click(document.querySelector<HTMLElement>('[aria-label="Actions for 2 tasks"]')!)
    await waitFor(() => menuItems().length > 0, 'the Actions menu')
    await click([...menuItems()].find((m) => m.textContent?.startsWith('Labels…')) as HTMLElement)
    const errand = () => [...document.querySelectorAll<HTMLElement>('[data-picker-step] [role="option"]')].find((o) => o.textContent?.includes('errand'))
    await waitFor(() => errand()?.getAttribute('aria-selected') === 'true', 'the common label marked')
    await act(async () => { errand()!.click() })
    await waitFor(() => !!document.querySelector('[data-bulk-toast]'), 'the undo offer')
    await waitFor(() => document.body.textContent!.includes('No open task carries this label.'), 'the empty state')
    await flush()
    expect({ menuItems: menuItems().length, picker: !!document.querySelector('[data-picker-step]'), docked: docked() })
      .toEqual({ menuItems: 0, picker: false, docked: null })
  } finally {
    await r.unmount()
  }
})
