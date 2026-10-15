// @vitest-environment happy-dom
// Project icon (OpenSpec change ux-overhaul, project-organization "Project icon",
// design D8): an additive field picked from the project menu, written as one op
// offline, shown in the sidebar, the header and the chip; the colour dot otherwise.
import 'fake-indexeddb/auto'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { click, flush, render } from '../ui/test-utils'
import { PROJECT_ICONS, ProjectHeader } from './ProjectHeader'
import { ProjectMark, Sidebar } from './Sidebar'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  // Offline: nothing answers.
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function waitFor(ok: () => boolean | Promise<boolean>, ms = 3000) {
  for (let t = 0; t < ms && !(await ok()); t += 20) await flush(20)
  expect(await ok()).toBe(true)
}

describe('project mark', () => {
  it('is the colour dot by default, the icon in the project colour once set, and the dot again for a name this client does not know', () => {
    const dot = renderToStaticMarkup(<ProjectMark project={{ color: '#22c55e', icon: null }} />)
    expect(dot).toContain('rounded-full')
    expect(dot).toContain('background-color:#22c55e')
    expect(dot).not.toContain('<svg')
    const icon = renderToStaticMarkup(<ProjectMark project={{ color: '#22c55e', icon: 'briefcase' }} />)
    expect(icon).toContain('<svg')
    expect(icon).toContain('color:#22c55e')
    expect(renderToStaticMarkup(<ProjectMark project={{ color: '#000', icon: 'from-a-newer-release' }} />)).not.toContain('<svg')
    expect(renderToStaticMarkup(<ProjectMark project={{ color: '#000' }} />)).toContain('rounded-full')
  })
})

describe('icon picker', () => {
  it('picks an icon offline from the project menu as one op, and the sidebar row shows it', async () => {
    const id = await createProject({ name: 'Work' })
    const project = (await db.projects.get(id))!
    expect(project.icon ?? null).toBeNull()
    const side = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => side.container.querySelector(`[data-project-id="${id}"]`) !== null)
    expect(side.container.querySelector(`[data-project-id="${id}"] svg`)).toBeNull()

    const r = await render(<ProjectHeader project={project} />)
    await flush(40)
    await click(r.container.querySelector('button[aria-label="Project menu"]')!)
    await flush(30)
    const swatches = document.querySelector('[role="group"][aria-label="Icon"]')!
    expect(swatches.getAttribute('data-project-icons')).not.toBeNull()
    expect(PROJECT_ICONS.length).toBeGreaterThanOrEqual(12)
    expect(swatches.querySelectorAll('[role="menuitemradio"]')).toHaveLength(PROJECT_ICONS.length + 1)
    expect(swatches.querySelector('[aria-checked="true"]')?.getAttribute('aria-label')).toBe('No icon')

    await click(swatches.querySelector('[aria-label="Icon briefcase"]')!)
    await waitFor(async () => (await db.projects.get(id))?.icon === 'briefcase')
    const ops = (await db.outbox.toArray()).filter((o) => o.entityId === id && o.field === 'icon')
    expect(ops).toHaveLength(1)
    expect(ops[0].value).toBe('briefcase')
    await waitFor(() => side.container.querySelector(`[data-project-id="${id}"] svg`) !== null)

    // The header shows the mark next to the name; the picker, still open, marks the choice.
    await r.rerender(<ProjectHeader project={(await db.projects.get(id))!} />)
    await flush(30)
    expect(r.container.querySelector('[data-page-header] h1')?.parentElement?.querySelector('svg')).toBeTruthy()
    await waitFor(() => document.querySelector('[data-project-icons] [aria-checked="true"]')?.getAttribute('aria-label') === 'Icon briefcase')
    await click(document.querySelector('[data-project-icons] [aria-label="No icon"]')!)
    await waitFor(async () => (await db.projects.get(id))?.icon === null)
    await r.unmount()
    await side.unmount()
  })
})
