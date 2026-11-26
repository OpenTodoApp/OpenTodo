// @vitest-environment happy-dom
// The long-press next to swipes and selections (OpenSpec change phone-v2, design D3,
// D8; task-row-context-menu "Touch: hold and release"): a hold without movement arms
// the drag — a release then opens the row's menu at the finger on any pointer, a move
// then lifts the drag (with onHold, the hold selects instead — the row's grip, since
// the touch rework); a move before the hold is a swipe or a scroll, never a drag —
// except on the grip, which never scrolls and drags on movement alone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { beginDrag, EDGE_STEP, edgeScroller, edgeStep, nextSnap, PAGE_ARM, PAGE_DWELL, sideScroller, TOUCH_HOLD_MS } from './dnd'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

const press = { pointerId: 9, pointerType: 'touch', button: 0, clientX: 50, clientY: 50 }
const move = (x: number, y = 50) => window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 9, pointerType: 'touch', clientX: x, clientY: y }))
const up = (x: number, y = 50) => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'touch', clientX: x, clientY: y }))
function spies() {
  return { onStart: vi.fn(), onDrop: vi.fn(), onEnd: vi.fn(), onHold: vi.fn() }
}

describe('touch: hold, swipe and drag', () => {
  it('marks the pressed row from the touch until the hold ends: an early release, a lift, a scroll (row-lift-overscroll)', () => {
    const row = document.createElement('li')
    const s = spies()
    beginDrag(press, { label: 'Task', onStart: s.onStart, onDrop: s.onDrop, press: row })
    expect(row.hasAttribute('data-touch-press')).toBe(true)
    vi.advanceTimersByTime(250)
    up(50)
    expect(row.hasAttribute('data-touch-press')).toBe(false)
    beginDrag(press, { label: 'Task', onStart: s.onStart, onDrop: s.onDrop, press: row })
    vi.advanceTimersByTime(TOUCH_HOLD_MS + 10)
    expect(row.hasAttribute('data-touch-press')).toBe(true)
    move(80)
    expect(s.onStart).toHaveBeenCalled()
    expect(row.hasAttribute('data-touch-press')).toBe(false)
    up(80)
    beginDrag({ ...press, pointerType: 'mouse' }, { label: 'Task', onDrop: s.onDrop, press: row })
    expect(row.hasAttribute('data-touch-press')).toBe(false)
    up(50)
  })

  it('a hold arms the drag: a move after it lifts, a release without moving opens the row menu', () => {
    const s = spies()
    const onHoldRelease = vi.fn()
    beginDrag(press, { label: 'Task', onStart: s.onStart, onDrop: s.onDrop, onEnd: s.onEnd, onHoldRelease })
    vi.advanceTimersByTime(TOUCH_HOLD_MS + 10)
    // Armed, not lifted: no ghost and no drop yet (task-row-context-menu).
    expect(s.onStart).not.toHaveBeenCalled()
    expect(document.querySelector('[data-drag-ghost]')).toBeNull()
    expect(onHoldRelease).not.toHaveBeenCalled()
    move(120)
    expect(s.onStart).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-drag-ghost]')).toBeTruthy()
    up(120)
    expect(s.onEnd).toHaveBeenCalledTimes(1)
    expect(onHoldRelease).not.toHaveBeenCalled()

    // The other half of the gesture: hold, then lift the finger where it rests.
    const held = spies()
    const release = vi.fn()
    beginDrag(press, { label: 'Task', onStart: held.onStart, onDrop: held.onDrop, onEnd: held.onEnd, onHoldRelease: release })
    vi.advanceTimersByTime(TOUCH_HOLD_MS + 10)
    up(50, 50)
    expect(held.onStart).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledWith(50, 50)
  })

  it('a swipe that began before the hold is never a drag', () => {
    const s = spies()
    beginDrag(press, { label: 'Task', onStart: s.onStart, onDrop: s.onDrop, onEnd: s.onEnd })
    move(70)
    vi.advanceTimersByTime(TOUCH_HOLD_MS + 10)
    up(130)
    expect(s.onStart).not.toHaveBeenCalled()
    expect(document.querySelector('[data-drag-ghost]')).toBeNull()
  })

  it('with onHold: the hold selects, a release then swallows the click, a move then drags', () => {
    const lifted = spies()
    beginDrag(press, { label: 'Task', ...lifted })
    vi.advanceTimersByTime(TOUCH_HOLD_MS + 10)
    expect(lifted.onHold).toHaveBeenCalledTimes(1)
    expect(lifted.onStart).not.toHaveBeenCalled()
    move(52)
    expect(lifted.onStart).not.toHaveBeenCalled()
    move(90, 70)
    expect(lifted.onStart).toHaveBeenCalledTimes(1)
    up(90, 70)

    const stayed = spies()
    beginDrag(press, { label: 'Task', ...stayed })
    vi.advanceTimersByTime(TOUCH_HOLD_MS + 10)
    up(50)
    expect(stayed.onStart).not.toHaveBeenCalled()
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    window.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
  })

  it('a held release opens the row menu on any pointer, a coarse (phone) one included', () => {
    // The grip took selection, so the row body's hold is only ever the menu's — on a
    // phone as on a desktop (task-row-context-menu, revised by the touch rework).
    const release = vi.fn()
    beginDrag(press, { label: 'Task', onDrop: vi.fn(), onEnd: vi.fn(), onHoldRelease: release })
    vi.advanceTimersByTime(TOUCH_HOLD_MS + 10)
    up(50, 50)
    expect(release).toHaveBeenCalledWith(50, 50)
    // The held press swallowed its click — consume it so a later test keeps its own.
    window.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
})

describe('the grip (bulk-actions on touch)', () => {
  it('movement alone drags: a grip never waits for the hold and never scrolls', () => {
    const s = spies()
    beginDrag(press, { label: 'Task', grip: true, ...s })
    move(60) // well before TOUCH_HOLD_MS
    expect(s.onStart).toHaveBeenCalledTimes(1)
    expect(s.onHold).not.toHaveBeenCalled()
    expect(document.querySelector('[data-drag-ghost]')).toBeTruthy()
    up(60)
    expect(s.onEnd).toHaveBeenCalledTimes(1)
  })

  it('a grip hold selects, its release swallows the click and never opens the menu', () => {
    const s = spies()
    const release = vi.fn()
    beginDrag(press, { label: 'Task', grip: true, onHoldRelease: release, ...s })
    vi.advanceTimersByTime(TOUCH_HOLD_MS + 10)
    expect(s.onHold).toHaveBeenCalledTimes(1)
    expect(s.onStart).not.toHaveBeenCalled()
    up(50, 50)
    expect(release).not.toHaveBeenCalled()
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    window.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
  })

  it('a plain tap on the grip lifts nothing, so the button\'s own click ticks', () => {
    const s = spies()
    const release = vi.fn()
    beginDrag(press, { label: 'Task', grip: true, onHoldRelease: release, ...s })
    up(50, 50)
    expect(s.onStart).not.toHaveBeenCalled()
    expect(s.onHold).not.toHaveBeenCalled()
    expect(release).not.toHaveBeenCalled()
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    window.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
  })

  it('a grip that drags before the hold elapses never selects: the hold dies with the lift', () => {
    const s = spies()
    beginDrag(press, { label: 'Task', grip: true, ...s })
    move(60) // lifts at once, well before TOUCH_HOLD_MS (the Android repro)
    vi.advanceTimersByTime(TOUCH_HOLD_MS * 2) // a hold timer that survived the lift would fire here
    expect(s.onHold).not.toHaveBeenCalled()
    up(60)
    expect(s.onHold).not.toHaveBeenCalled()
    expect(s.onStart).toHaveBeenCalledTimes(1)
  })
})

describe('the click after a drag (row-and-cursor D1)', () => {
  it('a mouse drag that drops swallows the next click, so the row under it does not open', () => {
    const s = spies()
    const li = document.createElement('li')
    const opened = vi.fn()
    li.addEventListener('click', opened)
    document.body.appendChild(li)
    beginDrag({ pointerId: 9, pointerType: 'mouse', button: 0, clientX: 50, clientY: 50 }, { label: 'Task', onStart: s.onStart, onDrop: s.onDrop, onEnd: s.onEnd })
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 9, pointerType: 'mouse', clientX: 50, clientY: 140 }))
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'mouse', clientX: 50, clientY: 140 }))
    expect(s.onStart).toHaveBeenCalledTimes(1)
    li.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(opened).not.toHaveBeenCalled()
  })

  it('a release over no target calls onMiss, never onDrop; a cancelled drag calls neither (#1507)', () => {
    const s = spies()
    const onMiss = vi.fn()
    beginDrag({ pointerId: 9, pointerType: 'mouse', button: 0, clientX: 50, clientY: 50 }, { label: 'Task', onStart: s.onStart, onDrop: s.onDrop, onEnd: s.onEnd, onMiss })
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 9, pointerType: 'mouse', clientX: 50, clientY: 140 }))
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'mouse', clientX: 50, clientY: 140 }))
    expect(onMiss).toHaveBeenCalledWith(50, 140)
    expect(s.onDrop).not.toHaveBeenCalled()
    expect(s.onEnd).toHaveBeenCalledTimes(1)
    const cancelled = vi.fn()
    beginDrag({ pointerId: 9, pointerType: 'mouse', button: 0, clientX: 50, clientY: 50 }, { label: 'Task', onDrop: vi.fn(), onMiss: cancelled })
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 9, pointerType: 'mouse', clientX: 50, clientY: 140 }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'mouse', clientX: 50, clientY: 140 }))
    expect(cancelled).not.toHaveBeenCalled()
  })

  it('the ring leaves a target with only data-drop-target when the drag ends (a viewer\'s project row)', () => {
    const s = spies()
    const row = document.createElement('li')
    row.setAttribute('data-drop-target', 'project:shared')
    document.body.appendChild(row)
    const at = vi.spyOn(document, 'elementFromPoint').mockReturnValue(row)
    beginDrag({ pointerId: 9, pointerType: 'mouse', button: 0, clientX: 50, clientY: 50 }, { label: 'Task', onStart: s.onStart, onDrop: s.onDrop, onEnd: s.onEnd, taskDrops: true })
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 9, pointerType: 'mouse', clientX: 50, clientY: 140 }))
    expect(row.hasAttribute('data-drop-active')).toBe(true)
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'mouse', clientX: 50, clientY: 140 }))
    expect(row.hasAttribute('data-drop-active')).toBe(false)
    at.mockRestore()
    row.remove()
  })
})

