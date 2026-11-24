// @vitest-environment happy-dom
// The menu's edge swipe (OpenSpec change edge-swipe-menu): a right swipe from the
// left edge opens the phone menu; anything else leaves it, and rows ignore the edge.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { edgeCommits, edgeSwipeAction, watchEdgeSwipe, watchesEdge } from './edgeSwipe'
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

  // edge-swipe-back (GitHub issue 1323): back on a page with Back, the menu on a top-level page.
  it('goes back on a page with Back and opens the menu on a top-level page', () => {
    const back = vi.fn()
    const menu = vi.fn()
    stop = watchEdgeSwipe(() => edgeSwipeAction(back, menu)(), () => true)
    swipe([[5, 300], [30, 302], [80, 303], [130, 304]])
    expect(back).toHaveBeenCalledTimes(1)
    expect(menu).not.toHaveBeenCalled()
    stop()
    stop = watchEdgeSwipe(() => edgeSwipeAction(undefined, menu)(), () => true)
    swipe([[5, 300], [30, 302], [80, 303], [130, 304]])
    expect(menu).toHaveBeenCalledTimes(1)
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('leaves the installed web app on iOS to the system back swipe', () => {
    expect(watchesEdge({ shell: false, standalone: true, ios: true })).toBe(false)
    expect(watchesEdge({ shell: true, standalone: true, ios: true })).toBe(true)
    expect(watchesEdge({ shell: false, standalone: false, ios: true })).toBe(true)
    expect(watchesEdge({ shell: false, standalone: true, ios: false })).toBe(true)
  })
})

// swipe-back-follows D3: a third of the width, or a flick past the reveal distance.
describe('the commit rule over widths', () => {
  it('a fifth of the way, slowly, stays; a third goes, on a phone, a tablet and a wide tablet', () => {
    for (const w of [360, 768, 1024]) {
      expect(edgeCommits(w / 5, 0.1, w), `${w}: a fifth`).toBe(false)
      expect(edgeCommits(Math.ceil(w / 3), 0.1, w), `${w}: a third`).toBe(true)
    }
  })

  it('a flick goes back on a 1024 px tablet though the finger moved less than a third (the scenario "A flick on a tablet")', () => {
    expect(edgeCommits(120, 0.9, 1024)).toBe(true)
    expect(edgeCommits(40, 0.9, 1024)).toBe(false)
  })
})

describe('a follower', () => {
  it('moves with the finger and settles once: committed past a third, back under it', () => {
    const moves: number[] = []
    const settled: [boolean, number][] = []
    const open = vi.fn()
    const follower = { move: (dx: number) => void moves.push(dx), settle: (c: boolean, dx: number) => void settled.push([c, dx]) }
    // A slow drag: 100 ms between the events, so no step is a flick.
    let t = 0
    vi.spyOn(performance, 'now').mockImplementation(() => (t += 100))
    stop = watchEdgeSwipe(open, () => true, { width: () => 390, follow: () => follower })
    swipe([[5, 300], [30, 302], [80, 303], [100, 304]])
    expect(moves).toEqual([25, 75, 95])
    expect(settled).toEqual([[false, 95]])
    expect(open).not.toHaveBeenCalled()
    swipe([[5, 300], [30, 302], [90, 303], [140, 304]])
    expect(settled.at(-1)).toEqual([true, 135])
    expect(open).toHaveBeenCalledTimes(1)
  vi.restoreAllMocks()
  })

  it('a cancelled touch springs back', () => {
    const settled: boolean[] = []
    stop = watchEdgeSwipe(() => {}, () => true, { width: () => 390, follow: () => ({ move() {}, settle: (c) => void settled.push(c) }) })
    ptr('pointerdown', 5)
    ptr('pointermove', 60)
    ptr('pointermove', 200)
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, pointerType: 'touch' }))
    expect(settled).toEqual([false])
  })
})
