// The Go port of quick add (internal/quickadd, OpenSpec change
// quick-add-recurrence D5) embeds the six vocabularies as JSON, folded with
// normalize() so Go can match plainly. This test fails when the file is stale.
// Regenerate with: npm run nlp:vocab
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { normalize, VOCABULARIES } from './vocab'

const target = fileURLToPath(new URL('../../../../internal/quickadd/vocab.json', import.meta.url))

function fold(v: unknown): unknown {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? normalize(x) : fold(x)))
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fold(x)]))
  }
  return v
}

/** Every vocabulary with every phrase (list entries and map keys) folded by normalize. */
export function exportVocab() {
  return Object.fromEntries(Object.entries(VOCABULARIES).map(([code, v]) => {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) {
      if (k === 'dayWords' || k === 'timeWords' || k === 'everyOne' || k === 'ordinals') {
        out[k] = Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([p, val]) => [normalize(p), val]))
      } else out[k] = fold(x)
    }
    return [code, out]
  }))
}

describe('quick-add vocabulary shared with the Go port', () => {
  it('internal/quickadd/vocab.json matches the vocabularies', () => {
    const want = JSON.stringify(exportVocab(), null, 1) + '\n'
    if (process.env.UPDATE_QUICKADD_VOCAB) writeFileSync(target, want)
    expect(readFileSync(target, 'utf8')).toBe(want)
  })
})
