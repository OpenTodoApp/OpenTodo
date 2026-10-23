// @vitest-environment happy-dom
// The quick-add palette (OpenSpec change palette-quick-add, design D2, D3;
// command-palette "Add mode"): field rows that follow the line, "Keep as text", the
// arrows and Tab that edit a row through the line, Shift+Enter, and the footer.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flush, key, render, type } from '../../ui/test-utils'
import { QuickAdd } from '../QuickAdd'

const projects = [{ id: 'p-home', name: 'Home renovation', color: '#e8894a' }, { id: 'p-work', name: 'Work' }]
const labels = [{ id: 'l-call', name: 'call' }]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 22, 12, 0)) // Thursday
})
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

const q = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)
const input = () => q<HTMLInputElement>('input[aria-label="Add a task"]')!
const row = (kind: string) => q(`[data-field-row="${kind}"]`)!
const highlighted = () => q('[data-highlighted]')?.getAttribute('data-field-row') ?? null

async function palette(props: { onAdd?: () => void; onAddAndOpen?: () => void; escape?: () => void } = {}) {
  return render(<QuickAdd layout="palette" placeholder="Add a task…" projects={projects} labels={labels}
    onAdd={props.onAdd ?? (() => {})} onAddAndOpen={props.onAddAndOpen} escape={{ label: 'Close', run: props.escape ?? (() => {}) }} />)
}

describe('field rows follow the line', () => {
  it('When, Project, Label, Priority and Estimate with values or hints, the keys, and the title in the footer', async () => {
    const r = await palette()
    expect([...document.querySelectorAll('[data-field-row]')].map((e) => e.getAttribute('data-field-row'))).toEqual(['when', 'project', 'label', 'priority', 'estimate'])
    expect(q('[data-quick-add-footer]')!.textContent).toContain('Understood as you type')
    await type(input(), 'Call Mia about the tiles tomorrow 5pm #HomeRenovation @call p2')
    expect(row('when').textContent).toContain('17:00')
    expect(row('project').textContent).toContain('Home renovation')
    expect(row('project').querySelector('kbd')!.textContent).toBe('#')
    expect(row('label').textContent).toContain('call')
    expect(row('priority').textContent).toContain('Priority 2')
    expect(row('estimate').hasAttribute('data-set')).toBe(false)
    expect(row('estimate').textContent).toContain('+30m')
    expect(q('[data-testid="quick-add-title"]')!.textContent).toContain('Call Mia about the tiles')
    await r.unmount()
  })

  it('Keep as text on the When row leaves the word in the title and no date', async () => {
    const onAdd = vi.fn()
    const r = await palette({ onAdd })
    await type(input(), 'Review may report')
    expect(row('when').hasAttribute('data-set')).toBe(true)
    await act(async () => { row('when').querySelector<HTMLButtonElement>('[data-keep-text]')!.click() })
    expect(row('when').hasAttribute('data-set')).toBe(false)
    expect(q('[data-testid="quick-add-title"]')!.textContent).toContain('Review may report')
    await act(async () => { input().form!.requestSubmit() })
    await flush(10)
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'Review may report' }))
    expect(onAdd.mock.calls[0][0].due).toBeUndefined()
    await r.unmount()
  })
})

describe('keys', () => {
  it('↓ highlights the rows in turn, ↑ from the first removes the highlight', async () => {
    const r = await palette()
    await type(input(), 'Buy primer')
    expect(highlighted()).toBeNull()
    await key(input(), 'ArrowDown')
    expect(highlighted()).toBe('when')
    await key(input(), 'ArrowDown')
    expect(highlighted()).toBe('project')
    await key(input(), 'ArrowUp')
    await key(input(), 'ArrowUp')
    expect(highlighted()).toBeNull()
    await r.unmount()
  })

  it('Tab on an unset Project row starts `#` at the end and opens the project suggestions', async () => {
    const r = await palette()
    await type(input(), 'Buy primer')
    await key(input(), 'ArrowDown')
    await key(input(), 'ArrowDown')
    await key(input(), 'Tab')
    await flush(40)
    expect(input().value).toBe('Buy primer #')
    expect(highlighted()).toBeNull()
    expect(q('[data-token-suggestions="project"]')).toBeTruthy()
    await r.unmount()
  })

  it('Tab on a set row selects its words, so typing replaces them', async () => {
    const r = await palette()
    await type(input(), 'Pay rent friday')
    await key(input(), 'ArrowDown')
    await key(input(), 'Tab')
    await flush(40)
    expect([input().selectionStart, input().selectionEnd]).toEqual([9, 15])
    await r.unmount()
  })

  it('a click on a row edits it too; Tab without a highlight is left to the browser', async () => {
    const r = await palette()
    await type(input(), 'Draft the offer')
    await act(async () => { row('estimate').click() })
    await flush(40)
    expect(input().value).toBe('Draft the offer +')
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    await act(async () => { input().dispatchEvent(tab) })
    expect(tab.defaultPrevented).toBe(false)
    await r.unmount()
  })

  it('Shift+Enter adds and opens; Escape clears a highlight before anything else', async () => {
    const onAdd = vi.fn()
    const onAddAndOpen = vi.fn()
    const r = await palette({ onAdd, onAddAndOpen })
    await type(input(), 'Draft the offer #Work')
    await key(input(), 'ArrowDown')
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    const outside = vi.fn()
    document.addEventListener('keydown', outside)
    await act(async () => { input().dispatchEvent(esc) })
    expect(highlighted()).toBeNull()
    expect(outside).not.toHaveBeenCalled()
    document.removeEventListener('keydown', outside)
    await key(input(), 'Enter', { shiftKey: true })
    await flush(10)
    expect(onAdd).not.toHaveBeenCalled()
    expect(onAddAndOpen).toHaveBeenCalledWith(expect.objectContaining({ title: 'Draft the offer', project_id: 'p-work' }))
    await r.unmount()
  })

  it('the footer Esc runs the escape action', async () => {
    const escape = vi.fn()
    const r = await palette({ escape })
    expect(q('[data-quick-add-escape]')!.textContent).toContain('Close')
    await act(async () => { q<HTMLButtonElement>('[data-quick-add-escape]')!.click() })
    expect(escape).toHaveBeenCalled()
    await r.unmount()
  })
})
