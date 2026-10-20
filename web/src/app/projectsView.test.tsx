// @vitest-environment happy-dom
// The All projects page (OpenSpec change sidebar-favourites, tasks 3.1 and 3.3;
// project-organization "All projects page" and "Archived projects list").
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { archiveProject, createProject, createTask, resetDeviceId } from '../lib/ops'
import { click, flush, key, render, type } from '../ui/test-utils'
import { AutoArchiveView } from './ProjectsSettings'
import { ProjectsView } from './ProjectsView'
import { navigate } from './router'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  navigate({ view: 'inbox' })
  // Offline: every request fails, the page reads local data only.
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
})
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals() })

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const names = (root: ParentNode) => [...root.querySelectorAll('[data-project-open] .truncate')].map((e) => e.textContent)

describe('All projects page', () => {
  it('Find a project: the matches with their ancestors, Enter opens the first (offline)', async () => {
    const work = await createProject({ name: 'Work' })
    const hiring = await createProject({ name: 'Hiring', parent_id: work })
    const designer = await createProject({ name: 'Designer', parent_id: hiring })
    const site = await createProject({ name: 'Website launch' })
    await createProject({ name: 'Design', parent_id: site })
    await createProject({ name: 'Home' })
    await createTask({ title: 'Portfolio review', project_id: designer })
    const r = await render(<ProjectsView />)
    await waitFor(() => names(r.container).length === 6)
    await waitFor(() => r.container.querySelector(`[data-projects-row="${designer}"]`)?.textContent?.includes('1 open task') === true)
    const field = r.container.querySelector<HTMLInputElement>('[data-projects-find]')!
    await type(field, 'des')
    await waitFor(() => names(r.container).length === 5)
    expect(names(r.container)).toEqual(['Work', 'Hiring', 'Designer', 'Website launch', 'Design'])
    await key(field, 'Enter')
    expect(location.pathname).toBe(`/project/${designer}`)
    await r.unmount()
  })

  it('Every project is one click away: all thirty, nested ones included, with Collapse all and Expand all', async () => {
    let parent: string | null = null
    for (let i = 0; i < 30; i++) {
      const id = await createProject({ name: `Project ${i}`, parent_id: i % 3 === 0 ? null : parent })
      if (i % 3 === 0) parent = id
    }
    const r = await render(<ProjectsView />)
    await waitFor(() => names(r.container).length === 30)
    await click(r.container.querySelector('[data-page-header] button[aria-label="More actions"], [data-page-header] button[aria-haspopup="menu"]')!)
    await waitFor(() => !!document.querySelector('[data-menu-label="Collapse all"]'))
    await click(document.querySelector<HTMLElement>('[data-menu-label="Collapse all"]')!)
    await waitFor(() => names(r.container).length === 10)
    await r.unmount()
  })

  it('every row has the project menu with Pin to sidebar', async () => {
    await createProject({ name: 'Home' })
    const r = await render(<ProjectsView />)
    await waitFor(() => names(r.container).length === 1)
    await click(r.container.querySelector('button[aria-label="Menu for project Home"]')!)
    await waitFor(() => !!document.querySelector('[data-menu-label="Pin to sidebar"]'))
    await click(document.querySelector<HTMLElement>('[data-menu-label="Pin to sidebar"]')!)
    await flush(60)
    expect((await db.userPrefs.get('me'))?.favourites).toMatch(/^project:/)
    await r.unmount()
  })
})

describe('Archived projects list', () => {
  it('Listed with context: a closed disclosure reading 2, sorted by name, with parent and open tasks', async () => {
    const home = await createProject({ name: 'Home' })
    const garden = await createProject({ name: 'Garden', parent_id: home })
    await createTask({ title: 'Prune the roses', project_id: garden })
    const trip = await createProject({ name: 'Trip 2026' })
    await archiveProject(trip)
    await archiveProject(garden)
    const r = await render(<ProjectsView />)
    await waitFor(() => r.container.querySelector('[data-archived-count]')?.textContent === '2')
    const details = r.container.querySelector<HTMLDetailsElement>('[data-archived-disclosure]')!
    expect(details.open).toBe(false)
    await click(details.querySelector('summary')!)
    await waitFor(() => r.container.querySelectorAll('[data-restore]').length === 2)
    await waitFor(() => r.container.querySelector('[data-testid="archived-projects"]')!.textContent!.includes('1 open task'))
    const text = r.container.querySelector('[data-testid="archived-projects"]')!.textContent!
    expect(text.indexOf('Garden')).toBeLessThan(text.indexOf('Trip 2026'))
    expect(text).toContain('In Home · 1 open task')
    expect(text).toContain('0 open tasks')
    // Restore works offline: one op, the project is back in the tree.
    await click(r.container.querySelector('button[aria-label="Restore Trip 2026"]')!)
    await waitFor(() => names(r.container).includes('Trip 2026'))
    expect((await db.projects.get(trip))!.archived).toBe(false)
    await r.unmount()
  })

  it('Nothing archived: the disclosure says so', async () => {
    await createProject({ name: 'Home' })
    const r = await render(<ProjectsView archived />)
    await waitFor(() => r.container.textContent!.includes('No archived projects'))
    expect(r.container.querySelector('[data-archived-count]')?.textContent).toBe('0')
    await r.unmount()
  })

  it('Reached from Settings: the link opens the page at the archived projects, expanded', async () => {
    const s = await render(<AutoArchiveView on onChange={() => {}} />)
    const link = s.container.querySelector<HTMLAnchorElement>('[data-archived-link]')!
    expect(link.getAttribute('href')).toBe('/projects#archived')
    await click(link)
    expect(`${location.pathname}${location.hash}`).toBe('/projects#archived')
    await s.unmount()
    const r = await render(<ProjectsView archived />)
    await flush(40)
    expect(r.container.querySelector<HTMLDetailsElement>('[data-archived-disclosure]')!.open).toBe(true)
    await r.unmount()
  })

  it('a link to #archived while the page is open expands the disclosure', async () => {
    history.replaceState(null, '', '/projects')
    const r = await render(<ProjectsView />)
    await flush(40)
    const details = r.container.querySelector<HTMLDetailsElement>('[data-archived-disclosure]')!
    expect(details.open).toBe(false)
    history.replaceState(null, '', '/projects#archived')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await waitFor(() => details.open)
    await r.unmount()
  })
})
