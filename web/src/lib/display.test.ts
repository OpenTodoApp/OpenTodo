// Display routes and options (OpenSpec change display-mode, task 1.2).
import { describe, expect, it } from 'vitest'
import { parseRoute, routePath } from '../app/router'
import { DEFAULT_DISPLAY, displayQuery, parseDisplayOptions } from './display'

describe('display routes', () => {
  it('parses every target', () => {
    expect(parseRoute('/display')).toEqual({ view: 'display', target: { kind: 'today' }, options: DEFAULT_DISPLAY })
    expect(parseRoute('/display/today')).toMatchObject({ target: { kind: 'today' } })
    expect(parseRoute('/display/upcoming')).toMatchObject({ target: { kind: 'upcoming' }, options: { days: 7 } })
    expect(parseRoute('/display/project/p1')).toMatchObject({ target: { kind: 'project', id: 'p1' } })
    expect(parseRoute('/display/view/v1')).toMatchObject({ target: { kind: 'view', id: 'v1' } })
  })

  it('expands eink=1 before explicit parameters and ignores unknown values', () => {
    expect(parseDisplayOptions('eink=1')).toEqual({ ...DEFAULT_DISPLAY, contrast: 'high', motion: 'none', seconds: false })
    expect(parseDisplayOptions('eink=1&contrast=normal')).toMatchObject({ contrast: 'normal', motion: 'none', seconds: false })
    expect(parseDisplayOptions('size=huge&days=12&contrast=max')).toEqual(DEFAULT_DISPLAY)
    expect(parseDisplayOptions('size=xl&days=5')).toMatchObject({ size: 'xl', days: 5 })
  })

  it('round-trips through routePath with only the differing options', () => {
    for (const path of ['/display', '/display/upcoming', '/display/project/p1?eink=1&size=xl', '/display/view/v1?contrast=high&days=2', '/display?motion=none&seconds=0']) {
      expect(routePath(parseRoute(path))).toBe(path)
    }
    expect(routePath(parseRoute('/display/today?size=l&days=3'))).toBe('/display')
    expect(displayQuery({ ...DEFAULT_DISPLAY, contrast: 'high', motion: 'none', seconds: false })).toBe('?eink=1')
  })
})
