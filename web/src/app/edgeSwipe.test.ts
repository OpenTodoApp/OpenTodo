// @vitest-environment happy-dom
// The menu's edge swipe (OpenSpec change edge-swipe-menu): a right swipe from the
// left edge opens the phone menu; anything else leaves it, and rows ignore the edge.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { watchEdgeSwipe } from './edgeSwipe'
import { beginSwipe, SWIPE } from './rowSwipe'

const ptr = (type: string, x: number, y = 300, pointerType = 'touch') =>
  window.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType, clientX: x, clientY: y }))

function swipe(path: [number, number][], pointerType = 'touch') {
  const [[x0, y0], ...rest] = path
  ptr('pointerdown', x0, y0, pointerType)
  for (const [x, y] of rest) ptr('pointermove', x, y, pointerType)
  const [xe, ye] = path[path.length - 1]
  ptr('pointerup', xe, ye, pointerType)
}

let stop: (() => void) | null = null
afterEach(() => { stop?.(); stop = null })

describe('edge swipe', () => {
  it('opens on a right swipe that starts at the edge', () => {
    const open = vi.fn()
    stop = watchEdgeSwipe(open, () => true)
    swipe([[5, 300], [30, 302], [80, 303], [130, 304]])
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('leaves the menu for a short swipe, a scroll, a left swipe, a start away from the edge, a mouse or a disabled menu', () => {
    const open = vi.fn()
    let on = true
    stop = watchEdgeSwipe(open, () => on)
    swipe([[5, 300], [30, 300]])
    swipe([[5, 300], [8, 340], [120, 360]])
    swipe([[15, 300], [2, 300]])
    swipe([[SWIPE.edge + 5, 300], [60, 300], [160, 300]])
    swipe([[5, 300], [60, 300], [160, 300]], 'mouse')
    on = false
    swipe([[5, 300], [60, 300], [160, 300]])
    expect(open).not.toHaveBeenCalled()
  })

  it('a row never takes a press in the edge strip', () => {
    const onLock = vi.fn()
    beginSwipe({ pointerId: 1, pointerType: 'touch', clientX: 5, clientY: 300 }, { onLock, onMove: () => {}, onEnd: () => {} })
    ptr('pointermove', 80, 300)
    ptr('pointerup', 80, 300)
    expect(onLock).not.toHaveBeenCalled()
  })
})
