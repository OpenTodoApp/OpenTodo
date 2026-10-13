import { describe, expect, it } from 'vitest'
import { keepFocus } from './ReminderToasts'

// A focused element: its tag, and the ancestor selector it sits in (if any).
const el = (tagName: string, inside?: string) => ({
  tagName, isContentEditable: false,
  closest: (sel: string) => (inside && sel.includes(inside) ? ({} as Element) : null),
}) as unknown as HTMLElement

describe('keepFocus', () => {
  it('lets a new reminder take focus from the page', () => {
    expect(keepFocus(null)).toBe(false)
    expect(keepFocus(el('BODY'))).toBe(false)
    expect(keepFocus(el('BUTTON'))).toBe(false)
  })

  it('leaves focus in a field, an open popover or a menu', () => {
    expect(keepFocus(el('INPUT'))).toBe(true)
    expect(keepFocus(el('TEXTAREA'))).toBe(true)
    expect(keepFocus(el('BUTTON', '[role="dialog"]'))).toBe(true)
    expect(keepFocus(el('BUTTON', '[role="menu"]'))).toBe(true)
  })
})
