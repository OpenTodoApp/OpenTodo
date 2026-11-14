// @vitest-environment happy-dom
// The icon picker (OpenSpec change icons-and-section-style, design-system "Icon
// catalogue"): type to search, grouped results, Enter picks, Esc closes without a
// change, category names in the interface language.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyCatalog } from '../lib/i18n/catalog'
import it_ from '../locales/it.json'
import { IconPicker, TOUCH_GRID } from './IconPicker'
import { loadCatalogue } from './icons/catalogue'
import { key, render, type, waitFor } from './test-utils'

afterEach(() => {
  applyCatalog('en', 'en', {})
})

const field = () => document.querySelector<HTMLInputElement>('[data-icon-picker] input[role="combobox"]')!
const active = () => document.getElementById(field().getAttribute('aria-activedescendant') ?? '')?.getAttribute('data-icon-option')

describe('IconPicker', () => {
  it('finds the paw and dog icons for "dog"; Enter picks the first', async () => {
    await loadCatalogue()
    const onPick = vi.fn()
    const r = await render(<IconPicker value={null} onPick={onPick} />)
    await waitFor(() => document.querySelector('[data-icon-option="briefcase"]') !== null, 'catalogue rendered')
    expect(document.querySelector('[data-icon-option="none"]')?.getAttribute('aria-selected')).toBe('true')
    await type(field(), 'dog')
    await waitFor(() => document.querySelector('[data-icon-option]')?.getAttribute('data-icon-option') === 'dog', 'the search results')
    const listed = [...document.querySelectorAll('[data-icon-option]')].map((o) => o.getAttribute('data-icon-option'))
    expect(listed[0]).toBe('dog')
    expect(listed).toContain('paw-print')
    expect(listed).not.toContain('none')
    // Grouped under the category name.
    expect(document.querySelector('[data-icon-option="dog"]')?.closest('[role="group"]')?.getAttribute('aria-label')).toBe('Animals')
    expect(active()).toBe('dog')
    await key(field(), 'Enter')
    expect(onPick).toHaveBeenCalledWith('dog')
    await r.unmount()
  })

  it('moves through the grid with the arrow keys, and Esc closes without a change', async () => {
    await loadCatalogue()
    const onPick = vi.fn()
    const onClose = vi.fn()
    const r = await render(<IconPicker value="briefcase" onPick={onPick} onClose={onClose} />)
    await waitFor(() => document.querySelector('[data-icon-option="briefcase"]') !== null, 'catalogue rendered')
    expect(document.querySelector('[data-icon-option="briefcase"]')?.getAttribute('aria-selected')).toBe('true')
    expect(active()).toBe('briefcase')
    await key(field(), 'ArrowRight')
    expect(active()).not.toBe('briefcase')
    await key(field(), 'ArrowLeft')
    expect(active()).toBe('briefcase')
    await key(field(), 'ArrowUp')
    expect(active()).toBe('none')
    await key(field(), 'Escape')
    expect(onClose).toHaveBeenCalled()
    expect(onPick).not.toHaveBeenCalled()
    await r.unmount()
  })

  it('moves by the columns the grid is drawn in (seven 44 px cells on a phone), and marks the cells as touch targets', async () => {
    await loadCatalogue()
    // The browser lays the touch grid out; the test stands in for it with seven tracks.
    const real = window.getComputedStyle
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => (
      (el as Element).hasAttribute('data-icon-grid') ? { gridTemplateColumns: Array(7).fill('44px').join(' ') } as CSSStyleDeclaration : real.call(window, el, pseudo)
    ))
    try {
      const r = await render(<IconPicker value="briefcase" onPick={() => {}} />)
      await waitFor(() => document.querySelector('[data-icon-option="briefcase"]') !== null, 'catalogue rendered')
      const names = [...document.querySelectorAll('[data-icon-grid]')[0].querySelectorAll('[data-icon-option]')].map((o) => o.getAttribute('data-icon-option'))
      expect(names[0]).toBe('briefcase')
      await key(field(), 'ArrowDown')
      expect(active()).toBe(names[7])
      await key(field(), 'ArrowUp')
      expect(active()).toBe('briefcase')
      const cell = document.querySelector('[data-icon-option="briefcase"]')!
      expect(cell.className).toContain('touch-target')
      expect(document.querySelector('[data-icon-grid]')!.className).toContain(TOUCH_GRID)
      await r.unmount()
    } finally {
      spy.mockRestore()
    }
  })

  it('matches category names in the interface language', async () => {
    await loadCatalogue()
    applyCatalog('it', 'it', it_ as Record<string, string>)
    const r = await render(<IconPicker value={null} onPick={() => {}} />)
    await waitFor(() => document.querySelector('[data-icon-option="briefcase"]') !== null, 'catalogue rendered')
    await type(field(), 'cibo')
    await waitFor(() => !!document.querySelector('[data-icon-picker] [role="listbox"] > [role="group"][aria-label="Cibo"]'), 'the Italian group')
    const groups = [...document.querySelectorAll('[data-icon-picker] [role="listbox"] > [role="group"]')].map((g) => g.getAttribute('aria-label'))
    expect(groups).toContain('Cibo')
    expect(document.querySelector('[data-icon-option="pizza"]')).not.toBeNull()
    await r.unmount()
  })
})
