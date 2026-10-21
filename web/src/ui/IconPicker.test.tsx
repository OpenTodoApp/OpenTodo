// @vitest-environment happy-dom
// The icon picker (OpenSpec change icons-and-section-style, design-system "Icon
// catalogue"): type to search, grouped results, Enter picks, Esc closes without a
// change, category names in the interface language.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyCatalog } from '../lib/i18n/catalog'
import it_ from '../locales/it.json'
import { IconPicker } from './IconPicker'
import { loadCatalogue } from './icons/catalogue'
import { flush, key, render, type, waitFor } from './test-utils'

afterEach(() => {
  applyCatalog('en', 'en', {})
  document.body.innerHTML = ''
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
    await flush(10)
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

  it('matches category names in the interface language', async () => {
    await loadCatalogue()
    applyCatalog('it', 'it', it_ as Record<string, string>)
    const r = await render(<IconPicker value={null} onPick={() => {}} />)
    await waitFor(() => document.querySelector('[data-icon-option="briefcase"]') !== null, 'catalogue rendered')
    await type(field(), 'cibo')
    await flush(10)
    const groups = [...document.querySelectorAll('[data-icon-picker] [role="listbox"] > [role="group"]')].map((g) => g.getAttribute('aria-label'))
    expect(groups).toContain('Cibo')
    expect(document.querySelector('[data-icon-option="pizza"]')).not.toBeNull()
    await r.unmount()
  })
})
