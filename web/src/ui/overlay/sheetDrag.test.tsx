// @vitest-environment happy-dom
// Bottom sheets are dragged away (OpenSpec changes phone-v2 D5 and sheet-drag-dismiss):
// a menu below 640 px and a dialog shown as a sheet share one drag (sheetDrag.ts). The
// sheet follows the finger from its handle or header, and from its body while nothing
// there is scrolled; it closes past 80 px or on a flick and springs back otherwise.
// And the toast lifted above the phone's tab bar and add button.
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { click, render, minWidthPx, waitFor } from '../test-utils'
import { MenuItem } from '../Menu'
import { Dialog } from './Dialog'
import { Menu } from './Menu'

const original = window.matchMedia
let reduced = false
beforeEach(() => {
  reduced = false
  window.matchMedia = ((q: string) => ({
    matches: q.includes('prefers-reduced-motion') ? reduced : minWidthPx(q) <= 390, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
})
afterEach(() => { window.matchMedia = original; delete document.documentElement.dataset.motion })

/** One touch event at a point; `at` is its time in ms. True when the default (scrolling) was prevented. */
function touch(el: Element, type: 'touchstart' | 'touchmove' | 'touchend', x: number, y: number, at = 0): boolean {
  const e = new Event(type, { bubbles: true, cancelable: true })
  const point = { clientX: x, clientY: y }
  Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [point] })
  Object.defineProperty(e, 'changedTouches', { value: [point] })
  Object.defineProperty(e, 'timeStamp', { value: at })
  el.dispatchEvent(e)
  return e.defaultPrevented
}

/** A slow drag from y 10 down by `dy`, released after a rest (no flick). */
function drag(el: Element, dy: number, release = true) {
  touch(el, 'touchstart', 100, 10, 0)
  touch(el, 'touchmove', 100, 10 + dy / 2, 300)
  touch(el, 'touchmove', 100, 10 + dy, 600)
  if (release) touch(el, 'touchend', 100, 10 + dy, 900)
}

function MenuHarness() {
  const [open, setOpen] = useState(false)
  return (
    <Menu kind="menu" label="Row menu" trigger="Open" open={open} onOpenChange={setOpen}>
      <MenuItem label="Complete" onSelect={() => {}} />
    </Menu>
  )
}

function SheetHarness({ dismissable, placement = 'sheet' }: { dismissable?: boolean; placement?: 'sheet' | 'center' }) {
  const [open, setOpen] = useState(true)
  return open
    ? <Dialog title="Start guide" placement={placement} dismissable={dismissable} onClose={() => setOpen(false)}><div data-scroller style={{ overflowY: 'auto' }}><p data-body>Three steps.</p></div><input aria-label="Name" /></Dialog>
    : <p data-closed>closed</p>
}

const dialog = () => document.querySelector<HTMLElement>('[data-overlay="dialog"]')
async function openSheet(props: Parameters<typeof SheetHarness>[0] = {}) {
  const r = await render(<SheetHarness {...props} />)
  await waitFor(() => !!dialog(), 'the dialog')
  return r
}

describe('a menu below 640 px', () => {
  it('is a sheet with a drag handle and a 90 dvh cap; a drag down on its top row closes it, a short one does not', async () => {
    const r = await render(<MenuHarness />)
    await click(r.container.querySelector('button')!)
    const sheet = document.querySelector<HTMLElement>('[data-overlay="sheet"]')!
    // 90 dvh, and never above the top safe area with the keyboard open (GitHub issue 973).
    expect(sheet.getAttribute('style')).toMatch(/max-height: min\(90dvh, calc\(100dvh - var\(--vv-bottom, 0px\) - var\(--safe-top\)/)
    const handle = sheet.querySelector('[data-sheet-handle]')!
    expect(handle).toBeTruthy()
    const top = handle.parentElement!
    touch(top, 'touchstart', 100, 10); touch(top, 'touchend', 100, 50)
    expect(document.querySelector('[data-overlay="sheet"]')).toBeTruthy()
    touch(top, 'touchstart', 100, 10); touch(top, 'touchend', 104, 140)
    await waitFor(() => !document.querySelector('[data-overlay="sheet"]'), 'the sheet closed')
    expect(document.querySelector('[data-overlay="sheet"]')).toBeNull()
    await r.unmount()
  })

  it('follows the finger, and from its list too while the list is at its top', async () => {
    const r = await render(<MenuHarness />)
    await click(r.container.querySelector('button')!)
    const sheet = document.querySelector<HTMLElement>('[data-overlay="sheet"]')!
    drag(sheet.querySelector('[role="menuitem"]')!, 40, false)
    expect(sheet.style.translate).toBe('0 40px')
    touch(sheet, 'touchend', 100, 50, 900)
    expect(sheet.style.translate).toBe('')
    expect(document.querySelector('[data-overlay="sheet"]')).toBeTruthy()
    await r.unmount()
  })
})

describe('a dialog shown as a bottom sheet', () => {
  it('has a handle, follows a drag on its header and closes when released past 80 px', async () => {
    const r = await openSheet()
    const sheet = dialog()!
    const grip = sheet.querySelector('[data-sheet-handle]')!.parentElement!
    expect(grip.hasAttribute('data-sheet-grip')).toBe(true)
    drag(grip, 120, false)
    expect(sheet.style.translate).toBe('0 120px')
    touch(grip, 'touchend', 100, 130, 900)
    await waitFor(() => !dialog(), 'the sheet closed')
    expect(r.container.querySelector('[data-closed]')).not.toBeNull()
    await r.unmount()
  })

  it('springs back after a short drag with the emphasis spring, and never moves up', async () => {
    const r = await openSheet()
    const sheet = dialog()!
    const grip = sheet.querySelector('[data-sheet-grip]')!
    touch(grip, 'touchstart', 100, 100, 0)
    expect(touch(grip, 'touchmove', 100, 140, 300)).toBe(true)
    expect(sheet.style.translate).toBe('0 40px')
    touch(grip, 'touchend', 100, 140, 600)
    expect(sheet.style.translate).toBe('')
    expect(sheet.style.transition).toBe('translate var(--duration-emphasis) var(--ease-spring)')
    expect(dialog()).not.toBeNull()
    // Up: not the sheet's gesture, also when the finger comes back down.
    touch(grip, 'touchstart', 100, 100, 0)
    expect(touch(grip, 'touchmove', 100, 40, 300)).toBe(false)
    expect(touch(grip, 'touchmove', 100, 200, 600)).toBe(false)
    touch(grip, 'touchend', 100, 200, 900)
    expect(dialog()).not.toBeNull()
    await r.unmount()
  })

  it('closes on a downward flick shorter than 80 px, not on a slow drag of the same length', async () => {
    const r = await openSheet()
    const grip = dialog()!.querySelector('[data-sheet-grip]')!
    drag(grip, 50)
    expect(dialog()).not.toBeNull()
    touch(grip, 'touchstart', 100, 10, 0)
    touch(grip, 'touchmove', 100, 30, 16)
    touch(grip, 'touchmove', 100, 60, 32)
    touch(grip, 'touchend', 100, 60, 40)
    await waitFor(() => !dialog(), 'the sheet closed')
    await r.unmount()
  })

  it('leaves a scrolled body to scroll, and a field to its text', async () => {
    const r = await openSheet()
    const sheet = dialog()!
    const body = sheet.querySelector('[data-body]')!
    sheet.querySelector<HTMLElement>('[data-scroller]')!.scrollTop = 30
    touch(body, 'touchstart', 100, 10, 0)
    expect(touch(body, 'touchmove', 100, 150, 300)).toBe(false)
    touch(body, 'touchend', 100, 150, 600)
    expect(sheet.style.translate).toBe('')
    expect(dialog()).not.toBeNull()
    drag(sheet.querySelector('input')!, 150)
    expect(dialog()).not.toBeNull()
    // The header still drags the sheet while its body is scrolled.
    drag(sheet.querySelector('[data-sheet-grip]')!, 150)
    await waitFor(() => !dialog(), 'the sheet closed')
    await r.unmount()
  })

  it('ignores the drag when it ignores a tap outside, and shows no handle', async () => {
    const r = await openSheet({ dismissable: false })
    const sheet = dialog()!
    expect(sheet.querySelector('[data-sheet-handle]')).toBeNull()
    await click(document.querySelector('[data-overlay-root]')!)
    drag(sheet.querySelector('h2')!, 200)
    expect(sheet.style.translate).toBe('')
    expect(dialog()).not.toBeNull()
    await r.unmount()
  })

  it('leaves from where the finger left it: the exit copy keeps the offset', async () => {
    // happy-dom runs no animations: pretend the browser does, as overlayMotion.test.tsx does.
    Object.defineProperty(document, 'getAnimations', { value: () => [], configurable: true })
    vi.spyOn(Element.prototype, 'getAnimations').mockImplementation(function (this: Element) { return this.matches('[data-closing]') ? [{} as Animation] : [] })
    const r = await openSheet()
    drag(dialog()!.querySelector('[data-sheet-grip]')!, 120)
    await waitFor(() => !dialog(), 'the sheet closed')
    const copy = document.querySelector<HTMLElement>('[data-overlay-exit]')!
    expect(copy.style.translate).toBe('none')
    expect(copy.querySelector<HTMLElement>('[data-closing]')!.style.translate).toBe('0 120px')
    copy.remove()
    delete (document as { getAnimations?: unknown }).getAnimations
    vi.restoreAllMocks()
    await r.unmount()
  })

  it('comes back in place when its owner keeps it open', async () => {
    const r = await render(<Dialog title="Draft" placement="sheet" onClose={() => {}}><p>Unsent</p></Dialog>)
    await waitFor(() => !!dialog(), 'the dialog')
    const sheet = dialog()!
    drag(sheet.querySelector('[data-sheet-grip]')!, 120)
    expect(sheet.style.translate).toBe('0 120px')
    await waitFor(() => sheet.style.translate === '', 'the sheet back in place')
    expect(dialog()).not.toBeNull()
    await r.unmount()
  })

  it('is not dragged when it is full screen', async () => {
    const r = await openSheet({ placement: 'center' })
    const sheet = dialog()!
    expect(sheet.querySelector('[data-sheet-handle]')).toBeNull()
    drag(sheet.querySelector('h2')!, 200)
    expect(sheet.style.translate).toBe('')
    expect(dialog()).not.toBeNull()
    await r.unmount()
  })

  it.each(['reduced', 'none'] as const)('stays still under %s motion: it closes past the threshold or stays', async (mode) => {
    if (mode === 'reduced') reduced = true
    else document.documentElement.dataset.motion = 'none'
    const r = await openSheet()
    const sheet = dialog()!
    const grip = sheet.querySelector('[data-sheet-grip]')!
    drag(grip, 40, false)
    expect(sheet.style.translate).toBe('')
    touch(grip, 'touchend', 100, 50, 900)
    expect(sheet.style.transition).toBe('')
    expect(dialog()).not.toBeNull()
    drag(grip, 120, false)
    expect(sheet.style.translate).toBe('')
    touch(grip, 'touchend', 100, 130, 900)
    await waitFor(() => !dialog(), 'the sheet closed')
    await r.unmount()
  })
})

describe('the toast on a phone', () => {
  it('sits on --toast-lift, which the shell sets above the tab bar and the add button', async () => {
    const { ToastRegion } = await import('./Toasts')
    const r = await render(<ToastRegion><p>Saved</p></ToastRegion>)
    const region = r.container.querySelector<HTMLElement>('[style*="bottom"]') ?? document.querySelector<HTMLElement>('[style*="--toast-lift"]')!
    expect(region.style.bottom).toContain('var(--toast-lift, 0px)')
    await r.unmount()
  })
})
