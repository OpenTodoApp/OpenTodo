// @vitest-environment happy-dom
// The project header through the page template (OpenSpec change ux-overhaul,
// project-organization "Project header"): Share and the layout control in the
// header, Activity and History as panel-slot occupants opened from the menu.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import type { Project } from '../lib/types'
import { click, key, render, waitFor } from '../ui/test-utils'
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
  document.body.innerHTML = ''
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
})
