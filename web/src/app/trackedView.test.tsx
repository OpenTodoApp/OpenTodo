// @vitest-environment happy-dom
// A saved view over tracked time follows a running entry (OpenSpec change
// time-tracking, task 7.3; filter-queries "Running entry counts live").
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatabase } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import { setCurrentUserId } from '../lib/sharing'
import { startTracking } from '../lib/timeEntries'
import { createView } from '../lib/views'
import { flush, render } from '../ui/test-utils'
import { SavedViewRoute } from './SavedViewView'

// 59 minutes and 59.99 seconds into the entry, 10 ms before a minute boundary.
const NOW = new Date(2026, 9, 14, 12, 0, 59, 990)
let n = 0
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  useDatabase(`tracked-view-${Date.now()}-${n++}`)
  resetDeviceId()
  await setCurrentUserId('u1')
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

describe('Running entry counts live', () => {
  it('a task crosses tracked >= 1h on the minute tick, without a reload', async () => {
    const id = await createTask({ title: 'Write the report' })
    await createTask({ title: 'Untracked' })
    await startTracking(id, { now: new Date(2026, 9, 14, 11, 1, 0).getTime() })
    const view = await createView({ name: 'Long ones', query: 'tracked >= 1h' })
    const r = await render(<SavedViewRoute id={view} />)
    await waitFor(() => r.container.textContent!.includes('Long ones'))
    await flush(100)
    expect(r.container.textContent).not.toContain('Write the report')
    // The minute turns: the shared totals recompute on their one timer.
    vi.setSystemTime(new Date(2026, 9, 14, 12, 1, 5))
    await waitFor(() => r.container.textContent!.includes('Write the report'))
    expect(r.container.textContent).not.toContain('Untracked')
  })
})
