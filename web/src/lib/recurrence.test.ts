import { describe, expect, it } from 'vitest'
import {
  canonicalRule, firstOccurrence, followingOccurrence, MAX_RULE_LENGTH, nextAfterCompletion, nextCalendar, parseRule, previewOccurrences, RULE_SUGGESTIONS,
} from './recurrence'
// Shared with internal/recurrence (Go): both implementations must satisfy every vector.
import vectors from './recurrence.vectors.json'

interface NextVector { name: string; rule: string; due: string | null; today: string; completedOn: string | null; done: number; expected: string | null }

describe('shared recurrence vectors', () => {
  it('has the expected shape', () => {
    expect(vectors.parse.length).toBeGreaterThan(50)
    expect(vectors.next.length).toBeGreaterThanOrEqual(60)
    for (const v of vectors.next as NextVector[]) {
      expect(Object.keys(v).sort()).toEqual(['completedOn', 'done', 'due', 'expected', 'name', 'rule', 'today'])
    }
  })

  it.each(vectors.parse.map((v) => [v.input, v] as const))('parse %j', (_input, v) => {
    const r = parseRule(v.input)
    if ('error' in v && v.error) {
      expect(r.ok, r.ok ? r.canonical : '').toBe(false)
      return
    }
    expect(r).toMatchObject({ ok: true, canonical: (v as { canonical: string }).canonical })
    // The canonical form is a fixed point.
    expect(canonicalRule((v as { canonical: string }).canonical)).toBe((v as { canonical: string }).canonical)
  })

  it.each((vectors.next as NextVector[]).map((v) => [v.name, v] as const))('next: %s', (_name, v) => {
    expect(followingOccurrence(v.rule, v.due, v.today, v.completedOn ?? v.today, v.done)).toBe(v.expected)
  })

  it.each(vectors.first.map((v) => [`${v.rule} from ${v.from}`, v] as const))('first: %s', (_name, v) => {
    expect(firstOccurrence(v.rule, v.from)).toBe(v.expected)
  })

  it.each(vectors.preview.map((v) => [v.name, v] as const))('preview: %s', (_name, v) => {
    expect(previewOccurrences(v.rule, v.due, v.today, v.done, 3)).toEqual(v.expected)
  })
})

describe('recurrence', () => {
  it('canonicalises "Every  2nd  Tuesday"', () => {
    expect(canonicalRule('Every  2nd  Tuesday')).toBe('every 2nd tuesday')
  })

  it('rejects rules over the length limit and unknown words with a message', () => {
    expect(parseRule('every day' + ' '.repeat(MAX_RULE_LENGTH))).toMatchObject({ ok: false })
    const r = parseRule('every blursday')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('blursday')
  })

  it('every suggestion is valid and already canonical or canonicalisable', () => {
    for (const s of RULE_SUGGESTIONS) expect(canonicalRule(s), s).not.toBeNull()
  })

  it('exposes the calendar and completion-relative calculators separately', () => {
    expect(nextCalendar('every last weekday', '2026-10-30', '2026-10-30')).toBe('2026-11-30')
    expect(nextAfterCompletion('every 3 days after completion', '2026-10-14')).toBe('2026-10-17')
    expect(() => nextAfterCompletion('every monday', '2026-10-14')).toThrow()
    expect(() => nextCalendar('every day', '2026-02-30', '2026-10-10')).toThrow()
  })

  it('does not depend on the time zone or DST (floating dates)', () => {
    // Walk 3 years of daily occurrences: every step is exactly one calendar day,
    // including the DST switch days of every zone.
    let d = '2025-12-31'
    const seen = new Set<string>()
    for (let i = 0; i < 365 * 3; i++) {
      const next = nextCalendar('every day', d, d)
      expect(next > d).toBe(true)
      seen.add(next)
      d = next
    }
    expect(seen.size).toBe(365 * 3)
    expect(seen.has('2026-03-29') && seen.has('2026-03-08') && seen.has('2026-11-01') && seen.has('2028-02-29')).toBe(true)
    expect(d).toBe('2028-12-30')
  })
})
