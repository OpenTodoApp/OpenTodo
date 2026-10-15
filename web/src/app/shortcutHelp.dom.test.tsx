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
    const rows = [...document.querySelectorAll('[data-help-section] tr')].map((tr) => tr.textContent ?? '')
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row.toLowerCase()).toContain('dead')
    await type(input, 'zzzz')
    await flush(20)
    expect(document.body.textContent).toContain('No shortcut matches')
    await r.unmount()
  })

  it('caps the sheet at 80 % of the viewport with its own scroller, in two columns from 768 px', async () => {
    const r = await render(<ShortcutHelp onClose={() => {}} />)
    await flush()
    const sheet = document.querySelector('[data-shortcut-sheet]')!
    expect(sheet.className).toContain('sm:max-h-[calc(80dvh-9rem)]')
    expect(sheet.className).toContain('sm:overflow-y-auto')
    expect(sheet.querySelector('.md\\:grid-cols-2')).toBeTruthy()
    await r.unmount()
  })
})