// drag-edge-scroll D1, D2 (GitHub issue 1760).
describe('the page holds still under a held or dragged row (drag-edge-scroll D1)', () => {
  const touchmove = () => {
    const ev = new Event('touchmove', { cancelable: true, bubbles: true })
    window.dispatchEvent(ev)
    return ev.defaultPrevented
  }

  it('a press adds no touchmove listener of its own: the standing one, there before the touch, blocks the scroll', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const cancel = beginDrag(press, { label: 'Task', onDrop: vi.fn() })
    expect(add.mock.calls.filter(([type]) => String(type) === 'touchmove')).toEqual([])
    add.mockRestore()
    // Before the hold the finger scrolls; once armed, and once lifted, it does not.
    expect(touchmove()).toBe(false)
    vi.advanceTimersByTime(TOUCH_HOLD_MS + 10)
    expect(touchmove()).toBe(true)
    move(80)
    expect(touchmove()).toBe(true)
    up(80)
    expect(touchmove()).toBe(false)
    cancel()
  })

  it('a swipe before the hold, a mouse drag and a cancelled drag leave scrolling alone', () => {
    beginDrag(press, { label: 'Task', onDrop: vi.fn() })
    move(80)
    vi.advanceTimersByTime(TOUCH_HOLD_MS + 10)
    expect(touchmove()).toBe(false)
    up(80)
    beginDrag({ ...press, pointerType: 'mouse' }, { label: 'Task', onDrop: vi.fn() })
    move(80)
    expect(touchmove()).toBe(false)
    up(80)
    const cancel = beginDrag(press, { label: 'Task', onDrop: vi.fn() })
    vi.advanceTimersByTime(TOUCH_HOLD_MS + 10)
    move(80)
    cancel()
    expect(touchmove()).toBe(false)
  })
})

