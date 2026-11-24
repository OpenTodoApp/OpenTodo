// Wildcard names (filter-wildcards): the matcher and the written names against
// the vectors internal/filter/names_test.go runs, the tokenizer's escapes and the printers.
import { describe, expect, it } from 'vitest'
import { nameKey } from '../fieldNames'
import vectors from './wildcards.vectors.json'
import { formatQuery } from './builder'
import { MAX_QUERY_LENGTH, parse, printQuery, type Node } from './parse'
import { idsNamed, literalName } from './names'
import { withLabels } from './labelTerms'
import { queryToCondition } from '../rules/convert'

describe('wildcard names', () => {
  it('has the vectors', () => {
    expect(vectors.matches.length).toBeGreaterThanOrEqual(40)
    expect(vectors.literals.length).toBeGreaterThanOrEqual(7)
  })
  for (const c of vectors.matches) {
    it(`${c.pattern} against ${c.name}`, () => {
      expect(idsNamed(new Map([[nameKey(c.name), ['x']]]), c.pattern) !== undefined).toBe(c.match)
    })
  }
  for (const c of vectors.literals) {
    it(`writes ${c.name} as ${c.query} and reads it back as that name only`, () => {
      const node: Node = { kind: 'label', name: literalName(c.name), pos: 0 }
      expect(printQuery(node)).toBe(c.query)
      expect(formatQuery(node)).toBe(c.query)
      const parsed = parse(c.query)
      if (parsed?.kind !== 'label') throw new Error(c.query)
      expect(idsNamed(new Map([[nameKey(c.name), ['name']], [nameKey(c.other), ['other']]]), parsed.name)).toEqual(['name'])
    })
  }

  it('keeps \\* and \\\\ escaped in a quoted name only', () => {
    expect(parse('@"to\\*do"')).toMatchObject({ kind: 'label', name: 'to\\*do' })
    expect(parse('@to\\*do')).toMatchObject({ kind: 'label', name: 'to\\*do' })
    expect(parse('@"a\\\\*"')).toMatchObject({ kind: 'label', name: 'a\\\\*' })
    expect(parse('##W*')).toMatchObject({ kind: 'project', name: 'W*', descendants: true })
    expect(parse('section: "R\\*"')).toMatchObject({ kind: 'section', name: 'R\\*' })
    expect(parse('search: "a\\*"')).toMatchObject({ kind: 'search', text: 'a*' })
  })

  it('prints a pattern back as the same pattern', () => {
    for (const q of ['@"to\\*do x"', '#"Client *"', '##W*', 'section: "In \\* review"', '@"a\\\\b*"', '@"x \\\\*"']) {
      expect(parse(printQuery(parse(q)!))).toEqual(parse(q))
      expect(parse(formatQuery(parse(q)!))).toEqual(parse(q))
    }
  })

  it('writes a picked name literally', () => {
    expect(literalName('to*do')).toBe('to\\*do')
    expect(literalName('a\\*')).toBe('a\\\\\\*')
    expect(withLabels('', [literalName('to*do')])).toBe('@to\\*do')
  })

  it('stays linear on the longest query', () => {
    const names = new Map([['a'.repeat(10000), ['x']], ['ab'.repeat(5000), ['y']]])
    const pattern = 'a*'.repeat(MAX_QUERY_LENGTH / 2 - 1)
    expect(idsNamed(names, pattern)).toEqual(['x', 'y'])
    expect(idsNamed(names, pattern + 'c')).toBeUndefined()
  })

  it('a rule takes the exact name, never a pattern', () => {
    const labels = [{ id: 'l1', name: 'home*', deleted_at: null }, { id: 'l2', name: 'house', deleted_at: null }]
    expect(queryToCondition('@home*', { labels, projects: [] }).condition).toEqual({ labels: { all: ['l1'] } })
    expect(queryToCondition('@home\\*', { labels, projects: [] }).condition).toEqual({ labels: { all: ['l1'] } })
    expect(queryToCondition('@h*', { labels, projects: [] }).condition).toBeNull()
  })
})
