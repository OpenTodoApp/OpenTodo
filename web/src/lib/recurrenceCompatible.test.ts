import { describe, expect, it } from 'vitest'
import { compatibleRule, parseRule } from './recurrence'
// Shared with internal/recurrence (Go): both implementations must satisfy every vector.
import vectors from './recurrence.vectors.json'
import quickadd from './nlp/quickadd.vectors.json'
import { parse } from './nlp/parse'
import { check10 } from './testdata/check10'
import { parseRule as parse10 } from './testdata/recurrence-1.0'

// OpenSpec change recurrence-1-0-compatible: writers store the form a 1.0 client
// reads whenever one means the same thing.
describe('rules a 1.0 client reads', () => {
  it('the frozen 1.0 grammar reads the old forms and not the new one', () => {
    for (const rule of ['every 2 weeks', 'every saturday', 'every monday, friday for 3 times', 'every 2nd tuesday', 'every 3 days after completion']) {
      expect(parse10(rule).ok, rule).toBe(true)
    }
    for (const rule of ['every 2 weeks on saturday', 'every week on monday', 'every 3 weeks on monday, friday']) {
      expect(parse10(rule).ok, rule).toBe(false)
    }
  })

  it('the check fails the new form where 1.0 has a rule with the same dates', () => {
    expect(check10('every 2 weeks on saturday', '2026-11-07')).not.toBeNull()
    expect(check10('every 2 weeks on saturday', '2026-11-04')).toBeNull()
    expect(check10('every 2 weeks on saturday', null)).toBeNull()
    expect(check10('every 3 weeks on monday, thursday', '2026-11-02')).toBeNull()
    expect(check10('every 2 weeks', '2026-11-07')).toBeNull()
  })

  it.each(vectors.compatible.map((v) => [v.name, v] as const))('compatible: %s', (_name, v) => {
    const got = compatibleRule(v.rule, v.due)
    expect(got).toBe(v.expected)
    if (parseRule(got).ok) expect(check10(got, v.due)).toBeNull()
  })

  it('every rule quick add stores in the shared vectors', () => {
    let n = 0
    for (const c of quickadd.cases) {
      const r = parse(c.line, c.ctx)
      if (!r.recurrence) continue
      n++
      expect(check10(r.recurrence, r.due?.date), c.name).toBeNull()
    }
    expect(n).toBeGreaterThan(50)
  })
})
