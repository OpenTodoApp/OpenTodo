import { describe, expect, it, vi } from 'vitest'
import { keepTouchActive } from './touchActive'

describe('keepTouchActive', () => {
  it('adds one passive touchstart listener and removes the same one', () => {
    const doc = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    const stop = keepTouchActive(doc)
    expect(doc.addEventListener).toHaveBeenCalledWith('touchstart', expect.any(Function), { passive: true })
    stop()
    expect(doc.removeEventListener).toHaveBeenCalledWith('touchstart', doc.addEventListener.mock.calls[0][1])
  })
})
