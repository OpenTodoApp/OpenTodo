// The Connections graph's model and layout (OpenSpec change notes-graph, D1, D2, D4).
import { describe, expect, it } from 'vitest'
import { cut, layout, neighbourhood, overlaps, RING1_CAP, RING2_CAP, stepFrom, type GraphItem, type GraphKind } from './graphLayout'

const item = (key: string, title = key, updated = 0): GraphItem => {
  const [kind, id] = key.split(':') as [GraphKind, string]
  return { key, kind, id, title, updated }
}

/** An undirected graph from pairs; `items` gives titles and change times. */
function graph(pairs: [string, string][], items: GraphItem[] = []) {
  const byKey = new Map(items.map((i) => [i.key, i]))
  const get = (k: string) => byKey.get(k) ?? item(k)
  const adj = new Map<string, Set<string>>()
  for (const [a, b] of pairs) {
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }
  return { get, of: (k: string) => [...(adj.get(k) ?? [])].map(get) }
}

const keys = (list: readonly GraphItem[]) => list.map((i) => i.key)

describe('neighbourhood', () => {
  it('Two steps: direct links on the inner ring, their links on the outer', () => {
    const g = graph([['note:trip', 'task:ferry'], ['note:packing', 'note:trip'], ['task:ferry', 'note:times']],
      [item('note:trip', 'Trip'), item('task:ferry', 'Book ferry'), item('note:packing', 'Packing list'), item('note:times', 'Ferry times')])
    const n = neighbourhood(g.get('note:trip'), g.of)
    expect(n.centre.key).toBe('note:trip')
    // Notes before tasks, then by title.
    expect(keys(n.ring1)).toEqual(['note:packing', 'task:ferry'])
    expect(keys(n.ring2)).toEqual(['note:times'])
    expect(n.parent.get('note:times')).toBe('task:ferry')
    expect(n.edges).toEqual([['note:packing', 'note:trip'], ['note:times', 'task:ferry'], ['note:trip', 'task:ferry']])
    expect([n.more1, n.more2]).toEqual([0, 0])
  })

  it('a cycle draws each pair once and keeps a direct link off the outer ring', () => {
    const g = graph([['note:a', 'note:b'], ['note:b', 'note:c'], ['note:c', 'note:a'], ['note:c', 'note:d'], ['note:d', 'note:b']])
    const n = neighbourhood(g.get('note:a'), g.of)
    expect(keys(n.ring1)).toEqual(['note:b', 'note:c'])
    expect(keys(n.ring2)).toEqual(['note:d'])
    // Reached first from b, the first ring-1 node in ring order.
    expect(n.parent.get('note:d')).toBe('note:b')
    expect(n.edges).toEqual([['note:a', 'note:b'], ['note:a', 'note:c'], ['note:b', 'note:c'], ['note:b', 'note:d'], ['note:c', 'note:d']])
  })

  it('an item linking to itself is not its own neighbour', () => {
    const g = graph([['note:a', 'note:a'], ['note:a', 'task:b']])
    const n = neighbourhood(g.get('note:a'), g.of)
    expect(keys(n.ring1)).toEqual(['task:b'])
    expect(n.edges).toEqual([['note:a', 'task:b']])
  })

  it('Hub note: 24 most recent on the inner ring and 16 more', () => {
    const notes = Array.from({ length: 40 }, (_, i) => item(`note:n${String(i).padStart(2, '0')}`, `Note ${i}`, i))
    const g = graph(notes.map((x) => [x.key, 'note:index'] as [string, string]), notes)
    const n = neighbourhood(g.get('note:index'), g.of)
    expect(n.ring1).toHaveLength(RING1_CAP)
    expect(n.more1).toBe(16)
    // The most recently changed (16 … 39), drawn in title order.
    expect(new Set(keys(n.ring1))).toEqual(new Set(notes.slice(16).map((x) => x.key)))
    expect(keys(n.ring1)).toEqual([...keys(n.ring1)].sort((a, b) => Number(a.slice(6)) - Number(b.slice(6))))
  })

  it('the outer ring is capped at 48, most recent first, grouped by parent', () => {
    const pairs: [string, string][] = [['note:c', 'note:p1'], ['note:c', 'note:p2']]
    const items: GraphItem[] = []
    for (let i = 0; i < 60; i++) {
      const k = `task:t${String(i).padStart(2, '0')}`
      items.push(item(k, `Task ${String(i).padStart(2, '0')}`, i))
      pairs.push([i % 2 ? 'note:p1' : 'note:p2', k])
    }
    const g = graph(pairs, items)
    const n = neighbourhood(g.get('note:c'), g.of)
    expect(n.ring2).toHaveLength(RING2_CAP)
    expect(n.more2).toBe(12)
    expect(Math.min(...n.ring2.map((x) => x.updated))).toBe(12)
    const parents = n.ring2.map((x) => n.parent.get(x.key))
    expect(parents).toEqual([...parents].sort())
  })

  it('an outer item reached only through a capped-out inner item is not shown', () => {
    const pairs: [string, string][] = []
    const items: GraphItem[] = []
    for (let i = 0; i < 25; i++) {
      items.push(item(`note:n${i}`, `N${i}`, i + 1))
      pairs.push(['note:hub', `note:n${i}`])
    }
    // n-old is the least recent direct link: capped out, so its own link is not a second step.
    items.push(item('note:old', 'Old', 0))
    pairs.push(['note:hub', 'note:old'], ['note:old', 'task:far'])
    const n = neighbourhood(graph(pairs, items).get('note:hub'), graph(pairs, items).of)
    expect(keys(n.ring1)).not.toContain('note:old')
    expect(keys(n.ring2)).not.toContain('task:far')
  })
})

