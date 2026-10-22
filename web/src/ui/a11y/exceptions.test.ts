import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'
import { parseThemes } from '../tokens/css'
import { DERIVED_TOKENS } from '../tokens/pairs'
import { EXCEPTIONS, EXCEPTION_MIN, exceptionFor, registeredMin } from './exceptions'

// OpenSpec accessibility "Exceptions register and statement" (design D1).
describe('accessibility exceptions register', () => {
  const tokens = { ...parseThemes(css).lightTokens, ...DERIVED_TOKENS }

  it('has every field on every entry', () => {
    expect(EXCEPTIONS.length).toBeGreaterThan(0)
    for (const e of EXCEPTIONS) {
      for (const k of ['id', 'criterion', 'where', 'reason', 'route'] as const) expect(e[k], `${e.id} ${k}`).toMatch(/\S/)
      expect(e.criterion, e.id).toMatch(/^\d\.\d\.\d+ /)
      expect(e.id).toMatch(/^[a-z][a-z0-9-]*$/)
      expect(e.measured?.light, `${e.id} measured.light`).toMatch(/\S/)
      expect(e.measured?.dark, `${e.id} measured.dark`).toMatch(/\S/)
    }
  })

  it('has unique ids', () => {
    expect(new Set(EXCEPTIONS.map((e) => e.id)).size).toBe(EXCEPTIONS.length)
  })

  it('names tokens that exist in every pair', () => {
    for (const e of EXCEPTIONS) for (const p of e.pairs ?? []) {
      expect(p.fg in tokens, `${e.id}: ${p.fg}`).toBe(true)
      if (p.bg !== '*') expect(p.bg in tokens, `${e.id}: ${p.bg}`).toBe(true)
    }
  })

  it('covers a pair by name or by the wildcard', () => {
    expect(exceptionFor('faint', 'hue-red-past')?.id).toBe('faint-tone')
    expect(exceptionFor('on-accent', 'accent')?.id).toBe('accent-label')
    expect(exceptionFor('text', 'canvas')).toBeUndefined()
    expect(registeredMin('faint', 'canvas', 7)).toBe(EXCEPTION_MIN)
    expect(registeredMin('text', 'canvas', 7)).toBe(7)
  })
})
