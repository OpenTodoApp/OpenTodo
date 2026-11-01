// The published JSON Schema of the theme format (theme-engine D1, task 1.1):
// every valid shared example passes it and every invalid one fails it, except the
// rules a schema cannot state (the sRGB gamut, the 16 KB size, broken JSON), which
// the validators check. A small interpreter of the keywords the schema uses keeps
// the test free of a dependency.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { THEME_TOKENS } from './tokens'

const root = join(__dirname, '../../../..')
const dir = join(root, 'internal/themes/testdata')
const schema = JSON.parse(readFileSync(join(root, 'docs/themes/opentodo-theme.schema.json'), 'utf8'))
const expected = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8')) as Record<string, string>

type S = Record<string, unknown>

function ref(s: S): S {
  const r = s.$ref as string | undefined
  return r ? (r.replace('#/', '').split('/').reduce<unknown>((o, k) => (o as S)[k], schema) as S) : s
}

/** True when `v` satisfies schema `s` (the keywords used by opentodo-theme.schema.json). */
function valid(v: unknown, raw: S): boolean {
  const s = ref(raw)
  const isObj = !!v && typeof v === 'object' && !Array.isArray(v)
  if ('const' in s && v !== s.const) return false
  if (Array.isArray(s.enum) && !s.enum.includes(v)) return false
  if (Array.isArray(s.oneOf) && s.oneOf.filter((x) => valid(v, x as S)).length !== 1) return false
  if (s.type === 'object' && !isObj) return false
  if (s.type === 'string' && typeof v !== 'string') return false
  if (s.type === 'integer' && !Number.isInteger(v)) return false
  if (typeof v === 'string') {
    if (typeof s.pattern === 'string' && !new RegExp(s.pattern, 'u').test(v)) return false
    if (typeof s.maxLength === 'number' && [...v].length > s.maxLength) return false
    if (typeof s.minLength === 'number' && [...v].length < s.minLength) return false
  }
  if (typeof v === 'number') {
    if (typeof s.minimum === 'number' && v < s.minimum) return false
    if (typeof s.maximum === 'number' && v > s.maximum) return false
  }
  if (isObj) {
    const o = v as S
    const props = (s.properties ?? {}) as Record<string, S>
    for (const k of (s.required ?? []) as string[]) if (!(k in o)) return false
    for (const [k, x] of Object.entries(o)) {
      if (s.propertyNames && !valid(k, s.propertyNames as S)) return false
      if (k in props) { if (!valid(x, props[k])) return false }
      else if (s.additionalProperties === false) return false
      else if (s.additionalProperties && typeof s.additionalProperties === 'object' && !valid(x, s.additionalProperties as S)) return false
    }
  }
  return true
}

/** Codes a JSON Schema cannot express; the validators refuse them. */
const BEYOND_SCHEMA = new Set(['gamut', 'size', 'json'])

describe('theme JSON Schema', () => {
  for (const [file, want] of Object.entries(expected)) {
    if (BEYOND_SCHEMA.has(want)) continue
    it(`${file} ${want === 'ok' ? 'passes' : 'fails'} the schema`, () => {
      const doc = JSON.parse(readFileSync(join(dir, file), 'utf8'))
      expect(valid(doc, schema)).toBe(want === 'ok')
    })
  }

  it('documents every token of the closed list', () => {
    const doc = readFileSync(join(root, 'docs/themes.md'), 'utf8')
    const missing = THEME_TOKENS.filter((t) => !doc.includes(`\`${t}\``))
    expect(missing).toEqual([])
  })
})
