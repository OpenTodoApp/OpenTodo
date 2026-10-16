// @vitest-environment happy-dom
// The public page (OpenSpec change public-links, tasks 4.1 and 4.2): the route
// starts no sync, sections and subtasks, ticking with a refetch, read-only view
// links, offline keeps the list, a revoked link replaces it, axe.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicList } from '../lib/types'
import { click, flush, render } from '../ui/test-utils'
import { publicGroups, PublicListScreen } from './PublicListScreen'
import { parseRoute, routePath } from './router'

const list = (over: Partial<PublicList> = {}): PublicList => ({
  projectName: 'Groceries', projectColor: '#16a34a', rights: 'tick', serverTime: 1,
  sections: [{ id: 's1', name: 'Fruit', position: 2 }],
  tasks: [
    { id: 't1', title: 'Bread', due: { date: '2026-10-17' }, priority: 1, section_id: null, parent_id: null, position: 1, completed_at: null },
    { id: 't2', title: 'Apples', due: null, priority: 4, section_id: 's1', parent_id: null, position: 1, completed_at: null },
    { id: 't3', title: 'Green ones', due: null, priority: 4, section_id: 's1', parent_id: 't2', position: 1, completed_at: null },
    { id: 't4', title: 'Milk', due: null, priority: 4, section_id: null, parent_id: null, position: 2, completed_at: Date.now() - 3600_000 },
  ],
  ...over,
})
let calls: string[] = []
let current: PublicList | { error: string; status: number } | 'offline' = list()

beforeEach(() => {
  calls = []
  current = list()
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    expect(init?.credentials).toBe('omit')
    if (current === 'offline') throw new TypeError('Failed to fetch')
    if ('error' in current) return new Response(JSON.stringify({ error: { code: current.error, message: current.error } }), { status: current.status })
    if (init?.method === 'POST') {
      const { taskId, completed } = JSON.parse(String(init.body))
      current = { ...current, tasks: current.tasks.map((t) => (t.id === taskId ? { ...t, completed_at: completed ? Date.now() : null } : t)) }
      return new Response(JSON.stringify({ taskId, completed_at: completed ? Date.now() : null }), { status: 200 })
    }
    return new Response(JSON.stringify(current), { status: 200 })
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

describe('public page', () => {
  it('parses /public/<secret> and groups sections with subtasks under their parent', () => {
    expect(parseRoute('/public/otl_abc')).toEqual({ view: 'public', token: 'otl_abc' })
    expect(routePath({ view: 'public', token: 'otl_abc' })).toBe('/public/otl_abc')
    expect(publicGroups(list()).map((g) => [g.name, g.rows.map((r) => `${r.task.title}:${r.depth}`)])).toEqual([
      [null, ['Bread:0', 'Milk:0']],
      ['Fruit', ['Apples:0', 'Green ones:1']],
    ])
  })

  it('shows the notice, checkboxes and recently completed tasks ticked; a tick posts and refetches', async () => {
    const r = await render(<PublicListScreen token="otl_abc" />)
    await waitFor(() => r.container.querySelectorAll('[data-public-task]').length === 4)
    expect(r.container.textContent).toContain('anyone with the link can see it and tick items')
    expect(r.container.querySelector('[data-public-task="t4"]')!.hasAttribute('data-done')).toBe(true)
    const box = r.container.querySelector<HTMLInputElement>('[data-public-task="t1"] input[type="checkbox"]')!
    await click(box)
    await waitFor(() => calls.includes('POST /api/v1/public/otl_abc/tick'))
    await waitFor(() => calls.filter((c) => c.startsWith('GET')).length >= 2)
    expect(r.container.querySelector('[data-public-task="t1"]')!.hasAttribute('data-done')).toBe(true)
    expect(r.container.querySelector('[data-public-updated]')!.textContent).toMatch(/^Updated /)

    const axe = (await import('axe-core')).default
    const res = await axe.run(r.container, { rules: { 'color-contrast': { enabled: false } } })
    expect(res.violations.map((v) => v.id)).toEqual([])
    await r.unmount()
  })

  it('has no checkboxes on a view link', async () => {
    current = list({ rights: 'view' })
    const r = await render(<PublicListScreen token="otl_view" />)
    await waitFor(() => r.container.querySelectorAll('[data-public-task]').length === 4)
    expect(r.container.querySelector('input[type="checkbox"]')).toBeNull()
    expect(r.container.textContent).toContain('read-only')
    await r.unmount()
  })

  it('keeps the list offline and replaces it when the link is revoked', async () => {
    const r = await render(<PublicListScreen token="otl_abc" />)
    await waitFor(() => r.container.querySelectorAll('[data-public-task]').length === 4)
    current = 'offline'
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => r.container.textContent!.includes('Could not refresh'))
    expect(r.container.querySelectorAll('[data-public-task]').length).toBe(4)
    current = { error: 'link_invalid', status: 404 }
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => r.container.querySelector('[data-public-invalid]') !== null)
    expect(r.container.querySelector('[data-public-task]')).toBeNull()
    await r.unmount()
  })
})

