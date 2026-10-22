// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { afterTap } from './afterTap'

const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)))

describe('afterTap (a comment\'s More on a phone)', () => {
  it('runs at once when no press started the blur (keyboard)', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 5000)
    const fn = vi.fn()
    afterTap(fn)
    expect(fn).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('after a press, waits for the click, then runs once', async () => {
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    const fn = vi.fn()
    afterTap(fn)
    await frame()
    expect(fn).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('click'))
    await frame()
    expect(fn).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event('click'))
    await frame()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('after a press with no click, runs after at most 600 ms', async () => {
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    const fn = vi.fn()
    afterTap(fn)
    await new Promise((r) => setTimeout(r, 650))
    await frame()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
