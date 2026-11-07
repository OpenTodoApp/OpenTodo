// Task lists that note their changes (OpenSpec change incremental-list-updates, D1).
import { describe, expect, it } from 'vitest'
import { changesBetween, Derived, keysBetween, LayeredMap, MAX_LINKS, noteChanges, noteKeys, patchOrdered, patchSorted, perList, type TaskChange } from './taskDelta'
import type { Task } from './types'

const task = (id: string, over: Partial<Task> = {}) => ({ id, title: id, position: 0, completed_at: null, ...over }) as Task
const ids = (xs: readonly Task[]) => xs.map((t) => t.id)

/** `prev` with `changed` swapped in (or added), sorted by id, and the link noted. */
function step(prev: Task[], changed: Task[], gone: string[] = []): Task[] {
  const map = new Map(prev.map((t) => [t.id, t]))
  const changes: TaskChange[] = []
  for (const c of changed) { changes.push({ id: c.id, before: map.get(c.id), after: c }); map.set(c.id, c) }
  for (const id of gone) { changes.push({ id, before: map.get(id), after: undefined }); map.delete(id) }
  const next = [...map.values()].sort((a, b) => (a.id < b.id ? -1 : 1))
  noteChanges(prev, next, changes)
  return next
}

describe('changesBetween', () => {
  it('follows and merges links: each id once, its first version and its last', () => {
    const a = [task('a'), task('b')]
    const b = step(a, [task('a', { title: 'A1' })])
    const c = step(b, [task('a', { title: 'A2' }), task('c')])
    const d = step(c, [], ['b'])
    const changes = changesBetween(a, d)!
    const byId = new Map(changes.map((x) => [x.id, x]))
    expect([...byId.keys()].sort()).toEqual(['a', 'b', 'c'])
    expect(byId.get('a')!.before).toBe(a[0])
    expect(byId.get('a')!.after!.title).toBe('A2')
    expect(byId.get('b')!.after).toBeUndefined()
    expect(byId.get('c')!.before).toBeUndefined()
    expect(changesBetween(d, d)).toEqual([])
  })

  it('is null for lists not linked, and for a link too far back', () => {
    const a = [task('a')]
    expect(changesBetween(a, [task('a')])).toBeNull()
    let x = a
    for (let i = 0; i <= MAX_LINKS; i++) x = step(x, [task('a', { title: String(i) })])
    expect(changesBetween(a, x)).toBeNull()
  })

  it('drops a row that came and went again', () => {
    const a = [task('a')]
    const b = step(a, [task('z')])
    const c = step(b, [], ['z'])
    expect(changesBetween(a, c)).toEqual([])
  })
})

describe('patchSorted and patchOrdered', () => {
  const rows = Array.from({ length: 30 }, (_, i) => task(`t${String(i).padStart(2, '0')}`, { position: (i * 7) % 11, completed_at: i % 3 ? null : 1 }))
  const open = (t: Task) => !t.completed_at
  const byPos = (a: Task, b: Task) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const changes: TaskChange[] = [
    { id: 't04', before: rows[4], after: { ...rows[4], completed_at: 5 } },
    { id: 't03', before: rows[3], after: { ...rows[3], completed_at: null, position: 2 } },
    { id: 'zz', before: undefined, after: task('zz', { position: 4 }) },
    { id: 't07', before: rows[7], after: undefined },
  ]
  const after = (() => {
    const map = new Map(rows.map((t) => [t.id, t]))
    for (const c of changes) { if (c.after) map.set(c.id, c.after); else map.delete(c.id) }
    return [...map.values()].sort((a, b) => (a.id < b.id ? -1 : 1))
  })()

  it('patchSorted equals filtering the new rows, and names what it changed', () => {
    const prev = rows.filter(open)
    const out = patchSorted(prev, changes, open)
    expect(ids(out.list)).toEqual(ids(after.filter(open)))
    expect(out.changes.map((c) => c.id).sort()).toEqual(['t03', 't04', 't07', 'zz'])
    expect(patchSorted(prev, [{ id: 't00', after: rows[0] }], open).list).toBe(prev)
  })

  it('patchOrdered equals sorting the filtered new rows', () => {
    const prev = rows.filter(open).sort(byPos)
    expect(ids(patchOrdered(prev, changes, open, byPos))).toEqual(ids(after.filter(open).sort(byPos)))
    expect(patchOrdered(prev, [{ id: 'none', before: undefined, after: undefined }], open, byPos)).toBe(prev)
  })
})

describe('Derived and perList', () => {
  it('patches a linked list, works out the rest in full, and keeps a value for the same inputs', () => {
    let fulls = 0
    let patches = 0
    const count = new Derived<number, [number]>((tasks, k) => { fulls++; return tasks.length * k }, (prev, changes, _t, k) => {
      patches++
      return prev + k * changes.reduce((n, c) => n + (c.after ? 1 : 0) - (c.before ? 1 : 0), 0)
    })
    const a = [task('a')]
    expect(count.get(a, 2)).toBe(2)
    const b = step(a, [task('b')])
    expect(count.get(b, 2)).toBe(4)
    expect(count.get(b, 2)).toBe(4)
    expect([fulls, patches]).toEqual([1, 1])
    expect(count.get(b, 3)).toBe(6)
    expect(count.get([task('x')], 3)).toBe(3)
    expect(fulls).toBe(3)
  })

  it('perList shares one value per list among callers', () => {
    let fulls = 0
    const size = perList((tasks) => { fulls++; return tasks.length }, () => null)
    const a = [task('a')]
    expect(size(a)).toBe(1)
    expect(size(a)).toBe(1)
    expect(size(step(a, [task('b')]))).toBe(2)
    expect(fulls).toBe(2)
  })
})

describe('keysBetween', () => {
  it('unites the keys along the links; null without one', () => {
    const a = {}
    const b = {}
    const c = {}
    noteKeys(a, b, new Set(['x']))
    noteKeys(b, c, new Set(['y']))
    expect([...keysBetween(a, c)!].sort()).toEqual(['x', 'y'])
    expect(keysBetween(a, a)!.size).toBe(0)
    expect(keysBetween({}, c)).toBeNull()
  })
})

describe('LayeredMap', () => {
  it('reads as a copy with the changes applied, however deep, and is read-only', () => {
    const plain = new Map([['a', 1], ['b', 2]])
    let layered: Map<string, number> = plain
    const want = new Map(plain)
    for (let i = 0; i < 3 * MAX_LINKS; i++) {
      const changes: [string, number | undefined][] = [[`k${i}`, i], [i % 2 ? 'a' : 'b', i % 3 ? undefined : i]]
      layered = LayeredMap.patched(layered, changes)
      for (const [k, v] of changes) { if (v === undefined) want.delete(k); else want.set(k, v) }
      for (const k of [...want.keys(), 'a', 'b', 'missing']) expect(layered.get(k)).toBe(want.get(k))
      expect(layered.has('missing')).toBe(false)
    }
    expect(layered.size).toBe(want.size)
    expect(new Map(layered)).toEqual(want)
    expect(() => layered.set('x', 1)).toThrow()
    expect(plain.get('a')).toBe(1)
  })
})
