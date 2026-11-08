import { describe, expect, it } from 'vitest'
import vectors from './reusable.vectors.json'
import { duplicateLosers, findMatch, isReusable, normalizeTitle, sortsIntoAisles, type ReusableTask } from './reusable'

type Row = Partial<ReusableTask> & { id: string; title: string }

function rows(list: readonly Row[]): ReusableTask[] {
  return list.map((t) => ({ project_id: null, parent_id: null, completed_at: null, deleted_at: null, ...t }) as ReusableTask)
}

describe('reusable lists (shared reusable.vectors.json with internal/reuse)', () => {
  it('has the same cases as the Go test', () => {
    // internal/reuse/reuse_test.go TestVectorCounts pins the same counts.
    expect([vectors.normalize.length, vectors.match.length, vectors.duplicates.length]).toEqual([28, 15, 10])
  })
  for (const c of vectors.normalize) it(`normalize ${JSON.stringify(c.in)}`, () => expect(normalizeTitle(c.in)).toBe(c.out))
  for (const c of vectors.match)
    it(`match: ${c.name}`, () => {
      const m = findMatch(c.project, c.title, rows(c.tasks as Row[]))
      expect(m && { id: m.task.id, state: m.state }).toEqual(c.want)
    })
  for (const c of vectors.duplicates)
    it(`duplicates: ${c.name}`, () => {
      const attached = new Set((c as { attached?: string[] }).attached ?? [])
      expect(duplicateLosers(c.project, rows(c.tasks as Row[]), attached)).toEqual(c.losers)
    })

  it('every device picks the same survivor whatever order it holds the rows in', () => {
    const a = rows([
      { id: 'x2', title: 'Eggs', project_id: 'p' },
      { id: 'x1', title: 'eggs', project_id: 'p' },
      { id: 'x3', title: 'EGGS ', project_id: 'p' },
    ])
    const b = [...a].reverse()
    expect(duplicateLosers('p', a)).toEqual(duplicateLosers('p', b))
    expect(duplicateLosers('p', a)).toEqual(['x2', 'x3'])
  })

  it('reads the project flags, aisles only while reusable', () => {
    expect(isReusable({ reusable: true })).toBe(true)
    expect(isReusable({})).toBe(false)
    expect(isReusable(null)).toBe(false)
    expect(sortsIntoAisles({ reusable: true, aisles: true })).toBe(true)
    expect(sortsIntoAisles({ reusable: false, aisles: true })).toBe(false)
  })
})
