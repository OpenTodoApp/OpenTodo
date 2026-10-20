// @vitest-environment happy-dom
// The Focus addresses (OpenSpec change focus-mode, task 3.1): /focus and
// /focus/<id> parse and print back, and Esc on the Focus screen returns to the
// last view shown before it.
import { describe, expect, it } from 'vitest'
import { navigate, parseRoute, routeBeforeFocus, routePath } from './router'

describe('focus routes', () => {
  it('parses and prints /focus and /focus/<task id>', () => {
    expect(parseRoute('/focus')).toEqual({ view: 'focus' })
    expect(parseRoute('/focus/t-1')).toEqual({ view: 'focus', id: 't-1' })
    expect(routePath({ view: 'focus' })).toBe('/focus')
    expect(routePath({ view: 'focus', id: 't-1' })).toBe('/focus/t-1')
    expect(parseRoute(routePath({ view: 'focus', id: 'a b' }))).toEqual({ view: 'focus', id: 'a b' })
  })

  it('remembers the view before Focus, across moves between focus tasks', () => {
    navigate({ view: 'today' })
    navigate({ view: 'focus' })
    navigate({ view: 'focus', id: 't-2' })
    expect(routeBeforeFocus()).toEqual({ view: 'today' })
    navigate({ view: 'upcoming' })
    navigate({ view: 'focus' })
    expect(routeBeforeFocus()).toEqual({ view: 'upcoming' })
  })
})
