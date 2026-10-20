// @vitest-environment happy-dom
// Property chips and the Add menu (OpenSpec change ux-overhaul, web-app "Task panel
// layout", design D4): a chip reads as its value, its editor opens on click or Enter
// and closes on Escape with focus back on the chip; Add reveals an empty property with
// its editor open, and cancelling removes it again; an empty task shows few items.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createProject, createTask } from '../../lib/ops'
import { click, flush, key, type } from '../../ui/test-utils'
import { open, settle, setupTaskDetailTests, waitFor } from './taskDetail.testkit'

setupTaskDetailTests()

/** What the user sees in the chips row: chips plus the Add control. */
const visibleItems = (root: ParentNode) => root.querySelectorAll('[data-property-chips] [data-property], [data-property-chips] button[aria-label="Add a property"]').length

describe('property chips', () => {
  it('an empty task shows the breadcrumb, Do on, Priority and Add: at most seven items', async () => {
    const id = await createTask({ title: 'Blank' })
    const { container, row, unmount } = await open(id)
    expect(row('project').textContent).toContain('Inbox')
    expect(row('due')).toBeTruthy()
    expect(row('priority')).toBeTruthy()
    const items = visibleItems(container)
    expect(items).toBeLessThanOrEqual(7)
    expect(items).toBe(3)
    expect(container.querySelector('section[aria-label="Properties"] input')).toBeNull()
    await unmount()
  })

  it('the Add menu lists the remaining properties with their shortcuts and hides the ones already shown', async () => {
    const id = await createTask({ title: 'Report', deadline: '2026-10-20' })
    const { row, addItems, unmount } = await open(id)
    const items = await addItems()
    const labels = items.map((i) => i.textContent ?? '')
    expect(labels.some((l) => l.includes('Deadline'))).toBe(false)
    expect(labels.some((l) => l.includes('Estimate') && l.includes('e'))).toBe(true)
    expect(labels.some((l) => l.includes('Blocked by'))).toBe(true)
    await key(document.activeElement!, 'Escape')
    await settle()
    expect(row('deadline').textContent).toContain('Tue 20 Oct')
    await unmount()
  })

  it('Add then Estimate shows the chip with its editor focused; Escape without a value removes it and focus lands on Add', async () => {
    const id = await createTask({ title: 'Blank' })
    const { row, add, addButton, unmount } = await open(id)
    expect(row('estimate')).toBeNull()
    await add('Estimate')
    expect(row('estimate')).toBeTruthy()
    const editor = row('estimate').querySelector('[data-property-editor="estimate"]')!
    expect(editor.contains(document.activeElement)).toBe(true)
    await key(document.activeElement!, 'Escape')
    await flush(80)
    expect(row('estimate')).toBeNull()
    expect(document.activeElement).toBe(addButton())
    await unmount()
  })

  it('Add then Estimate with a value keeps the chip reading the value, and its clear control removes it', async () => {
    const id = await createTask({ title: 'Blank' })
    const { row, add, unmount } = await open(id)
    await add('Estimate')
    const input = row('estimate').querySelector('input') as HTMLInputElement
    await type(input, '45m')
    await key(input, 'Enter')
    await waitFor(() => (row('estimate')?.textContent ?? '').includes('45'))
    // Enter commits and leaves the field; Escape anywhere in the editor closes it.
    await key(row('estimate').querySelector('[data-property-editor]')!, 'Escape')
    // The stored value first, then the DOM read in the same turn (the chip re-renders as the save arrives).
    await waitFor(async () => (await db.tasks.get(id))!.estimate_minutes === 45 && !!row('estimate')?.textContent?.includes('45m') && !row('estimate').querySelector('[data-property-editor]'), 'the editor closed on the saved value')
    expect(row('estimate')).toBeTruthy()
    expect(row('estimate').querySelector('[data-property-editor]')).toBeNull()
    expect((await db.tasks.get(id))!.estimate_minutes).toBe(45)
    await click(row('estimate').querySelector('button[aria-label="Clear estimate"]')!)
    await waitFor(async () => (await db.tasks.get(id))!.estimate_minutes === null, 'the estimate cleared')
    await waitFor(() => !row('estimate'), 'the chip removed')
    await unmount()
  })

  it('a chip opens on Enter with focus in its editor and returns focus on Escape', async () => {
    const id = await createTask({ title: 'Plan', due: { date: '2026-10-15' } })
    const { row, valueButton, unmount } = await open(id)
    const chip = valueButton('due')
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    chip.focus()
    await click(chip) // Enter on a native button activates it
    await settle()
    expect(chip.getAttribute('aria-expanded')).toBe('true')
    const editor = row('due').querySelector('[data-property-editor="due"]')!
    expect(editor.contains(document.activeElement)).toBe(true)
    await key(document.activeElement!, 'Escape')
    await settle()
    expect(row('due').querySelector('[data-property-editor]')).toBeNull()
    expect(document.activeElement).toBe(valueButton('due'))
    await unmount()
  })

  // Issue #100: the zone control sits beside a timed due only, and once while the When editor is open.
  it('shows the zone control beside a timed due only, and once while the When editor is open', async () => {
    const zones = (root: ParentNode) => root.querySelectorAll('button[aria-label^="Time zone"]').length
    const untimed = await createTask({ title: 'Brush head', due: { date: '2026-11-07' } })
    let view = await open(untimed)
    expect(zones(view.row('due'))).toBe(0)
    await view.unmount()

    const timed = await createTask({ title: 'Call', due: { date: '2026-11-07', time: '09:00' } })
    view = await open(timed)
    expect(zones(view.row('due'))).toBe(1)
    await click(view.valueButton('due'))
    await settle()
    expect(view.row('due').querySelector('[data-property-editor="due"]')).toBeTruthy()
    expect(zones(view.row('due'))).toBe(1)
    await view.unmount()
  })

  it('the breadcrumb reads project › section', async () => {
    const p = await createProject({ name: 'Home' })
    const { createSection, moveTaskToSection } = await import('../../lib/sections')
    const doing = await createSection(p, 'Doing')
    const id = await createTask({ title: 'Paint', project_id: p })
    await moveTaskToSection(id, doing)
    const { container, row, unmount } = await open(id)
    await waitFor(() => !!row('section'))
    const crumb = container.querySelector('[data-property-breadcrumb]')!
    expect(crumb.contains(row('project'))).toBe(true)
    expect(crumb.contains(row('section'))).toBe(true)
    expect(row('project').textContent).toContain('Home')
    expect(row('section').textContent).toContain('Doing')
    await unmount()
  })

  // Task origins (OpenSpec change task-origin, web-app "Task panel property chips").
  it('an Origin chip opens its URL in a new tab; Remove clears it in one write; it is never offered in Add', async () => {
    const origin = { kind: 'url' as const, url: 'https://example.org/post', title: 'Interesting article' }
    const id = await createTask({ title: 'Read', description: 'https://example.org/post', origin })
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { row, valueButton, addItems, unmount } = await open(id)
    expect(row('origin').textContent).toContain('example.org')
    const chip = valueButton('origin')
    await act(async () => { chip.focus() })
    expect(document.querySelector('[data-tooltip]')?.textContent).toBe('Interesting article')
    await click(chip) // Enter on a native button activates it
    expect(opened).toHaveBeenCalledWith('https://example.org/post', '_blank', expect.stringContaining('noopener'))
    expect(row('origin').querySelector('[data-property-editor]')).toBeNull()
    const items = await addItems()
    expect(items.some((i) => (i.textContent ?? '').includes('Origin'))).toBe(false)
    await key(document.activeElement!, 'Escape')
    await settle()
    await click(row('origin').querySelector('button[aria-label="Clear origin"]')!)
    await waitFor(async () => (await db.tasks.get(id))!.origin === null, 'the origin cleared')
    await waitFor(() => !row('origin'), 'the chip removed')
    expect((await db.tasks.get(id))!.description).toBe('https://example.org/post')
    const ops = (await db.outbox.toArray()).filter((o) => o.entityId === id && o.field === 'origin')
    expect(ops.at(-1)?.value).toBeNull()
    opened.mockRestore()
    await unmount()
  })

  it('a task without an origin shows no Origin chip and Add does not offer one', async () => {
    const id = await createTask({ title: 'Plain' })
    const { row, addItems, unmount } = await open(id)
    expect(row('origin')).toBeNull()
    const items = await addItems()
    expect(items.some((i) => (i.textContent ?? '').includes('Origin'))).toBe(false)
    await unmount()
  })
})
