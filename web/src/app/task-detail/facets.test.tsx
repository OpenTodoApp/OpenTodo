// @vitest-environment happy-dom
// The facet lines and their popover editors (OpenSpec change task-panel-facets,
// web-app "Task panel facets", "Facet editors are popovers", "When popover shows one
// segment", "Add menu grouped by facet", "Facet keyboard operation"), and the toggle
// of task-panel-polish ("Popover triggers toggle").
import 'fake-indexeddb/auto'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createProject, createTask } from '../../lib/ops'
import { click, flush, key, type } from '../../ui/test-utils'
import { open, settle, setupTaskDetailTests, waitFor } from './taskDetail.testkit'

setupTaskDetailTests()

/** What the user sees as properties: the facet lines plus the Add control. */
const visibleItems = (root: ParentNode) => root.querySelectorAll('[data-facets] [data-facet], [data-facets] button[aria-label="Add a property"]').length
const lineText = (root: ParentNode, facet: string) => root.querySelector(`[data-facet="${facet}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

describe('facet lines', () => {
  it('an empty task reads Where, When "Not scheduled" and How "P4", with Add: at most seven items', async () => {
    const id = await createTask({ title: 'Blank' })
    const { container, unmount } = await open(id)
    expect(lineText(container, 'where')).toContain('Inbox')
    expect(lineText(container, 'when')).toContain('Not scheduled')
    expect(lineText(container, 'how')).toContain('P4')
    expect(container.querySelector('[data-facet="who"]')).toBeNull()
    const items = visibleItems(container)
    expect(items).toBe(4)
    expect(items).toBeLessThanOrEqual(7)
    expect(container.querySelector('section[aria-label="Properties"] input')).toBeNull()
    await unmount()
  })

  it('Where reads project then section', async () => {
    const p = await createProject({ name: 'Home' })
    const { createSection, moveTaskToSection } = await import('../../lib/sections')
    const doing = await createSection(p, 'Doing')
    const id = await createTask({ title: 'Paint', project_id: p })
    await moveTaskToSection(id, doing)
    const { container, row, unmount } = await open(id)
    await waitFor(() => !!row('section'))
    const where = container.querySelector('[data-facet="where"]')!
    expect(where.contains(row('project'))).toBe(true)
    expect(where.contains(row('section'))).toBe(true)
    expect(lineText(container, 'where')).toMatch(/Home\s*Doing/)
    expect(container.querySelectorAll('[data-facet="where"] svg').length).toBe(2)
    await unmount()
  })

  it('the due carries its zone as a suffix only when fixed; no zone control at rest', async () => {
    const floating = await createTask({ title: 'Brush head', due: { date: '2026-11-07', time: '09:00' } })
    let view = await open(floating)
    expect(view.container.querySelectorAll('[data-facets] button[aria-label^="Time zone"]').length).toBe(0)
    expect(lineText(view.container, 'when')).not.toContain('New York')
    await view.unmount()
    const fixed = await createTask({ title: 'Call', due: { date: '2026-11-07', time: '09:00', tz: 'America/New_York' } })
    view = await open(fixed)
    expect(lineText(view.container, 'when')).toContain('New York')
    await view.unmount()
  })
})

describe('popover editors', () => {
  it('Enter on Do on opens the When popover with focus inside; Escape closes it with focus back on the part', async () => {
    const id = await createTask({ title: 'Plan', due: { date: '2026-10-15' } })
    const { valueButton, editor, unmount } = await open(id)
    const part = valueButton('due')
    expect(part.getAttribute('aria-expanded')).toBe('false')
    part.focus()
    await click(part) // Enter on a native button activates it
    await settle()
    expect(part.getAttribute('aria-expanded')).toBe('true')
    expect(editor()).toBeTruthy()
    expect(editor()!.querySelector('[data-when-shown="due"]')).toBeTruthy()
    await waitFor(() => !!editor()!.contains(document.activeElement), 'focus in the popover')
    await key(document.activeElement!, 'Escape')
    await settle()
    expect(editor()).toBeNull()
    expect(document.activeElement).toBe(valueButton('due'))
    await unmount()
  })

  it('activating the open part again closes it, every time (no flicker)', async () => {
    const id = await createTask({ title: 'Plan', due: { date: '2026-10-15' } })
    const { valueButton, editor, unmount } = await open(id)
    for (let i = 1; i <= 6; i++) {
      await click(valueButton('due'))
      await settle()
      expect(!!editor(), `after click ${i}`).toBe(i % 2 === 1)
    }
    await unmount()
  })

  it('the When popover shows one segment; the deadline part opens on Deadline and segments switch', async () => {
    const id = await createTask({ title: 'Report', due: { date: '2026-10-15' }, deadline: '2026-10-20' })
    const { valueButton, editor, unmount } = await open(id)
    await click(valueButton('deadline'))
    await settle()
    expect(editor()!.querySelectorAll('[data-when-segment]').length).toBe(1)
    expect(editor()!.querySelector('[data-when-segment="deadline"]')).toBeTruthy()
    await click(editor()!.querySelector('[data-when-tab="repeat"]')!)
    await settle()
    expect(editor()!.querySelector('[data-when-segment="repeat"]')).toBeTruthy()
    expect(editor()!.querySelector('[data-when-segment="deadline"]')).toBeNull()
    await unmount()
  })

  it('Clear in the footer removes the value and closes; no clear button sits on any line', async () => {
    const id = await createTask({ title: 'Report', deadline: '2026-10-20' })
    const { container, valueButton, editor, unmount } = await open(id)
    expect(container.querySelectorAll('[data-facets] button[aria-label^="Clear"]').length).toBe(0)
    await click(valueButton('deadline'))
    await settle()
    await click(editor()!.querySelector('[data-facet-clear]')!)
    await waitFor(async () => (await db.tasks.get(id))!.deadline === null, 'the deadline cleared')
    expect(editor()).toBeNull()
    await waitFor(() => !lineText(container, 'when').includes('deadline'))
    await unmount()
  })
})

describe('Add menu', () => {
  it('lists what is not set under Where, When, How and Who, with shortcuts, then the attach entries', async () => {
    const id = await createTask({ title: 'Report', deadline: '2026-10-20' })
    const { valueButton, addItems, unmount } = await open(id)
    const items = await addItems()
    const labels = items.map((i) => i.textContent ?? '')
    expect(labels.some((l) => l.includes('Deadline'))).toBe(false)
    expect(labels.some((l) => l.includes('Estimate') && l.includes('e'))).toBe(true)
    expect(labels.some((l) => l.includes('Blocked by'))).toBe(true)
    expect(labels.some((l) => l.includes('Choose files'))).toBe(true)
    const groups = [...document.querySelectorAll('[role="menu"] [role="group"]')].map((g) => g.querySelector('[id]')?.textContent)
    expect(groups).toEqual(expect.arrayContaining(['When', 'How', 'Who']))
    expect(labels.some((l) => l.includes('Origin'))).toBe(false)
    await key(document.activeElement!, 'Escape')
    await settle()
    expect(valueButton('deadline').textContent).toContain('deadline')
    await unmount()
  })

  it('Add then Estimate shows the part with its editor focused; Escape without a value removes it and focuses Add', async () => {
    const id = await createTask({ title: 'Blank' })
    const { row, add, addButton, editor, unmount } = await open(id)
    expect(row('estimate')).toBeNull()
    await add('Estimate')
    expect(row('estimate')).toBeTruthy()
    await waitFor(() => !!editor()?.contains(document.activeElement), 'focus in the estimate editor')
    await key(document.activeElement!, 'Escape')
    await flush(80)
    expect(row('estimate')).toBeNull()
    expect(document.activeElement).toBe(addButton())
    await unmount()
  })

  it('Add then Estimate with a value reads "P4 · 45m" on How, and Clear removes it', async () => {
    const id = await createTask({ title: 'Blank' })
    const { container, row, add, editor, valueButton, unmount } = await open(id)
    await add('Estimate')
    const input = editor()!.querySelector('input') as HTMLInputElement
    await type(input, '45m')
    await key(input, 'Enter')
    await waitFor(async () => (await db.tasks.get(id))!.estimate_minutes === 45, 'the estimate saved')
    await key(editor()!, 'Escape')
    await waitFor(() => !editor() && !!row('estimate')?.textContent?.includes('45m'), 'the editor closed on the saved value')
    expect(lineText(container, 'how')).toMatch(/P4\s*·\s*45m/)
    await click(valueButton('estimate'))
    await settle()
    await click(editor()!.querySelector('[data-facet-clear]')!)
    await waitFor(async () => (await db.tasks.get(id))!.estimate_minutes === null, 'the estimate cleared')
    await waitFor(() => !row('estimate'), 'the part removed')
    await unmount()
  })
})

// Task origins (OpenSpec change task-origin): a part of the Where line that opens its source.
describe('origin', () => {
  it('opens its URL in a new tab on Enter, shows its title as a tooltip, is never in Add, and Remove origin in the header menu clears it', async () => {
    const origin = { kind: 'url' as const, url: 'https://example.org/post', title: 'Interesting article' }
    const id = await createTask({ title: 'Read', description: 'https://example.org/post', origin })
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { container, row, valueButton, addItems, editor, unmount } = await open(id)
    expect(row('origin').textContent).toContain('example.org')
    const part = valueButton('origin')
    await act(async () => { part.focus() })
    expect(document.querySelector('[data-tooltip]')?.textContent).toBe('Interesting article')
    await click(part)
    expect(opened).toHaveBeenCalledWith('https://example.org/post', '_blank', expect.stringContaining('noopener'))
    expect(editor()).toBeNull()
    const items = await addItems()
    expect(items.some((i) => (i.textContent ?? '').includes('Origin'))).toBe(false)
    await key(document.activeElement!, 'Escape')
    await settle()
    await click(container.querySelector('button[aria-label="Task actions"]')!)
    await settle()
    await click([...document.querySelectorAll('[role="menuitem"]')].find((m) => m.textContent?.includes('Remove origin'))!)
    await waitFor(async () => (await db.tasks.get(id))!.origin === null, 'the origin cleared')
    await waitFor(() => !row('origin'), 'the part removed')
    expect((await db.tasks.get(id))!.description).toBe('https://example.org/post')
    opened.mockRestore()
    await unmount()
  })

  it('a task without an origin shows no origin part and Add does not offer one', async () => {
    const id = await createTask({ title: 'Plain' })
    const { row, addItems, unmount } = await open(id)
    expect(row('origin')).toBeNull()
    const items = await addItems()
    expect(items.some((i) => (i.textContent ?? '').includes('Origin'))).toBe(false)
    await unmount()
  })
})
