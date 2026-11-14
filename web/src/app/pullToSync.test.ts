// @vitest-environment happy-dom
// Pull to sync (OpenSpec change pull-to-sync, GitHub issue 1342): what makes a touch
// a pull, and what leaves it to the page, a row, the edge or another gesture.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ownsTouch, PULL, pullFires, pullLockOf, pullOffset, pullStarts, watchPull, type PullStart } from './pullToSync'
import { lockOf, SWIPE } from './rowSwipe'

const atTop: PullStart = { touches: 1, x: 180, scrollTop: 0, busy: false, modal: false, selecting: false, owned: false }

describe('pull decisions', () => {
  it('starts only with one finger on a page at its top that nothing else owns', () => {
    expect(pullStarts(atTop)).toBe(true)
    expect(pullStarts({ ...atTop, scrollTop: 1 })).toBe(false)
    expect(pullStarts({ ...atTop, touches: 2 })).toBe(false)
    expect(pullStarts({ ...atTop, x: SWIPE.edge - 1 })).toBe(false)
    expect(pullStarts({ ...atTop, busy: true })).toBe(false)
    expect(pullStarts({ ...atTop, modal: true })).toBe(false)
    expect(pullStarts({ ...atTop, selecting: true })).toBe(false)
    expect(pullStarts({ ...atTop, owned: true })).toBe(false)
  })

  it('locks on a clearly vertical move down', () => {
    expect(pullLockOf(0, PULL.lock - 1)).toBeNull()
    expect(pullLockOf(0, PULL.lock)).toBe('pull')
    expect(pullLockOf(5, 14)).toBe('pull')
    // Up is the list's own scroll: never a pull, whatever the distance.
    expect(pullLockOf(0, -40)).toBeNull()
  })

  it('leaves a sideways or diagonal move to the rows and the edge', () => {
    expect(pullLockOf(SWIPE.lockX, 0)).toBe('leave')
    expect(pullLockOf(-SWIPE.lockX, 4)).toBe('leave')
    expect(pullLockOf(10, 14)).toBe('leave')
    // Every move a row swipe takes is one the pull leaves.
    for (const [dx, dy] of [[12, 0], [-12, 7], [40, 3]]) {
      expect(lockOf(dx, dy)).toBe('swipe')
      expect(pullLockOf(dx, dy)).toBe('leave')
    }
  })

  it('damps and clamps the travel, and fires from the threshold', () => {
    expect(pullOffset(-20)).toBe(0)
    expect(pullOffset(60)).toBe(60 * PULL.resistance)
    expect(pullOffset(10_000)).toBe(PULL.max)
    expect(pullFires(PULL.threshold - 1)).toBe(false)
    expect(pullFires(PULL.threshold)).toBe(true)
    expect(pullFires(pullOffset(10_000))).toBe(true)
  })
})

// ---- the watcher, with synthetic touch events ----

const touchEvent = (type: string, points: { id?: number; x: number; y: number }[]) => {
  const e = new Event(type, { bubbles: true, cancelable: true }) as Event & { touches: unknown[] }
  e.touches = points.map((p) => ({ identifier: p.id ?? 1, clientX: p.x, clientY: p.y }))
  return e
}

function page() {
  const scroller = document.createElement('div')
  const row = document.createElement('div')
  scroller.append(row)
  document.body.append(scroller)
  const h = { busy: vi.fn(() => false), onPull: vi.fn(), onEnd: vi.fn() }
  const stop = watchPull(scroller, h)
  const touch = (path: [number, number][], from: Element = row) => {
    const [[x0, y0], ...rest] = path
    from.dispatchEvent(touchEvent('touchstart', [{ x: x0, y: y0 }]))
    const moves = rest.map(([x, y]) => {
      const e = touchEvent('touchmove', [{ x, y }])
      window.dispatchEvent(e)
      return e
    })
    window.dispatchEvent(touchEvent('touchend', []))
    return moves
  }
  return { scroller, row, h, touch, stop: () => { stop(); scroller.remove() } }
}

let p: ReturnType<typeof page> | null = null
afterEach(() => { p?.stop(); p = null })

