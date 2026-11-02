// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { watchVisualViewport } from './stack'

// A stand-in for window.visualViewport: its size and scale, and the listeners the watcher adds.
function fakeViewport() {
  const listeners: Array<() => void> = []
  const vv = {
    height: window.innerHeight, offsetTop: 0, scale: 1,
    addEventListener: (_: string, fn: () => void) => { listeners.push(fn) },
    removeEventListener: () => {},
    set(h: number, scale = 1) { vv.height = h; vv.scale = scale; for (const fn of listeners) fn() },
  }
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
  return vv
}

describe('the on-screen keyboard (issue #724)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('puts a document Safari left scrolled back at the top when the keyboard closes', () => {
    const vv = fakeViewport()
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const stop = watchVisualViewport()
    vv.set(window.innerHeight - 300)
    Object.defineProperty(window, 'scrollY', { value: 120, configurable: true })
    expect(scrollTo).not.toHaveBeenCalled()
    vv.set(window.innerHeight)
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
    stop()
  })

  it('leaves a pinch zoom alone', () => {
    const vv = fakeViewport()
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const stop = watchVisualViewport()
    vv.set(window.innerHeight - 300)
    Object.defineProperty(window, 'scrollY', { value: 120, configurable: true })
    vv.set(window.innerHeight - 40, 1.1)
    expect(scrollTo).not.toHaveBeenCalled()
    stop()
  })
})
