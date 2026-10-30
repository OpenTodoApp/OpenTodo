import { describe, expect, it } from 'vitest'
import { ENERGY_LEVELS, energyLevelsOn, energyOf, isEnergy } from './energy'

// OpenSpec change task-energy, D1 and D3.
describe('energy', () => {
  it('reads the three levels and nothing else', () => {
    expect(ENERGY_LEVELS.map((e) => energyOf({ energy: e }))).toEqual(['deep', 'medium', 'low'])
    expect(energyOf({ energy: '' })).toBeNull()
    expect(energyOf({})).toBeNull()
    expect(energyOf(null)).toBeNull()
  })
  it('an unknown value from a later version reads as none', () => {
    expect(energyOf({ energy: 'high' })).toBeNull()
    expect(energyOf({ energy: 'Deep' })).toBeNull()
    expect(isEnergy('high')).toBe(false)
  })
  it('the switch reads as off unless "on"', () => {
    expect([energyLevelsOn(null), energyLevelsOn({ energy: '' }), energyLevelsOn({ energy: 'off' }), energyLevelsOn({ energy: 'yes' }), energyLevelsOn({ energy: 'on' })])
      .toEqual([false, false, false, false, true])
  })
})