describe('watchPull', () => {
  it('follows a pull from the top and fires past the threshold', () => {
    p = page()
    const moves = p.touch([[180, 100], [181, 120], [182, 180], [182, 260]])
    expect(p.h.onPull.mock.calls.map((c) => c[0])).toEqual([10, 40, 80])
    expect(p.h.onEnd).toHaveBeenCalledExactlyOnceWith(true)
    // The page does not scroll or bounce under the mark.
    expect(moves.every((m) => m.defaultPrevented)).toBe(true)
  })

  it('returns without syncing when released short of the threshold', () => {
    p = page()
    p.touch([[180, 100], [180, 130], [180, 160]])
    expect(p.h.onEnd).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('does not start on a scrolled page, and ends when the page scrolls meanwhile', () => {
    p = page()
    p.scroller.scrollTop = 40
    p.touch([[180, 100], [180, 300]])
    expect(p.h.onPull).not.toHaveBeenCalled()
    p.scroller.scrollTop = 0
    p.row.dispatchEvent(touchEvent('touchstart', [{ x: 180, y: 100 }]))
    window.dispatchEvent(touchEvent('touchmove', [{ x: 180, y: 160 }]))
    p.scroller.scrollTop = 5
    window.dispatchEvent(touchEvent('touchmove', [{ x: 180, y: 300 }]))
    expect(p.h.onEnd).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('is cancelled by a horizontal move and never prevents it', () => {
    p = page()
    const moves = p.touch([[180, 100], [200, 102], [200, 300]])
    expect(p.h.onPull).not.toHaveBeenCalled()
    expect(p.h.onEnd).not.toHaveBeenCalled()
    expect(moves.some((m) => m.defaultPrevented)).toBe(false)
  })

  it('leaves a move another gesture already took (a lifted drag)', () => {
    p = page()
    const block = (e: Event) => e.preventDefault()
    window.addEventListener('touchmove', block, { capture: true })
    p.touch([[180, 100], [180, 300]])
    window.removeEventListener('touchmove', block, { capture: true })
    expect(p.h.onPull).not.toHaveBeenCalled()
  })

  it('ends without syncing when a second finger lands or the touch is cancelled', () => {
    p = page()
    p.row.dispatchEvent(touchEvent('touchstart', [{ x: 180, y: 100 }]))
    window.dispatchEvent(touchEvent('touchmove', [{ x: 180, y: 300 }]))
    p.row.dispatchEvent(touchEvent('touchstart', [{ x: 180, y: 300 }, { id: 2, x: 90, y: 300 }]))
    expect(p.h.onEnd).toHaveBeenCalledExactlyOnceWith(false)
    p.row.dispatchEvent(touchEvent('touchstart', [{ x: 180, y: 100 }]))
    window.dispatchEvent(touchEvent('touchmove', [{ x: 180, y: 300 }]))
    window.dispatchEvent(touchEvent('touchcancel', []))
    expect(p.h.onEnd.mock.calls).toEqual([[false], [false]])
  })

  it('ignores the edge strip, a running sync, an open dialog and a mouse or a wheel', () => {
    p = page()
    p.touch([[SWIPE.edge - 5, 100], [SWIPE.edge - 5, 300]])
    p.h.busy.mockReturnValueOnce(true)
    p.touch([[180, 100], [180, 300]])
    const dialog = document.createElement('div')
    dialog.setAttribute('aria-modal', 'true')
    document.body.append(dialog)
    p.touch([[180, 100], [180, 300]])
    dialog.remove()
    // A mouse or a trackpad sends pointer, mouse and wheel events, never touch events.
    for (const [type, y] of [['pointerdown', 100], ['pointermove', 300], ['pointerup', 300]] as const) {
      p.row.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'mouse', clientX: 180, clientY: y }))
    }
    for (const [type, y] of [['mousedown', 100], ['mousemove', 300], ['mouseup', 300]] as const) {
      p.row.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 180, clientY: y }))
    }
    p.row.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -300 }))
    expect(p.h.onPull).not.toHaveBeenCalled()
    expect(p.h.onEnd).not.toHaveBeenCalled()
  })

  it('stops watching', () => {
    p = page()
    p.stop()
    p.touch([[180, 100], [180, 300]])
    expect(p.h.onPull).not.toHaveBeenCalled()
  })
})

describe('ownsTouch', () => {
  it('is true inside a scroller with something to scroll, a no-pan handle, the focused field or a dialog', () => {
    const scroller = document.createElement('div')
    scroller.innerHTML = '<div id="plain"><span id="text">a</span></div><div id="inner" style="overflow-y: auto"><p id="deep">b</p></div>'
      + '<span id="handle" style="touch-action: none"></span><input id="field"><div role="dialog"><p id="sheet">c</p></div>'
    document.body.append(scroller)
    const el = (id: string) => scroller.querySelector(`#${id}`)!
    expect(ownsTouch(el('text'), scroller)).toBe(false)
    expect(ownsTouch(null, scroller)).toBe(false)
    // An inner scroller owns the touch only when it has something to scroll.
    expect(ownsTouch(el('deep'), scroller)).toBe(false)
    Object.defineProperty(el('inner'), 'scrollHeight', { value: 500 })
    Object.defineProperty(el('inner'), 'clientHeight', { value: 200 })
    expect(ownsTouch(el('deep'), scroller)).toBe(true)
    expect(ownsTouch(el('handle'), scroller)).toBe(true)
    expect(ownsTouch(el('sheet'), scroller)).toBe(true)
    // A field owns the touch only while it has the focus (its caret and selection).
    expect(ownsTouch(el('field'), scroller)).toBe(false)
    ;(el('field') as HTMLInputElement).focus()
    expect(ownsTouch(el('field'), scroller)).toBe(true)
    scroller.remove()
  })
})
