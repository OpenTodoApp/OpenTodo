// @vitest-environment happy-dom
// The graph of the notes (OpenSpec change notes-graph-page, design D2, D4, D5, D6):
// notes and their links, secondary nodes for targets without a note, nothing the
// device cannot read, hiding without moving, the topic, the depth around a centre,
// the arrow keys' step and the positions kept on the device.
import { beforeEach, describe, expect, it } from 'vitest'
import type { NoteEntry } from './noteList'
import { around, buildGraph, GraphLayout, inTopic, litMask, POSITIONS_KEY, readPositions, sameGraph, stepToward, visibleMask, writePositions, type Resolve } from './notesGraph'

const note = (id: string, title: string, extra: Partial<NoteEntry> = {}): NoteEntry => ({ key: `note:${id}`, source: 'note', id, title, text: '', projectId: null, labels: [], updated: 0, ...extra })
const taskNote = (id: string, title: string, extra: Partial<NoteEntry> = {}): NoteEntry => ({ ...note(id, title, extra), key: `task:${id}`, source: 'task' })

/** Trip links to Packing list, to the task Book ferry (no note) and to a note the device does not hold; Lone links nowhere. */
const ENTRIES = [
  note('trip', 'Trip', { projectId: 'holidays', labels: ['travel'] }), note('packing', 'Packing list', { projectId: 'holidays' }),
  note('lone', 'Lone'), taskNote('t1', 'Call the bank', { projectId: 'admin', labels: ['travel'] }),
]
const LINKS: [string, string][] = [['note:trip', 'note:packing'], ['note:packing', 'note:trip'], ['note:trip', 'task:ferry'], ['note:trip', 'note:theirs'], ['task:t1', 'note:packing'], ['note:theirs', 'note:trip']]
const resolve: Resolve = (kind, id) => (kind === 'task' && id === 'ferry' ? { title: 'Book ferry', projectId: 'holidays', labels: [], done: false } : null)
const graph = () => buildGraph(ENTRIES, (fn) => { for (const [a, b] of LINKS) fn(a, b) }, resolve)

beforeEach(() => localStorage.clear())

describe('the notes graph', () => {
  it('draws notes, secondary nodes and one line per linked pair, without what the device cannot read', () => {
    const g = graph()
    expect(g.nodes.map((n) => n.key)).toEqual(['note:lone', 'note:packing', 'note:trip', 'task:ferry', 'task:t1'])
    expect(g.nodes.find((n) => n.key === 'task:ferry')).toMatchObject({ listed: false, title: 'Book ferry' })
    const pairs = []
    for (let e = 0; e < g.edges.length; e += 2) pairs.push(`${g.nodes[g.edges[e]].key}|${g.nodes[g.edges[e + 1]].key}`)
    // Trip and Packing list link each other: one line.
    expect(pairs.sort()).toEqual(['note:packing|note:trip', 'note:packing|task:t1', 'note:trip|task:ferry'])
    expect(sameGraph(g, graph())).toBe(true)
  })

  it('hides secondary nodes and notes without links, moving nothing', () => {
    const g = graph()
    const at = (k: string) => g.at.get(k)!
    const all = visibleMask(g, { orphans: true, secondary: true })
    expect(all.every((v) => v === 1)).toBe(true)
    const linked = visibleMask(g, { orphans: false, secondary: false })
    expect(linked[at('task:ferry')]).toBe(0)
    expect(linked[at('note:lone')]).toBe(0)
    expect(linked[at('note:trip')]).toBe(1)
    const layout = new GraphLayout(g, new Map())
    layout.layout.run()
    const p = layout.placed()
    // Lone has no link: it sits on the rim, outside the layout.
    expect(p.orphan[at('note:lone')]).toBe(1)
    expect(Math.hypot(p.x[at('note:lone')], p.y[at('note:lone')])).toBeGreaterThan(Math.hypot(p.x[at('note:trip')], p.y[at('note:trip')]))
  })

  it('lights the topic (the notes the chips keep, and what they link to without a note), the search and the depth, each narrowing the others', () => {
    const g = graph()
    const keys = (m: Uint8Array | null) => (m ? g.nodes.filter((_, i) => m[i]).map((n) => n.key) : null)
    const visible = visibleMask(g, { orphans: true, secondary: true })
    const lit = (o: Partial<Parameters<typeof litMask>[1]>) => keys(litMask(g, { topic: null, matches: null, centre: null, depth: 2, visible, ...o }))
    expect(lit({})).toBeNull()
    // in:Holidays keeps Trip and Packing list; Book ferry has no note and Trip links to it.
    const holidays = new Set(['note:trip', 'note:packing'])
    expect(lit({ topic: holidays })).toEqual(['note:packing', 'note:trip', 'task:ferry'])
    // label:travel keeps Trip and the task note Call the bank.
    expect(lit({ topic: new Set(['note:trip', 'task:t1']) })).toEqual(['note:trip', 'task:ferry', 'task:t1'])
    expect(lit({ topic: holidays, matches: new Set(['note:trip']) })).toEqual(['note:trip'])
    expect(lit({ centre: g.at.get('task:ferry')!, depth: 1 })).toEqual(['note:trip', 'task:ferry'])
    expect(keys(around(g, g.at.get('task:ferry')!, 2, visible))).toEqual(['note:packing', 'note:trip', 'task:ferry'])
    expect(inTopic(g, g.at.get('note:lone')!, holidays)).toBe(false)
  })

  it('steps to the linked node in the direction of the arrow', () => {
    const g = graph()
    const x = Float64Array.from([0, 100, 0, -100, 100])
    const y = Float64Array.from([200, 0, 0, 0, 100])
    const visible = visibleMask(g, { orphans: true, secondary: true })
    const trip = g.at.get('note:trip')!
    expect(stepToward(g, x, y, visible, trip, 'right')).toBe(g.at.get('note:packing'))
    expect(stepToward(g, x, y, visible, trip, 'left')).toBe(g.at.get('task:ferry'))
    // Nothing linked below: the nearest node that way.
    expect(stepToward(g, x, y, visible, trip, 'down')).toBe(g.at.get('note:lone'))
    expect(stepToward(g, x, y, visible, trip, 'up')).toBeNull()
  })

  it('keeps the positions on the device and reuses them', () => {
    const g = graph()
    const first = new GraphLayout(g, new Map())
    first.layout.run()
    const placed = first.placed()
    writePositions(g, placed, new Map([['note:elsewhere', { x: 1, y: 2, orphan: false }]]))
    expect(localStorage.getItem(POSITIONS_KEY)).toContain('note:elsewhere')
    const stored = readPositions()
    const again = new GraphLayout(g, stored)
    expect(again.local).toBe(true)
    again.layout.run()
    const p = again.placed()
    g.nodes.forEach((_, i) => {
      expect(Math.abs(p.x[i] - placed.x[i])).toBeLessThanOrEqual(0.5)
      expect(Math.abs(p.y[i] - placed.y[i])).toBeLessThanOrEqual(0.5)
    })
    localStorage.setItem(POSITIONS_KEY, 'not json')
    expect(readPositions().size).toBe(0)
  })
})
