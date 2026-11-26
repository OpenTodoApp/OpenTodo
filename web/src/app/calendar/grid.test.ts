// The resize zone of a block in the Day and Week grids (OpenSpec change phone-calendar, design D5).
import { describe, expect, it } from 'vitest'
import { PX_PER_MIN, RESIZE_ZONE_PX, resizeZone, TOUCH_RESIZE_ZONE_PX } from './grid'

const px = (minutes: number) => minutes * PX_PER_MIN

describe('the zone that resizes a block', () => {
  it('is a few pixels for a mouse or a pen, as it was', () => {
    expect(resizeZone(px(120), 'mouse')).toBe(RESIZE_ZONE_PX)
    expect(resizeZone(px(120), 'pen')).toBe(RESIZE_ZONE_PX)
    expect(resizeZone(px(15), 'mouse')).toBe(px(15) / 3)
  })
  it('is 24 px for a finger on a block of an hour and a half or more', () => {
    expect(resizeZone(px(90), 'touch')).toBe(TOUCH_RESIZE_ZONE_PX)
    expect(resizeZone(px(240), 'touch')).toBe(TOUCH_RESIZE_ZONE_PX)
  })
  it('is a third of a shorter block for a finger, so the middle still moves it', () => {
    expect(resizeZone(px(60), 'touch')).toBe(16)
    expect(resizeZone(px(30), 'touch')).toBe(8)
    for (const minutes of [15, 30, 45, 60, 90, 180]) expect(px(minutes) - 2 * resizeZone(px(minutes), 'touch')).toBeGreaterThanOrEqual(px(minutes) / 3)
  })
})
