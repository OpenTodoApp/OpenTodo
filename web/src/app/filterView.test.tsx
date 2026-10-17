// @vitest-environment happy-dom
// Enter in the filter query moves focus to the results, also when it is pressed
// before the view has read the tasks (the e2e saved-views check on a slow runner).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatabase } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import type { Task } from '../lib/types'
import { key, render, type, waitFor } from '../ui/test-utils'
import { FilterView } from './FilterView'

// The first read of the tasks waits for `release`, like a slow device.
const gate = vi.hoisted(() => ({ release: () => {}, held: true }))
vi.mock('../lib/trash', async (load) => {
  const real = await load<typeof import('../lib/trash')>()
  return {
    ...real,
    visibleTasks: async (): Promise<Task[]> => {
      if (gate.held) await new Promise<void>((r) => { gate.release = () => { gate.held = false; r() } })
      return real.visibleTasks()
    },
  }
})

let n = 0
beforeEach(() => {
  useDatabase(`filter-view-${Date.now()}-${n++}`)
  resetDeviceId()
  gate.held = true
})
afterEach(() => {
  document.body.innerHTML = ''
})

describe('filter query Enter', () => {
  it('focuses the results once the tasks arrive', async () => {
    await createTask({ title: 'Plan sprint', priority: 1 })
    const r = await render(<FilterView />)
    const input = r.container.querySelector('input[aria-label="Filter query"]') as HTMLInputElement
    await type(input, 'p1')
    await key(input, 'Enter')
    gate.release()
    await waitFor(() => r.container.textContent?.includes('Plan sprint') ?? false, 'the result')
    await waitFor(() => document.activeElement?.getAttribute('aria-label') === 'Filter results', 'focus on the results')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Filter results')
    await r.unmount()
  })
})
