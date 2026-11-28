// @vitest-environment happy-dom
// GitHub issue 2165: a row dragged to a new place is selected without scrolling the list.
// The selection renders before the move does, so revealing the row then scrolled back
// to the place it came from.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { compareByPosition } from '../../lib/ordering'
import { createTask, resetDeviceId } from '../../lib/ops'
import { createView } from '../../lib/views'
import { key, render, waitFor } from '../../ui/test-utils'
import { hideBulkToast } from '../bulk/toastStore'
import { resetPanel } from '../panel'
import { SavedViewRoute } from '../SavedViewView'
import { TaskListView } from '../TaskListView'
import { revealRow } from './revealRow'

vi.mock('./revealRow', async (original) => ({ ...(await original<typeof import('./revealRow')>()), revealRow: vi.fn() }))

let n = 0
beforeEach(() => {
  useDatabase(`drop-keeps-scroll-${Date.now()}-${n++}`)
  resetDeviceId()
  vi.mocked(revealRow).mockClear()
})
afterEach(() => {
  vi.restoreAllMocks()
  hideBulkToast()
  resetPanel()
  history.replaceState(null, '', '/')
})

const row = (id: string) => document.querySelector<HTMLElement>(`li[data-task-id="${id}"]`)!

/** Press on `from`, move over `over` and release there, `y` into its 40 px high box. */
async function drag(from: HTMLElement, over: HTMLElement, y: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ top: 100, height: 40, bottom: 140, left: 0, right: 600, width: 600, x: 0, y: 100, toJSON: () => ({}) }))
  document.elementFromPoint = () => over
  await act(async () => {
    from.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 100, clientY: 20 }))
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: y }))
  })
  await act(async () => { window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: y })) })
}
const order = async () => (await db.tasks.toArray()).filter((t) => !t.deleted_at).sort(compareByPosition).map((t) => t.title)

it('a dropped row is selected where it lands, without scrolling back to where it was', async () => {
  const ids: Record<string, string> = {}
  for (const t of ['A', 'B', 'C', 'D', 'E']) ids[t] = await createTask({ title: t })
  const r = await render(<TaskListView route={{ view: 'inbox' }} />)
  await waitFor(() => !!row(ids.E))
  await drag(row(ids.E), row(ids.A), 102)
  await waitFor(async () => (await order()).join() === 'E,A,B,C,D', 'E above A')
  await waitFor(() => row(ids.E).getAttribute('aria-current') === 'true', 'E selected')
  expect(revealRow).not.toHaveBeenCalled()
  await r.unmount()
})

it('a drop on the row already selected leaves the next keyboard selection to scroll', async () => {
  const ids: Record<string, string> = {}
  for (const t of ['A', 'B', 'C', 'D', 'E']) ids[t] = await createTask({ title: t })
  const r = await render(<TaskListView route={{ view: 'inbox' }} />)
  await waitFor(() => !!row(ids.E))
  // The row's empty area selects it.
  await act(async () => { row(ids.E).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })) })
  await waitFor(() => row(ids.E).getAttribute('aria-current') === 'true', 'E selected')
  await drag(row(ids.E), row(ids.A), 102)
  await waitFor(async () => (await order()).join() === 'E,A,B,C,D', 'E above A')
  await key(document.body, 'Escape')
  await waitFor(() => !document.querySelector('li[aria-current="true"]'), 'nothing selected')
  vi.mocked(revealRow).mockClear()
  await key(document.body, 'j')
  await waitFor(() => row(ids.E).getAttribute('aria-current') === 'true', 'j selects E')
  expect(revealRow).toHaveBeenCalledWith(row(ids.E), expect.anything())
  await r.unmount()
})

it('the same in a saved view', async () => {
  const ids: Record<string, string> = {}
  for (const t of ['A', 'B', 'C']) ids[t] = await createTask({ title: t, priority: 1 })
  const view = await createView({ name: 'Urgent', query: 'p1' })
  const r = await render(<SavedViewRoute id={view} />)
  await waitFor(() => !!document.querySelector(`[data-task-id="${ids.C}"]`))
  const viewRow = (id: string) => document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!
  await drag(viewRow(ids.C), viewRow(ids.A), 102)
  await waitFor(async () => ((await db.views.get(view))?.manual_order as string[] | undefined)?.[0] === ids.C, 'C first')
  await waitFor(() => viewRow(ids.C).closest('[aria-current="true"]') !== null, 'C selected')
  expect(revealRow).not.toHaveBeenCalled()
  await r.unmount()
})
