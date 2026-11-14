// @vitest-environment happy-dom
// Pull to sync on the page (OpenSpec change pull-to-sync, GitHub issue 1342): a pull
// from the top asks for a sync once, the mark shows while it runs and goes when it
// settles, a device that cannot sync says so, and nothing reloads.
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '../ui/test-utils'
import { actionToast, hideActionToast } from './bulk/toastStore'
import { PULL } from './pullToSync'

const sync = vi.hoisted(() => ({
  calls: 0,
  settle: [] as (() => void)[],
  snapshot: { state: 'idle', error: null as string | null },
}))
vi.mock('../lib/sync', () => ({
  syncNow: () => new Promise<void>((resolve) => { sync.calls++; sync.settle.push(resolve) }),
  syncSnapshot: () => sync.snapshot,
}))

import PullToSync, { pullNotice } from './PullToSync'

const touchEvent = (type: string, points: { x: number; y: number }[]) => {
  const e = new Event(type, { bubbles: true, cancelable: true }) as Event & { touches: unknown[] }
  e.touches = points.map((p) => ({ identifier: 1, clientX: p.x, clientY: p.y }))
  return e
}

/** A finger down on the list at `from`, moved through `ys`, and lifted. */
function pull(row: Element, ys: number[], lift = true) {
  row.dispatchEvent(touchEvent('touchstart', [{ x: 180, y: 100 }]))
  for (const y of ys) window.dispatchEvent(touchEvent('touchmove', [{ x: 180, y }]))
  if (lift) window.dispatchEvent(touchEvent('touchend', []))
}

async function mount() {
  const scroller = createRef<HTMLDivElement>()
  const r = await render(<><PullToSync scroller={scroller} /><div ref={scroller} id="content"><div data-row>Buy milk</div></div></>)
  const state = () => r.container.querySelector('[data-pull-sync]')!.getAttribute('data-pull-sync')
  const mark = r.container.querySelector<HTMLElement>('[data-pull-sync] .rounded-full')!
  const spoken = () => r.container.querySelector('[role="status"]')!.textContent
  return { ...r, row: r.container.querySelector('[data-row]')!, state, mark, spoken }
}

const reload = vi.fn()
const originalMatchMedia = window.matchMedia
beforeEach(() => {
  sync.calls = 0
  sync.settle = []
  sync.snapshot = { state: 'idle', error: null }
  vi.stubGlobal('location', { ...window.location, reload })
})
afterEach(() => {
  hideActionToast()
  delete window.opentodoShell
  window.matchMedia = originalMatchMedia
  vi.unstubAllGlobals()
  reload.mockClear()
})

describe('pull to sync', () => {
  it('syncs once on a pull past the threshold, shows the mark while it runs and hides it when it settles', async () => {
    const p = await mount()
    pull(p.row, [140, 220], false)
    // The mark follows the finger, damped.
    expect(p.mark.style.transform).toBe(`translateY(${120 * PULL.resistance}px)`)
    expect(p.mark.hasAttribute('data-armed')).toBe(false)
    window.dispatchEvent(touchEvent('touchmove', [{ x: 180, y: 300 }]))
    expect(p.mark.hasAttribute('data-armed')).toBe(true)
    expect(sync.calls).toBe(0)
    window.dispatchEvent(touchEvent('touchend', []))
    await waitFor(() => p.state() === 'syncing', 'the mark shows the sync')
    expect(sync.calls).toBe(1)
    expect(p.spoken()).toBe('Syncing…')
    // A second pull while it runs asks for nothing more.
    pull(p.row, [300])
    expect(sync.calls).toBe(1)
    sync.settle[0]()
    await waitFor(() => p.state() === 'idle', 'the mark goes')
    expect(p.mark.style.transform).toBe('translateY(0px)')
    expect(p.mark.style.opacity).toBe('0')
    expect(p.spoken()).toBe('')
    expect(actionToast()).toBeNull()
    expect(reload).not.toHaveBeenCalled()
  })

  it('does nothing on a short pull', async () => {
    const p = await mount()
    pull(p.row, [140, 180])
    expect(sync.calls).toBe(0)
    expect(p.state()).toBe('idle')
    expect(p.mark.style.transform).toBe('translateY(0px)')
  })

  it('says Offline with the sync status wording and changes nothing', async () => {
    sync.snapshot = { state: 'offline', error: null }
    const p = await mount()
    pull(p.row, [300])
    await waitFor(() => p.state() === 'syncing', 'the pull was taken')
    sync.settle[0]()
    await waitFor(() => actionToast()?.label === 'Offline', 'the Offline toast')
    await waitFor(() => p.state() === 'idle', 'the mark goes')
    expect(reload).not.toHaveBeenCalled()
  })

  it('names why a sync could not run', () => {
    expect(pullNotice({ state: 'idle', error: null })).toBeNull()
    expect(pullNotice({ state: 'offline', error: null })).toBe('Offline')
    expect(pullNotice({ state: 'unauthenticated', error: null })).toBe('Signed out')
    expect(pullNotice({ state: 'locked', error: null })).toBe('Locked')
    expect(pullNotice({ state: 'error', error: 'The server answered 500.' })).toBe('The server answered 500.')
  })

  it('shows the mark in place under reduced motion', async () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia
    const p = await mount()
    pull(p.row, [140], false)
    const placed = p.mark.style.transform
    window.dispatchEvent(touchEvent('touchmove', [{ x: 180, y: 260 }]))
    expect(p.mark.style.transform).toBe(placed)
    expect(placed).not.toBe('translateY(0px)')
    expect(p.mark.style.getPropertyValue('--pull-turn')).toBe('0deg')
    window.dispatchEvent(touchEvent('touchcancel', []))
    expect(p.mark.style.transform).toBe('translateY(0px)')
  })

  it('tells a shell with its own pull to refresh that the page handles the pull', async () => {
    const pullHandled = vi.fn()
    window.opentodoShell = { bridge: 1, platform: 'ios', app: '1.6.0', capabilities: ['pull-refresh'], pullHandled }
    await mount()
    expect(pullHandled).toHaveBeenCalledTimes(1)
    // A page restored from the page cache did not load again, and says it again.
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }))
    expect(pullHandled).toHaveBeenCalledTimes(1)
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
    expect(pullHandled).toHaveBeenCalledTimes(2)
  })
})
