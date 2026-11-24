// @vitest-environment happy-dom
// The All projects page (OpenSpec change sidebar-favourites, tasks 3.1 and 3.3;
// project-organization "All projects page" and "Archived projects list").
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { archiveProject, createProject, createTask, resetDeviceId } from '../lib/ops'
import { click, key, render, type, waitFor } from '../ui/test-utils'
import { AutoArchiveView } from './ProjectsSettings'
import { ProjectsView } from './ProjectsView'
import { navigate } from './router'
import { BulkConfirmHost } from './bulk/BulkConfirmHost'
import { act } from 'react'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  navigate({ view: 'inbox' })
  // Offline: every request fails, the page reads local data only.
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
})
afterEach(() => { vi.unstubAllGlobals() })

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
    await waitFor(async () => !!(await db.userPrefs.get('me'))?.favourites, 'the pinned favourite')
    expect((await db.userPrefs.get('me'))?.favourites).toMatch(/^project:/)
    await r.unmount()
  })
})


const archivedTab = (root: ParentNode) => [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent!.startsWith('Archived'))!

describe('Archived projects list', () => {
  it('Listed with context: an Archived tab reading 2, sorted by name, with parent and open tasks', async () => {
    const home = await createProject({ name: 'Home' })
    const garden = await createProject({ name: 'Garden', parent_id: home })
    await createTask({ title: 'Prune the roses', project_id: garden })
    const trip = await createProject({ name: 'Trip 2026' })
    await archiveProject(trip)
    await archiveProject(garden)
    history.replaceState(null, '', '/projects')
    const r = await render(<ProjectsView />)
    await waitFor(() => archivedTab(r.container)?.textContent === 'Archived2')
    expect(archivedTab(r.container).getAttribute('aria-selected')).toBe('false')
    await click(archivedTab(r.container))
    await waitFor(() => r.container.querySelectorAll('[data-restore]').length === 2)
    await waitFor(() => r.container.querySelector('[data-testid="archived-projects"]')!.textContent!.includes('1 open task'))
    const text = r.container.querySelector('[data-testid="archived-projects"]')!.textContent!
    expect(text.indexOf('Garden')).toBeLessThan(text.indexOf('Trip 2026'))
    expect(text).toContain('In Home · 1 open task')
    expect(text).toContain('0 open tasks')
    expect(location.hash).toBe('#archived')
    // Restore works offline: one op, the project is back in the table.
    await click(r.container.querySelector('button[aria-label="Restore Trip 2026"]')!)
    await waitFor(() => archivedTab(r.container).textContent === 'Archived1')
    expect((await db.projects.get(trip))!.archived).toBe(false)
    await click(r.container.querySelector('[role="tab"]')!)
    await waitFor(() => names(r.container).includes('Trip 2026'))
    expect(location.hash).toBe('')
    await r.unmount()
  })

  it('Nothing archived: the tab says so', async () => {
    await createProject({ name: 'Home' })
    const r = await render(<ProjectsView archived />)
    await waitFor(() => r.container.textContent!.includes('No archived projects'))
    expect(archivedTab(r.container).textContent).toBe('Archived0')
    await r.unmount()
  })

  it('Reached from Settings: the link opens the page on the Archived tab', async () => {
    const s = await render(<AutoArchiveView on onChange={() => {}} />)
    const link = s.container.querySelector<HTMLAnchorElement>('[data-archived-link]')!
    expect(link.getAttribute('href')).toBe('/projects#archived')
    await click(link)
    expect(`${location.pathname}${location.hash}`).toBe('/projects#archived')
    await s.unmount()
    const r = await render(<ProjectsView archived />)
    await waitFor(() => !!archivedTab(r.container), 'the tabs')
    expect(archivedTab(r.container).getAttribute('aria-selected')).toBe('true')
    await r.unmount()
  })

  it('a link to #archived while the page is open selects the Archived tab', async () => {
    history.replaceState(null, '', '/projects')
    const r = await render(<ProjectsView />)
    await waitFor(() => !!archivedTab(r.container), 'the tabs')
    expect(archivedTab(r.container).getAttribute('aria-selected')).toBe('false')
    history.replaceState(null, '', '/projects#archived')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await waitFor(() => archivedTab(r.container).getAttribute('aria-selected') === 'true')
    await r.unmount()
  })
})

