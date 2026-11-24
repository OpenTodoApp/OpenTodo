// Wildcard names (filter-wildcards): the matcher against the vectors
// internal/filter/names_test.go runs, the tokenizer's escapes and the printers.
import { describe, expect, it } from 'vitest'
import { nameKey } from '../fieldNames'
import vectors from '../../../../internal/filter/testdata/wildcards.json'
import { formatQuery } from './builder'
import { MAX_QUERY_LENGTH, parse, printQuery } from './parse'
import { idsNamed, literalName } from './names'
import { withLabels } from './labelTerms'
import { queryToCondition } from '../rules/convert'

describe('wildcard names', () => {
  it('has the vectors', () => expect(vectors.length).toBeGreaterThanOrEqual(30))
  for (const c of vectors) {
    it(`${c.pattern} against ${c.name}`, () => {
      expect(idsNamed(new Map([[nameKey(c.name), ['x']]]), c.pattern) !== undefined).toBe(c.match)
    })
  }

  it('keeps \\* escaped in a quoted name only', () => {
    expect(parse('@"to\\*do"')).toMatchObject({ kind: 'label', name: 'to\\*do' })
    expect(parse('@to\\*do')).toMatchObject({ kind: 'label', name: 'to\\*do' })
    expect(parse('##W*')).toMatchObject({ kind: 'project', name: 'W*', descendants: true })
    expect(parse('section: "R\\*"')).toMatchObject({ kind: 'section', name: 'R\\*' })
    expect(parse('search: "a\\*"')).toMatchObject({ kind: 'search', text: 'a*' })
  })

  it('prints a pattern back as the same pattern', () => {
    for (const q of ['@"to\\*do x"', '#"Client *"', '##W*', 'section: "In \\* review"', '@"a\\\\b*"']) {
      expect(parse(printQuery(parse(q)!))).toEqual(parse(q))
      expect(parse(formatQuery(parse(q)!))).toEqual(parse(q))
    }
  })

  it('writes a picked name with a star literally', () => {
    expect(literalName('to*do')).toBe('to\\*do')
    expect(withLabels('', ['to\\*do'])).toBe('@to\\*do')
  })

  it('stays linear on the longest query', () => {
    const names = new Map([['a'.repeat(10000), ['x']], ['ab'.repeat(5000), ['y']]])
    const pattern = 'a*'.repeat(MAX_QUERY_LENGTH / 2 - 1)
    expect(idsNamed(names, pattern)).toEqual(['x', 'y'])
    expect(idsNamed(names, pattern + 'c')).toBeUndefined()
  })

  it('leaves a wildcard out of a rule', () => {
    const labels = [{ id: 'l1', name: 'home*', deleted_at: null }]
    expect(queryToCondition('@home*', { labels, projects: [] }).condition).toBeNull()
    expect(queryToCondition('@home\\*', { labels, projects: [] }).condition).toEqual({ labels: { all: ['l1'] } })
  })
})
