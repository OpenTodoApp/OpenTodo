// @vitest-environment happy-dom
// The Focus addresses (OpenSpec change focus-mode, task 3.1): /focus and
// /focus/<id> parse and print back, and Esc on the Focus screen returns to the
// last view shown before it.
import { describe, expect, it } from 'vitest'
import { navigate, parseRoute, routeBeforeFocus, routePath, setLeaveGuard } from './router'

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

// The leave guard of a page with unsaved changes (routines-editor-page D4).
describe('leave guard', () => {
  it('asks before navigating, continues on go, and is gone afterwards', () => {
    navigate({ view: 'rules', id: 'r1' })
    let go: (() => void) | null = null
    setLeaveGuard((g) => { go = g; return true })
    navigate({ view: 'today' })
    expect(location.pathname).toBe('/routines/r1')
    go!()
    expect(location.pathname).toBe('/today')
    navigate({ view: 'upcoming' })
    expect(location.pathname).toBe('/upcoming')
  })

  it('lets a navigation through when the guard declines, and stops asking once removed', () => {
    let asked = 0
    setLeaveGuard(() => { asked++; return false })
    navigate({ view: 'someday' })
    expect(location.pathname).toBe('/someday')
    setLeaveGuard(null)
    navigate({ view: 'today' })
    expect(asked).toBe(1)
  })
})
