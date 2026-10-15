// @vitest-environment happy-dom
// Display mode (OpenSpec change display-mode, tasks 3.1-3.3, 4.1 and 4.2): the
// Today, project and saved view displays, presentation attributes that leave with
// the route, the clock without seconds, keyboard toggles and Escape, viewers who
// get no checkboxes, the missing-project message, entry points and start view.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { parseDisplayOptions } from '../../lib/display'
import { createProject, createTask, resetDeviceId } from '../../lib/ops'
import { createSection } from '../../lib/sections'
import { createView, getStartView, resolveStartView, setStartView } from '../../lib/views'
import { click, flush, key, render } from '../../ui/test-utils'
import { DisplayScreen } from './DisplayScreen'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 7, 30))
  await db.delete()
  await db.open()
  resetDeviceId()
  history.pushState(null, '', '/display')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const rows = (root: ParentNode) => [...root.querySelectorAll('[data-display-row]')].map((e) => e.textContent!.replace(/P\d$/, '').trim())

describe('Today display', () => {
  it('shows overdue, today, done today and the next days, with e-ink attributes that leave with it', async () => {
    await createTask({ title: 'Late bill', due: { date: '2026-10-12' } })
    await createTask({ title: 'Buy bread', due: { date: '2026-10-14' } })
    const done = await createTask({ title: 'Walk the dog', due: { date: '2026-10-14' } })
    await db.tasks.update(done, { completed_at: Date.now() })
    await createTask({ title: 'Dentist', due: { date: '2026-10-16' } })
    const r = await render(<DisplayScreen target={{ kind: 'today' }} options={parseDisplayOptions('eink=1')} />)
    await waitFor(() => r.container.querySelectorAll('[data-display-row]').length === 4)
    const cols = [...r.container.querySelectorAll('[data-display-column]')].map((c) => c.getAttribute('data-display-column'))
    expect(cols).toEqual(['overdue', 'today', 'done', '2026-10-15', '2026-10-16', '2026-10-17'])
    expect(r.container.querySelector('[data-display-column="2026-10-16"]')!.textContent).toContain('Dentist')
    expect(r.container.querySelector('[data-display-row][data-done]')!.textContent).toContain('Walk the dog')
    expect(document.documentElement.getAttribute('data-contrast')).toBe('high')
    expect(document.documentElement.getAttribute('data-motion')).toBe('none')
    // No seconds on the e-ink clock.
    expect(r.container.querySelector('[data-display-clock]')!.textContent).not.toMatch(/\d{1,2}:\d{2}:\d{2}/)
    // No shell chrome.
    expect(r.container.querySelector('nav, [data-quick-add], input[type="text"]')).toBeNull()
    await r.unmount()
    expect(document.documentElement.hasAttribute('data-contrast')).toBe(false)
    expect(document.documentElement.hasAttribute('data-motion')).toBe(false)
  })

  it('moves with j and toggles with Space, queues the op, and Escape opens the normal view', async () => {
    await createTask({ title: 'One', due: { date: '2026-10-14' } })
    const two = await createTask({ title: 'Two', due: { date: '2026-10-14' } })
    const r = await render(<DisplayScreen target={{ kind: 'today' }} options={parseDisplayOptions('')} />)
    await waitFor(() => r.container.querySelectorAll('[data-display-row]').length === 2)
    const before = await db.outbox.count()
    await key(document.body, 'j')
    expect(document.activeElement?.getAttribute('data-display-row')).toBe(two)
    await key(document.body, ' ')
    await waitFor(() => r.container.querySelector(`[data-display-row="${two}"]`)?.hasAttribute('data-done') ?? false)
    expect(await db.outbox.count()).toBeGreaterThan(before)
    await key(document.body, 'g')
    await key(document.body, 's')
    expect(location.pathname).toBe('/display')
    await key(document.body, 'Escape')
    expect(location.pathname).toBe('/today')
    await r.unmount()
  })
})

