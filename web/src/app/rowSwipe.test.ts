// @vitest-environment happy-dom
// The swipe gesture's numbers (OpenSpec change phone-v2, design D3 table), one case per threshold.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { beginSwipe, lockOf, offsetOf, releaseOf, revealed, SWIPE, type SwipeHandlers } from './rowSwipe'

describe('the gesture table', () => {
  it.each([
    [0, 0, null], [11, 0, null], [12, 0, 'swipe'], [-12, 7, 'swipe'], [12, 8, 'scroll'], [3, -9, 'scroll'], [30, 10, 'scroll'],
  ] as const)('direction lock: dx %i, dy %i → %s', (dx, dy, out) => {
    expect(lockOf(dx, dy)).toBe(out)
  })

  it.each([[40, 40], [120, 120], [200, 120], [-200, -120], [-90, -90]])('maximum translation: %i → %i', (dx, out) => {
    expect(offsetOf(dx)).toBe(out)
  })

  it.each([[63, false], [64, true], [-64, true], [-10, false]] as const)('reveal at 64 px: %i → %s', (dx, out) => {
    expect(revealed(dx)).toBe(out)
  })

  it.each([
    // [dx, velocity px/ms, outcome]
    [96, 0, 'right'], [-96, 0, 'left'], [95, 0, null],
    [70, 0.6, 'right'], [-70, -0.6, 'left'], [70, 0.4, null], [64, 0.9, null],
    [31, 2, null], [20, 0, null], [-31, -3, null],
  ] as const)('release: dx %i at %s px/ms → %s', (dx, v, out) => {
    expect(releaseOf(dx, v)).toBe(out)
  })

  it('the return takes the ui duration', () => {
    expect(SWIPE.returnMs).toBe(120)
  })
})

describe('beginSwipe', () => {
  afterEach(() => vi.restoreAllMocks())
  const down = { pointerId: 7, pointerType: 'touch', clientX: 100, clientY: 100 }
  const move = (x: number, y = 100) => window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y }))
  const up = (x: number, y = 100) => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y }))
  function track(extra: Partial<SwipeHandlers> = {}) {
    const calls = { lock: [] as string[], moves: [] as number[], end: [] as (string | null)[] }
    beginSwipe(down, { onLock: (d) => calls.lock.push(d), onMove: (o) => calls.moves.push(o), onEnd: (f) => calls.end.push(f), ...extra })
    return calls
  }

  it('a slow pull past 96 px commits right; the row stops at 120 px', () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => (now += 100))
    const c = track()
    move(110); move(160); move(250); up(250)
    expect(c.lock).toEqual(['right'])
    expect(Math.max(...c.moves)).toBe(120)
    expect(c.end).toEqual(['right'])
  })

  it('a flick past 64 px commits; a slow one at the same distance returns', () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => (now += 10))
    const fast = track()
    move(90); move(175); up(175)
    expect(fast.end).toEqual(['right'])
    now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => (now += 400))
    const slow = track()
    move(90); move(175); up(175)
    expect(slow.end).toEqual([null])
  })

  it('a vertical move belongs to the list: no lock, no end', () => {
    const c = track()
    move(104, 112); move(150, 160); up(150, 160)
    expect(c.lock).toEqual([])
    expect(c.end).toEqual([])
  })

  it('a mouse never swipes; a refused start leaves the row alone', () => {
    const calls: string[] = []
    beginSwipe({ ...down, pointerType: 'mouse' }, { onLock: () => calls.push('lock'), onMove: () => {}, onEnd: () => calls.push('end') })
    move(200); up(200)
    expect(calls).toEqual([])
    const c = track({ canStart: () => false })
    move(200); up(200)
    expect(c.lock).toEqual([])
  })

  it('pulling back under 32 px cancels', () => {
    const c = track()
    move(140); move(200); move(120); up(120)
    expect(c.end).toEqual([null])
  })
})
