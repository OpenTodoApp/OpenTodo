// @vitest-environment happy-dom
// Section menu (labels-and-menus 3.1): the delete confirmation names the open tasks
// that move to "No section", and Cancel changes nothing.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { createSection } from '../lib/sections'
import { click, flush, render } from '../ui/test-utils'
import { SectionHeader, sectionMenuGroups } from './Sections'

beforeEach(async () => { await db.delete(); await db.open() })
afterEach(() => { document.body.innerHTML = '' })

describe('section menu', () => {
  it('disables moves at the edges with a reason and keeps delete last', () => {
    const noop = { rename: () => {}, move: () => {}, remove: () => {} }
    const items = sectionMenuGroups('Doing', { first: true, last: false, layout: 'board', count: 0 }, noop).flatMap((g) => g.items)
    expect(items.map((i) => i.label)).toEqual(['Rename', 'Move left', 'Move right', 'Delete section'])
    expect(items[1]).toMatchObject({ disabled: true, reason: 'Already first' })
  })

  it('shows the open-task count and Cancel leaves the section in place', async () => {
    const id = await createSection('p1', 'Doing')
    const section = (await db.sections.get(id))!
    const r = await render(<SectionHeader section={section} count={2} layout="list" editable first last={false} />)
    await click(r.container.querySelector('button[aria-label="Section menu for Doing"]')!)
    await flush(20)
    const del = [...document.querySelectorAll('[data-menu-label]')].find((e) => e.getAttribute('data-menu-label') === 'Delete section…') as HTMLElement
    await click(del)
    await flush(30)
    const dialog = document.querySelector('[role="alertdialog"]')!
    expect(dialog.textContent).toContain('Its 2 open tasks move to “No section”')
    await click([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!)
    await flush(20)
    expect((await db.sections.get(id))?.deleted_at ?? null).toBeNull()
    await r.unmount()
  })
})
