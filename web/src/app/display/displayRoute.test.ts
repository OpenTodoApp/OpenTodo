// Display routes and presentation options (OpenSpec change display-mode, task 1.2):
// every path and option combination parses, the e-ink preset expands before the
// explicit parameters, unknown values fall back, and routePath round-trips.
import { describe, expect, it } from 'vitest'
import { addressOf, parseRoute, routePath, type Route } from '../router'
import { DEFAULT_DISPLAY_OPTIONS, parseDisplayOptions, serializeDisplayOptions } from './displayOptions'

const D = DEFAULT_DISPLAY_OPTIONS

describe('display routes', () => {
  it('parses each target; /display is Today and an unknown target falls back to Today', () => {
    expect(parseRoute('/display')).toEqual({ view: 'display', target: { kind: 'today' }, options: D })
    expect(parseRoute('/display/today')).toEqual({ view: 'display', target: { kind: 'today' }, options: D })
    expect(parseRoute('/display/upcoming')).toEqual({ view: 'display', target: { kind: 'upcoming' }, options: D })
    expect(parseRoute('/display/project/p1')).toEqual({ view: 'display', target: { kind: 'project', id: 'p1' }, options: D })
    expect(parseRoute('/display/view/v1')).toEqual({ view: 'display', target: { kind: 'view', id: 'v1' }, options: D })
    expect(parseRoute('/display/project')).toEqual({ view: 'display', target: { kind: 'today' }, options: D })
    expect(parseRoute('/display/nonsense')).toEqual({ view: 'display', target: { kind: 'today' }, options: D })
  })

  it('reads the options; eink=1 is high contrast, no motion and no seconds, and explicit values win', () => {
    expect(parseDisplayOptions('size=xl&contrast=high&motion=none&seconds=0&days=5')).toEqual({ size: 'xl', contrast: 'high', motion: 'none', seconds: false, days: 5 })
    expect(parseDisplayOptions('eink=1')).toEqual({ size: 'l', contrast: 'high', motion: 'none', seconds: false })
    expect(parseDisplayOptions('eink=1&contrast=normal')).toEqual({ size: 'l', contrast: 'normal', motion: 'none', seconds: false })
    expect(parseDisplayOptions('eink=1&seconds=1&size=m')).toEqual({ size: 'm', contrast: 'high', motion: 'none', seconds: true })
    expect(parseRoute('/display/upcoming?eink=1&days=2')).toEqual({
      view: 'display', target: { kind: 'upcoming' }, options: { size: 'l', contrast: 'high', motion: 'none', seconds: false, days: 2 },
    })
  })

  it('falls back to the defaults for unknown or malformed values', () => {
    expect(parseDisplayOptions('size=huge&contrast=max&motion=slow&seconds=yes&days=9&eink=yes')).toEqual(D)
    expect(parseDisplayOptions('days=0')).toEqual(D)
    expect(parseDisplayOptions('days=1.5')).toEqual(D)
  })

  it('serialises the options back: defaults left out, the preset written as eink=1', () => {
    expect(serializeDisplayOptions(D)).toBe('')
    expect(serializeDisplayOptions({ ...D, contrast: 'high', motion: 'none', seconds: false })).toBe('eink=1')
    expect(serializeDisplayOptions({ ...D, size: 'xl', contrast: 'high' })).toBe('size=xl&contrast=high')
    expect(routePath({ view: 'display', target: { kind: 'project', id: 'p1' }, options: { ...D, motion: 'none', days: 4 } })).toBe('/display/project/p1?motion=none&days=4')
  })

  it('round-trips every target with every option combination', () => {
    const targets = [{ kind: 'today' }, { kind: 'upcoming' }, { kind: 'project', id: 'p 1' }, { kind: 'view', id: 'v1' }] as const
    for (const target of targets) {
      for (const size of ['m', 'l', 'xl'] as const) {
        for (const contrast of ['normal', 'high'] as const) {
          for (const motion of ['normal', 'none'] as const) {
            for (const seconds of [true, false]) {
              for (const days of [undefined, 1, 7]) {
                const r: Route = { view: 'display', target, options: { size, contrast, motion, seconds, ...(days ? { days } : {}) } }
                expect(parseRoute(routePath(r))).toEqual(r)
              }
            }
          }
        }
      }
    }
  })

  it('tracks the query only on display addresses', () => {
    expect(addressOf({ pathname: '/display/today', search: '?eink=1' })).toBe('/display/today?eink=1')
    expect(addressOf({ pathname: '/display', search: '?size=xl' })).toBe('/display?size=xl')
    expect(addressOf({ pathname: '/', search: '?task=t1' })).toBe('/')
    expect(addressOf({ pathname: '/displayed', search: '?x=1' })).toBe('/displayed')
  })
})
