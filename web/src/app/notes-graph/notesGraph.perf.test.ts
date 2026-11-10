// @vitest-environment happy-dom
// The graph page at scale (OpenSpec change notes-graph-page, design D7): 2,000 notes
// and 5,000 links. Counts, not times: the layout finishes in its fixed number of
// steps and gives the same picture twice; adding one note moves no other node; a
// frame draws a bounded number of labels; a hit test looks at a few nodes.
import { describe, expect, it } from 'vitest'
import { FULL_STEPS, LOCAL_STEPS } from '../../lib/forceLayout'
import type { NoteEntry } from '../../lib/noteList'
import { buildGraph, GraphLayout, positionsOf, readPositions, visibleMask, writePositions, type NotesGraph, type Placed } from '../../lib/notesGraph'
import { HitGrid, labelsFor, LABEL_CAP } from './draw'

const NOTES = 2_000
const LINKS = 5_000

const entry = (i: number): NoteEntry => ({
  key: `note:n${String(i).padStart(5, '0')}`, source: 'note', id: `n${String(i).padStart(5, '0')}`, title: `Note ${i}`, text: '',
  projectId: `p${i % 20}`, labels: [], updated: i,
})

/** A fixed pseudo-random link list: most links stay near in the numbering, some reach far. */
function links(count: number, notes: number): [string, string][] {
  let s = 42
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const out: [string, string][] = []
  for (let k = 0; k < count; k++) {
    const a = Math.floor(rnd() * notes)
    const b = rnd() < 0.8 ? (a + 1 + Math.floor(rnd() * 30)) % notes : Math.floor(rnd() * notes)
    out.push([entry(a).key, entry(b).key])
  }
  return out
}

const PAIRS = links(LINKS, NOTES)
function graph(extra: NoteEntry[] = [], more: [string, string][] = []): NotesGraph {
  const entries = [...Array.from({ length: NOTES }, (_, i) => entry(i)), ...extra]
  return buildGraph(entries, (fn) => { for (const [a, b] of [...PAIRS, ...more]) fn(a, b) }, () => null)
}

function place(g: NotesGraph, stored = new Map()): { placed: Placed; layout: GraphLayout } {
  const layout = new GraphLayout(g, stored)
  layout.layout.run()
  return { placed: layout.placed(), layout }
}

describe('the notes graph at 2,000 notes and 5,000 links', () => {
  const g = graph()
  const first = place(g)

  it('builds one edge per linked pair', () => {
    expect(g.nodes).toHaveLength(NOTES)
    expect(g.edges.length / 2).toBeGreaterThan(4_500)
    expect(g.edges.length / 2).toBeLessThanOrEqual(LINKS)
  })

  it('lays out in a fixed number of steps, the same way twice', () => {
    const again = place(g)
    expect(first.layout.layout.taken).toBe(FULL_STEPS)
    expect(Array.from(again.placed.x)).toEqual(Array.from(first.placed.x))
    expect(Array.from(again.placed.y)).toEqual(Array.from(first.placed.y))
  })

  it('places a new note without moving any other, from the positions kept on the device and while shown', () => {
    localStorage.clear()
    writePositions(g, first.placed, new Map())
    const added = { ...entry(NOTES), title: 'New' }
    const next = graph([added], [[added.key, g.nodes[10].key]])
    for (const stored of [readPositions(), positionsOf(g, first.placed)]) {
      const { placed, layout } = place(next, stored)
      expect(layout.local).toBe(true)
      expect(layout.layout.taken).toBe(LOCAL_STEPS)
      let moved = 0
      next.nodes.forEach((n, i) => {
        const was = g.at.get(n.key)
        if (was !== undefined && (Math.abs(placed.x[i] - first.placed.x[was]) > 0.5 || Math.abs(placed.y[i] - first.placed.y[was]) > 0.5)) moved++
      })
      expect(moved).toBe(0)
    }
  })

  it('draws a bounded number of labels and hit-tests a few nodes', () => {
    const { x, y } = first.placed
    const visible = visibleMask(g, { orphans: true, secondary: true })
    // The whole picture at a zoom where every node has room for its label: still the cap.
    const labels = labelsFor(g, x, y, visible, { x: 0, y: 0, k: 3 }, { width: 10_000, height: 10_000 }, new Set())
    expect(labels.length).toBeLessThanOrEqual(LABEL_CAP)
    const grid = new HitGrid(x, y, visible)
    const probe = grid.nearest(x[0], y[0], 12)
    expect(probe.node).toBe(0)
    expect(probe.visited).toBeLessThan(100)
  })
})
