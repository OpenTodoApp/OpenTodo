// @vitest-environment happy-dom
// Bulk selection in the Filter view (OpenSpec change bulk-edit, tasks 1.2 and 2.4).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { createTask, resetDeviceId } from '../../lib/ops'
import { flush, key, render } from '../../ui/test-utils'
import { FilterView } from '../FilterView'
import { listState } from '../listActions'
import { hideBulkToast } from './toastStore'

let n = 0
beforeEach(() => { useDatabase(`filter-bulk-${Date.now()}-${n++}`); resetDeviceId() })
afterEach(() => { hideBulkToast(); document.body.innerHTML = '' })
async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

describe('Filter view selection', () => {
  it('j, x, Shift+↓ tick two results; 1 sets their priority in one batch; the list state reports them', async () => {
    const a = await createTask({ title: 'Alpha p3', priority: 3 })
    const b = await createTask({ title: 'Bravo p3', priority: 3 })
    const r = await render(<FilterView initialQuery="p3" />)
    await waitFor(() => document.body.textContent!.includes('Bravo p3'))
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    await key(document.body, 'j')
    await key(document.body, 'x')
    await key(document.body, 'ArrowDown', { shiftKey: true })
    await waitFor(() => document.querySelector('[data-selection-bar] [role="status"]')?.textContent === '2 selected')
    expect(listState()?.ticked?.()).toEqual([a, b])
    await db.outbox.clear()
    await key(document.body, '1')
    await flush(100)
    expect((await db.tasks.get(a))!.priority).toBe(1)
    expect(new Set((await db.outbox.toArray()).map((o) => o.ts)).size).toBe(1)
    await r.unmount()
  })
})
