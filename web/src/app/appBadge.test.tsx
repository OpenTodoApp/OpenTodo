// @vitest-environment happy-dom
// App icon badge (OpenSpec change app-icon-badge): the count is the sidebar's Today
// count, set live and cleared at zero, stored for the service worker, and off per device.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { render, waitFor } from '../ui/test-utils'
import { AppBadgeView } from './AppBadge'
import { BADGE_KEY, BADGE_META, badgeCounts, badgeSupported, clearBadge, setBadgeEnabled, showBadge, todayCount, useAppBadge, type BadgeRow } from '../lib/appBadge'
import { db, useDatabase } from '../lib/db'
import type { Task } from '../lib/types'

const task = (over: Partial<Task>): Task => ({ id: Math.random().toString(36).slice(2), title: 't', completed_at: null, due: null, deadline: null, start: null, ...over } as Task)

const TODAY = '2026-11-01'
const tasks = [
  task({ due: { date: '2026-10-30' } }), // overdue
  task({ due: { date: TODAY, time: '09:00' } }),
  task({ deadline: TODAY }),
  task({ start: '2026-10-31' }), // started
  task({ due: { date: '2026-11-02' } }), // tomorrow
  task({ start: 'someday' }),
  task({ due: { date: TODAY }, completed_at: 1 }), // done
  task({}), // anytime
]

function stubNavigator() {
  const calls: (number | 'clear')[] = []
  const nav = {
    setAppBadge: vi.fn(async (n?: number) => { calls.push(n ?? 0) }),
    clearAppBadge: vi.fn(async () => { calls.push('clear') }),
  }
  Object.defineProperty(navigator, 'setAppBadge', { value: nav.setAppBadge, configurable: true })
  Object.defineProperty(navigator, 'clearAppBadge', { value: nav.clearAppBadge, configurable: true })
  return { nav, calls }
}

let n = 0
beforeEach(() => {
  useDatabase(`badge-${Date.now()}-${n++}`)
  localStorage.removeItem(BADGE_KEY)
})
afterEach(() => {
  delete (navigator as unknown as Record<string, unknown>).setAppBadge
  delete (navigator as unknown as Record<string, unknown>).clearAppBadge
})

describe('the count', () => {
  it('is every open task Today lists: overdue, due, deadline and started, not the limit', () => {
    expect(todayCount(tasks, TODAY)).toBe(4)
  })

  it('covers the next days, with today\'s open tasks counted as overdue tomorrow', () => {
    const counts = badgeCounts(tasks, TODAY, 3)
    expect(counts).toEqual({ '2026-11-01': 4, '2026-11-02': 5, '2026-11-03': 5 })
  })
})

describe('the Badging API', () => {
  it('is supported only with both calls', () => {
    expect(badgeSupported(null)).toBe(false)
    expect(badgeSupported({ setAppBadge: async () => undefined })).toBe(false)
    expect(badgeSupported({ setAppBadge: async () => undefined, clearAppBadge: async () => undefined })).toBe(true)
  })

  it('sets the number, clears at zero and never throws when refused', async () => {
    const { nav, calls } = stubNavigator()
    await showBadge(3, nav)
    await showBadge(0, nav)
    expect(calls).toEqual([3, 'clear'])
    await expect(showBadge(2, { setAppBadge: async () => { throw new Error('no permission') }, clearAppBadge: async () => undefined })).resolves.toBeUndefined()
  })
})

function Badge({ list, today }: { list: Task[]; today: string }) {
  useAppBadge(list, true, today, 0, 'UTC')
  return null
}

describe('useAppBadge', () => {
  it('sets the badge live, stores the counts for the worker and clears at zero', async () => {
    const { calls } = stubNavigator()
    const r = await render(<Badge list={tasks} today={TODAY} />)
    await waitFor(() => calls.includes(4), 'badge 4')
    await waitFor(async () => (await db.meta.get(BADGE_META)) !== undefined, 'stored counts')
    const row = (await db.meta.get(BADGE_META))!.value as BadgeRow
    expect(row.dayStart).toBe(0)
    expect(row.counts[TODAY]).toBe(4)
    expect(Object.keys(row.counts)).toHaveLength(7)
    // Completing everything: the badge goes away.
    await r.rerender(<Badge list={[]} today={TODAY} />)
    await waitFor(() => calls.at(-1) === 'clear', 'cleared')
  })

  it('turned off: clears the badge, forgets the counts and stops setting it', async () => {
    const { calls } = stubNavigator()
    await db.meta.put({ key: BADGE_META, value: { dayStart: 0, counts: { [TODAY]: 2 } } })
    setBadgeEnabled(false)
    expect(localStorage.getItem(BADGE_KEY)).toBe('off')
    await waitFor(async () => (await db.meta.get(BADGE_META)) === undefined, 'row removed')
    await render(<Badge list={tasks} today={TODAY} />)
    expect(calls).toEqual(['clear'])
    setBadgeEnabled(true)
    expect(localStorage.getItem(BADGE_KEY)).toBeNull()
    await waitFor(() => calls.includes(4), 'on again')
  })

  it('sign-out clears the badge and the stored counts', async () => {
    const { calls } = stubNavigator()
    await db.meta.put({ key: BADGE_META, value: { dayStart: 0, counts: { [TODAY]: 2 } } })
    await clearBadge()
    expect(calls).toEqual(['clear'])
    expect(await db.meta.get(BADGE_META)).toBeUndefined()
  })
})

describe('the setting', () => {
  it('asks for notifications when they are not allowed', () => {
    const html = renderToStaticMarkup(<AppBadgeView on permission="default" onChange={() => {}} />)
    expect(html).toContain('App icon badge')
    expect(html).toContain('only once notifications are allowed')
    expect(renderToStaticMarkup(<AppBadgeView on permission="granted" onChange={() => {}} />)).not.toContain('only once notifications are allowed')
  })
})
