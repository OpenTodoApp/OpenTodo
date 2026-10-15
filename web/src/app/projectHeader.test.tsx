// @vitest-environment happy-dom
// The project header through the page template (OpenSpec change ux-overhaul,
// project-organization "Project header"): Share and the layout control in the
// header, Activity and History as panel-slot occupants opened from the menu.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import type { Project } from '../lib/types'
import { click, flush, key, render } from '../ui/test-utils'
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

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const menuItem = (label: string) => [...document.querySelectorAll('[data-menu-label]')].find((e) => e.getAttribute('data-menu-label') === label) as HTMLElement

describe('project header', () => {
  it('keeps Share and the layout control in the header; Activity and History open in the panel slot from the menu', async () => {
    const r = await render(<><ProjectHeader project={p('home', 'Home')} layout={<span data-layout-control>List</span>} /><PanelHost /></>)
    await flush(40)
    const header = r.container.querySelector('[data-page-header]')!
    expect(header).toBeTruthy()
    expect(header.querySelector('h1 [data-project-name]')?.textContent).toBe('Home')
    expect(header.querySelector('[data-project-share]')).toBeTruthy()
    expect(header.querySelector('[data-layout-control]')).toBeTruthy()
    // No disclosure rows under the title any more.
    expect(r.container.querySelector('details')).toBeNull()
    expect(r.container.textContent).not.toContain('History')

    await click(header.querySelector('button[aria-label="Project menu"]')!)
    await flush(30)
    const labels = [...document.querySelectorAll('[data-menu-label]')].map((e) => e.getAttribute('data-menu-label'))
    expect(labels).toEqual(expect.arrayContaining(['Activity', 'History']))
    await click(menuItem('Activity'))
    await flush(30)
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
    await flush(30)
    await click(menuItem('History'))
    await flush(30)
    expect(panelOccupant()).toMatchObject({ kind: 'custom', key: 'project-history' })
    await waitFor(() => document.querySelector('[data-panel-frame="project-history"]') !== null)
    expect(document.querySelectorAll('[data-panel-frame]')).toHaveLength(1)
    await key(document.body, 'Escape')
    await waitFor(() => panelOccupant() === null)
    expect(document.querySelector('[data-panel-frame]')).toBeNull()
    await r.unmount()
  })
})
