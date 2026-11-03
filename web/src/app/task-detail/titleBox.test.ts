import { describe, expect, it } from 'vitest'
import { TITLE_LINES, titleBoxHeight } from './useTaskDetail'

describe('titleBoxHeight', () => {
  it('shows the whole title until eight lines, then scrolls', () => {
    expect(titleBoxHeight(60, 20)).toEqual({ height: 60, scrolls: false })
    expect(titleBoxHeight(20 * TITLE_LINES, 20)).toEqual({ height: 160, scrolls: false })
    expect(titleBoxHeight(20 * TITLE_LINES + 5, 20)).toEqual({ height: 160, scrolls: true })
  })

  it('uses a 20 px line when the browser reports none', () => {
    expect(titleBoxHeight(40, 0)).toEqual({ height: 40, scrolls: false })
    expect(titleBoxHeight(20 * TITLE_LINES + 1, Number.NaN).scrolls).toBe(true)
  })
})
