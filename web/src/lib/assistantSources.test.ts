import { describe, expect, it } from 'vitest'
import vectors from './assistantDevice/sources.vectors.json'
import { sourceOf, sourceOfResult } from './assistantSources'

describe('sourceOfResult (assistant-tool-sources D1)', () => {
  for (const v of vectors.vectors) {
    it(v.name, () => {
      expect(sourceOfResult(v.tool, v.result)).toEqual(v.source)
    })
  }
})

describe('sourceOf', () => {
  it('reads a stream event', () => {
    expect(sourceOf({ type: 'source', of: 'projects', ids: ['p1', 'bad id'], total: 4 })).toEqual({ of: 'projects', ids: ['p1'], total: 4 })
  })
  it('skips an unknown kind', () => {
    expect(sourceOf({ type: 'source', of: 'notes', ids: ['n1'], total: 1 })).toBeNull()
  })
  it('never counts fewer than it holds', () => {
    expect(sourceOf({ of: 'tasks', ids: ['a', 'b'], total: 1 })).toEqual({ of: 'tasks', ids: ['a', 'b'], total: 2 })
  })
})
