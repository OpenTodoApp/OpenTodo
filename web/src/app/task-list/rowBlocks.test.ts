// A long list's blocks keep their rows (OpenSpec change incremental-list-updates, D5).
import { describe, expect, it } from 'vitest'
import { BLOCK_ROWS, blockOf, rowBlocks, type RowBlock } from './rowBlocks'

const ids = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `t${String(i + from).padStart(5, '0')}`)
const keyMaker = () => { let n = 0; return () => `b${n++}` }
const blockMap = (blocks: RowBlock[]) => blockOf(blocks)
const sizes = (blocks: RowBlock[]) => blocks.map((b) => b.ids.length)

describe('rowBlocks', () => {
  it('starts with blocks of BLOCK_ROWS in order', () => {
    const rows = ids(2 * BLOCK_ROWS + 7)
    const blocks = rowBlocks(rows, new Map(), keyMaker())
    expect(sizes(blocks)).toEqual([BLOCK_ROWS, BLOCK_ROWS, 7])
    expect(blocks.flatMap((b) => b.ids)).toEqual(rows)
  })

  it('a row that leaves moves no other row to another block', () => {
    const rows = ids(200)
    const make = keyMaker()
    const first = rowBlocks(rows, new Map(), make)
    const before = blockMap(first)
    const next = rowBlocks(rows.filter((id) => id !== 't00010'), before, make)
    const after = blockMap(next)
    for (const [id, key] of after) expect(key).toBe(before.get(id))
    expect(next.map((b) => b.key)).toEqual(first.map((b) => b.key))
  })

  it('a block whose rows all left is gone; the others keep their keys', () => {
    const rows = ids(150)
    const make = keyMaker()
    const first = rowBlocks(rows, new Map(), make)
    const next = rowBlocks(rows.slice(BLOCK_ROWS), blockMap(first), make)
    expect(next.map((b) => b.key)).toEqual(first.slice(1).map((b) => b.key))
  })

  it('a new row joins the block before it; a full block grows up to twice its size', () => {
    const rows = ids(120)
    const make = keyMaker()
    const first = rowBlocks(rows, new Map(), make)
    const added = [...rows.slice(0, 10), 'new', ...rows.slice(10)]
    const next = rowBlocks(added, blockMap(first), make)
    expect(blockMap(next).get('new')).toBe(first[0].key)
    for (const [id, key] of blockMap(first)) expect(blockMap(next).get(id)).toBe(key)
  })

  it('splits a block that grew past twice its size, and keeps every row once and in order', () => {
    const rows = ids(BLOCK_ROWS)
    const make = keyMaker()
    let prev = blockMap(rowBlocks(rows, new Map(), make))
    // Insert rows inside the first block until it must split.
    let list = rows
    for (let i = 0; i < BLOCK_ROWS + 5; i++) list = [list[0], `n${i}`, ...list.slice(1)]
    const next = rowBlocks(list, prev, make)
    prev = blockMap(next)
    expect(next.flatMap((b) => b.ids)).toEqual(list)
    expect(Math.max(...sizes(next))).toBeLessThanOrEqual(2 * BLOCK_ROWS)
    expect(next.length).toBe(2)
  })

  it('a reordered row joins the block it lands in; no key is used twice', () => {
    const rows = ids(150)
    const make = keyMaker()
    const first = rowBlocks(rows, new Map(), make)
    const moved = [...rows.slice(1, 120), rows[0], ...rows.slice(120)]
    const next = rowBlocks(moved, blockMap(first), make)
    expect(new Set(next.map((b) => b.key)).size).toBe(next.length)
    expect(next.flatMap((b) => b.ids)).toEqual(moved)
  })
})
