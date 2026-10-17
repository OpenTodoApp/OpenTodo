// @vitest-environment happy-dom
// Project menu (labels-and-menus 3.2): `m` opens straight into the "Move to" picker,
// colours are radio items, and the delete confirmation counts open tasks.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import type { Project } from '../lib/types'
import { click, flush, key, render, mockFetch, noPublicLinks } from '../ui/test-utils'
import { ProjectHeader } from './ProjectHeader'

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
afterEach(() => { document.body.innerHTML = '' })

describe('project menu', () => {
  it('m opens the Move to picker without the project itself or its sub-project', async () => {
    const r = await render(<ProjectHeader project={p('home', 'Home')} />)
    await flush(40)
    await key(document.body, 'm')
    await flush(40)
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
    await flush(40)
    await click(r.container.querySelector('button[aria-label="Project menu"]')!)
    await flush(30)
    const radios = document.querySelectorAll('[role="group"][aria-label="Colour"] [role="menuitemradio"]')
    expect(radios.length).toBe(12)
    expect([...radios].filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.getAttribute('aria-label'))).toEqual(['Colour green'])
    await click([...document.querySelectorAll('[data-menu-label]')].find((e) => e.getAttribute('data-menu-label') === 'Delete project…') as HTMLElement)
    await flush(30)
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('1 open task')
    await r.unmount()
  })
})