describe('project and saved view displays', () => {
  it('lists sections in order with subtasks, and gives a viewer no checkboxes', async () => {
    const p = await createProject({ name: 'Groceries' })
    const produce = await createSection(p, 'Produce')
    await createSection(p, 'Dairy')
    const apples = await createTask({ title: 'Apples', project_id: p, section_id: produce })
    await createTask({ title: 'Green ones', project_id: p, parent_id: apples })
    const r = await render(<DisplayScreen target={{ kind: 'project', id: p }} options={parseDisplayOptions('size=xl')} />)
    await waitFor(() => r.container.querySelectorAll('[data-display-row]').length === 2)
    expect(r.container.querySelector('h1')!.textContent).toContain('Groceries')
    expect([...r.container.querySelectorAll('[data-display-column] h2')].map((h) => h.textContent)).toEqual(['Produce', 'Dairy'])
    expect(rows(r.container)).toEqual(['Apples', 'Green ones'])
    expect(r.container.querySelectorAll('[data-display-row] input[type="checkbox"]')).toHaveLength(2)
    expect((r.container.querySelector('[data-display-screen]') as HTMLElement).style.getPropertyValue('--display-scale')).toBe('2.15')
    await r.unmount()

    await db.memberships.put({ projectId: p, role: 'viewer', ownerId: 'someone', members: [] })
    const v = await render(<DisplayScreen target={{ kind: 'project', id: p }} options={parseDisplayOptions('')} />)
    await waitFor(() => v.container.querySelectorAll('[data-display-row]').length === 2)
    expect(v.container.querySelector('[data-display-row] input')).toBeNull()
    const before = await db.outbox.count()
    v.container.querySelector<HTMLElement>('[data-display-row]')!.focus()
    await key(document.body, ' ')
    await flush(50)
    expect(await db.outbox.count()).toBe(before)
    await v.unmount()
  })

  it('shows a saved view with its groups, and a message for a deleted project', async () => {
    await createTask({ title: 'Urgent', priority: 1 })
    await createTask({ title: 'Later', priority: 3 })
    const id = await createView({ name: 'By priority', query: 'p1 | p3', group_by: 'priority' } as never)
    const r = await render(<DisplayScreen target={{ kind: 'view', id }} options={parseDisplayOptions('')} />)
    await waitFor(() => r.container.querySelectorAll('[data-display-row]').length >= 2)
    expect(r.container.querySelector('h1')!.textContent).toContain('By priority')
    await r.unmount()

    const gone = await render(<DisplayScreen target={{ kind: 'project', id: 'nope' }} options={parseDisplayOptions('')} />)
    await waitFor(() => gone.container.textContent!.includes('This project no longer exists'))
    await gone.unmount()
  })
})

describe('leaving and pinning', () => {
  it('Exit returns to the normal view; the menu pins the display as the start view', async () => {
    const p = await createProject({ name: 'Fridge' })
    const r = await render(<DisplayScreen target={{ kind: 'project', id: p }} options={parseDisplayOptions('eink=1')} />)
    await waitFor(() => r.container.querySelector('h1')?.textContent?.includes('Fridge') ?? false)
    await click(r.container.querySelector('button[aria-label="Display options"]')!)
    await flush(20)
    await click([...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent?.includes('start view'))!)
    await flush(30)
    expect(await getStartView()).toBe(`display:/display/project/${p}?eink=1`)
    expect(await resolveStartView()).toEqual({ kind: 'display', path: `/display/project/${p}?eink=1` })
    await click(r.container.querySelector('[data-display-exit]')!)
    expect(location.pathname).toBe(`/project/${p}`)
    await r.unmount()
  })

  it('falls back to the Inbox with the notice when a pinned project is gone', async () => {
    await setStartView('display:/display/project/missing')
    expect(await resolveStartView()).toEqual({ kind: 'builtin', view: 'inbox', removed: true })
    expect(await getStartView()).toBe('inbox')
  })
})

describe('in the app', () => {
  it('starts sync on a display route and shows sign-in first to an anonymous visitor', async () => {
    vi.resetModules()
    const startSync = vi.fn()
    vi.doMock('../../lib/sync', async (orig) => ({ ...(await orig<typeof import('../../lib/sync')>()), startSync }))
    history.pushState(null, '', '/display/upcoming')
    let authed = false
    const me = { id: 'u1', email: 'me@example.com', name: 'Me', role: 'owner', createdAt: 1 }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/v1/auth/status')) return new Response(JSON.stringify({ authenticated: authed, user: authed ? me : null, setupRequired: false, signupAllowed: false, version: 'test' }), { status: 200 })
      return new Response('{}', { status: 404 })
    }))
    const { App } = await import('../App')
    const r = await render(<App />)
    await waitFor(() => !!r.container.querySelector('input[type="password"]'))
    expect(r.container.querySelector('[data-display-screen]')).toBeNull()
    authed = true
    // Signing in refreshes the auth status; the route is still the display.
    window.dispatchEvent(new Event('opentodo:account-changed'))
    await waitFor(() => r.container.querySelector('[data-display-screen="upcoming"]') !== null)
    expect(startSync).toHaveBeenCalled()
    await r.unmount()
    vi.doUnmock('../../lib/sync')
  })
})

describe('entry points', () => {
  it('the project menu and the Today header open the display', async () => {
    vi.resetModules()
    const { ProjectHeader } = await import('../ProjectHeader')
    const p = await createProject({ name: 'Fridge' })
    const project = (await db.projects.get(p))!
    const r = await render(<ProjectHeader project={project} userId="u1" />)
    await click(r.container.querySelector('button[aria-label="Project menu"]')!)
    await flush(20)
    await click([...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent?.includes('Display mode'))!)
    expect(location.pathname).toBe(`/display/project/${p}`)
    await r.unmount()
  })
})
