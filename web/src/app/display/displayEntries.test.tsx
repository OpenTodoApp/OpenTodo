// @vitest-environment happy-dom
// Entering and leaving display mode (OpenSpec change display-mode, task 4.1): the
// Today and Upcoming headers, a project's header menu and a saved view's menu open
// the matching display; Exit returns to the normal view; the overflow menu pins
// the display as this device's start view.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createProject, resetDeviceId } from '../../lib/ops'
import type { Project, View } from '../../lib/types'
import { getStartView } from '../../lib/views'
import { click, flush, render } from '../../ui/test-utils'
import { ProjectHeader } from '../ProjectHeader'
import { TaskListView } from '../TaskListView'
import { ViewMenu, viewMenuGroups } from '../ViewsView'
import { DEFAULT_DISPLAY_OPTIONS } from './displayOptions'
import { DisplayScreen } from './DisplayScreen'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  history.replaceState(null, '', '/')
  window.dispatchEvent(new PopStateEvent('popstate'))
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const menuItem = (label: string) => [...document.querySelectorAll<HTMLElement>('[data-menu-label]')].find((e) => e.getAttribute('data-menu-label') === label)

describe('entering display mode', () => {
  it('Today and Upcoming offer Display mode in the header', async () => {
    for (const view of ['today', 'upcoming'] as const) {
      const r = await render(<TaskListView route={{ view }} />)
      await waitFor(() => !!r.container.querySelector('[data-page-header] [data-display-mode]'))
      await click(r.container.querySelector('[data-display-mode]')!)
      expect(location.pathname).toBe(`/display/${view}`)
      expect(location.search).toBe('')
      await r.unmount()
    }
    const inbox = await render(<TaskListView route={{ view: 'inbox' }} />)
    await flush(40)
    expect(inbox.container.querySelector('[data-display-mode]')).toBeNull()
    await inbox.unmount()
  })

  it('a project header menu opens /display/project/<id>', async () => {
    const project = { id: 'home', name: 'Home', color: '#22c55e', position: 1, archived: false, parent_id: null, created_at: 0, deleted_at: null, _clock: {} } as Project
    await db.projects.put(project)
    const r = await render(<ProjectHeader project={project} />)
    await flush(40)
    await click(r.container.querySelector('button[aria-label="Project menu"]')!)
    await waitFor(() => !!menuItem('Display mode'))
    await click(menuItem('Display mode')!)
    expect(location.pathname).toBe('/display/project/home')
    await r.unmount()
  })

  it('a saved view menu opens /display/view/<id>; dashboards do not offer it', async () => {
    const view = { id: 'v1', name: 'Deep work', kind: 'list', query: 'p1', panels: [], pinned: true, position: 1, created_at: 0, deleted_at: null, _clock: {} } as unknown as View
    await db.views.put(view)
    const r = await render(<ViewMenu view={view} />)
    await flush(30)
    await click(r.container.querySelector('button[aria-label="Menu for view Deep work"]')!)
    await waitFor(() => !!menuItem('Display mode'))
    await click(menuItem('Display mode')!)
    expect(location.pathname).toBe('/display/view/v1')
    await r.unmount()
    const noop = () => undefined
    const actions = { rename: noop, move: noop, pin: noop, startView: noop, remove: noop, display: noop }
    expect(viewMenuGroups({ ...view, kind: 'dashboard' } as View, [view], false, actions).flatMap((g) => g.items).some((i) => i.id === 'display')).toBe(false)
  })
})

describe('leaving display mode', () => {
  it('Exit returns to the normal project view', async () => {
    const p = await createProject({ name: 'Groceries' })
    const r = await render(<DisplayScreen route={{ view: 'display', target: { kind: 'project', id: p }, options: DEFAULT_DISPLAY_OPTIONS }} />)
    await waitFor(() => r.container.querySelector('h1')?.textContent === 'Groceries')
    const exit = r.container.querySelector<HTMLButtonElement>('[data-display-exit]')!
    expect(exit.className).toContain('min-h-11')
    await click(exit)
    expect(location.pathname).toBe(`/project/${p}`)
    await r.unmount()
  })

  it('the overflow menu makes this display the start view on this device, with its options', async () => {
    const r = await render(<DisplayScreen route={{ view: 'display', target: { kind: 'today' }, options: { ...DEFAULT_DISPLAY_OPTIONS, contrast: 'high', motion: 'none', seconds: false } }} />)
    await flush(40)
    await click(r.container.querySelector('button[aria-label="Display options"]')!)
    await waitFor(() => !!menuItem('Make this the start view on this device'))
    await click(menuItem('Make this the start view on this device')!)
    await flush(40)
    expect(await getStartView()).toBe('display:/display/today?eink=1')
    await r.unmount()
  })
})