describe('a drag near a scroller\'s edge scrolls it (drag-edge-scroll D2)', () => {
  it('the step grows towards the edge and is nothing in the middle', () => {
    expect(edgeStep(200, 0, 400)).toBe(0)
    expect(edgeStep(399, 0, 400)).toBe(EDGE_STEP)
    expect(edgeStep(1, 0, 400)).toBe(-EDGE_STEP)
    expect(edgeStep(376, 0, 400)).toBeGreaterThan(0)
    expect(edgeStep(376, 0, 400)).toBeLessThan(EDGE_STEP)
    expect(edgeStep(120, 100, 500)).toBeLessThan(0)
    expect(edgeStep(10, 0, 0)).toBe(0)
  })

  it('a pointer resting at the bottom of the list keeps it scrolling, re-reading the target; it stops at the end and on release', () => {
    const scroller = document.createElement('div')
    scroller.setAttribute('data-main-scroller', '')
    const row = document.createElement('div')
    row.setAttribute('data-drop-target', 'task:a')
    scroller.appendChild(row)
    document.body.appendChild(scroller)
    let top = 0
    Object.defineProperty(scroller, 'scrollTop', { get: () => top, set: (v: number) => { top = Math.max(0, Math.min(100, v)) }, configurable: true })
    scroller.getBoundingClientRect = () => ({ top: 0, bottom: 400, left: 0, right: 300, width: 300, height: 400, x: 0, y: 0, toJSON() {} })
    Object.defineProperty(scroller, 'clientHeight', { value: 400, configurable: true })
    Object.defineProperty(scroller, 'scrollHeight', { value: 500, configurable: true })
    const at = vi.fn(() => row)
    const doc = document as unknown as { elementFromPoint: unknown }
    const before = doc.elementFromPoint
    doc.elementFromPoint = at
    vi.stubGlobal('innerHeight', 800)
    try {
      const onMove = vi.fn()
      beginDrag({ ...press, pointerType: 'mouse' }, { label: 'Task', onDrop: vi.fn(), onMove })
      move(50, 395)
      const moves = onMove.mock.calls.length
      vi.advanceTimersByTime(50)
      expect(top).toBeGreaterThan(0)
      expect(onMove.mock.calls.length).toBeGreaterThan(moves)
      vi.advanceTimersByTime(1000)
      expect(top).toBe(100)
      const settled = onMove.mock.calls.length
      vi.advanceTimersByTime(100)
      expect(onMove.mock.calls.length).toBe(settled)
      move(50, 200)
      vi.advanceTimersByTime(100)
      expect(top).toBe(100)
      move(50, 2)
      up(50, 2)
      const after = top
      vi.advanceTimersByTime(100)
      expect(top).toBe(after)
    } finally {
      doc.elementFromPoint = before
      vi.unstubAllGlobals()
      scroller.remove()
    }
  })
})

