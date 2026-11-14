// @vitest-environment happy-dom
// A day page opens in place (OpenSpec change today-no-shift): the list is drawn only
// once its briefing is read, so the sentence above the rows never changes length under
// them. Every state of the page that shows a row is recorded, not only the last, and
// the notifications' read is held by the test, so the order of the reads is not luck.
import 'fake-indexeddb/auto'
import { act, useSyncExternalStore } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatabase } from '../../lib/db'
import { createTask, resetDeviceId } from '../../lib/ops'
import { LIST_READY } from '../../lib/perfMarks'
import type { AppNotification } from '../../lib/types'
import { setBriefingShown } from '../../lib/userPrefs'
import { flush, mockFetch, noPublicLinks, render, waitFor } from '../../ui/test-utils'
import { TaskListView } from '../TaskListView'

// The notifications as the page reads them: undefined (still being read) until the test hands them over.
const held = vi.hoisted(() => {
  let rows: unknown[] | undefined
  const listeners = new Set<() => void>()
  return {
    get: () => rows,
    set: (next: unknown[] | undefined) => { rows = next; for (const l of listeners) l() },
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } },
  }
})
vi.mock('../../lib/localData', async (original) => ({
  ...(await original<typeof import('../../lib/localData')>()),
  useNotificationsRead: () => useSyncExternalStore(held.subscribe, held.get),
}))

const TODAY = '2026-10-30'
let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 30, 12, 0))
  useDatabase(`list-ready-${Date.now()}-${n++}`)
  resetDeviceId()
  mockFetch(noPublicLinks)
  held.set(undefined)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const reply = (id: string): AppNotification => ({
  id, kind: 'page_replied', createdAt: Date.now(), readAt: null,
  payload: { pageId: `page-${id}`, taskId: `task-${id}`, taskTitle: 'Boiler', guestName: 'Mia', at: Date.now() },
})

/** The briefing's text in every state of the document that shows a task row (null: no briefing). */
function briefingsBesideRows() {
  const seen = new Set<string | null>()
  const look = () => {
    if (document.querySelector('[data-task-id]')) seen.add(document.querySelector('[data-page-briefing]')?.textContent ?? null)
  }
  const observer = new MutationObserver(look)
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  return { seen, stop: () => { look(); observer.disconnect() } }
}

describe('a day page opens in place', () => {
  it('Today: nothing is drawn while the notifications are read, then the rows with the whole briefing', async () => {
    await createTask({ title: 'Water the plants', due: { date: '2026-10-28' } })
    await createTask({ title: 'Call the dentist', due: { date: TODAY } })
    const watch = briefingsBesideRows()
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    // The tasks are read by now, the notifications are not: the page holds its place, empty.
    await flush(50) // eslint-disable-line test-hygiene/no-fixed-wait -- checks that nothing is drawn meanwhile
    expect(r.container.querySelector('[data-list-loading]')).not.toBeNull()
    expect(r.container.querySelector('[data-task-id]')).toBeNull()
    await act(() => held.set([reply('a'), reply('b')]))
    await waitFor(() => r.container.querySelectorAll('[data-task-id]').length === 2, 'the rows')
    watch.stop()
    expect([...watch.seen]).toEqual(['Two things matter today. Water the plants is 2 days late and 2 replies are waiting.'])
    await r.unmount()
  })

  it('Upcoming waits the same way, and a hidden briefing never shows beside the rows', async () => {
    await createTask({ title: 'Renew the passport', due: { date: '2026-10-31' } })
    held.set([])
    const shown = briefingsBesideRows()
    const r = await render(<TaskListView route={{ view: 'upcoming' }} />)
    await waitFor(() => r.container.querySelectorAll('[data-task-id]').length === 1, 'the row')
    shown.stop()
    expect([...shown.seen]).toEqual(['One task in the next seven days. Every day still has room. Tomorrow starts with one task; the first is Renew the passport.'])
    await r.unmount()

    await setBriefingShown(false)
    const hidden = briefingsBesideRows()
    const again = await render(<TaskListView route={{ view: 'upcoming' }} />)
    await waitFor(() => again.container.querySelectorAll('[data-task-id]').length === 1, 'the row')
    hidden.stop()
    expect([...hidden.seen]).toEqual([null])
    await again.unmount()
  })

  it('the list is marked ready with its first rows, once, and a list without a briefing does not wait for one', async () => {
    const calls: string[] = []
    const mark = performance.mark.bind(performance)
    vi.spyOn(performance, 'mark').mockImplementation((name: string, opts?: PerformanceMarkOptions) => { calls.push(name); return mark(name, opts) })
    await createTask({ title: 'Call the dentist', due: { date: TODAY } })
    await createTask({ title: 'Sort me' })
    held.set([])
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => r.container.querySelectorAll('[data-task-id]').length === 1, 'Today')
    expect(calls.filter((c) => c === LIST_READY)).toHaveLength(1)
    await r.rerender(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => !!r.container.textContent?.includes('Sort me'), 'the Inbox')
    expect(r.container.querySelector('[data-page-briefing]')).toBeNull()
    expect(calls.filter((c) => c === LIST_READY)).toHaveLength(2)
    await r.unmount()
  })
})
