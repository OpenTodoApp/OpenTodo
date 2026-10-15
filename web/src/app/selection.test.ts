// OpenSpec change bulk-edit, task 1.1.
import { describe, expect, it } from 'vitest'
import { EMPTY, extendTo, retain, selectAll, toggle } from './selection'

const rows = ['a', 'b', 'c', 'd', 'e']
const ids = (s: { ticked: ReadonlySet<string> }) => [...s.ticked].sort()

describe('selection', () => {
  it('tick and extend to three', () => {
    let s = toggle(EMPTY, 'b')
    s = extendTo(s, rows, 'c')
    s = extendTo(s, rows, 'd')
    expect(ids(s)).toEqual(['b', 'c', 'd'])
  })
  it('shrink the range back', () => {
    let s = extendTo(toggle(EMPTY, 'b'), rows, 'e')
    expect(ids(s)).toEqual(['b', 'c', 'd', 'e'])
    s = extendTo(s, rows, 'c')
    expect(ids(s)).toEqual(['b', 'c'])
  })
  it('extends upwards from the anchor', () => {
    expect(ids(extendTo(toggle(EMPTY, 'd'), rows, 'b'))).toEqual(['b', 'c', 'd'])
  })
  it('individually ticked rows survive a shrink', () => {
    let s = toggle(EMPTY, 'e')
    s = toggle(s, 'a')
    s = extendTo(s, rows, 'e')
    s = extendTo(s, rows, 'b')
    expect(ids(s)).toEqual(['a', 'b', 'e'])
  })
  it('select all skips read-only rows, and toggle refuses them', () => {
    const ro = (id: string) => id === 'c'
    expect(ids(selectAll(EMPTY, rows, ro))).toEqual(['a', 'b', 'd', 'e'])
    expect(toggle(EMPTY, 'c', ro)).toBe(EMPTY)
    expect(ids(extendTo(toggle(EMPTY, 'b'), rows, 'd', ro))).toEqual(['b', 'd'])
  })
  it('retain drops a vanished id and keeps the object when nothing changed', () => {
    const s = toggle(toggle(EMPTY, 'a'), 'b')
    expect(retain(s, rows)).toBe(s)
    expect(ids(retain(s, ['a', 'c']))).toEqual(['a'])
  })
})
