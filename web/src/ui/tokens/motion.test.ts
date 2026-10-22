// Motion tokens (OpenSpec change motion-v2, design D1; design-system "Reduced motion"):
// the moment and the spring are declared once, the spring never overshoots, and no
// duration in the stylesheet is longer than the moment.
import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'

const declarations = (name: string) => [...css.matchAll(new RegExp(`${name}\\s*:\\s*([^;]+);`, 'g'))].map((m) => m[1].trim())

describe('motion tokens', () => {
  it('declares the moment and the spring exactly once, outside the no-motion block', () => {
    expect(declarations('--duration-moment')).toEqual(['400ms', '0ms'])
    expect(declarations('--ease-spring')).toHaveLength(1)
  })

  it('the spring is an ease-out without overshoot', () => {
    const [x1, y1, x2, y2] = declarations('--ease-spring')[0].match(/cubic-bezier\(([^)]+)\)/)![1].split(',').map(Number)
    for (const v of [x1, y1, x2, y2]) expect(v).toBeGreaterThanOrEqual(0)
    expect(y1).toBeLessThanOrEqual(1)
    expect(y2).toBeLessThanOrEqual(1)
  })

  it('no declared duration is longer than 400 ms', () => {
    const times = [...css.matchAll(/(?<![\w-])(\d+(?:\.\d+)?)(ms|s)\b/g)].map((m) => Number(m[1]) * (m[2] === 's' ? 1000 : 1))
    expect(times.length).toBeGreaterThan(0)
    expect(Math.max(...times)).toBeLessThanOrEqual(400)
  })
})
