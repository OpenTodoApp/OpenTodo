// @vitest-environment happy-dom
// "Pin to sidebar" in every menu (OpenSpec change sidebar-favourites, task 2.1):
// the item reflects the state, a toggle writes one preference op (plus the flag for a
// saved filter), and pinning a shared project writes no project op.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { resetDeviceId } from '../lib/ops'
import type { Label, Project, View } from '../lib/types'
import { click, flush, render } from '../ui/test-utils'
import { LabelMenu, LabelsView } from './LabelsView'
import { ProjectHeader } from './ProjectHeader'
import { resetPanel } from './panel'
import { ViewMenu } from './ViewsView'

const project = { id: 'home', name: 'Home', color: '#22c55e', position: 1, archived: false, parent_id: null, created_at: 0, deleted_at: null, _clock: {} } as unknown as Project
const label = { id: 'errand', name: 'errand', color: '#f97316', position: 1, created_at: 0, deleted_at: null, _clock: {} } as unknown as Label
const view = { id: 'v1', name: 'Waiting', kind: 'list', query: 'p1', panels: [], pinned: false, position: 1, created_at: 0, deleted_at: null, _clock: {} } as unknown as View

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  await db.projects.put(project)
  await db.labels.put(label)
  await db.views.put(view)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); resetPanel() })

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const pinItem = () => document.querySelector<HTMLElement>('[data-menu-label="Pin to sidebar"]')
const ops = async () => (await db.outbox.toArray()).map((o) => `${o.entity}.${o.field}=${JSON.stringify(o.value)}`).sort()

async function openMenu(root: ParentNode, name: string) {
  document.body.click()
  await flush(20)
  await click(root.querySelector(`button[aria-label="${name}"]`)!)
  await waitFor(() => pinItem() !== null)
}

describe('Pin to sidebar', () => {
  it('Pin from the header: one preference op, checked in every menu of the project', async () => {
    const r = await render(<ProjectHeader project={project} />)
    await flush(40)
    await openMenu(r.container, 'Project menu')
    expect(pinItem()!.getAttribute('aria-checked')).toBe('false')
    await click(pinItem()!)
    await flush(40)
    expect(await ops()).toEqual(['user_prefs.favourites="project:home"'])
    await openMenu(r.container, 'Project menu')
    expect(pinItem()!.getAttribute('aria-checked')).toBe('true')
    await r.unmount()
  })

  it('Shared project pinned by one member: no project op is written', async () => {
    await db.memberships.put({ projectId: 'home', role: 'editor', ownerId: 'bob', members: [] } as never)
    const r = await render(<ProjectHeader project={project} />)
    await flush(40)
    await openMenu(r.container, 'Project menu')
    await click(pinItem()!)
    await flush(60)
    expect(await ops()).toEqual(['user_prefs.favourites="project:home"'])
    expect((await db.outbox.toArray()).some((o) => o.entity === 'project')).toBe(false)
    await r.unmount()
  })

  it('Pin from the labels overview: one preference op, and the label view header menu reads it as checked', async () => {
    const r = await render(<LabelsView route={{ view: 'labels' }} />)
    await waitFor(() => r.container.querySelector('[data-label-row]') !== null)
    await openMenu(r.container, 'Menu for label errand')
    await click(pinItem()!)
    await flush(60)
    expect(await ops()).toEqual(['user_prefs.favourites="label:errand"'])
    await r.unmount()
    const header = await render(<LabelMenu label={label} />)
    await flush(40)
    await openMenu(header.container, 'Label menu')
    expect(pinItem()!.getAttribute('aria-checked')).toBe('true')
    await header.unmount()
  })

  it('a saved filter pins with its flag and its entry in one batch, and unpins both', async () => {
    const r = await render(<ViewMenu view={view} />)
    await flush(40)
    await openMenu(r.container, 'Menu for view Waiting')
    expect(pinItem()!.getAttribute('aria-checked')).toBe('false')
    await click(pinItem()!)
    await flush(60)
    expect(await ops()).toEqual(['user_prefs.favourites="view:v1"', 'view.pinned=true'])
    const batch = new Set((await db.outbox.toArray()).map((o) => o.ts))
    expect(batch.size).toBe(1)
    await db.outbox.clear()
    await r.rerender(<ViewMenu view={(await db.views.get('v1'))!} />)
    await openMenu(r.container, 'Menu for view Waiting')
    expect(pinItem()!.getAttribute('aria-checked')).toBe('true')
    await click(pinItem()!)
    await flush(60)
    expect(await ops()).toEqual(['user_prefs.favourites=""', 'view.pinned=false'])
    await r.unmount()
  })
})
