// @vitest-environment happy-dom
// The project header through the page template (OpenSpec change ux-overhaul,
// project-organization "Project header"): Share and the layout control in the
// header, Activity and History as panel-slot occupants opened from the menu.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import type { Project, Task } from '../lib/types'
import { click, key, render, spokenText, visibleText, waitFor } from '../ui/test-utils'
import { panelOccupant, resetPanel } from './panel'
import { PanelHost } from './PanelHost'
import { ProjectHeader } from './ProjectHeader'

const p = (id: string, name: string): Project =>
  ({ id, name, color: '#22c55e', position: 1, archived: false, parent_id: null, created_at: 0, deleted_at: null, _clock: {} } as Project)

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.projects.put(p('home', 'Home'))
  resetPanel()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.unstubAllGlobals()
  resetPanel()
})

const menuItem = (label: string) => [...document.querySelectorAll('[data-menu-label]')].find((e) => e.getAttribute('data-menu-label') === label) as HTMLElement

describe('project header', () => {
  it('keeps Share and the layout control in the header; Activity and History open in the panel slot from the menu', async () => {
    const r = await render(<><ProjectHeader project={p('home', 'Home')} layout={<span data-layout-control>List</span>} /><PanelHost /></>)
    await waitFor(() => r.container.querySelector('[data-page-header] h1 [data-project-name]')?.textContent === 'Home', 'the header')
    const header = r.container.querySelector('[data-page-header]')!
    expect(header).toBeTruthy()
    expect(header.querySelector('h1 [data-project-name]')?.textContent).toBe('Home')
    expect(header.querySelector('[data-project-share]')).toBeTruthy()
    expect(header.querySelector('[data-layout-control]')).toBeTruthy()
    // No disclosure rows under the title any more.
    expect(r.container.querySelector('details')).toBeNull()
    expect(r.container.textContent).not.toContain('History')

    await click(header.querySelector('button[aria-label="Project menu"]')!)
    await waitFor(() => !!menuItem('Activity'), 'the project menu')
    const labels = [...document.querySelectorAll('[data-menu-label]')].map((e) => e.getAttribute('data-menu-label'))
    expect(labels).toEqual(expect.arrayContaining(['Activity', 'History']))
    await click(menuItem('Activity'))
    await waitFor(() => (panelOccupant() as { key?: string } | null)?.key === 'project-activity', 'the Activity panel')
    expect(panelOccupant()).toMatchObject({ kind: 'custom', key: 'project-activity' })
    await waitFor(() => document.querySelector('[data-panel-frame="project-activity"]') !== null)
    expect(document.querySelector('[data-panel-frame="project-activity"] h2')?.textContent).toBe('Activity')

    // Shift+H toggles the same occupant.
    await key(document.body, 'H', { shiftKey: true })
    await waitFor(() => panelOccupant() === null)
    await key(document.body, 'H', { shiftKey: true })
    await waitFor(() => panelOccupant()?.kind === 'custom')

    // History takes the slot over (one occupant at a time); Escape empties it.
    await click(header.querySelector('button[aria-label="Project menu"]')!)
    await waitFor(() => !!menuItem('History'), 'the project menu')
    await click(menuItem('History'))
    await waitFor(() => (panelOccupant() as { key?: string } | null)?.key === 'project-history', 'the History panel')
    expect(panelOccupant()).toMatchObject({ kind: 'custom', key: 'project-history' })
    await waitFor(() => document.querySelector('[data-panel-frame="project-history"]') !== null)
    expect(document.querySelectorAll('[data-panel-frame]')).toHaveLength(1)
    await key(document.body, 'Escape')
    await waitFor(() => panelOccupant() === null)
    expect(document.querySelector('[data-panel-frame]')).toBeNull()
    await r.unmount()
  })

  it('reads "In maintenance" in the lead line while the project is in maintenance (project-review-cadence)', async () => {
    const r = await render(<ProjectHeader project={{ ...p('home', 'Home'), status: 'maintenance' }} />)
    await waitFor(() => !!r.container.querySelector('[data-project-maintenance]'), 'the maintenance note')
    expect(r.container.querySelector('[data-project-maintenance]')!.textContent).toBe('In maintenance')
    await r.rerender(<ProjectHeader project={{ ...p('home', 'Home'), status: 'active' }} />)
    await waitFor(() => !r.container.querySelector('[data-project-maintenance]'), 'no maintenance note')
    await r.unmount()
  })

  it('shows the project\'s progress beside its title, live, and none for an area (task-progress D4)', async () => {
    const tk = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, description: '', project_id: 'home', parent_id: null, priority: 4, due: null, labels: [], position: 0,
      created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, _clock: {}, ...extra } as Task)
    await db.tasks.bulkPut([tk('a', { completed_at: 1 }), tk('b'), tk('c'), tk('d', { parent_id: 'b', completed_at: 1 }), tk('gone', { deleted_at: 1, completed_at: 1 })])
    const r = await render(<ProjectHeader project={p('home', 'Home')} />)
    const progress = () => r.container.querySelector('[data-page-lead] [data-project-progress]')
    await waitFor(() => visibleText(progress() ?? document.createElement('i')) === '50%', 'the progress')
    expect(spokenText(progress()!)).toBe('50% done')
    expect(progress()!.querySelector('svg[data-progress-ring]')).not.toBeNull()
    await db.tasks.update('b', { completed_at: 2 })
    await waitFor(() => visibleText(progress()!) === '75%', 'the progress after a write')
    await r.rerender(<ProjectHeader project={{ ...p('home', 'Home'), flow_mode: 'area' }} />)
    await waitFor(() => !progress(), 'no progress for an area')
    await r.unmount()
  })

  it('shows no progress for a project without tasks', async () => {
    const r = await render(<ProjectHeader project={p('home', 'Home')} />)
    await waitFor(() => r.container.querySelector('[data-project-name]')?.textContent === 'Home', 'the header')
    expect(r.container.querySelector('[data-project-progress]')).toBeNull()
    await r.unmount()
  })

  it('starts renaming with the selected project name after switching projects', async () => {
    const r = await render(<ProjectHeader project={p('first', 'Example Project 1')} />)
    await waitFor(() => r.container.querySelector('button[data-project-name]')?.textContent === 'Example Project 1', 'the first project title')

    await r.rerender(<ProjectHeader project={p('second', 'Example Project 2')} />)
    const title = r.container.querySelector('button[data-project-name]')
    expect(title?.textContent).toBe('Example Project 2')
    await click(title!)

    expect(r.container.querySelector<HTMLInputElement>('input[aria-label="Project name"]')?.value).toBe('Example Project 2')
    await r.unmount()
  })
})
