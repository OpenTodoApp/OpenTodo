// The graph page's force layout (OpenSpec change notes-graph-page, design D6): the
// same graph gives the same positions, linked nodes end nearer than unlinked ones,
// fixed nodes never move, and a new node starts by its placed neighbours.
import { describe, expect, it } from 'vitest'
import { FULL_STEPS, ForceLayout, hash32, LOCAL_STEPS, placeNew } from './forceLayout'

/** Two clusters of six (each a ring with a hub) and two loose nodes. */
function sample() {
  const e: number[] = []
  for (const base of [0, 6]) {
    for (let i = 1; i < 6; i++) e.push(base, base + i)
    for (let i = 1; i < 5; i++) e.push(base + i, base + i + 1)
  }
  return { n: 14, edges: Uint32Array.from(e) }
}

const run = (g: ReturnType<typeof sample>) => {
  const l = new ForceLayout(g)
  l.run()
  return l
}

describe('ForceLayout', () => {
  it('lays out the same graph the same way, in a fixed number of steps', () => {
    const a = run(sample())
    const b = run(sample())
    expect(a.taken).toBe(FULL_STEPS)
    expect([...a.x]).toEqual([...b.x])
    expect([...a.y]).toEqual([...b.y])
    for (const v of [...a.x, ...a.y]) expect(Number.isFinite(v)).toBe(true)
  })

  it('keeps linked nodes closer than the two clusters', () => {
    const l = run(sample())
    const d = (i: number, j: number) => Math.hypot(l.x[i] - l.x[j], l.y[i] - l.y[j])
    expect(d(0, 1)).toBeLessThan(d(0, 6))
    expect(d(6, 7)).toBeLessThan(d(1, 7))
  })

  it('moves only the nodes that are not fixed', () => {
    const g = sample()
    const first = run(g)
    const x = Float64Array.from(first.x)
    const y = Float64Array.from(first.y)
    const fixed = new Uint8Array(g.n).fill(1)
    fixed[13] = 0
    const local = new ForceLayout(g, { steps: LOCAL_STEPS, start: { x: Float64Array.from(x), y: Float64Array.from(y), fixed }, alpha: 0.3 })
    local.run()
    for (let i = 0; i < 13; i++) {
      expect(local.x[i]).toBe(x[i])
      expect(local.y[i]).toBe(y[i])
    }
    expect(local.taken).toBe(LOCAL_STEPS)
  })

  it('runs in slices and stops at its budget', () => {
    let t = 0
    const l = new ForceLayout(sample())
    // A clock that moves 1 ms a read: a 5 ms budget takes a few steps, not all.
    expect(l.run(5, () => (t += 1))).toBe(false)
    expect(l.taken).toBeGreaterThan(0)
    expect(l.taken).toBeLessThan(FULL_STEPS)
    l.run()
    expect(l.finished).toBe(true)
  })

  it('starts a new node by its placed neighbours, a node without one on the rim', () => {
    const g = { n: 4, edges: Uint32Array.from([0, 1, 1, 2]) }
    const x = Float64Array.from([0, 100, 0, 0])
    const y = Float64Array.from([0, 0, 0, 0])
    const placed = Uint8Array.from([1, 1, 0, 0])
    placeNew(g, x, y, placed, (i) => hash32(`k${i}`))
    expect(Math.hypot(x[2] - 100, y[2])).toBeLessThan(40)
    expect(Math.hypot(x[3], y[3])).toBeGreaterThan(100)
  })
})
