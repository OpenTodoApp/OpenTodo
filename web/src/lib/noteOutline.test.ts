import { describe, expect, it } from 'vitest'
import type { RNode } from './richtext'
import { modelToPm } from './richtextEditor'
import { currentHeading, OUTLINE_MIN, outlineOf, outlineStep, sameOutline } from './noteOutline'

const text = (t: string) => ({ text: t, marks: {} })
const h = (level: number, t: string): RNode => ({ type: 'heading', attrs: { level }, runs: [text(t)] })
const p = (t: string): RNode => ({ type: 'paragraph', attrs: {}, runs: [text(t)] })

describe('note outline', () => {
  it('lists the top-level headings of levels 1 to 3, in order, with their text', () => {
    const doc = modelToPm([
      h(1, 'Flights'), p('Tuesday'),
      { type: 'blockquote', attrs: {}, content: [h(2, 'Quoted')] },
      h(2, ' Hotels '), h(4, 'Small print'), h(3, 'Days'),
    ])
    const items = outlineOf(doc)
    expect(items.map((i) => [i.level, i.text])).toEqual([[1, 'Flights'], [2, 'Hotels'], [3, 'Days']])
    expect(doc.nodeAt(items[2].pos)?.textContent).toBe('Days')
    expect(items.length >= OUTLINE_MIN).toBe(true)
  })

  it('compares outlines by level and text', () => {
    expect(sameOutline([{ level: 1, text: 'a' }], [{ level: 1, text: 'a' }])).toBe(true)
    expect(sameOutline([{ level: 1, text: 'a' }], [{ level: 2, text: 'a' }])).toBe(false)
    expect(sameOutline([], [{ level: 1, text: 'a' }])).toBe(false)
  })

  it('the current heading is the last one above the line', () => {
    expect(currentHeading([-400, -20, 180, 900], 200)).toBe(2)
    expect(currentHeading([300, 900], 200)).toBe(-1)
    expect(currentHeading([], 200)).toBe(-1)
  })

  it('moves with the arrows, Home and End', () => {
    expect(outlineStep('ArrowDown', -1, 5)).toBe(0)
    expect(outlineStep('ArrowDown', 4, 5)).toBe(4)
    expect(outlineStep('ArrowUp', 0, 5)).toBe(0)
    expect(outlineStep('End', 0, 5)).toBe(4)
    expect(outlineStep('Home', 3, 5)).toBe(0)
    expect(outlineStep('a', 3, 5)).toBeNull()
  })
})