describe('the scroller near the pointer (drag-edge-scroll D2)', () => {
  type Box = { top: number; bottom: number; scrollTop: number; scrollHeight: number }
  function scroller(attr: string, box: Box, parent: HTMLElement = document.body): HTMLElement {
    const el = document.createElement('div')
    el.setAttribute(attr, '')
    el.getBoundingClientRect = () => ({ top: box.top, bottom: box.bottom, left: 0, right: 300, width: 300, height: box.bottom - box.top, x: 0, y: box.top, toJSON() {} })
    Object.defineProperty(el, 'scrollTop', { get: () => box.scrollTop, set: (v: number) => { box.scrollTop = Math.max(0, Math.min(box.scrollHeight - (box.bottom - box.top), v)) }, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: box.bottom - box.top, configurable: true })
    Object.defineProperty(el, 'scrollHeight', { value: box.scrollHeight, configurable: true })
    parent.appendChild(el)
    return el
  }
  afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals() })

  it('is found by its box, so a bar floating over its bottom edge does not hide it', () => {
    vi.stubGlobal('innerHeight', 800)
    const list = scroller('data-main-scroller', { top: 0, bottom: 800, scrollTop: 0, scrollHeight: 2000 })
    // The selection bar over the list's bottom edge: the element under the finger is the bar.
    const bar = document.createElement('div')
    document.body.appendChild(bar)
    const doc = document as unknown as { elementFromPoint: unknown }
    doc.elementFromPoint = () => bar
    expect(edgeScroller(100, 790)?.el).toBe(list)
    expect(edgeScroller(100, 790)?.step).toBeGreaterThan(0)
    expect(edgeScroller(100, 400)).toBeNull()
    expect(edgeScroller(100, 5)).toBeNull()
    delete doc.elementFromPoint
  })

  it('the open phone drawer scrolls, not the inert page behind it; nothing scrolls under a dialog', () => {
    vi.stubGlobal('innerHeight', 800)
    const aside = document.createElement('aside')
    document.body.appendChild(aside)
    const list = { top: 0, bottom: 800, scrollTop: 0, scrollHeight: 3000 }
    const page = { top: 0, bottom: 800, scrollTop: 0, scrollHeight: 3000 }
    const drawer = scroller('data-sidebar-scroll', list, aside)
    const main = document.createElement('main')
    main.setAttribute('inert', '')
    document.body.appendChild(main)
    scroller('data-main-scroller', page, main)
    const row = document.createElement('div')
    drawer.appendChild(row)
    const doc = document as unknown as { elementFromPoint: unknown }
    doc.elementFromPoint = () => row
    expect(edgeScroller(100, 795)?.el).toBe(drawer)
    // Under a bar over the drawer's edge, still the drawer: the page behind is inert.
    doc.elementFromPoint = () => document.body
    expect(edgeScroller(100, 795)?.el).toBe(drawer)
    const dialog = document.createElement('div')
    dialog.setAttribute('data-overlay-root', '')
    document.body.appendChild(dialog)
    doc.elementFromPoint = () => dialog
    expect(edgeScroller(100, 795)).toBeNull()
    delete doc.elementFromPoint
  })

  it('a fractional position at the end counts as the end, so the outer scroller takes over', () => {
    vi.stubGlobal('innerHeight', 800)
    const outer = { top: 0, bottom: 800, scrollTop: 0, scrollHeight: 2000 }
    const inner = { top: 400, bottom: 800, scrollTop: 199.5, scrollHeight: 600 }
    const out = scroller('data-main-scroller', outer)
    scroller('data-main-scroller', inner, out)
    expect(edgeScroller(100, 795)?.el).toBe(out)
  })

  it('takes the inner of two nested scrollers while it can move, then the outer one', () => {
    vi.stubGlobal('innerHeight', 800)
    const outer = { top: 0, bottom: 800, scrollTop: 0, scrollHeight: 2000 }
    const inner = { top: 400, bottom: 800, scrollTop: 0, scrollHeight: 600 }
    const out = scroller('data-main-scroller', outer)
    const inn = scroller('data-main-scroller', inner, out)
    expect(edgeScroller(100, 795)?.el).toBe(inn)
    inner.scrollTop = 200
    expect(edgeScroller(100, 795)?.el).toBe(out)
  })

  it('a touch drag held at the bottom edge scrolls with the page held; a cancel stops both', () => {
    vi.stubGlobal('innerHeight', 800)
    const box = { top: 0, bottom: 400, scrollTop: 0, scrollHeight: 1000 }
    scroller('data-main-scroller', box)
    const blocked = () => { const ev = new Event('touchmove', { cancelable: true }); window.dispatchEvent(ev); return ev.defaultPrevented }
    const cancel = beginDrag(press, { label: 'Task', onDrop: vi.fn() })
    vi.advanceTimersByTime(TOUCH_HOLD_MS + 10)
    move(50, 395)
    vi.advanceTimersByTime(100)
    expect(box.scrollTop).toBeGreaterThan(0)
    expect(blocked()).toBe(true)
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 9, pointerType: 'touch' }))
    const at = box.scrollTop
    vi.advanceTimersByTime(200)
    expect(box.scrollTop).toBe(at)
    expect(blocked()).toBe(false)
    cancel()
  })
})

