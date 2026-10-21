// @vitest-environment happy-dom
// Project icon (OpenSpec changes ux-overhaul D8 and icons-and-section-style,
// project-organization "Project icon"): an additive field picked from the icon
// catalogue through the searchable picker in the project menu, written as one op
// offline, shown in the sidebar and the header; the colour dot otherwise.
import 'fake-indexeddb/auto'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { click, flush, key, render, type } from '../ui/test-utils'
import { ProjectHeader } from './ProjectHeader'
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
  it('picks an icon offline from the project menu through search, as one op, and the sidebar shows it at once', async () => {
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
    // The 24-icon grid is gone: "Icon…" opens the searchable picker in the same overlay.
    expect(document.querySelector('[data-project-icons]')).toBeNull()
    await click([...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.includes('Icon…'))!)
    await waitFor(() => document.querySelector('[data-icon-picker]') !== null && document.querySelector('[data-icon-option="briefcase"]') !== null)
    expect(document.querySelector('[data-icon-option="none"]')?.getAttribute('aria-selected')).toBe('true')

    const input = document.querySelector<HTMLInputElement>('[data-icon-picker] input[role="combobox"]')!
    await type(input, 'brief')
    await flush(20)
    await key(input, 'Enter')
    await waitFor(async () => (await db.projects.get(id))?.icon === 'briefcase')
    const ops = (await db.outbox.toArray()).filter((o) => o.entityId === id && o.field === 'icon')
    expect(ops).toHaveLength(1)
    expect(ops[0].value).toBe('briefcase')
    // Offline, the sidebar shows it at once.
    await waitFor(() => side.container.querySelector(`[data-project-id="${id}"] svg[data-icon="briefcase"]`) !== null)
    expect(document.querySelector('[data-icon-picker]')).toBeNull()

    // An icon outside the interface set loads with the catalogue and is drawn too.
    await r.rerender(<ProjectHeader project={(await db.projects.get(id))!} />)
    await click(r.container.querySelector('button[aria-label="Project menu"]')!)
    await flush(30)
    await click([...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.includes('Icon…'))!)
    await waitFor(() => document.querySelector('[data-icon-option="briefcase"]')?.getAttribute('aria-selected') === 'true')
    await click(document.querySelector('[data-icon-option="paw-print"]')!)
    await waitFor(async () => (await db.projects.get(id))?.icon === 'paw-print')
    await waitFor(() => side.container.querySelector(`[data-project-id="${id}"] svg[data-icon="paw-print"]`) !== null)

    // "No icon" brings the dot back.
    await r.rerender(<ProjectHeader project={(await db.projects.get(id))!} />)
    await click(r.container.querySelector('button[aria-label="Project menu"]')!)
    await flush(30)
    await click([...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.includes('Icon…'))!)
    await waitFor(() => document.querySelector('[data-icon-option="none"]') !== null)
    await click(document.querySelector('[data-icon-option="none"]')!)
    await waitFor(async () => (await db.projects.get(id))?.icon === null)
    await r.unmount()
    await side.unmount()
  })
})