describe('layout', () => {
  const g = graph([['note:trip', 'task:ferry'], ['note:packing', 'note:trip'], ['task:ferry', 'note:times']],
    [item('note:trip', 'Trip'), item('task:ferry', 'Book ferry'), item('note:packing', 'Packing list'), item('note:times', 'Ferry times')])
  const n = neighbourhood(g.get('note:trip'), g.of)

  it('is the same picture every time for the same items and box', () => {
    const a = layout(n, { width: 640, height: 400 })
    const b = layout(neighbourhood(g.get('note:trip'), g.of), { width: 640, height: 400 })
    expect(b).toEqual(a)
    expect(a.fits).toBe(true)
    // The centre in the middle, the first inner node straight above it.
    expect(a.nodes[0]).toMatchObject({ ring: 0, x: 320, y: 200 })
    expect(a.nodes[1].x).toBe(320)
    expect(a.nodes[1].y).toBeLessThan(200)
  })

  it('cuts labels to 24 characters, keeping the whole title on the item', () => {
    const long = 'A very long note title that goes on and on'
    const h = graph([['note:a', 'note:b']], [item('note:a', long), item('note:b', 'B')])
    const l = layout(neighbourhood(h.get('note:a'), h.of), { width: 640, height: 400 })
    expect(l.nodes[0].label).toBe(cut(long, 24))
    expect([...l.nodes[0].label].length).toBeLessThanOrEqual(24)
    expect(l.nodes[0].truncated).toBe(true)
    expect(l.nodes[0].item.title).toBe(long)
  })

  it('at 360 px nothing overlaps, the outer ring as icons', () => {
    const pairs: [string, string][] = []
    const items: GraphItem[] = [item('note:c', 'Weekend in Lisbon')]
    for (let i = 0; i < 6; i++) {
      items.push(item(`note:a${i}`, `Inner note number ${i}`))
      pairs.push(['note:c', `note:a${i}`])
      for (let j = 0; j < 2; j++) {
        items.push(item(`task:b${i}${j}`, `Outer task ${i}.${j} with a long title`))
        pairs.push([`note:a${i}`, `task:b${i}${j}`])
      }
    }
    const h = graph(pairs, items)
    const l = layout(neighbourhood(h.get('note:c'), h.of), { width: 360, height: 560 }, true)
    expect(l.fits).toBe(true)
    expect(overlaps([...l.nodes, ...l.markers], { width: 360, height: 560 })).toBe(false)
    expect(l.nodes.filter((p) => p.ring === 2).every((p) => p.compact)).toBe(true)
  })

  it('a hub at full caps on a phone does not fit and says so', () => {
    const pairs: [string, string][] = []
    for (let i = 0; i < 30; i++) {
      pairs.push(['note:hub', `note:a${i}`])
      for (let j = 0; j < 3; j++) pairs.push([`note:a${i}`, `task:b${i}x${j}`])
    }
    const h = graph(pairs)
    const nb = neighbourhood(h.get('note:hub'), h.of)
    const l = layout(nb, { width: 360, height: 560 }, true)
    expect(l.nodes).toHaveLength(1 + RING1_CAP + RING2_CAP)
    expect(l.markers.map((m) => [m.ring, m.count])).toEqual([[1, 6], [2, 72 - RING2_CAP]])
    expect(l.fits).toBe(false)
  })
})

describe('stepFrom', () => {
  const g = graph([['note:trip', 'task:ferry'], ['note:packing', 'note:trip'], ['task:ferry', 'note:times']],
    [item('note:trip', 'Trip'), item('task:ferry', 'Book ferry'), item('note:packing', 'Packing list'), item('note:times', 'Ferry times')])
  const l = layout(neighbourhood(g.get('note:trip'), g.of), { width: 640, height: 400 })

  it('moves around a ring, toward the centre and outward', () => {
    expect(stepFrom(l, 'note:trip', 'right')).toBe('note:packing')
    expect(stepFrom(l, 'note:trip', 'left')).toBe('task:ferry')
    expect(stepFrom(l, 'note:trip', 'down')).toBe('note:packing')
    expect(stepFrom(l, 'note:trip', 'up')).toBeNull()
    expect(stepFrom(l, 'note:packing', 'right')).toBe('task:ferry')
    expect(stepFrom(l, 'task:ferry', 'right')).toBe('note:packing')
    expect(stepFrom(l, 'task:ferry', 'down')).toBe('note:times')
    expect(stepFrom(l, 'note:times', 'up')).toBe('task:ferry')
    expect(stepFrom(l, 'note:packing', 'up')).toBe('note:trip')
    expect(stepFrom(l, 'note:times', 'down')).toBeNull()
  })
})
