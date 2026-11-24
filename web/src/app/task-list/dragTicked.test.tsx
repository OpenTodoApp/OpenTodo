// @vitest-environment happy-dom
// OpenSpec change drag-ticked-together (GitHub issue 1498): a ticked row dragged
// among the rows of the Inbox takes the other ticked rows along, as one batch
// with one Undo; an unticked row still moves alone.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { compareByPosition } from '../../lib/ordering'
import { createTask, resetDeviceId } from '../../lib/ops'
import { click, render, waitFor } from '../../ui/test-utils'
import { PanelHost } from '../PanelHost'
import { resetPanel } from '../panel'
import { TaskListView } from '../TaskListView'
import { hideBulkToast } from '../bulk/toastStore'
import { UndoToast } from '../bulk/UndoToast'

let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  useDatabase(`drag-ticked-${Date.now()}-${n++}`)
  resetDeviceId()
})
const mounted: { unmount: () => Promise<void> }[] = []
afterEach(async () => {
  for (const r of mounted.splice(0)) await r.unmount()
  vi.useRealTimers()
  hideBulkToast()
  resetPanel()
  history.replaceState(null, '', '/')
})

const row = (id: string) => document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!
const tick = (title: string) => document.querySelector<HTMLElement>(`[data-tick][aria-label="Select ${title}"]`)!
const toast = () => document.querySelector('[data-bulk-toast]')?.textContent ?? ''
const order = async () => (await db.tasks.toArray()).filter((t) => !t.parent_id && !t.deleted_at).sort(compareByPosition).map((t) => t.title)

async function inbox(...titles: string[]) {
  const ids: Record<string, string> = {}
  for (const t of titles) ids[t] = await createTask({ title: t })
  const r = await render(<><TaskListView route={{ view: 'inbox' }} /><PanelHost /><UndoToast /></>)
  mounted.push(r)
  await waitFor(() => document.body.textContent!.includes(titles[titles.length - 1]))
  return ids
}

/** Press on `el`, move over `over` (its top quarter: without layout rows are zero high), release. */
async function drag(el: Element, over: Element) {
  document.elementFromPoint = () => over
  await act(async () => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 }))
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 60 }))
  })
  const ghost = document.querySelector('[data-drag-ghost]')?.textContent ?? document.body.lastElementChild?.textContent ?? ''
  await act(async () => { window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 60 })) })
  return { ghost }
}

describe('dragging ticked rows within a list', () => {
  it('Reorder three at once: the ticked rows land together above the row, the toast offers Undo', async () => {
    const ids = await inbox('A', 'B', 'C', 'D', 'E')
    await click(tick('B'))
    await click(tick('D'))
    const { ghost } = await drag(row(ids.D), row(ids.A))
    expect(ghost).toContain('2 tasks')
    await waitFor(async () => (await order()).join() === 'B,D,A,C,E', 'B and D above A')
    await waitFor(() => toast().includes('2 tasks moved'))
    expect(toast()).toContain('Undo')
  })

  it('an unticked row still moves alone', async () => {
    const ids = await inbox('A', 'B', 'C', 'D', 'E')
    await click(tick('B'))
    await click(tick('D'))
    await drag(row(ids.E), row(ids.A))
    await waitFor(async () => (await order()).join() === 'E,A,B,C,D', 'E alone above A')
  })
})
