// @vitest-environment happy-dom
// Menus, popovers and pickers below 640 px (OpenSpec change phone-v2, design D5): a
// bottom sheet with a drag handle, at most 90 dvh, closed by a drag down on its top
// row; and the toast lifted above the phone's tab bar and add button.
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { click, flush, render } from '../test-utils'
import { MenuItem } from '../Menu'
import { Menu } from './Menu'

const original = window.matchMedia
beforeEach(() => {
  window.matchMedia = ((q: string) => ({
    matches: Number(/min-width:\s*(\d+)px/.exec(q)?.[1] ?? 0) <= 390, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
})
afterEach(() => { window.matchMedia = original; document.body.innerHTML = '' })

function touch(el: Element, type: 'touchstart' | 'touchend', x: number, y: number) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  const point = { clientX: x, clientY: y }
  Object.defineProperty(e, 'touches', { value: type === 'touchstart' ? [point] : [] })
  Object.defineProperty(e, 'changedTouches', { value: [point] })
  el.dispatchEvent(e)
}

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <Menu kind="menu" label="Row menu" trigger="Open" open={open} onOpenChange={setOpen}>
      <MenuItem label="Complete" onSelect={() => {}} />
    </Menu>
  )
}

describe('a menu below 640 px', () => {
  it('is a sheet with a drag handle and a 90 dvh cap; a drag down on its top row closes it, a short one does not', async () => {
    const r = await render(<Harness />)
    await click(r.container.querySelector('button')!)
    const sheet = document.querySelector('[data-overlay="sheet"]')!
    expect(sheet.className).toContain('max-h-[90dvh]')
    const handle = sheet.querySelector('[data-sheet-handle]')!
    expect(handle).toBeTruthy()
    const top = handle.parentElement!
    touch(top, 'touchstart', 100, 10); touch(top, 'touchend', 100, 50)
    expect(document.querySelector('[data-overlay="sheet"]')).toBeTruthy()
    touch(top, 'touchstart', 100, 10); touch(top, 'touchend', 104, 140)
    await flush(20)
    expect(document.querySelector('[data-overlay="sheet"]')).toBeNull()
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
