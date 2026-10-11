import { describe, expect, it, vi } from 'vitest'
import { place } from './position'
import { captureFocus, escapeTop, lockScroll, overlayDepth, pushOverlay } from './stack'

const vp = { width: 768, height: 1024 }
const panel = { width: 224, height: 200 }

describe('place (anchored popovers from 640 px up)', () => {
  it('opens below the trigger, aligned to its end edge', () => {
    const p = place({ top: 100, bottom: 130, left: 500, right: 540 }, panel, vp)
    expect(p).toEqual({ top: 134, left: 316, side: 'bottom' })
  })

  it('shifts a panel whose trigger sits near the left edge back inside the screen', () => {
    // End-aligned to a trigger at x 20..50 would start at -174.
    const p = place({ top: 100, bottom: 130, left: 20, right: 50 }, panel, vp)
    expect(p.left).toBe(8)
    // Start-aligned near the right edge.
    const q = place({ top: 100, bottom: 130, left: 740, right: 760 }, panel, vp, { align: 'start' })
    expect(q.left).toBe(768 - 8 - 224)
  })

  it('flips above the trigger when there is no room below', () => {
    const p = place({ top: 900, bottom: 930, left: 300, right: 340 }, panel, vp)
    expect(p.side).toBe('top')
    expect(p.top).toBe(900 - 4 - 200)
  })

  it('stays on the preferred side and caps the height when neither side fits', () => {
    const tall = { width: 224, height: 900 }
    const p = place({ top: 300, bottom: 330, left: 300, right: 340 }, tall, vp)
    expect(p.side).toBe('bottom')
    expect(p.maxHeight).toBe(1024 - 8 - 334)
    expect(p.top + (p.maxHeight ?? 0)).toBeLessThanOrEqual(1024 - 8)
  })

  it('narrows a panel wider than the viewport', () => {
    const p = place({ top: 10, bottom: 40, left: 10, right: 40 }, { width: 900, height: 100 }, { width: 640, height: 800 })
    expect(p.left).toBe(8)
    expect(p.maxWidth).toBe(624)
  })
})

describe('overlay stack', () => {
  it('only the topmost overlay answers Escape', () => {
    const a = vi.fn(), b = vi.fn()
    const first = pushOverlay(a, null)
    const second = pushOverlay(b, null)
    expect(overlayDepth()).toBe(2)
    escapeTop()
    expect(b).toHaveBeenCalledTimes(1)
    expect(a).not.toHaveBeenCalled()
    second.pop()
    escapeTop()
    expect(a).toHaveBeenCalledTimes(1)
    first.pop()
    expect(escapeTop()).toBe(false)
  })
})

describe('scroll lock', () => {
  it('locks the page while any overlay is open and restores the previous value', () => {
    const body = { style: { overflow: 'scroll' } }
    const r1 = lockScroll(body)
    const r2 = lockScroll(body)
    expect(body.style.overflow).toBe('hidden')
    r1()
    r1() // releasing twice is harmless
    expect(body.style.overflow).toBe('hidden')
    r2()
    expect(body.style.overflow).toBe('scroll')
  })
})

describe('focus return', () => {
  it('returns focus to the trigger when focus fell back to the body', () => {
    const trigger = { focus: vi.fn(), isConnected: true }
    const doc = { activeElement: null as unknown, body: {} }
    const restore = captureFocus(trigger, doc)
    doc.activeElement = doc.body
    restore()
    expect(trigger.focus).toHaveBeenCalledTimes(1)
  })

  it('returns focus to the element focused at open time when there is no trigger', () => {
    const before = { focus: vi.fn() }
    const doc = { activeElement: before as unknown, body: {} }
    const inside = {}
    const restore = captureFocus(null, doc, (el) => el === inside)
    doc.activeElement = inside
    restore()
    expect(before.focus).toHaveBeenCalledTimes(1)
  })

  it('leaves focus alone when an action moved it elsewhere (an inline editor)', () => {
    const trigger = { focus: vi.fn(), isConnected: true }
    const doc = { activeElement: null as unknown, body: {} }
    const restore = captureFocus(trigger, doc, () => false)
    doc.activeElement = { tagName: 'INPUT' }
    restore()
    expect(trigger.focus).not.toHaveBeenCalled()
  })

  it('skips a trigger that is no longer in the document', () => {
    const trigger = { focus: vi.fn(), isConnected: false }
    const restore = captureFocus(trigger, { activeElement: null, body: {} })
    restore()
    expect(trigger.focus).not.toHaveBeenCalled()
  })
})
