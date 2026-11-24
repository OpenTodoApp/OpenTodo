// @vitest-environment happy-dom
// Text size per device (text-size, GitHub issue 1414): Default follows the device,
// the steps override it, the choice stays on the device and lands on the root.
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '../ui/test-utils'
import { applyTextScale, clampScale, setTextSize, systemTextScale, TEXT_SIZE_KEY, textScale, useTextScale } from './textSize'

const scale = () => document.documentElement.style.getPropertyValue('--ot-text-scale')
const setShell = (s: unknown) => { (window as unknown as { opentodoShell?: unknown }).opentodoShell = s }

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('style')
  setShell(undefined)
})
afterEach(() => setShell(undefined))

function Harness() {
  useTextScale()
  return null
}

describe('the scale', () => {
  it('maps the steps and lets Default follow the device', () => {
    expect(textScale('large', 1.3)).toBe(1.125)
    expect(textScale('larger', 1)).toBe(1.25)
    expect(textScale('largest', 0.9)).toBe(1.5)
    expect(textScale('default', 1.3)).toBe(1.3)
  })

  it('clamps a system scale to 85-200 % and reads garbage as 1', () => {
    expect(clampScale(3.1)).toBe(2)
    expect(clampScale(0.5)).toBe(0.85)
    expect(clampScale(Number.NaN)).toBe(1)
    expect(clampScale('2')).toBe(1)
    expect(clampScale(undefined)).toBe(1)
  })

  it('is 1 in a browser and the font scale in the Android app', () => {
    expect(systemTextScale()).toBe(1)
    setShell({ bridge: 1, platform: 'android', app: '1.0.0', capabilities: [], textScale: 1.3 })
    expect(systemTextScale()).toBe(1.3)
    setShell({ bridge: 1, platform: 'android', app: '1.0.0', capabilities: [] })
    expect(systemTextScale()).toBe(1)
  })

  it('reads Dynamic Type from the probe in the iOS app', () => {
    setShell({ bridge: 1, platform: 'ios', app: '1.0.0', capabilities: [] })
    const probe = document.createElement('span')
    probe.style.fontSize = '25.5px'
    document.body.append(probe)
    expect(systemTextScale(probe)).toBe(1.5)
    probe.remove()
  })

  it('writes the root property, and removes it at 1', () => {
    applyTextScale(1.25)
    expect(scale()).toBe('1.25')
    applyTextScale(1)
    expect(scale()).toBe('')
  })
})

describe('the device setting', () => {
  it('starts at Default, stores only a step, and follows changes', async () => {
    const r = await render(<Harness />)
    expect(scale()).toBe('')
    await act(async () => { setTextSize('largest') })
    expect(localStorage.getItem(TEXT_SIZE_KEY)).toBe('largest')
    expect(scale()).toBe('1.5')
    await act(async () => { setTextSize('default') })
    expect(localStorage.getItem(TEXT_SIZE_KEY)).toBeNull()
    expect(scale()).toBe('')
    await r.unmount()
  })

  it('keeps the Dynamic Type scale the boot script applied on the first render in the iOS app', async () => {
    setShell({ bridge: 1, platform: 'ios', app: '1.0.0', capabilities: [] })
    const real = window.getComputedStyle.bind(window)
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, p?: string | null) =>
      (el as HTMLElement).style?.cssText?.includes('-apple-system-body') ? ({ fontSize: '25.5px' } as CSSStyleDeclaration) : real(el, p))
    try {
      document.documentElement.style.setProperty('--ot-text-scale', '1.5')
      const r = await render(<Harness />)
      expect(scale()).toBe('1.5')
      await r.unmount()
    } finally {
      spy.mockRestore()
    }
  })

  it('tells the Android shell that the page applies the font scale', async () => {
    const applied = vi.fn()
    setShell({ bridge: 1, platform: 'android', app: '1.0.0', capabilities: [], textScale: 1.3, textScaleApplied: applied })
    const r = await render(<Harness />)
    expect(applied).toHaveBeenCalled()
    expect(scale()).toBe('1.3')
    await r.unmount()
  })

  it('reads an unknown stored value as Default', async () => {
    localStorage.setItem(TEXT_SIZE_KEY, 'enormous')
    const r = await render(<Harness />)
    expect(scale()).toBe('')
    await r.unmount()
  })
})
