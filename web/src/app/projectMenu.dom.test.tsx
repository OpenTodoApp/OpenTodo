// @vitest-environment happy-dom
// Project menu (labels-and-menus 3.2): `m` opens straight into the "Move to" picker,
// colours are radio items, and the delete confirmation counts open tasks.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import type { Project } from '../lib/types'
import { click, key, render, mockFetch, noPublicLinks, waitFor } from '../ui/test-utils'
import { ProjectHeader, projectMenuGroups } from './ProjectHeader'

// The project header asks the server for its public links.
beforeEach(() => mockFetch(noPublicLinks))
afterEach(() => { vi.unstubAllGlobals() })

const p = (id: string, name: string, parent_id: string | null = null): Project =>
  ({ id, name, color: '#22c55e', position: 1, archived: false, parent_id, created_at: 0, deleted_at: null, _clock: {} } as Project)

beforeEach(async () => {
  await db.delete(); await db.open()
  await db.projects.bulkPut([p('home', 'Home'), p('kitchen', 'Kitchen', 'home'), p('work', 'Work')])
  await db.tasks.put({ id: 't1', title: 'Quotes', project_id: 'home', labels: [], priority: 4, position: 1, created_at: 0, completed_at: null, deleted_at: null, _clock: {} } as never)
})

describe('project menu', () => {
  it('m opens the Move to picker without the project itself or its sub-project', async () => {
    const r = await render(<ProjectHeader project={p('home', 'Home')} />)
    await waitFor(() => !!r.container.querySelector('button[aria-label="Project menu"]'), 'the header')
    await key(document.body, 'm')
    await waitFor(() => document.querySelectorAll('[data-picker-step] [role="option"]').length > 0, 'the Move to picker')
    const step = document.querySelector('[data-picker-step]')
    expect(step).toBeTruthy()
    const options = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent ?? '')
    expect(options.some((o) => o.includes('Work'))).toBe(true)
    expect(options.some((o) => o.includes('Top level'))).toBe(true)
    expect(options.some((o) => o.includes('Kitchen'))).toBe(false)
    expect(options.some((o) => o.includes('Home'))).toBe(false)
    await r.unmount()
  })

  it('shows colours as radio items and counts open tasks in the delete confirmation', async () => {
    const r = await render(<ProjectHeader project={p('home', 'Home')} />)
    await click(r.container.querySelector('button[aria-label="Project menu"]')!)
    await waitFor(() => document.querySelectorAll('[role="group"][aria-label="Colour"] [role="menuitemradio"]').length > 0, 'the project menu')
    const radios = document.querySelectorAll('[role="group"][aria-label="Colour"] [role="menuitemradio"]')
    expect(radios.length).toBe(12)
    expect([...radios].filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.getAttribute('aria-label'))).toEqual(['Colour green'])
    await click([...document.querySelectorAll('[data-menu-label]')].find((e) => e.getAttribute('data-menu-label') === 'Delete project…') as HTMLElement)
    await waitFor(() => !!document.querySelector('[role="alertdialog"]'), 'the delete confirmation')
    await waitFor(() => !!document.querySelector('[role="alertdialog"]')?.textContent?.includes('1 open task'), 'the count in the confirmation')
    await r.unmount()
  })

  it('opened before the live count has loaded, the delete confirmation still counts the open tasks', async () => {
    const groups = projectMenuGroups(p('home', 'Home'), { role: 'owner', shared: false, targets: [], subCount: 0, openTasks: undefined }, { rename: () => {} })
    const item = groups.flatMap((g) => g.items).find((i) => i.id === 'delete')
    if (!item || item.kind !== 'confirm' || typeof item.confirm.body !== 'function') throw new Error('the delete confirmation reads its count on open')
    expect(await item.confirm.body()).toContain('1 open task')
  })
})
