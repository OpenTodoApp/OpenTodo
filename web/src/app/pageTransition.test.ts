// @vitest-environment happy-dom
// page-transitions D1, D2: the direction table, the gates (reduced motion, the no-motion
// display, a focused text field, a hidden tab) and the CSS that slides the page and keeps
// the chrome still.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import css from '../index.css?raw'
import { canTransitionPage, installPageTransitions, navDirection, routeDepth, showRouteChange } from './pageTransition'
import { navigate, setRouteShow, type Route } from './router'

const r = (x: Route) => x

describe('the direction of a route change', () => {
  it('deeper is forward, shallower back, a switch between destinations none', () => {
    expect(navDirection(r({ view: 'inbox' }), r({ view: 'task', id: 't' }), false)).toBe('forward')
    expect(navDirection(r({ view: 'project', id: 'p' }), r({ view: 'task', id: 't' }), false)).toBe('forward')
    expect(navDirection(r({ view: 'task', id: 't' }), r({ view: 'inbox' }), false)).toBe('back')
    expect(navDirection(r({ view: 'notes' }), r({ view: 'notes', id: 'n' }), false)).toBe('forward')
    expect(navDirection(r({ view: 'settings' }), r({ view: 'settings', section: 'appearance' }), false)).toBe('forward')
    expect(navDirection(r({ view: 'inbox' }), r({ view: 'today' }), false)).toBe('none')
    expect(navDirection(r({ view: 'project', id: 'a' }), r({ view: 'project', id: 'b' }), false)).toBe('none')
  })

  it('a step back through history is always back', () => {
    expect(navDirection(r({ view: 'inbox' }), r({ view: 'task', id: 't' }), true)).toBe('back')
    expect(routeDepth(r({ view: 'today' }))).toBe(0)
  })
})

describe('showing a route change', () => {
  let calls: string[]
  let finish: () => void
  beforeEach(() => {
    calls = []
    ;(document as unknown as { startViewTransition: unknown }).startViewTransition = (update: () => void) => {
      calls.push(document.documentElement.dataset.nav ?? '')
      update()
      return { finished: new Promise<void>((done) => { finish = done }), skipTransition: () => finish() }
    }
  })
  afterEach(() => {
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition
    delete document.documentElement.dataset.motion
    delete document.documentElement.dataset.nav
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
    setRouteShow(null)
  })

  it('runs in a view transition with its direction, and clears it once the transition ends', async () => {
    const apply = vi.fn()
    showRouteChange(apply, '/inbox', '/task/t', false)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['forward'])
    expect(document.documentElement.dataset.nav).toBe('forward')
    finish()
    await vi.waitFor(() => expect(document.documentElement.dataset.nav).toBeUndefined())
  })

  it('a next change does not wait: the running transition jumps to its end', async () => {
    showRouteChange(() => {}, '/inbox', '/task/t', false)
    showRouteChange(() => {}, '/task/t', '/inbox', true)
    expect(calls).toEqual(['forward', 'back'])
    finish()
    await vi.waitFor(() => expect(document.documentElement.dataset.nav).toBeUndefined())
  })

  it('a skipped transition is not an unhandled rejection (its ready promise rejects)', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      ;(document as unknown as { startViewTransition: unknown }).startViewTransition = (update: () => void) => {
        update()
        let fail: (e: Error) => void = () => {}
        const ready = new Promise<void>((_, no) => { fail = no })
        return { ready, updateCallbackDone: Promise.resolve(), finished: new Promise<void>((done) => { finish = done }), skipTransition: () => { fail(new Error('AbortError: Transition was skipped')); finish() } }
      }
      showRouteChange(() => {}, '/inbox', '/task/t', false)
      showRouteChange(() => {}, '/task/t', '/inbox', true)
      finish()
      await new Promise((r) => setTimeout(r, 0))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('the page changes at once with reduced motion, the no-motion display, a focused field or a hidden tab', () => {
    const apply = vi.fn()
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
    expect(canTransitionPage()).toBe(false)
    showRouteChange(apply, '/inbox', '/task/t', false)
    vi.unstubAllGlobals()
    document.documentElement.dataset.motion = 'none'
    expect(canTransitionPage()).toBe(false)
    delete document.documentElement.dataset.motion
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    expect(canTransitionPage()).toBe(false)
    input.blur()
    expect(canTransitionPage()).toBe(true)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(calls).toEqual([])
  })

  it('a change made from the keyboard happens at once; a tap brings the transitions back', () => {
    installPageTransitions()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(canTransitionPage()).toBe(false)
    const apply = vi.fn()
    showRouteChange(apply, '/task/t', '/inbox', true)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(calls).toEqual([])
    window.dispatchEvent(new Event('pointerdown'))
    expect(canTransitionPage()).toBe(true)
  })

  it('navigate hands the change to the installed show with both addresses', () => {
    const seen: unknown[] = []
    setRouteShow((apply, from, to, popped) => { seen.push([from, to, popped]); apply() })
    navigate({ view: 'task', id: 'x1' })
    expect(seen).toEqual([[expect.any(String), '/task/x1', false]])
  })
})

describe('the CSS (page-transitions D2)', () => {
  it('names the page and the chrome only during a route change', () => {
    for (const rule of [':root[data-nav] #content { view-transition-name: page; }', ':root[data-nav] [data-sidebar] { view-transition-name: sidebar; }',
      ':root[data-nav] [data-phone-bar] { view-transition-name: phone-bar; }', ':root[data-nav] [data-tab-bar] { view-transition-name: tab-bar; }']) expect(css).toContain(rule)
  })

  it('slides with the emphasis duration and the spring, and lets taps through', () => {
    expect(css).toContain(':root[data-nav="forward"]::view-transition-new(page) { animation: nav-from-end var(--duration-emphasis) var(--ease-spring) both; }')
    expect(css).toContain(':root[data-nav="back"]::view-transition-old(page) { animation: nav-to-end var(--duration-emphasis) var(--ease-spring) both; }')
    expect(css).toContain(':root[data-nav]::view-transition { pointer-events: none; }')
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\n {2}:root\[data-nav\]::view-transition-old\(page\), :root\[data-nav\]::view-transition-new\(page\) \{ animation: none !important; \}/)
  })
})

describe('history steps', () => {
  afterEach(() => setRouteShow(null))

  it('a step over an overlay marker (the same address) re-renders without a page transition', () => {
    const seen: unknown[] = []
    setRouteShow((apply, from, to, popped) => { seen.push([from, to, popped]); apply() })
    history.pushState({ overlay: 1 }, '', location.pathname)
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(seen).toEqual([])
  })
})
