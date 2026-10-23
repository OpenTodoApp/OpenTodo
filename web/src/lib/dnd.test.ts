// @vitest-environment happy-dom
// The long-press drag next to swipes and the long press that selects (OpenSpec change
// phone-v2, design D3, D8): a hold without movement is a drag (or, with onHold, a
// selection the next move drags); a move before the hold is a swipe or a scroll, never a drag.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { beginDrag, TOUCH_HOLD_MS } from './dnd'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

const press = { pointerId: 9, pointerType: 'touch', button: 0, clientX: 50, clientY: 50 }
const move = (x: number, y = 50) => window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 9, pointerType: 'touch', clientX: x, clientY: y }))
const up = (x: number, y = 50) => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'touch', clientX: x, clientY: y }))
function spies() {
  return { onStart: vi.fn(), onDrop: vi.fn(), onEnd: vi.fn(), onHold: vi.fn() }
}

describe('touch: hold, swipe and drag', () => {
  it('a hold without movement lifts the drag; a horizontal move after it still drags', () => {
    const s = spies()
    beginDrag(press, { label: 'Task', onStart: s.onStart, onDrop: s.onDrop, onEnd: s.onEnd })
    vi.advanceTimersByTime(TOUCH_HOLD_MS + 10)
    expect(s.onStart).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-drag-ghost]')).toBeTruthy()
    move(120)
    up(120)
    expect(s.onEnd).toHaveBeenCalledTimes(1)
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
})
