// @vitest-environment happy-dom
// Overlay motion (OpenSpec change motion-v2, web-app "Overlay motion", design D5): a
// dialog's exit plays on an inert copy after it unmounted, focus is back on the
// trigger before the exit ends, and the palette's fade closes at once.
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { click, flush, key, render } from '../test-utils'
import { Dialog } from './Dialog'

// happy-dom runs no animations: pretend the browser does, with one running on every element.
beforeEach(() => {
  Object.defineProperty(document, 'getAnimations', { value: () => [], configurable: true })
  vi.spyOn(Element.prototype, 'getAnimations').mockImplementation(function (this: Element) {
    return this.matches('[data-closing]') ? [{} as Animation] : []
  })
})
afterEach(() => {
  delete (document as { getAnimations?: unknown }).getAnimations
  delete document.documentElement.dataset.motion
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function Harness({ motion }: { motion?: 'dialog' | 'fade' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" data-trigger onClick={() => setOpen(true)}>Share</button>
      {open && <Dialog title="Share" motion={motion} onClose={() => setOpen(false)}><button type="button">Copy link</button></Dialog>}
    </>
  )
}

const exitCopy = () => document.querySelector<HTMLElement>('[data-overlay-exit]')

describe('dialog exit', () => {
  it('leaves an inert, hidden copy with data-closing while focus is already back on the trigger, then removes it', async () => {
    const r = await render(<Harness />)
    const trigger = r.container.querySelector<HTMLButtonElement>('[data-trigger]')!
    trigger.focus()
    await click(trigger)
    await flush(20)
    expect(document.querySelector('[data-overlay="dialog"]')!.className).toContain('dialog-card')
    await key(document.querySelector('[data-overlay="dialog"] button')!, 'Escape')
    await flush(10)
    expect(document.querySelector('[data-overlay="dialog"]')).toBeNull()
    const copy = exitCopy()!
    expect(copy).not.toBeNull()
    expect(copy.getAttribute('aria-hidden')).toBe('true')
    expect(copy.inert).toBe(true)
    expect(copy.querySelector('[role]')).toBeNull()
    expect(copy.querySelector('.dialog-card')!.hasAttribute('data-closing')).toBe(true)
    expect(document.activeElement).toBe(trigger)
    await flush(320)
    expect(exitCopy()).toBeNull()
    await r.unmount()
  })

  it('a dialog closed and reopened quickly leaves one copy at most and one open dialog', async () => {
    const r = await render(<Harness />)
    const trigger = r.container.querySelector<HTMLButtonElement>('[data-trigger]')!
    await click(trigger)
    await key(document.querySelector('[data-overlay="dialog"] button')!, 'Escape')
    await click(trigger)
    await flush(10)
    expect(document.querySelectorAll('[data-overlay="dialog"]')).toHaveLength(1)
    // The new dialog replaces the one still leaving.
    expect(document.querySelectorAll('[data-overlay-exit]')).toHaveLength(0)
    await r.unmount()
  })

  it('the palette motion fades in and closes at once; no motion plays no exit', async () => {
    const r = await render(<Harness motion="fade" />)
    await click(r.container.querySelector('[data-trigger]')!)
    expect(document.querySelector('[data-overlay="dialog"]')!.className).toContain('overlay-fade-in')
    await key(document.querySelector('[data-overlay="dialog"] button')!, 'Escape')
    expect(exitCopy()).toBeNull()
    await r.unmount()
    document.documentElement.dataset.motion = 'none'
    const n = await render(<Harness />)
    await click(n.container.querySelector('[data-trigger]')!)
    await key(document.querySelector('[data-overlay="dialog"] button')!, 'Escape')
    expect(exitCopy()).toBeNull()
    await n.unmount()
  })
})
