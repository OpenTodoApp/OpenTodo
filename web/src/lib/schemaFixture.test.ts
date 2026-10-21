import { describe, expect, it } from 'vitest'
// The op schema contract shared with the server (internal/sync/schema_fixture_test.go
// checks the same file against sync.Schema and e2ee.ContentFields).
import fixture from '../../../internal/sync/testdata/schema_fixture.json'
import { CONTENT_FIELDS, CONTENT_PREFIXES } from './e2ee'
import { DEFAULTS, FIELD_VALUE_PREFIX, REACTION_PREFIX } from './ops'
import { ENTITIES } from './types'

const sorted = (m: Partial<Record<string, readonly string[]>>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...(v ?? [])].sort()]).sort(([a], [b]) => (a < b ? -1 : 1)))

describe('op schema fixture (test-integrity)', () => {
  it('lists the entities of the client', () => {
    expect([...ENTITIES].sort()).toEqual(Object.keys(fixture.entities).sort())
  })

  it('has a row default for every schema field and no other', () => {
    const prefixes = fixture.field_prefixes as Partial<Record<string, string[]>>
    for (const entity of ENTITIES) {
      // A prefix family (`fields.<id>`) lives in one row key named after the prefix.
      const families = (prefixes[entity] ?? []).map((p) => p.replace(/\.$/, ''))
      const keys = Object.keys(DEFAULTS[entity]).filter((k) => !families.includes(k)).sort()
      expect(keys, entity).toEqual([...fixture.entities[entity as keyof typeof fixture.entities]].sort())
    }
    expect(prefixes).toEqual({ task: [FIELD_VALUE_PREFIX], comment: [REACTION_PREFIX] })
    expect(Object.keys(DEFAULTS.task)).toContain('fields')
  })

  it('encrypts the same content fields as the server', () => {
    expect(sorted(CONTENT_FIELDS)).toEqual(sorted(fixture.content_fields))
    expect(sorted(CONTENT_PREFIXES)).toEqual(sorted(fixture.content_prefixes))
  })
})