const DAY = 86_400_000
const cell = (root: ParentNode, id: string, sel: string) => root.querySelector(`[data-projects-row="${id}"] ${sel}`)

describe('All projects table', () => {
  beforeEach(() => { history.replaceState(null, '', '/projects') })

  it('health, progress, next due and the note, from local data (offline)', async () => {
    const reno = await createProject({ name: 'Home renovation' })
    const admin = await createProject({ name: 'Personal admin' })
    const work = await createProject({ name: 'Work' })
    await createTask({ title: 'Tiles', project_id: reno, due: { date: '2020-01-02' } })
    await createTask({ title: 'Paint', project_id: reno })
    await createTask({ title: 'passport', project_id: admin, deadline: '2020-01-01' })
    await createTask({ title: 'Plan', project_id: work, due: { date: '2999-01-01' } })
    const doneId = await createTask({ title: 'Done one', project_id: work })
    await db.tasks.update(doneId, { completed_at: Date.now() })
    const r = await render(<ProjectsView />)
    await waitFor(() => names(r.container).length === 3)
    await waitFor(() => cell(r.container, reno, '[data-health]')?.getAttribute('data-health') === 'slipping')
    expect(cell(r.container, reno, '[data-health]')!.textContent).toContain('1 late')
    expect(cell(r.container, admin, '[data-health]')!.getAttribute('data-health')).toBe('late')
    expect(cell(r.container, admin, '[data-health]')!.textContent).toContain('passport')
    expect(cell(r.container, work, '[data-health]')!.getAttribute('data-health')).toBe('on-track')
    await waitFor(() => r.container.querySelector(`[data-projects-row="${work}"]`)!.textContent!.includes('50% done'))
    expect(cell(r.container, reno, '[data-next-due]')!.getAttribute('data-next-due')).toBe('late')
    expect(cell(r.container, work, '[data-next-due]')!.getAttribute('data-next-due')).toBe('')
    expect(r.container.querySelector('[data-health-note]')!.textContent).toMatch(/worked out on your device/)
    await r.unmount()
  })

  it('on a narrow table the health word says why: a tooltip on focus, the detail on a tap, read aloud always (briefing-links D5)', async () => {
    const original = globalThis.ResizeObserver
    // A table narrower than 36 rem: every observed size reads as 0 px wide.
    globalThis.ResizeObserver = class { constructor(private cb: () => void) {} observe() { this.cb() } unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
    try {
      const reno = await createProject({ name: 'Home renovation' })
      await createTask({ title: 'Tiles', project_id: reno, due: { date: '2020-01-02' } })
      const r = await render(<ProjectsView />)
      await waitFor(() => !!cell(r.container, reno, '[data-health-why]'))
      const why = cell(r.container, reno, '[data-health-why]') as HTMLButtonElement
      expect(why.textContent).toBe('Overdue, 1 late')
      expect(why.getAttribute('aria-expanded')).toBe('false')
      why.focus()
      await waitFor(() => document.querySelector('[data-tooltip]')?.textContent === '1 late')
      await click(why)
      expect(cell(r.container, reno, '[data-health-detail]')!.textContent).toBe('1 late')
      expect(location.pathname).toBe('/projects')
      await click(why)
      expect(cell(r.container, reno, '[data-health-detail]')).toBeNull()
      await r.unmount()
    } finally {
      globalThis.ResizeObserver = original
    }
  })

  it('a quiet project says for how long', async () => {
    const reading = await createProject({ name: 'Reading' })
    const id = await createTask({ title: 'Finish the novel', project_id: reading })
    const old = Date.now() - 9 * DAY - 60_000
    await db.tasks.update(id, { _clock: { title: { ts: old, device: 'x' } } })
    await db.projects.update(reading, { _clock: { name: { ts: old, device: 'x' } } })
    const r = await render(<ProjectsView />)
    await waitFor(() => cell(r.container, reading, '[data-health]')?.getAttribute('data-health') === 'quiet')
    expect(cell(r.container, reading, '[data-health]')!.textContent).toContain('9 days')
    await r.unmount()
  })

  it('sorting by a header orders the rows and marks the column; the third click restores your order', async () => {
    const a = await createProject({ name: 'Alpha' })
    const b = await createProject({ name: 'Bravo' })
    await createProject({ name: 'Charlie' })
    await createTask({ title: 'late', project_id: b, due: { date: '2020-01-01' } })
    await createTask({ title: 'fine', project_id: a })
    const r = await render(<ProjectsView />)
    await waitFor(() => names(r.container).length === 3)
    const header = () => r.container.querySelector<HTMLButtonElement>('[data-sort="health"]')!
    await click(header())
    await waitFor(() => names(r.container)[0] === 'Bravo')
    expect(names(r.container)).toEqual(['Bravo', 'Alpha', 'Charlie'])
    expect(header().closest('th')!.getAttribute('aria-sort')).toBe('ascending')
    await click(header())
    await waitFor(() => names(r.container)[0] === 'Alpha')
    expect(header().closest('th')!.getAttribute('aria-sort')).toBe('descending')
    await click(header())
    await waitFor(() => header().closest('th')!.getAttribute('aria-sort') === null)
    expect(names(r.container)).toEqual(['Alpha', 'Bravo', 'Charlie'])
    await r.unmount()
  })

  it('keyboard: arrows and j/k move between rows, Left folds and Right unfolds, Enter opens', async () => {
    const home = await createProject({ name: 'Home' })
    await createProject({ name: 'Garden', parent_id: home })
    const work = await createProject({ name: 'Work' })
    const r = await render(<ProjectsView />)
    await waitFor(() => names(r.container).length === 3)
    const open = (id: string) => r.container.querySelector<HTMLButtonElement>(`[data-project-open="${id}"]`)!
    open(home).focus()
    await key(open(home), 'j')
    expect(document.activeElement?.textContent).toContain('Garden')
    await key(document.activeElement!, 'ArrowDown')
    expect(document.activeElement).toBe(open(work))
    await key(open(work), 'k')
    await key(document.activeElement!, 'ArrowLeft')
    expect(document.activeElement).toBe(open(home))
    await key(open(home), 'ArrowLeft')
    await waitFor(() => names(r.container).length === 2)
    await key(open(home), 'ArrowRight')
    await waitFor(() => names(r.container).length === 3)
    await click(open(work))
    expect(location.pathname).toBe(`/project/${work}`)
    await r.unmount()
  })
})

// OpenSpec change archive-several-projects (GitHub issue 1661).
describe('Archive several projects at once', () => {
  const clickWith = (el: Element, init: MouseEventInit) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init })) })

  it('Ctrl+click and Shift+click tick rows; Archive asks, archives them with their sub-projects in one batch', async () => {
    const home = await createProject({ name: 'Home' })
    const garden = await createProject({ name: 'Garden', parent_id: home })
    const work = await createProject({ name: 'Work' })
    const keep = await createProject({ name: 'Keep' })
    await db.outbox.clear()
    const r = await render(<><ProjectsView /><BulkConfirmHost /></>)
    await waitFor(() => names(r.container).length === 4)
    const open = (id: string) => r.container.querySelector(`[data-project-open="${id}"]`)!
    await clickWith(open(home), { ctrlKey: true })
    expect(location.pathname).not.toBe(`/project/${home}`)
    await waitFor(() => !!document.querySelector('[data-selection-bar]'))
    expect(document.querySelector('[data-selection-bar]')!.textContent).toContain('1 selected')
    // While the boxes show, the marks become boxes; Shift extends from Home to Work (Garden is between them).
    expect(r.container.querySelectorAll('[data-project-tick]').length).toBe(4)
    await clickWith(open(work), { shiftKey: true })
    await waitFor(() => document.querySelector('[data-selection-bar]')!.textContent!.includes('3 selected'))
    expect(r.container.querySelector(`[data-projects-row="${keep}"]`)!.hasAttribute('data-ticked')).toBe(false)
    await click(document.querySelector('[data-projects-archive]')!)
    await waitFor(() => !!document.querySelector('[role="dialog"], [role="alertdialog"]'))
    expect(document.querySelector('[role="dialog"], [role="alertdialog"]')!.textContent).toContain('Archive 3 projects?')
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button, [role="alertdialog"] button')].find((b) => b.textContent === 'Archive')!
    await click(confirm)
    await waitFor(async () => (await db.projects.get(work))?.archived === true)
    for (const id of [home, garden, work]) expect((await db.projects.get(id))?.archived).toBe(true)
    expect((await db.projects.get(keep))?.archived).toBeFalsy()
    const stamps = new Set((await db.outbox.toArray()).filter((o) => o.entity === 'project' && o.field === 'archived').map((o) => `${o.ts}|${o.device}`))
    expect(stamps.size).toBe(1)
    await waitFor(() => names(r.container).length === 1)
    expect(document.querySelector('[data-selection-bar]')).toBeNull()
    await r.unmount()
  })

  it('Space ticks the focused row, Escape clears; a viewer’s project cannot be ticked', async () => {
    const { setCurrentUserId, storeMemberships } = await import('../lib/sharing')
    const mine = await createProject({ name: 'Mine' })
    const theirs = await createProject({ name: 'Theirs' })
    setCurrentUserId('me')
    await storeMemberships([{ projectId: theirs, role: 'viewer', ownerId: 'owner', members: [{ userId: 'owner', email: 'o@example.com', name: 'O', role: 'owner' }, { userId: 'me', email: 'm@example.com', name: 'M', role: 'viewer' }] }] as never)
    const r = await render(<ProjectsView />)
    await waitFor(() => names(r.container).length === 2)
    const open = (id: string) => r.container.querySelector<HTMLElement>(`[data-project-open="${id}"]`)!
    await key(open(theirs), ' ')
    expect(document.querySelector('[data-selection-bar]')).toBeNull()
    await key(open(mine), ' ')
    await waitFor(() => !!document.querySelector('[data-selection-bar]'))
    await clickWith(open(theirs), { ctrlKey: true })
    expect(r.container.querySelector(`[data-projects-row="${theirs}"]`)!.hasAttribute('data-ticked')).toBe(false)
    await key(open(mine), 'Escape')
    await waitFor(() => !document.querySelector('[data-selection-bar]'))
    await r.unmount()
  })
})

