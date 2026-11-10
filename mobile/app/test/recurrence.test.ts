// The recurrence vectors shared with internal/recurrence (docs/contracts.md), run on
// the app's runtime against web/src/lib/recurrence.ts.
import { canonicalRule, firstOccurrence, followingOccurrence, parseRule, previewOccurrences } from '@shared/recurrence'
import vectors from '../../../web/src/lib/recurrence.vectors.json'

interface NextVector { name: string; rule: string; due: string | null; today: string; completedOn: string | null; done: number; expected: string | null }

describe('recurrence.vectors.json', () => {
  it.each(vectors.parse.map((v) => [v.input, v] as const))('parse %j', (_input, v) => {
    const r = parseRule(v.input)
    if ('error' in v && v.error) {
      expect(r.ok).toBe(false)
      return
    }
    const canonical = (v as { canonical: string }).canonical
    expect(r).toMatchObject({ ok: true, canonical })
    expect(canonicalRule(canonical)).toBe(canonical)
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
