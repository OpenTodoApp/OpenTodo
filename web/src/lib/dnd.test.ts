// @vitest-environment happy-dom
// The long-press next to swipes and selections (OpenSpec change phone-v2, design D3,
// D8; task-row-context-menu "Touch: hold and release"): a hold without movement arms
// the drag — a release then opens the row's menu at the finger on any pointer, a move
// then lifts the drag (with onHold, the hold selects instead — the row's grip, since
// the touch rework); a move before the hold is a swipe or a scroll, never a drag —
// except on the grip, which never scrolls and drags on movement alone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { beginDrag, EDGE_STEP, edgeStep, TOUCH_HOLD_MS } from './dnd'

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
    expect(add.mock.calls.filter(([type]) => type === 'touchmove')).toEqual([])
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
