// @vitest-environment happy-dom
// The cheat sheet (OpenSpec change ux-overhaul, keyboard-shortcuts "Cheat sheet"):
// context first, searchable, capped height with its own scroller.
import { afterEach, describe, expect, it } from 'vitest'
import { flush, render, type } from '../ui/test-utils'
import { contextSections, orderedSections, ShortcutHelp } from './ShortcutHelp'

afterEach(() => { document.body.innerHTML = '' })

const sections = () => [...document.querySelectorAll('[data-help-section]')].map((s) => s.getAttribute('data-help-section'))

describe('context first', () => {
  it('orders a board context as Board, Tasks in a list, Everywhere, Go to, then the rest', () => {
    expect(contextSections({ view: 'project', board: true })).toEqual(['board', 'tasks'])
    expect(orderedSections({ view: 'project', board: true }).map((s) => s.title).slice(0, 4)).toEqual(['Board and timeline', 'Tasks in a list', 'Everywhere', 'Go to a view'])
    expect(orderedSections({ view: 'day' }).map((s) => s.id).slice(0, 3)).toEqual(['calendar', 'everywhere', 'go'])
    expect(orderedSections(undefined).map((s) => s.id).slice(0, 2)).toEqual(['everywhere', 'go'])
  })

  it('renders the context groups first and marks them', async () => {
    const r = await render(<ShortcutHelp onClose={() => {}} context={{ view: 'project', board: true }} />)
    await flush()
    expect(sections().slice(0, 4)).toEqual(['Board and timeline', 'Tasks in a list', 'Everywhere', 'Go to a view'])
    expect(document.querySelectorAll('[data-context-section]')).toHaveLength(2)
    await r.unmount()
  })
})

describe('search and size', () => {
  it('filters every group by key or description', async () => {
    const r = await render(<ShortcutHelp onClose={() => {}} context={{ view: 'inbox' }} />)
    await flush()
    const input = document.querySelector<HTMLInputElement>('[data-shortcut-search]')!
    expect(document.activeElement).toBe(input)
    await type(input, 'dead')
    await flush(20)
    const rows = [...document.querySelectorAll('[data-help-section] [data-sheet-row]')].map((tr) => tr.textContent ?? '')
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row.toLowerCase()).toContain('dead')
    await type(input, 'zzzz')
    await flush(20)
    expect(document.body.textContent).toContain('No shortcut matches')
    await r.unmount()
  })

  it('caps the sheet at 80 % of the viewport with its own scroller, in two columns from 768 px and three from 1280 px', async () => {
    const r = await render(<ShortcutHelp onClose={() => {}} />)
    await flush()
    const sheet = document.querySelector('[data-shortcut-sheet]')!
    expect(sheet.className).toContain('sm:max-h-[calc(80dvh-9rem)]')
    expect(sheet.className).toContain('sm:overflow-y-auto')
    expect(sheet.querySelector('.md\\:columns-2.xl\\:columns-3')).toBeTruthy()
    await r.unmount()
  })
})

describe('compact rows (shortcut-spotlight)', () => {
  it('shows a condition under the label, never inside a keycap, and the full description to assistive technology', async () => {
    const r = await render(<ShortcutHelp onClose={() => {}} />)
    await flush()
    const row = [...document.querySelectorAll('[data-sheet-row]')].find((li) => li.querySelector('[data-sheet-when]')?.textContent === 'proposed changes')!
    expect(row).toBeTruthy()
    expect([...row.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['Enter', 'Esc'])
    expect(row.querySelector('[data-keys]')!.textContent).not.toContain('proposed')
    expect(row.querySelector('.sr-only')!.textContent).toBe('Apply the checked changes / discard the proposal; Space toggles an item')
    await r.unmount()
  })

  it('reads a sequence as keycaps joined by "then", with its short label', async () => {
    const r = await render(<ShortcutHelp onClose={() => {}} />)
    await flush()
    const row = [...document.querySelectorAll('[data-help-section="Go to a view"] [data-sheet-row]')].find((li) => li.querySelector('[aria-hidden]')?.textContent === 'Today')!
    expect([...row.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['g', 't'])
    expect(row.querySelector('[data-keys]')!.textContent).toContain('then')
    await r.unmount()
  })

  it('rows that share a head read their own action (In the Trash: …)', async () => {
    const r = await render(<ShortcutHelp onClose={() => {}} />)
    await flush()
    const labels = [...document.querySelectorAll('[data-sheet-row] [aria-hidden]')].map((s) => s.textContent)
    expect(labels).not.toContain('In the Trash')
    expect(labels).toContain('Restore the selected item')
    await r.unmount()
  })
})
