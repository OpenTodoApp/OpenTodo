import { describe, expect, it } from 'vitest'
import { layoutDay, type BlockInput, type PlacedBlock } from './layout'

const b = (id: string, start: number, end: number): BlockInput => ({ id, start, end })
const byId = (blocks: PlacedBlock[]) => Object.fromEntries(blocks.map((x) => [x.id, x]))
const h = (hours: number) => hours * 60

describe('layoutDay', () => {
  it('returns nothing for no blocks', () => {
    expect(layoutDay([])).toEqual({ blocks: [], overflow: [] })
  })

  it('gives disjoint blocks the full width and no overlap marker', () => {
    const { blocks, overflow } = layoutDay([b('a', h(9), h(10)), b('b', h(11), h(12)), b('c', h(13), h(13.5))])
    expect(overflow).toEqual([])
    for (const x of blocks) expect(x).toMatchObject({ lane: 0, lanes: 1, overlap: false, hidden: false })
  })

  it('treats touching blocks (end == next start) as disjoint', () => {
    const { blocks } = layoutDay([b('a', h(9), h(10)), b('b', h(10), h(11))])
    expect(blocks.map((x) => [x.id, x.lanes, x.overlap])).toEqual([['a', 1, false], ['b', 1, false]])
  })

  it('puts two tasks at the same time side by side, both marked', () => {
    const m = byId(layoutDay([b('y', h(10), h(10.5)), b('x', h(10), h(10.5))]).blocks)
    // Equal blocks are ordered by id, so the result does not depend on input order.
    expect(m.x).toMatchObject({ lane: 0, lanes: 2, overlap: true })
    expect(m.y).toMatchObject({ lane: 1, lanes: 2, overlap: true })
  })

  it('lays out nested blocks: the long block first, inner blocks share the second lane', () => {
    const m = byId(layoutDay([b('inner1', h(9.5), h(10)), b('outer', h(9), h(12)), b('inner2', h(10.5), h(11))]).blocks)
    expect(m.outer).toMatchObject({ lane: 0, lanes: 2, overlap: true })
    expect(m.inner1).toMatchObject({ lane: 1, lanes: 2 })
    expect(m.inner2).toMatchObject({ lane: 1, lanes: 2 })
  })

  it('keeps a chain in one cluster and reuses freed lanes', () => {
    // a overlaps b, b overlaps c, a and c do not overlap: c reuses lane 0.
    const m = byId(layoutDay([b('a', h(9), h(10)), b('b', h(9.5), h(10.5)), b('c', h(10), h(11))]).blocks)
    expect(m.a).toMatchObject({ lane: 0, lanes: 2, overlap: true })
    expect(m.b).toMatchObject({ lane: 1, lanes: 2, overlap: true })
    expect(m.c).toMatchObject({ lane: 0, lanes: 2, overlap: true })
  })

  it('sizes each cluster independently', () => {
    const m = byId(layoutDay([
      b('a', h(9), h(10)), b('b', h(9), h(10)), b('c', h(9), h(10)),
      b('d', h(14), h(15)),
    ]).blocks)
    expect([m.a.lanes, m.b.lanes, m.c.lanes]).toEqual([3, 3, 3])
    expect(m.d).toMatchObject({ lane: 0, lanes: 1, overlap: false })
  })

  it('never lets two visible blocks in the same lane overlap', () => {
    const input = Array.from({ length: 30 }, (_, i) => b(`t${i}`, (i * 37) % 600 + 360, ((i * 37) % 600) + 360 + 15 + ((i * 13) % 90)))
    const { blocks } = layoutDay(input, 100)
    for (const x of blocks) {
      for (const y of blocks) {
        if (x.id !== y.id && x.lane === y.lane && x.start < y.end && y.start < x.end) throw new Error(`${x.id} and ${y.id} collide`)
      }
      expect(x.lane).toBeLessThan(x.lanes)
    }
    expect(blocks).toHaveLength(30)
  })

  it('caps at four lanes: three lanes of blocks and a +N marker for the rest', () => {
    const input = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => b(id, h(10), h(11)))
    const { blocks, overflow } = layoutDay(input)
    const visible = blocks.filter((x) => !x.hidden)
    expect(visible.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(visible.every((x) => x.lanes === 4)).toBe(true)
    expect(overflow).toEqual([{ lane: 3, lanes: 4, start: h(10), end: h(11), ids: ['d', 'e', 'f'] }])
    expect(blocks.filter((x) => x.hidden).every((x) => x.lane === 3)).toBe(true)
  })

  it('does not overflow at exactly four lanes', () => {
    const { blocks, overflow } = layoutDay(['a', 'b', 'c', 'd'].map((id) => b(id, h(10), h(11))))
    expect(overflow).toEqual([])
    expect(blocks.map((x) => x.lane)).toEqual([0, 1, 2, 3])
  })

  it('repairs empty or inverted blocks to one minute', () => {
    const { blocks } = layoutDay([b('z', 600, 600), b('w', 600, 590)])
    expect(blocks.map((x) => x.end)).toEqual([601, 601])
  })

  it('is independent of input order', () => {
    const input = [b('a', 540, 600), b('b', 570, 630), b('c', 600, 660), b('d', 540, 720), b('e', 800, 830)]
    const want = layoutDay(input)
    expect(layoutDay([...input].reverse())).toEqual(want)
    expect(layoutDay([input[2], input[0], input[4], input[1], input[3]])).toEqual(want)
  })
})
