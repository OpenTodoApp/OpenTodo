// @vitest-environment happy-dom
// Tooltip (OpenSpec change ux-overhaul, design-system "Tooltip primitive").
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IconButton } from './Button'
import { render } from './test-utils'
import { Tooltip } from './Tooltip'

const tip = () => document.querySelector<HTMLElement>('[role="tooltip"]')

function mockPointer(coarse: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: coarse && q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }))
}

beforeEach(() => { vi.useFakeTimers(); mockPointer(false) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = '' })

// React derives onPointerEnter/Leave from pointerover/pointerout and onFocus/onBlur from focusin/focusout.
async function pointer(el: Element, type: 'pointerenter' | 'pointerleave', pointerType = 'mouse') {
  const name = type === 'pointerenter' ? 'pointerover' : 'pointerout'
  await act(async () => { el.dispatchEvent(new (window.PointerEvent ?? MouseEvent)(name, { bubbles: true, pointerType } as PointerEventInit)) })
}
async function focus(el: Element, type: 'focus' | 'blur') {
  await act(async () => { el.dispatchEvent(new FocusEvent(type === 'focus' ? 'focusin' : 'focusout', { bubbles: true })) })
}
const advance = (ms: number) => act(async () => { vi.advanceTimersByTime(ms) })

describe('Tooltip', () => {
  it('opens after the hover delay with the label and shortcut, and closes when the pointer leaves', async () => {
    const r = await render(<Tooltip label="Share project" shortcut="Shift+S"><button>Share</button></Tooltip>)
    const button = r.container.querySelector('button')!
    await pointer(button, 'pointerenter')
    expect(tip()).toBeNull()
    await advance(399)
    expect(tip()).toBeNull()
    await advance(1)
    expect(tip()!.textContent).toContain('Share project')
    expect(tip()!.querySelector('kbd')!.textContent).toBe('Shift+S')
    expect(button.getAttribute('aria-describedby')).toBe(tip()!.id)
    await pointer(button, 'pointerleave')
    expect(tip()).toBeNull()
    expect(button.getAttribute('aria-describedby')).toBeNull()
    await r.unmount()
  })

  it('opens at once on focus and closes on Escape and on blur', async () => {
    const r = await render(<Tooltip label="Notifications"><button>Bell</button></Tooltip>)
    const button = r.container.querySelector('button')!
    await focus(button, 'focus')
    expect(tip()).toBeTruthy()
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(tip()).toBeNull()
    await focus(button, 'focus')
    expect(tip()).toBeTruthy()
    await focus(button, 'blur')
    expect(tip()).toBeNull()
    await r.unmount()
  })

  it('does not open from a touch pointer or on a coarse-pointer device', async () => {
    const r = await render(<Tooltip label="Close"><button>×</button></Tooltip>)
    const button = r.container.querySelector('button')!
    await pointer(button, 'pointerenter', 'touch')
    await advance(1000)
    expect(tip()).toBeNull()
    mockPointer(true)
    await pointer(button, 'pointerenter')
    await advance(1000)
    expect(tip()).toBeNull()
    await r.unmount()
  })

  it('IconButton carries one by default and no native title', async () => {
    const r = await render(<IconButton icon="x" label="Close" />)
    const button = r.container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('Close')
    expect(button.getAttribute('title')).toBeNull()
    await focus(button, 'focus')
    expect(tip()!.textContent).toBe('Close')
    await r.unmount()
  })
})