// OpenSpec display-mode, task 5.1 ("Public link display").
describe('public page on a display', () => {
  afterEach(() => {
    history.replaceState(null, '', '/')
    document.documentElement.removeAttribute('data-contrast')
    document.documentElement.removeAttribute('data-motion')
  })

  it('display=1&eink=1 renders large type in high contrast with a clock without seconds and the public notice; a tick still posts', async () => {
    history.replaceState(null, '', '/public/otl_abc?display=1&eink=1&size=xl')
    const r = await render(<PublicListScreen token="otl_abc" />)
    await waitFor(() => r.container.querySelectorAll('[data-display-row]').length === 4)
    const screen = r.container.querySelector('[data-screen="public/display"]')!
    expect(screen.classList.contains('display-root')).toBe(true)
    expect(screen.getAttribute('data-size')).toBe('xl')
    expect(document.documentElement.getAttribute('data-contrast')).toBe('high')
    expect(document.documentElement.getAttribute('data-motion')).toBe('none')
    expect(r.container.querySelector('[data-clock-time]')!.textContent).toMatch(/^\d{1,2}:\d{2}( [AP]M)?$/)
    expect(r.container.textContent).toContain('anyone with the link can see it and tick items')
    expect(r.container.querySelector('h1')!.textContent).toBe('Groceries')
    await click(r.container.querySelector('[data-display-row$=":t1"] [data-display-check]')!)
    await waitFor(() => calls.includes('POST /api/v1/public/otl_abc/tick'))
    await waitFor(() => r.container.querySelector('[data-display-row$=":t1"]')!.hasAttribute('data-done'))

    const axe = (await import('axe-core')).default
    const res = await axe.run(r.container, { rules: { 'color-contrast': { enabled: false } } })
    expect(res.violations.map((v) => v.id)).toEqual([])
    await r.unmount()
    expect(document.documentElement.hasAttribute('data-contrast')).toBe(false)
  })

  it('a view link on a display has no checkboxes', async () => {
    current = list({ rights: 'view' })
    history.replaceState(null, '', '/public/otl_view?display=1')
    const r = await render(<PublicListScreen token="otl_view" />)
    await waitFor(() => r.container.querySelectorAll('[data-display-row]').length === 4)
    expect(r.container.querySelector('[data-display-check]')).toBeNull()
    expect(r.container.textContent).toContain('read-only')
    await r.unmount()
  })

  it('without display=1 the page renders as before, at its normal size', async () => {
    history.replaceState(null, '', '/public/otl_abc?eink=1')
    const r = await render(<PublicListScreen token="otl_abc" />)
    await waitFor(() => r.container.querySelectorAll('[data-public-task]').length === 4)
    expect(r.container.querySelector('[data-screen="public/list"]')).toBeTruthy()
    expect(r.container.querySelector('.display-root, [data-clock-time]')).toBeNull()
    expect(document.documentElement.hasAttribute('data-contrast')).toBe(false)
    await r.unmount()
  })
})

describe('public route in the app', () => {
  it('renders before sign-in and never starts sync, even for a signed-in visitor', async () => {
    vi.resetModules()
    const startSync = vi.fn()
    vi.doMock('../lib/sync', async (orig) => ({ ...(await orig<typeof import('../lib/sync')>()), startSync }))
    history.pushState(null, '', '/public/otl_abc')
    const me = { id: 'u1', email: 'me@example.com', name: 'Me', role: 'owner', createdAt: 1 }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/v1/auth/status')) return new Response(JSON.stringify({ authenticated: true, user: me, setupRequired: false, signupAllowed: false, version: 'test' }), { status: 200 })
      if (String(url).includes('/api/v1/public/')) return new Response(JSON.stringify(list()), { status: 200 })
      return new Response('{}', { status: 404 })
    }))
    const { App } = await import('./App')
    const r = await render(<App />)
    await waitFor(() => r.container.querySelectorAll('[data-public-task]').length === 4)
    await flush(100)
    expect(startSync).not.toHaveBeenCalled()
    await r.unmount()
    vi.doUnmock('../lib/sync')
    history.pushState(null, '', '/')
  })
})
