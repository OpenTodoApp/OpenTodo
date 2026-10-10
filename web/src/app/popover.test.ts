import { describe, expect, it } from 'vitest'
import { keepInViewport, shiftIntoView } from './popover'

describe('popover', () => {
  it('shifts a panel that opens past either edge back inside the screen', () => {
    expect(shiftIntoView({ left: -122, right: 102 }, 390)).toBe(130)
    expect(shiftIntoView({ left: 300, right: 524 }, 390)).toBe(-142)
    expect(shiftIntoView({ left: 20, right: 244 }, 390)).toBe(0)
    // Wider than the screen: keep the start visible.
    expect(shiftIntoView({ left: -50, right: 450 }, 390)).toBe(58)
  })

  it('applies the shift on open and clears it on close', () => {
    let rect = { left: -122, right: 102 }
    const panel = { style: { transform: '' }, getBoundingClientRect: () => rect }
    const details = { open: true, querySelector: () => panel }
    keepInViewport({ currentTarget: details }, 390)
    expect(panel.style.transform).toBe('translateX(130px)')
    details.open = false
    rect = { left: 8, right: 232 }
    keepInViewport({ currentTarget: details }, 390)
    expect(panel.style.transform).toBe('')
  })
})
