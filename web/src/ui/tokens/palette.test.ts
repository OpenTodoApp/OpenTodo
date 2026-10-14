import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'
import { LABEL_PALETTE } from '../../lib/labels'
import { HUES, hueFor } from './palette'

describe('hueFor', () => {
  it('maps every LABEL_PALETTE value to its own hue', () => {
    for (const hex of LABEL_PALETTE) expect(HUES.find((h) => h.name === hueFor(hex))?.hex).toBe(hex)
  })

  it('maps an off-palette colour to the nearest hue', () => {
    expect(hueFor('#a0522d')).toBe('orange')
    expect(hueFor('#22C55E')).toBe('green')
    expect(hueFor('#1d4ed8')).toBe('blue')
    expect(hueFor('#808080')).toBe('slate')
  })

  it('falls back to slate for invalid input', () => {
    for (const v of ['', 'red', '#12', 'rgb(1,2,3)', null, undefined]) expect(hueFor(v)).toBe('slate')
  })

  it('has a data-hue rule for every hue', () => {
    for (const { name } of HUES) expect(css).toContain(`[data-hue="${name}"]`)
  })
})
