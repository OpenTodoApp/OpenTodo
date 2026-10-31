// @vitest-environment happy-dom
// The long-press next to swipes and selections (OpenSpec change phone-v2, design D3,
// D8; task-row-context-menu "Touch: hold and release"): a hold without movement arms
// the drag — a release then opens the row's menu at the finger on any pointer, a move
// then lifts the drag (with onHold, the hold selects instead — the row's grip, since
// the touch rework); a move before the hold is a swipe or a scroll, never a drag —
// except on the grip, which never scrolls and drags on movement alone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { beginDrag, TOUCH_HOLD_MS } from './dnd'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

const press = { pointerId: 9, pointerType: 'touch', button: 0, clientX: 50, clientY: 50 }
const move = (x: number, y = 50) => window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 9, pointerType: 'touch', clientX: x, clientY: y }))
const up = (x: number, y = 50) => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'touch', clientX: x, clientY: y }))
function spies() {
  return { onStart: vi.fn(), onDrop: vi.fn(), onEnd: vi.fn(), onHold: vi.fn() }
}

describe('touch: hold, swipe and drag', () => {
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
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia
    try {
      const release = vi.fn()
      beginDrag(press, { label: 'Task', onDrop: vi.fn(), onEnd: vi.fn(), onHoldRelease: release })
      vi.advanceTimersByTime(TOUCH_HOLD_MS + 10)
      up(50, 50)
      expect(release).toHaveBeenCalledWith(50, 50)
      // The held press swallowed its click — consume it so a later test keeps its own.
      window.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    } finally {
      window.matchMedia = original
    }
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
