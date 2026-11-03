// keepRows (list-rendering-at-scale): a live read that runs again keeps the
// objects of unchanged rows, and its whole answer when nothing changed.
import { describe, expect, it } from 'vitest'
import { keepRows } from './localData'

describe('keepRows', () => {
  it('keeps unchanged rows and the array when nothing changed', async () => {
    let rows = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
    const read = keepRows(async () => rows.map((r) => ({ ...r })))
    const first = await read()
    expect(await read()).toBe(first)
    rows = [{ id: 'a', name: 'A' }, { id: 'b', name: 'Bee' }]
    const second = await read()
    expect(second).not.toBe(first)
    expect(second[0]).toBe(first[0])
    expect(second[1]).toEqual({ id: 'b', name: 'Bee' })
    rows = [{ id: 'a', name: 'A' }]
    const third = await read()
    expect(third).toEqual([{ id: 'a', name: 'A' }])
    expect(third[0]).toBe(first[0])
  })
})
