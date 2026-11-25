// @vitest-environment happy-dom
// The overlay stack leaves a composing Escape to the input method (OpenSpec change
// composition-keys): Safari reports it as key code 229 with isComposing false.
import { describe, expect, it, vi } from 'vitest'
import { pushOverlay } from './stack'

const escape = (init: KeyboardEventInit = {}, keyCode?: number) => {
  const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ...init })
  if (keyCode !== undefined) Object.defineProperty(e, 'keyCode', { get: () => keyCode })
  document.body.dispatchEvent(e)
  return e
}

describe('overlay stack and composition', () => {
  it('does not close the top overlay on a composing Escape, and closes it after', () => {
    const close = vi.fn()
    const top = pushOverlay(close)
    expect(escape({ isComposing: true }).defaultPrevented).toBe(false)
    expect(escape({}, 229).defaultPrevented).toBe(false)
    expect(close).not.toHaveBeenCalled()
    expect(escape().defaultPrevented).toBe(true)
    expect(close).toHaveBeenCalledOnce()
    top.pop()
  })
})
