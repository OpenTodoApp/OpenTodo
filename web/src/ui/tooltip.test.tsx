// @vitest-environment happy-dom
// Tooltip (OpenSpec change ux-overhaul, design-system "Tooltip primitive").
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IconButton } from './Button'
import { Icon } from './Icon'
import { Menu } from './overlay/Menu'
import { render } from './test-utils'
import { keyPress } from '../lib/focusSource'
import { Tooltip } from './Tooltip'
import { TruncatedText } from './TruncatedText'

const tip = () => document.querySelector<HTMLElement>('[role="tooltip"]')

function mockPointer(coarse: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: coarse && q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }))
}

beforeEach(() => { vi.useFakeTimers(); mockPointer(false) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

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

  // A tap in a browser: the pointer is down and up before the mousedown that moves focus.
  const press = (el: Element, type: string, pointerType: string) => act(async () => { el.dispatchEvent(new (window.PointerEvent ?? MouseEvent)(type, { bubbles: true, pointerType } as PointerEventInit)) })
  const key = (k: string, target: EventTarget = document.body) => act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) })

  it('does not open on the focus a tap leaves on the control, only on keyboard focus (issues 169, 1362)', async () => {
    mockPointer(true)
    const r = await render(<Tooltip label="Open menu"><button>≡</button></Tooltip>)
    const button = r.container.querySelector('button')!
    await pointer(button, 'pointerenter', 'touch')
    await press(button, 'pointerdown', 'touch')
    await press(button, 'pointerup', 'touch')
    await pointer(button, 'pointerleave', 'touch')
    await focus(button, 'focus')
    await advance(1000)
    expect(tip()).toBeNull()
    // Focus the page gives back after the tap (a sheet closed) is not keyboard focus either.
    await focus(button, 'blur')
    await focus(button, 'focus')
    expect(tip()).toBeNull()
    // Enter from the on-screen keyboard does not count; scripted keys are never a hardware keyboard.
    const field = document.createElement('input')
    document.body.append(field)
    await focus(button, 'blur')
    await key('Enter', field)
    await focus(button, 'focus')
    expect(tip()).toBeNull()
    field.remove()
    await r.unmount()
  })

  it('a key press on a touch-first device counts only when an on-screen keyboard cannot make it', () => {
    const field = document.createElement('input')
    const k = (init: Partial<KeyboardEvent>) => ({ isTrusted: true, key: 'a', keyCode: 65, isComposing: false, ctrlKey: false, metaKey: false, altKey: false, target: document.body, ...init }) as KeyboardEvent
    expect(keyPress(k({ key: 'Enter', target: field }), true)).toBe(false)
    expect(keyPress(k({ key: 'Tab', target: field }), true)).toBe(true)
    expect(keyPress(k({ key: 'j' }), true)).toBe(true)
    expect(keyPress(k({ key: 'Enter', target: field }), false)).toBe(true)
  })

  it('does not open on the focus a mouse click gives; Tab afterwards shows the tip', async () => {
    const r = await render(<Tooltip label="Open menu"><button>≡</button></Tooltip>)
    const button = r.container.querySelector('button')!
    await pointer(button, 'pointerenter')
    await advance(400)
    expect(tip()).toBeTruthy()
    await press(button, 'pointerdown', 'mouse')
    expect(tip()).toBeNull()
    await focus(button, 'focus')
    await press(button, 'pointerup', 'mouse')
    await advance(1000)
    expect(tip()).toBeNull()
    await focus(button, 'blur')
    await key('Tab')
    await focus(button, 'focus')
    expect(tip()!.textContent).toBe('Open menu')
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

  it('an icon-only menu trigger carries its name; a text trigger does not (issue 528)', async () => {
    const r = await render(<><Menu kind="menu" label="Filter" trigger={<Icon name="filter" />}>{null}</Menu><Menu kind="menu" label="View actions" trigger="More">{null}</Menu></>)
    const [icon, text] = r.container.querySelectorAll('button')
    await pointer(icon, 'pointerenter')
    await advance(500)
    expect(tip()!.textContent).toBe('Filter')
    await pointer(icon, 'pointerleave')
    await advance(500)
    await pointer(text, 'pointerenter')
    await advance(500)
    expect(tip()).toBeNull()
    await r.unmount()
  })
})

describe('TruncatedText (ux-fixes-phone D2)', () => {
  function measure(scroll: number, client: number) {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scroll)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(client)
  }
  afterEach(() => { vi.restoreAllMocks() })

  it('leaves text that fits plain: no tab stop, no tip', async () => {
    measure(80, 80)
    const r = await render(<TruncatedText text="Garden" />)
    const el = r.container.querySelector('span')!
    expect(el.textContent).toBe('Garden')
    expect(el.hasAttribute('tabindex')).toBe(false)
    expect(el.hasAttribute('data-tip')).toBe(false)
    await pointer(el, 'pointerenter')
    await advance(500)
    expect(tip()).toBeNull()
    await r.unmount()
  })

  it('makes cut text focusable and shows the whole text in the tip on focus', async () => {
    measure(300, 100)
    const r = await render(<TruncatedText as="h1" text="Home renovation with a rather long project name" />)
    const el = r.container.querySelector('h1')!
    expect(el.getAttribute('tabindex')).toBe('0')
    expect(el.getAttribute('data-tip')).toBe('Home renovation with a rather long project name')
    await focus(el, 'focus')
    expect(tip()!.textContent).toBe('Home renovation with a rather long project name')
    await r.unmount()
  })

  it('wrap="phone" takes the two-line phone rule instead of the one-line cut (phone-titles-everywhere)', async () => {
    measure(80, 80)
    const r = await render(<><TruncatedText text="Garden" /><TruncatedText as="p" wrap="phone" text="Paint the fence" /></>)
    expect(r.container.querySelector('span')!.className).toMatch(/(^| )truncate( |$)/)
    const p = r.container.querySelector('p')!
    expect(p.className).toMatch(/(^| )title-phone( |$)/)
    expect(p.className).not.toMatch(/(^| )truncate( |$)/)
    await r.unmount()
  })

  it('a disabled Tooltip never opens', async () => {
    const r = await render(<Tooltip label="Rename" disabled><button>Garden</button></Tooltip>)
    const button = r.container.querySelector('button')!
    await focus(button, 'focus')
    expect(tip()).toBeNull()
    await r.unmount()
  })
})
