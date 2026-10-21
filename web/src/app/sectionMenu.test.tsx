// @vitest-environment happy-dom
// Section menu (labels-and-menus 3.1): the delete confirmation names the open tasks
// that move to "No section", and Cancel changes nothing.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { createSection, setSectionStyle } from '../lib/sections'
import { loadCatalogue } from '../ui'
import { click, flush, key, render, type, waitFor } from '../ui/test-utils'
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

// Section colour and icon (icons-and-section-style, sections-and-boards "Section colour and icon").
describe('section style', () => {
  it('offers Colour and Icon after Rename', () => {
    const noop = { rename: () => {}, move: () => {}, remove: () => {} }
    const section = { id: 's1', name: 'Doing', project_id: 'p1', position: 0, created_at: 0, deleted_at: null, _clock: { ts: 0, device: 'd' } } as never
    const items = sectionMenuGroups('Doing', { first: true, last: false, layout: 'list', count: 0 }, { ...noop, section }).flatMap((g) => g.items)
    expect(items.map((i) => i.label)).toEqual(['Rename', 'Colour', 'Icon', 'Move up', 'Move down', 'Delete section'])
  })

  it('a keyboard user picks the rocket icon by typing, and focus returns to the menu trigger', async () => {
    await loadCatalogue()
    const id = await createSection('p1', 'Doing')
    const r = await render(<SectionHeader section={(await db.sections.get(id))!} count={0} layout="list" editable first last={false} />)
    const trigger = r.container.querySelector<HTMLButtonElement>('button[aria-label="Section menu for Doing"]')!
    await click(trigger)
    await flush(20)
    await click([...document.querySelectorAll('[data-menu-label]')].find((e) => e.getAttribute('data-menu-label') === 'Icon…') as HTMLElement)
    await waitFor(() => document.querySelector('[data-icon-option="rocket"]') !== null, 'icon picker')
    const input = document.querySelector<HTMLInputElement>('[data-icon-picker] input[role="combobox"]')!
    await type(input, 'rocket')
    await flush(10)
    await key(input, 'Enter')
    await waitFor(async () => (await db.sections.get(id))?.icon === 'rocket', 'icon written')
    await flush(30)
    expect(document.activeElement).toBe(trigger)

    // The heading shows the icon before the title, and a colour tints it.
    await r.rerender(<SectionHeader section={(await db.sections.get(id))!} count={0} layout="list" editable first last={false} />)
    expect(r.container.querySelector('[data-section-mark="icon"] svg[data-icon="rocket"]')).not.toBeNull()
    await click(trigger)
    await flush(20)
    await click([...document.querySelectorAll('[data-menu-label]')].find((e) => e.getAttribute('data-menu-label') === 'Colour…') as HTMLElement)
    await flush(20)
    await click(document.querySelector('[data-section-colours] [aria-label="Colour amber"], [data-section-colours] [aria-label="Colour orange"]')!)
    await waitFor(async () => (await db.sections.get(id))?.color === '#f97316', 'colour written')
    await r.rerender(<SectionHeader section={(await db.sections.get(id))!} count={0} layout="list" editable first last={false} />)
    expect(r.container.querySelector('[data-section-mark="icon"]')?.getAttribute('data-hue')).toBe('orange')
    await r.unmount()
  })

  it('shows a dot for a colour without an icon, and nothing by default or on "No section"', async () => {
    const id = await createSection('p1', 'Backlog')
    await setSectionStyle(id, { color: '#22c55e' })
    const r = await render(<SectionHeader section={(await db.sections.get(id))!} count={0} layout="board" editable first last />)
    expect(r.container.querySelector('[data-section-mark="dot"]')?.getAttribute('data-hue')).toBe('green')
    await r.rerender(<SectionHeader section={null} count={0} layout="board" editable first last />)
    expect(r.container.querySelector('[data-section-mark]')).toBeNull()
    const plain = await createSection('p1', 'Plain')
    await r.rerender(<SectionHeader section={(await db.sections.get(plain))!} count={0} layout="board" editable first last />)
    expect(r.container.querySelector('[data-section-mark]')).toBeNull()
    await r.unmount()
  })

  it('a viewer sees the style but gets no menu to change it', async () => {
    const id = await createSection('p1', 'Waiting')
    await setSectionStyle(id, { icon: 'hourglass', color: '#eab308' })
    const r = await render(<SectionHeader section={(await db.sections.get(id))!} count={0} layout="list" editable={false} first last />)
    expect(r.container.querySelector('[data-section-mark="icon"] svg[data-icon="hourglass"]')).not.toBeNull()
    expect(r.container.querySelector('button[aria-label="Section menu for Waiting"]')).toBeNull()
    await r.unmount()
  })
})
