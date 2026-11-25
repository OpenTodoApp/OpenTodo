// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { directionOf, fromStartEdge, inlineArrows, inlineDelta, inlineKey, isRtl } from './direction'

afterEach(() => { document.documentElement.removeAttribute('dir'); document.body.innerHTML = '' })

describe('direction (arabic-rtl D1, D4)', () => {
  it('knows which languages are written right to left', () => {
    expect(directionOf('ar')).toBe('rtl')
    expect(directionOf('ar-EG')).toBe('rtl')
    expect(directionOf('en')).toBe('ltr')
    expect(directionOf('zh')).toBe('ltr')
  })

  it('swaps ArrowLeft and ArrowRight right to left, and nothing else', () => {
    const el = document.createElement('div')
    document.body.append(el)
    expect(inlineKey({ key: 'ArrowRight', currentTarget: el })).toBe('ArrowRight')
    document.documentElement.dir = 'rtl'
    expect(isRtl(el)).toBe(true)
    expect(inlineKey({ key: 'ArrowRight', currentTarget: el })).toBe('ArrowLeft')
    expect(inlineKey({ key: 'ArrowLeft', target: el })).toBe('ArrowRight')
    expect(inlineKey({ key: 'ArrowUp', currentTarget: el })).toBe('ArrowUp')
    expect(inlineKey({ key: 'ArrowLeft' })).toBe('ArrowRight')
  })

  it('follows a box kept left to right inside a right-to-left page', () => {
    document.documentElement.dir = 'rtl'
    const box = document.createElement('div')
    box.dir = 'ltr'
    const inner = document.createElement('span')
    box.append(inner)
    document.body.append(box)
    expect(isRtl(inner)).toBe(false)
    expect(inlineKey({ key: 'ArrowRight', currentTarget: inner })).toBe('ArrowRight')
    expect(inlineDelta(10, inner)).toBe(10)
  })

  it('looks past dir="auto" to the layout direction', () => {
    document.documentElement.dir = 'rtl'
    const title = document.createElement('span')
    title.dir = 'auto'
    title.textContent = 'Call Bob'
    document.body.append(title)
    expect(isRtl(title)).toBe(true)
    const box = document.createElement('div')
    box.dir = 'ltr'
    const inner = document.createElement('span')
    inner.dir = 'auto'
    box.append(inner)
    document.body.append(box)
    expect(isRtl(inner)).toBe(false)
  })

  it('measures deltas and edges from the start of the line', () => {
    expect(inlineDelta(10)).toBe(10)
    expect(fromStartEdge(5)).toBe(5)
    document.documentElement.dir = 'rtl'
    expect(inlineDelta(10)).toBe(-10)
    expect(fromStartEdge(window.innerWidth - 5)).toBe(5)
  })

  it('prints the arrow keys the way they are pressed', () => {
    expect(inlineArrows('Shift+→')).toBe('Shift+→')
    document.documentElement.dir = 'rtl'
    expect(inlineArrows('Shift+→')).toBe('Shift+←')
    expect(inlineArrows('← / →')).toBe('→ / ←')
    expect(inlineArrows('g i')).toBe('g i')
  })
})