describe('a held card scrolls the board (phone-board D1, D2)', () => {
  type Row = { left: number; right: number; scrollLeft: number; scrollWidth: number }
  /** A sideways scroller 600 px high; with `columns`, as the phone's board: 343 px columns, a 12 px gap, 16 px of padding. */
  function board(box: Row, opts: { snap?: boolean; mark?: boolean; columns?: number; rtl?: boolean } = {}): HTMLElement {
    const el = document.createElement('div')
    if (opts.mark !== false) el.setAttribute('data-edge-scroll', 'x')
    if (opts.snap) el.style.scrollSnapType = 'x mandatory'
    if (opts.rtl) el.style.direction = 'rtl'
    const width = box.right - box.left
    const max = box.scrollWidth - width
    const clamp = (v: number) => (opts.rtl ? Math.max(-max, Math.min(0, v)) : Math.max(0, Math.min(max, v)))
    el.getBoundingClientRect = () => ({ top: 0, bottom: 600, left: box.left, right: box.right, width, height: 600, x: box.left, y: 0, toJSON() {} })
    Object.defineProperty(el, 'scrollLeft', { get: () => box.scrollLeft, set: (v: number) => { box.scrollLeft = clamp(v) }, configurable: true })
    Object.defineProperty(el, 'clientWidth', { value: width, configurable: true })
    Object.defineProperty(el, 'scrollWidth', { value: box.scrollWidth, configurable: true })
    el.scrollTo = ((o: { left: number }) => { box.scrollLeft = clamp(o.left) }) as typeof el.scrollTo
    for (let i = 0; i < (opts.columns ?? 0); i++) {
      const col = document.createElement('section')
      col.style.scrollSnapAlign = 'start'
      const start = 16 + i * 355
      col.getBoundingClientRect = () => {
        const left = opts.rtl ? box.right - start - 343 - box.scrollLeft : box.left + start - box.scrollLeft
        return { top: 0, bottom: 600, left, right: left + 343, width: 343, height: 600, x: left, y: 0, toJSON() {} }
      }
      el.appendChild(col)
    }
    // The "Add a section" column ends the row and declares no snap point.
    el.appendChild(document.createElement('div'))
    document.body.appendChild(el)
    return el
  }
  beforeEach(() => { vi.stubGlobal('innerWidth', 390); vi.stubGlobal('innerHeight', 800) })
  afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals() })

  it('the neighbouring snap point: the nearest one past the position, kept within the scroll range, none at the end', () => {
    const starts = [16, 371, 726, 1081]
    expect(nextSnap(starts, 16, 1, 0, 1200)).toBe(371)
    expect(nextSnap(starts, 371, 1, 0, 1200)).toBe(726)
    expect(nextSnap(starts, 371, -1, 0, 1200)).toBe(16)
    expect(nextSnap(starts, 16, -1, 0, 1200)).toBeNull()
    // The last column cannot reach its start: the end of the row is its snap point, and then there is none.
    expect(nextSnap(starts, 726, 1, 0, 1000)).toBe(1000)
    expect(nextSnap(starts, 1000, 1, 0, 1000)).toBeNull()
    // A fractional position at a snap point counts as that point.
    expect(nextSnap(starts, 370.4, 1, 0, 1200)).toBe(726)
    // Right to left the positions run from -max to 0.
    expect(nextSnap([-16, -371, -726], -16, -1, -1000, 0)).toBe(-371)
    expect(nextSnap([-16, -371, -726], -371, 1, -1000, 0)).toBe(-16)
    expect(nextSnap([], 0, 1, 0, 1000)).toBeNull()
  })

  it('the sideways scroller near the pointer: which one, which way and how fast', () => {
    const box = { left: 0, right: 390, scrollLeft: 400, scrollWidth: 1500 }
    const el = board(box)
    // Within 32 px of the right edge: to the right, faster nearer the edge; the same to the left.
    expect(sideScroller(389, 300)).toEqual({ el, step: EDGE_STEP })
    expect(sideScroller(370, 300)!.step).toBeGreaterThan(0)
    expect(sideScroller(370, 300)!.step).toBeLessThan(EDGE_STEP)
    expect(sideScroller(1, 300)).toEqual({ el, step: -EDGE_STEP })
    // 40 px from the edge would scroll a list up or down, but not the board sideways.
    expect(sideScroller(350, 300)).toBeNull()
    expect(sideScroller(200, 300)).toBeNull()
    // Outside its box, and at either end, nothing.
    expect(sideScroller(389, 700)).toBeNull()
    box.scrollLeft = 1110
    expect(sideScroller(389, 300)).toBeNull()
    expect(sideScroller(1, 300)!.step).toBeLessThan(0)
    box.scrollLeft = 0
    expect(sideScroller(1, 300)).toBeNull()
  })

  it('only a scroller that asks for it; never an inert one or under a dialog', () => {
    const box = { left: 0, right: 390, scrollLeft: 400, scrollWidth: 1500 }
    const el = board(box, { mark: false })
    expect(sideScroller(389, 300)).toBeNull()
    el.setAttribute('data-edge-scroll', 'x')
    expect(sideScroller(389, 300)?.el).toBe(el)
    const main = document.createElement('main')
    main.setAttribute('inert', '')
    document.body.appendChild(main)
    main.appendChild(el)
    expect(sideScroller(389, 300)).toBeNull()
    main.removeAttribute('inert')
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    const doc = document as unknown as { elementFromPoint: unknown }
    doc.elementFromPoint = () => dialog
    expect(sideScroller(389, 300)).toBeNull()
    delete doc.elementFromPoint
  })

  it('a snapping board names the neighbouring column, in both writing directions', () => {
    const box = { left: 0, right: 390, scrollLeft: 16, scrollWidth: 1500 }
    const el = board(box, { snap: true, columns: 4 })
    expect(sideScroller(385, 300)).toMatchObject({ el, to: 371 })
    expect(sideScroller(5, 300)).toBeNull()
    box.scrollLeft = 371
    expect(sideScroller(385, 300)!.to).toBe(726)
    expect(sideScroller(5, 300)!.to).toBe(16)
    // The last column, and no further: what ends the row declares no snap point.
    box.scrollLeft = 726
    expect(sideScroller(385, 300)!.to).toBe(1081)
    box.scrollLeft = 1081
    expect(sideScroller(385, 300)).toBeNull()
    document.body.innerHTML = ''
    const rtl = { left: 0, right: 390, scrollLeft: -16, scrollWidth: 1500 }
    board(rtl, { snap: true, columns: 4, rtl: true })
    // The second column is to the left: the left edge turns to it, the right edge has nowhere to go.
    expect(sideScroller(5, 300)!.to).toBe(-371)
    expect(sideScroller(385, 300)).toBeNull()
    rtl.scrollLeft = -371
    expect(sideScroller(385, 300)!.to).toBe(-16)
  })

  it('a card held at the edge of a snapping board turns it one column at a time, re-reading the target; a quick release turns nothing', () => {
    const box = { left: 0, right: 390, scrollLeft: 16, scrollWidth: 1500 }
    board(box, { snap: true, columns: 4 })
    const onMove = vi.fn()
    const onDrop = vi.fn()
    beginDrag(press, { label: 'Card', onDrop, onMove })
    vi.advanceTimersByTime(TOUCH_HOLD_MS + 10)
    move(385, 300)
    // Resting for less than the arm time: the board has not moved.
    vi.advanceTimersByTime(PAGE_ARM - 50)
    expect(box.scrollLeft).toBe(16)
    vi.advanceTimersByTime(100)
    expect(box.scrollLeft).toBe(371)
    // The target under the still finger is read again while the column slides in.
    const moves = onMove.mock.calls.length
    vi.advanceTimersByTime(200)
    expect(onMove.mock.calls.length).toBeGreaterThan(moves)
    expect(box.scrollLeft).toBe(371)
    // One more column after each dwell.
    vi.advanceTimersByTime(PAGE_DWELL)
    expect(box.scrollLeft).toBe(726)
    // Away from the edge it stops; back at an edge it arms again.
    move(200, 300)
    vi.advanceTimersByTime(PAGE_DWELL * 2)
    expect(box.scrollLeft).toBe(726)
    move(5, 300)
    vi.advanceTimersByTime(PAGE_ARM + 50)
    expect(box.scrollLeft).toBe(371)
    up(5, 300)
    vi.advanceTimersByTime(PAGE_DWELL * 2)
    expect(box.scrollLeft).toBe(371)
    // A drop on the next column's edge within the arm time lands without a turn.
    box.scrollLeft = 16
    beginDrag(press, { label: 'Card', onDrop, onMove })
    vi.advanceTimersByTime(TOUCH_HOLD_MS + 10)
    move(385, 300)
    vi.advanceTimersByTime(PAGE_ARM - 100)
    up(385, 300)
    vi.advanceTimersByTime(PAGE_DWELL)
    expect(box.scrollLeft).toBe(16)
  })

  it('the turn is smooth, and instant with reduced motion', () => {
    const box = { left: 0, right: 390, scrollLeft: 16, scrollWidth: 1500 }
    const el = board(box, { snap: true, columns: 4 })
    const calls: ScrollToOptions[] = []
    el.scrollTo = ((o: ScrollToOptions) => { calls.push(o) }) as typeof el.scrollTo
    const held = (reduce: boolean) => {
      vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }))
      beginDrag({ ...press, pointerType: 'mouse' }, { label: 'Card', onDrop: vi.fn() })
      move(385, 300)
      vi.advanceTimersByTime(PAGE_ARM + 50)
      up(385, 300)
    }
    held(false)
    held(true)
    expect(calls).toEqual([{ left: 371, behavior: 'smooth' }, { left: 371, behavior: 'auto' }])
  })

  it('a board that does not snap scrolls steadily while the pointer rests at its edge, and stops at the end', () => {
    vi.stubGlobal('innerWidth', 1000)
    const box = { left: 0, right: 1000, scrollLeft: 0, scrollWidth: 1200 }
    board(box)
    const onMove = vi.fn()
    beginDrag({ ...press, pointerType: 'mouse' }, { label: 'Card', onDrop: vi.fn(), onMove })
    move(995, 300)
    vi.advanceTimersByTime(50)
    expect(box.scrollLeft).toBeGreaterThan(0)
    expect(box.scrollLeft).toBeLessThan(200)
    vi.advanceTimersByTime(1000)
    expect(box.scrollLeft).toBe(200)
    const settled = onMove.mock.calls.length
    vi.advanceTimersByTime(200)
    expect(onMove.mock.calls.length).toBe(settled)
    up(995, 300)
  })

  it('a column\'s cards scroll before the page, and the page once the column is at its end', () => {
    type Box = { top: number; bottom: number; scrollTop: number; scrollHeight: number }
    const scroller = (attr: string, value: string, b: Box, parent: HTMLElement) => {
      const el = document.createElement('div')
      el.setAttribute(attr, value)
      el.getBoundingClientRect = () => ({ top: b.top, bottom: b.bottom, left: 0, right: 300, width: 300, height: b.bottom - b.top, x: 0, y: b.top, toJSON() {} })
      Object.defineProperty(el, 'scrollTop', { get: () => b.scrollTop, set: (v: number) => { b.scrollTop = Math.max(0, Math.min(b.scrollHeight - (b.bottom - b.top), v)) }, configurable: true })
      Object.defineProperty(el, 'clientHeight', { value: b.bottom - b.top, configurable: true })
      Object.defineProperty(el, 'scrollHeight', { value: b.scrollHeight, configurable: true })
      parent.appendChild(el)
      return el
    }
    const page = { top: 0, bottom: 800, scrollTop: 0, scrollHeight: 2000 }
    const cards = { top: 300, bottom: 800, scrollTop: 0, scrollHeight: 900 }
    const main = scroller('data-main-scroller', '', page, document.body)
    const list = scroller('data-edge-scroll', 'y', cards, main)
    expect(edgeScroller(100, 795)?.el).toBe(list)
    expect(edgeScroller(100, 305)).toBeNull()
    cards.scrollTop = 400
    expect(edgeScroller(100, 795)?.el).toBe(main)
    expect(edgeScroller(100, 305)?.el).toBe(list)
  })
})