// Issue 1956: the menu's Alt+Up and Alt+Down work on the table too, and keep focus; a header sort turns the moves off.
describe('All projects page reordering', () => {
  it('Alt+Down moves the row among its siblings and keeps focus; not while a header sorts', async () => {
    const a = await createProject({ name: 'A' })
    await createProject({ name: 'B' })
    await createProject({ name: 'C' })
    const r = await render(<ProjectsView />)
    await waitFor(() => names(r.container).length === 3)
    const row = () => r.container.querySelector<HTMLButtonElement>(`[data-project-open="${a}"]`)!
    await act(async () => row().focus())
    await key(row(), 'ArrowDown', { altKey: true })
    await waitFor(() => names(r.container).join() === 'B,A,C', 'A moved down')
    await waitFor(() => document.activeElement === row(), 'focus stays on A')
    await key(row(), 'ArrowDown', { altKey: true })
    await waitFor(() => names(r.container).join() === 'B,C,A', 'A moved down again')
    await click(r.container.querySelector<HTMLButtonElement>('[data-sort="name"]')!)
    await waitFor(() => names(r.container).join() === 'A,B,C', 'sorted by name')
    const before = await db.outbox.count()
    await key(row(), 'ArrowDown', { altKey: true })
    expect(await db.outbox.count()).toBe(before)
    await r.unmount()
  })
})
