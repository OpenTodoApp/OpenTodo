// The Connections graph's model and layout (OpenSpec change notes-graph, D1, D2, D4).
import { describe, expect, it } from 'vitest'
import { crosses, cut, layout, neighbourhood, overlaps, RING1_CAP, RING2_CAP, stepFrom, type GraphItem, type GraphKind, type GraphLayout } from './graphLayout'

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

/** The lines that pass behind a node other than their two ends. */
const blocked = (l: GraphLayout) => l.edges.flatMap((e) =>
  [...l.nodes.filter((p) => p.item.key !== e.a && p.item.key !== e.b), ...l.markers].filter((r) => crosses(e, r)).map(() => `${e.a}|${e.b}`))

/** The Lisbon example of the screenshots: a note, five links of three kinds, two second steps. */
const LISBON = [
  item('note:trip', 'Trip to Lisbon'), item('task:ferry', 'Book the ferry to Cacilhas'), item('note:packing', 'Packing list'),
  item('note:times', 'Ferry times'), item('project:holidays', 'Holidays'), item('task:tickets', 'Buy museum tickets'),
  item('note:food', 'Places to eat'), item('task:pastel', 'Try a pastel de nata in Belém'),
]
const LISBON_LINKS: [string, string][] = [
  ['note:trip', 'task:ferry'], ['note:packing', 'note:trip'], ['task:ferry', 'note:times'], ['note:times', 'note:packing'], ['project:holidays', 'note:trip'],
  ['note:trip', 'task:tickets'], ['note:food', 'note:trip'], ['note:food', 'task:pastel'],
]

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
    // The first inner node straight above the centre, and the drawing centred in the canvas both ways.
    expect(a.nodes[0].ring).toBe(0)
    expect(a.nodes[1].x).toBe(a.nodes[0].x)
    expect(a.nodes[1].y).toBeLessThan(a.nodes[0].y)
    const all = [...a.nodes, ...a.markers]
    const mid = (lo: number, hi: number) => (lo + hi) / 2
    expect(Math.abs(mid(Math.min(...all.map((p) => p.x - p.w / 2)), Math.max(...all.map((p) => p.x + p.w / 2))) - 320)).toBeLessThan(1)
    expect(Math.abs(mid(Math.min(...all.map((p) => p.y - p.h / 2)), Math.max(...all.map((p) => p.y + p.h / 2))) - 200)).toBeLessThan(1)
  })

  it('cuts labels to 22 characters, keeping the whole title on the item', () => {
    const long = 'A very long note title that goes on and on'
    const h = graph([['note:a', 'note:b']], [item('note:a', long), item('note:b', 'B')])
    const l = layout(neighbourhood(h.get('note:a'), h.of), { width: 640, height: 400 })
    expect(l.nodes[0].label).toBe(cut(long, 22))
    expect([...l.nodes[0].label].length).toBeLessThanOrEqual(22)
    expect(l.nodes[0].truncated).toBe(true)
    expect(l.nodes[0].item.title).toBe(long)
  })

  it('on a phone every node keeps a label, nothing overlaps and no line passes behind a node', () => {
    const h = graph([['note:trip', 'note:times'], ['note:packing', 'note:trip'], ['note:tram', 'note:times']],
      [item('note:trip', 'Trip to Lisbon'), item('note:times', 'Ferry times'), item('note:food', 'Places to eat'), item('note:packing', 'Packing list'), item('note:tram', 'Tram 28')])
    const l = layout(neighbourhood(h.get('note:trip'), h.of), { width: 358, height: 700 }, true)
    expect(l.fits).toBe(true)
    expect(overlaps([...l.nodes, ...l.markers], { width: 358, height: 700 })).toBe(false)
    expect(l.nodes.every((p) => !p.compact && p.label !== '')).toBe(true)
    expect(blocked(l)).toEqual([])
  })

  it('a long title does not shorten the others: short titles stay whole', () => {
    const h = graph(LISBON_LINKS, LISBON)
    const l = layout(neighbourhood(h.get('note:trip'), h.of), { width: 736, height: 480 })
    const label = (k: string) => l.nodes.find((p) => p.item.key === k)!.label
    expect(label('note:times')).toBe('Ferry times')
    expect(label('task:tickets')).toBe('Buy museum tickets')
    expect(label('note:packing')).toBe('Packing list')
  })

  it('on a phone a picture whose labels do not fit says so (the List opens first)', () => {
    const h = graph(LISBON_LINKS, LISBON)
    expect(layout(neighbourhood(h.get('note:trip'), h.of), { width: 358, height: 700 }, true).fits).toBe(false)
    expect(layout(neighbourhood(h.get('note:trip'), h.of), { width: 736, height: 480 }).fits).toBe(true)
  })

  it('on a phone a picture that needs icon-only nodes does not fit (the List opens first)', () => {
    const pairs: [string, string][] = []
    for (let i = 0; i < 8; i++) {
      pairs.push(['note:c', `note:a${i}`])
      for (let j = 0; j < 3; j++) pairs.push([`note:a${i}`, `task:b${i}x${j}`])
    }
    const h = graph(pairs)
    const l = layout(neighbourhood(h.get('note:c'), h.of), { width: 358, height: 700 }, true)
    expect(l.fits).toBe(false)
  })

  it('no line passes behind a node other than its two ends, and lines end at the pills', () => {
    const cycle = graph([['note:a', 'note:b'], ['note:b', 'note:c'], ['note:c', 'note:a'], ['note:c', 'task:d'], ['task:d', 'note:b']],
      [item('note:a', 'Reading list'), item('note:b', 'Book notes: Deep Work'), item('note:c', 'Focus rituals'), item('task:d', 'Block mornings for writing')])
    const hubPairs: [string, string][] = []
    for (let i = 0; i < 40; i++) hubPairs.push([`note:n${i}`, 'note:index'])
    for (let i = 0; i < 10; i++) hubPairs.push([`note:n${39 - i}`, `task:t${i}`])
    const hub = graph(hubPairs)
    const lisbon = graph(LISBON_LINKS, LISBON)
    for (const [g, centre] of [[cycle, 'note:a'], [hub, 'note:index'], [lisbon, 'note:trip']] as const) {
      for (const [box, narrow] of [[{ width: 736, height: 480 }, false], [{ width: 358, height: 700 }, true]] as const) {
        const l = layout(neighbourhood(g.get(centre), g.of), box, narrow)
        // A phone picture that does not fit opens on the List; the desktop ones must fit.
        if (narrow && !l.fits) continue
        expect(l.fits, `${centre} in ${box.width}`).toBe(true)
        expect(blocked(l), `${centre} in ${box.width}`).toEqual([])
        const at = new Map(l.nodes.map((p) => [p.item.key, p]))
        for (const e of l.edges) {
          // Each end on (or just outside) its own pill's border, never inside it.
          for (const [k, x, y] of [[e.a, e.x1, e.y1], [e.b, e.x2, e.y2]] as const) {
            const p = at.get(k)!
            const inside = p.compact ? Math.hypot(x - p.x, y - p.y) < p.w / 2 - 1 : Math.abs(x - p.x) < p.w / 2 - 1 && Math.abs(y - p.y) < p.h / 2 - 1
            expect(inside, `${k} end ${x},${y} of ${p.x},${p.y} ${p.w}x${p.h} in ${box.width}`).toBe(false)
          }
        }
      }
    }
  })

  it('a cross-link between two outer nodes is left out when its line would cross the centre', () => {
    const h = graph([['note:c', 'note:l'], ['note:c', 'note:r'], ['note:l', 'task:x'], ['note:r', 'task:y'], ['task:x', 'task:y']],
      [item('note:c', 'Centre'), item('note:l', 'Left'), item('note:r', 'Right'), item('task:x', 'Far left'), item('task:y', 'Far right')])
    const n = neighbourhood(h.get('note:c'), h.of)
    const l = layout(n, { width: 736, height: 480 })
    expect(n.edges.map((e) => e.join('|'))).toContain('task:x|task:y')
    expect(l.edges.some((e) => e.a === 'task:x' && e.b === 'task:y')).toBe(false)
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
