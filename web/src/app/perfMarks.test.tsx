// @vitest-environment happy-dom
// The app's measurement points (OpenSpec change performance-10k, task 1.2): a
// list opened marks LIST_READY once, a search keystroke SEARCH_RESULTS once.
// Its fixed waits are measurement windows: they check that no further mark follows.
/* eslint-disable test-hygiene/no-fixed-wait -- measurement windows of the mark counts */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatabase } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { LIST_READY, SEARCH_RESULTS } from '../lib/perfMarks'
import { flush, mockFetch, noPublicLinks, render, type, waitFor } from '../ui/test-utils'
import { TaskListView } from './TaskListView'
import CommandPalette from './palette/CommandPalette'

let n = 0
let calls: string[] = []
beforeEach(() => {
  useDatabase(`perf-marks-${Date.now()}-${n++}`)
  resetDeviceId()
  mockFetch(noPublicLinks)
  calls = []
  const mark = performance.mark.bind(performance)
  vi.spyOn(performance, 'mark').mockImplementation((name: string, opts?: PerformanceMarkOptions) => { calls.push(name); return mark(name, opts) })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const count = (name: string) => calls.filter((c) => c === name).length

describe('measurement points', () => {
  it('a list marks LIST_READY once when opened, and again for the next list', async () => {
    const p = await createProject({ name: 'Home' })
    await createTask({ title: 'One', project_id: p })
    await createTask({ title: 'Two' })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => r.container.querySelectorAll('[data-task-id]').length === 1, 'the project')
    await flush(100)
    expect(count(LIST_READY)).toBe(1)
    await createTask({ title: 'Three', project_id: p })
    await waitFor(() => r.container.querySelectorAll('[data-task-id]').length === 2, 'the new task')
    await flush(100)
    expect(count(LIST_READY)).toBe(1)
    await r.rerender(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => r.container.textContent!.includes('Two'), 'the Inbox')
    await flush(100)
    expect(count(LIST_READY)).toBe(2)
    await r.unmount()
  })

  it('a search keystroke marks SEARCH_RESULTS once', async () => {
    await createTask({ title: 'Order the zephyr part' })
    const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as never
    const r = await render(<CommandPalette user={user} onClose={() => {}} showShortcuts={() => {}} />)
    const field = () => document.querySelector('input[aria-label="Search tasks, projects and commands"]') as HTMLInputElement
    await waitFor(() => !!field(), 'the palette')
    await flush(100)
    expect(count(SEARCH_RESULTS)).toBe(0)
    for (const [i, text] of ['z', 'ze', 'zep'].entries()) {
      await type(field(), text)
      await flush(100)
      expect(count(SEARCH_RESULTS)).toBe(i + 1)
    }
    await r.unmount()
  })
})
