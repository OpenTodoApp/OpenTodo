// @vitest-environment happy-dom
// Settings → Integrations → Calendar sync (OpenSpec change calendar-two-way, task
// 4.2): the member state without the switch, the cards' states, connecting a
// CalDAV account and choosing its calendars, Delete confirming before the API
// call, and the message a Google sign-in leaves in the address.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import type { CalendarConnection } from '../lib/types'
import { click, render, type, waitFor } from '../ui/test-utils'
import { CalendarSyncPanel, googleResultText, syncStateLine } from './CalendarSyncPanel'

const NOW = new Date(2026, 9, 26, 12, 0).getTime()
const base: CalendarConnection = {
  id: 'c1', provider: 'caldav', name: 'Fastmail', server_url: 'https://caldav.fastmail.com', username: 'me@example.com',
  calendars: [{ url: 'https://caldav.fastmail.com/cal/work/', name: 'Work', color: '#3366CC', read_only: false },
    { url: 'https://caldav.fastmail.com/cal/family/', name: 'Family', color: '#FF0000', read_only: false },
    { url: 'https://caldav.fastmail.com/cal/holidays/', name: 'Holidays', color: '', read_only: true }],
  target: 'https://caldav.fastmail.com/cal/work/', read: [], include_date_only: false, enabled: true, state: 'ok',
  next_sync_at: NOW, last_sync_at: NOW - 120_000, last_success_at: NOW - 120_000, last_error: '', last_error_at: null,
  stopped_reason: '', last_run: { moved: 1, renamed: 0, unscheduled: 0, written: 3, removed: 1, conflicts: 0, refused: 0, partial: false },
  password_set: true, event_count: 12, created_at: NOW, updated_at: NOW,
}
let calls: { key: string; body: unknown }[] = []

