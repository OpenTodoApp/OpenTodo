// @vitest-environment happy-dom
// Settings → Integrations → Calendar feeds (OpenSpec change calendar-feeds, task
// 7.1): the member state without the switch, a failing row, the feed URL shown
// once, and Delete confirming before the API call.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import type { CalendarSubscription } from '../lib/types'
import { click, flush, render } from '../ui/test-utils'
import { CalendarFeedsPanel, subscriptionStatus } from './CalendarFeedsPanel'

const NOW = new Date(2026, 9, 14, 12, 0).getTime()
const failing: CalendarSubscription = {
  id: 's1', url: 'https://cal.example.com/a.ics', name: 'Work', color: '#2563eb', enabled: true,
  lastSuccessAt: NOW - 2 * 3600_000, lastError: 'timed out',
}
let calls: string[] = []

function serve(routes: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${new URL(url, 'http://x').pathname}`
    calls.push(key)
    if (key in routes) {
      const body = routes[key]
      return body === null ? new Response(null, { status: 204 }) : new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ error: { code: 'not_found', message: 'not found' } }), { status: 404 })
  }))
}

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await db.delete()
  await db.open()
  calls = []
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('calendar feeds panel', () => {
  it('tells a member the owner has not enabled it, with no actions', async () => {
    serve({ 'GET /api/v1/settings/calendar-feeds': { enabled: false } })
    const r = await render(<CalendarFeedsPanel isOwner={false} />)
    await waitFor(() => r.container.textContent!.includes('The owner has not enabled calendar feeds'))
    expect(r.container.querySelector('[role="switch"]')).toBeNull()
    expect([...r.container.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Add calendar')
    await r.unmount()
  })

  it('shows a failing row with its error and last success, and asks before deleting', async () => {
    serve({
      'GET /api/v1/settings/calendar-feeds': { enabled: true },
      'GET /api/v1/calendar-feeds/subscriptions': { subscriptions: [failing] },
      'GET /api/v1/calendar-feeds/feed': { feed: null },
      'DELETE /api/v1/calendar-feeds/subscriptions/s1': null,
    })
    const r = await render(<CalendarFeedsPanel isOwner />)
    await waitFor(() => r.container.querySelector('[data-subscription-status="s1"]') !== null)
    expect(r.container.querySelector('[data-subscription-status="s1"]')!.textContent).toBe('Failed: timed out · last success 2 h ago')

    await click(r.container.querySelector('button[aria-label="Actions for Work"]')!)
    await flush(20)
    await click([...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent?.includes('Delete'))!)
    await waitFor(() => document.querySelector('[role="alertdialog"], [role="dialog"]') !== null)
    expect(document.body.textContent).toContain('disappear from Day and Week on every device')
    expect(calls).not.toContain('DELETE /api/v1/calendar-feeds/subscriptions/s1')
    await click([...document.querySelectorAll('[role="alertdialog"] button, [role="dialog"] button')].find((b) => b.textContent === 'Delete')!)
    await waitFor(() => calls.includes('DELETE /api/v1/calendar-feeds/subscriptions/s1'))
    await waitFor(() => r.container.querySelector('[data-subscription-status="s1"]') === null)
    await r.unmount()
  })

  it('shows the feed URL once after creating it', async () => {
    serve({
      'GET /api/v1/settings/calendar-feeds': { enabled: true },
      'GET /api/v1/calendar-feeds/subscriptions': { subscriptions: [] },
      'GET /api/v1/calendar-feeds/feed': { feed: null },
      'POST /api/v1/calendar-feeds/feed': { feed: { createdAt: NOW, lastUsedAt: null }, url: 'https://todo.example.com/feeds/secret123/tasks.ics' },
    })
    const r = await render(<CalendarFeedsPanel isOwner />)
    await waitFor(() => [...r.container.querySelectorAll('button')].some((b) => b.textContent === 'Create feed URL'))
    await click([...r.container.querySelectorAll('button')].find((b) => b.textContent === 'Create feed URL')!)
    await waitFor(() => document.querySelector('[data-testid="calendar-feed-url"]') !== null)
    expect(document.body.textContent).toContain('secret123')
    expect(document.body.textContent).toContain('Google Calendar')
    await click([...document.querySelectorAll('[data-testid="calendar-feed-url"] button')].find((b) => b.textContent === 'Done')!)
    await waitFor(() => document.querySelector('[data-testid="calendar-feed-url"]') === null)
    expect(document.body.textContent).not.toContain('secret123')
    expect(r.container.textContent).toContain('never used')
    await r.unmount()
  })

  it('keeps the last loaded list offline with actions disabled', async () => {
    await db.calendarSubscriptions.put({ ...failing, lastError: undefined })
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    serve({})
    const r = await render(<CalendarFeedsPanel isOwner />)
    await waitFor(() => r.container.textContent!.includes('A connection is required'))
    expect(r.container.textContent).toContain('Work')
    expect([...r.container.querySelectorAll('button')].find((b) => b.textContent === 'Add calendar')!.hasAttribute('disabled')).toBe(true)
    vi.restoreAllMocks()
    await r.unmount()
  })

  it('words a disabled and a waiting subscription', () => {
    expect(subscriptionStatus({ ...failing, enabled: false, stoppedReason: 'the address was not found (404)' }, NOW)).toBe('Stopped: the address was not found (404)')
    expect(subscriptionStatus({ ...failing, lastError: undefined, lastSuccessAt: null }, NOW)).toBe('Waiting for the first refresh')
    expect(subscriptionStatus({ ...failing, lastError: undefined, lastSuccessAt: NOW - 5 * 60_000 }, NOW)).toBe('Refreshed 5 min ago')
  })
})
