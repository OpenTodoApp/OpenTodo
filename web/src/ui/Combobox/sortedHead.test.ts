// sortedHead (list-rendering-at-scale): the shown head of the options is what a
// full sort gives, and every match is still there after it.
import { describe, expect, it } from 'vitest'
import { sortedHead } from './useCombobox'

describe('sortedHead', () => {
  it('orders the head as a full sort does and keeps every item', () => {
    let seed = 7
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    for (const n of [0, 3, 50, 199, 200, 201, 5000]) {
      const xs = Array.from({ length: n }, (_, i) => ({ tier: Math.floor(rand() * 4), gaps: Math.floor(rand() * 6), i }))
      const order = (a: typeof xs[number], b: typeof xs[number]) => b.tier - a.tier || a.gaps - b.gaps || a.i - b.i
      const full = [...xs].sort(order)
      for (const head of [undefined, 0, 1, 50]) {
        const out = sortedHead([...xs], head, order)
        const shown = Math.min(head ?? n, n)
        expect(out.slice(0, shown)).toEqual(full.slice(0, shown))
        expect(out.map((x) => x.i).sort((a, b) => a - b)).toEqual(xs.map((x) => x.i))
      }
    }
  })
})
