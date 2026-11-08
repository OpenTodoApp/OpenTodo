// @vitest-environment happy-dom
// A completion draws its own row only (OpenSpec change list-rendering-at-scale, design
// D7): a departure that starts wakes that task's rows, not the list, and a list that
// draws ghosts finds a departing row's place in the lists it last drew.
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '../ui/test-utils'
import type { ListGroup } from '../lib/listGroups'
import { useListMotion } from './task-list/ListGroups'
import { cancelDeparture, departures$, ghostMemory, isGhost, markCompleted, resetDepartures, useDeparture, useDepartureEnds, withGhosts } from './motion'

afterEach(() => { resetDepartures(); vi.useRealTimers() })

describe('departure subscriptions', () => {
  it('a departure that starts draws its own task only; the list draws when it ends', async () => {
    vi.useFakeTimers()
    const renders = { a: 0, b: 0, list: 0 }
    const seen: Record<string, unknown> = {}
    function Row({ id }: { id: 'a' | 'b' }) {
      renders[id]++
      seen[id] = useDeparture(id)
      return null
    }
    function List() {
      renders.list++
      useDepartureEnds()
      return <><Row id="a" /><Row id="b" /></>
    }
    await render(<List />)
    const before = { ...renders }
    await act(async () => markCompleted('a'))
    expect(seen.a).toBe('leave')
    expect(renders.a).toBe(before.a + 1)
    expect(renders.b).toBe(before.b)
    expect(renders.list).toBe(before.list)
    // The moment ends: the list draws again (to drop a ghost), and the row is plain again.
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(seen.a).toBeUndefined()
    expect(renders.list).toBe(before.list + 1)
  })

  it('Undo during the moment ends the departure for the list and restores the row', async () => {
    const renders = { list: 0 }
    let state: unknown
    function Row() { state = useDeparture('a'); return null }
    function List() { renders.list++; useDepartureEnds(); return <Row /> }
    await render(<List />)
    await act(async () => markCompleted('a'))
    const before = renders.list
    await act(async () => cancelDeparture('a'))
    expect(state).toBe('restored')
    expect(renders.list).toBe(before + 1)
  })
})

describe('one list redraw per completion (incremental-list-updates D4)', () => {
  it('a list that draws ghosts does not draw again when a departure ends', async () => {
    vi.useFakeTimers()
    let renders = 0
    const groups: ListGroup[] = [{ key: 'all', heading: null, rows: [] }]
    function List() {
      renders++
      useListMotion(groups, [])
      return null
    }
    await render(<List />)
    const before = renders
    await act(async () => markCompleted('a'))
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(departures$().size).toBe(0)
    expect(renders).toBe(before)
  })
})

describe('withGhosts', () => {
  const lists = (...xs: string[][]) => xs.map((items, i) => ({ key: `g${i}`, items: items.map((id) => ({ id })) }))
  const ids = (m: Map<string, { id: string }[]>) => [...m.values()].map((l) => l.map((x) => (isGhost(x) ? `(${x.id})` : x.id)))
  const run = (m: ReturnType<typeof ghostMemory<{ id: string }>>, ls: ReturnType<typeof lists>, live: Map<string, 'leave' | 'restored'>) =>
    withGhosts(ls, (x) => x.id, (x) => ({ ...x }), live, m)

  it('puts a row that left back at its place in the lists last drawn, though the list never drew while it departed', () => {
    const m = ghostMemory<{ id: string }>()
    expect(ids(run(m, lists(['a', 'b', 'c'], ['d']), new Map()))).toEqual([['a', 'b', 'c'], ['d']])
    // b and then c complete; the list draws next when both have left its data.
    const live = new Map([['b', 'leave'], ['c', 'leave']] as const)
    expect(ids(run(m, lists(['a'], ['d']), live))).toEqual([['a', '(b)', '(c)'], ['d']])
    // Still in place on the next draw; gone once the departures end.
    expect(ids(run(m, lists(['a'], ['d']), live))).toEqual([['a', '(b)', '(c)'], ['d']])
    expect(ids(run(m, lists(['a'], ['d']), new Map()))).toEqual([['a'], ['d']])
  })

  it('a row that leaves after another row left keeps its place below that ghost', () => {
    const m = ghostMemory<{ id: string }>()
    run(m, lists(['a', 'b', 'c']), new Map())
    run(m, lists(['a', 'c']), new Map([['b', 'leave']]))
    expect(ids(run(m, lists(['a']), new Map([['b', 'leave'], ['c', 'leave']])))).toEqual([['a', '(b)', '(c)']])
  })

  it('a row that comes back (Undo) is no ghost, and lists without ghosts are the same arrays', () => {
    const m = ghostMemory<{ id: string }>()
    const first = lists(['a', 'b'])
    run(m, first, new Map())
    expect(ids(run(m, lists(['a']), new Map([['b', 'leave']])))).toEqual([['a', '(b)']])
    const back = lists(['a', 'b'])
    const out = run(m, back, new Map([['b', 'restored']]))
    expect(ids(out)).toEqual([['a', 'b']])
    expect(out.get('g0')).toBe(back[0].items)
    expect(departures$().size).toBe(0)
  })
})