function serve(routes: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${new URL(url, 'http://x').pathname}`
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (key in routes) {
      const body = typeof routes[key] === 'function' ? (routes[key] as () => unknown)() : routes[key]
      return body === null ? new Response(null, { status: 204 }) : new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ error: { code: 'not_found', message: 'not found' } }), { status: 404 })
  }))
}

const keys = () => calls.map((c) => c.key)


const button = (root: ParentNode, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === text)

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
})

describe('calendar sync panel', () => {
  it('tells a member the owner has not enabled it, with no actions', async () => {
    serve({ 'GET /api/v1/settings/calendar-sync': { enabled: false, google: false, max_connections: 3 } })
    const r = await render(<CalendarSyncPanel isOwner={false} />)
    await waitFor(() => r.container.textContent!.includes('The owner has not enabled calendar sync'))
    expect(r.container.querySelector('[role="switch"]')).toBeNull()
    expect(button(r.container, 'Connect CalDAV')).toBeUndefined()
    await r.unmount()
  })

  it('leads each card with its state and asks before deleting', async () => {
    const reconnect: CalendarConnection = { ...base, id: 'c2', name: 'Google', provider: 'google', state: 'reconnect', stopped_reason: 'unauthorized' }
    serve({
      'GET /api/v1/settings/calendar-sync': { enabled: true, google: true, max_connections: 3 },
      'GET /api/v1/calendar-sync/connections': { connections: [base, reconnect] },
      'GET /api/v1/settings/calendar-sync/google': { client_id: 'cid', secret_set: true, from_env: false, redirect_uri: 'https://todo.example/api/v1/calendar-sync/google/callback' },
      'DELETE /api/v1/calendar-sync/connections/c1': null,
      'GET /api/v1/calendar-feeds/events': { events: [], subscriptions: [] },
    })
    const r = await render(<CalendarSyncPanel isOwner />)
    await waitFor(() => r.container.querySelector('[data-calendar-connection="c2"]') !== null)
    const card = r.container.querySelector('[data-calendar-connection="c1"]')!
    expect(card.textContent).toContain('Synced 2 min ago')
    expect(card.textContent).toContain('Tasks go to Work')
    expect(card.textContent).toContain('3 events written')
    const google = r.container.querySelector('[data-calendar-connection="c2"]')!
    expect(google.textContent).toContain('refused the password or the Google grant')
    expect(button(google, 'Reconnect')).toBeDefined()
    expect(button(r.container, 'Connect Google')).toBeDefined()

    await click(r.container.querySelector('button[aria-label="Actions for Fastmail"]')!)
    await waitFor(() => [...document.querySelectorAll('[role="menuitem"]')].some((e) => e.textContent?.includes('Delete')), 'the actions menu')
    await click([...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent?.includes('Delete'))!)
    await waitFor(() => document.body.textContent!.includes('12 events already written stay in the calendar'))
    expect(keys()).not.toContain('DELETE /api/v1/calendar-sync/connections/c1')
    await click([...document.querySelectorAll('[role="alertdialog"] button, [role="dialog"] button')].find((b) => b.textContent === 'Delete')!)
    await waitFor(() => keys().includes('DELETE /api/v1/calendar-sync/connections/c1'))
    await waitFor(() => r.container.querySelector('[data-calendar-connection="c1"]') === null)
    await r.unmount()
  })

  it('connects a CalDAV account and then asks for its calendars', async () => {
    const created: CalendarConnection = { ...base, state: 'choose_calendar', target: '', last_run: null, last_success_at: null }
    serve({
      'GET /api/v1/settings/calendar-sync': { enabled: true, google: false, max_connections: 3 },
      'GET /api/v1/calendar-sync/connections': { connections: [] },
      'GET /api/v1/settings/calendar-sync/google': { client_id: '', secret_set: false, from_env: false, redirect_uri: 'x' },
      'POST /api/v1/calendar-sync/connections': { connection: created },
      'PATCH /api/v1/calendar-sync/connections/c1': { connection: { ...base, state: 'pending' } },
      'GET /api/v1/calendar-feeds/events': { events: [], subscriptions: [] },
    })
    const r = await render(<CalendarSyncPanel isOwner={false} />)
    await waitFor(() => button(r.container, 'Connect CalDAV') !== undefined)
    expect(button(r.container, 'Connect Google')).toBeUndefined()
    await click(button(r.container, 'Connect CalDAV')!)
    await waitFor(() => document.querySelector('[data-testid="caldav-connect"]') !== null)
    const form = document.querySelector('[data-testid="caldav-connect"]')!
    await type(form.querySelector('input[aria-label="Server"]')!, 'caldav.fastmail.com')
    await type(form.querySelector('input[aria-label="Username"]')!, 'me@example.com')
    await type(form.querySelector('input[aria-label="App password"]')!, 'app-pass')
    await click(button(form, 'Find calendars')!)
    await waitFor(() => document.querySelector('[data-testid="calendar-choice"]') !== null)
    expect(calls.find((c) => c.key === 'POST /api/v1/calendar-sync/connections')!.body).toEqual({ server_url: 'caldav.fastmail.com', username: 'me@example.com', password: 'app-pass' })
    const choice = document.querySelector('[data-testid="calendar-choice"]')!
    // The first writable calendar is proposed; the read-only one is never offered as the target.
    expect(choice.querySelector('[data-target-calendar]')!.textContent).toBe('Work')
    await click(choice.querySelector('[role="switch"]')!)
    await click(button(choice, 'Save')!)
    await waitFor(() => keys().includes('PATCH /api/v1/calendar-sync/connections/c1'))
    expect(calls.find((c) => c.key === 'PATCH /api/v1/calendar-sync/connections/c1')!.body).toEqual({ target: base.target, read: [], include_date_only: true })
    await waitFor(() => document.querySelector('[data-testid="calendar-choice"]') === null)
    await r.unmount()
  })

  it('shows what a Google sign-in returned and cleans the address', async () => {
    window.history.replaceState(null, '', '/settings/integrations/calendar-sync?calendar-sync=denied')
    serve({
      'GET /api/v1/settings/calendar-sync': { enabled: true, google: true, max_connections: 3 },
      'GET /api/v1/calendar-sync/connections': { connections: [] },
    })
    const r = await render(<CalendarSyncPanel isOwner={false} />)
    await waitFor(() => r.container.textContent!.includes('the permission was not granted'))
    expect(window.location.search).toBe('')
    await r.unmount()
  })
})

describe('calendar sync texts', () => {
  it('words the states and the Google results', () => {
    expect(syncStateLine({ ...base, state: 'choose_calendar' }, NOW)).toBe('Choose the calendar to write tasks into.')
    expect(syncStateLine({ ...base, state: 'failed', last_error: 'timeout' }, NOW)).toBe('The calendar server did not answer in time. · last success 2 min ago')
    expect(syncStateLine({ ...base, state: 'stopped', stopped_reason: 'calendar_missing' }, NOW)).toContain('no longer exists')
    expect(googleResultText('connected')).toBeNull()
    expect(googleResultText('invalid_state')).toContain('sign-in expired')
  })
})
