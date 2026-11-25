import { describe, expect, it } from 'vitest'
import { composing, composingEnter } from './composeKey'

describe('input-method composition (japanese)', () => {
  it('reads isComposing on the event or its native event', () => {
    expect(composing({ key: 'Escape', isComposing: true })).toBe(true)
    expect(composing({ key: 'ArrowDown', nativeEvent: { isComposing: true } })).toBe(true)
    expect(composing({ key: 'Escape' })).toBe(false)
  })
  it('falls back to key code 229 when isComposing is false (Safari)', () => {
    expect(composing({ key: 'Escape', isComposing: false, keyCode: 229 })).toBe(true)
    expect(composingEnter({ key: 'Enter', isComposing: false, nativeEvent: { isComposing: false, keyCode: 229 } })).toBe(true)
    expect(composingEnter({ key: 'Enter', keyCode: 13 })).toBe(false)
  })
  it('composingEnter is only Enter', () => {
    expect(composingEnter({ key: 'Escape', isComposing: true })).toBe(false)
    expect(composingEnter({ key: 'Enter', isComposing: true })).toBe(true)
  })
})
