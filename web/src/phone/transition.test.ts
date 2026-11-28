// @vitest-environment happy-dom
// Screens push and pop (OpenSpec change phone-ui-trial, "Screens push and pop"): the
// direction is set for the length of the transition; without the API, with reduced
// motion or in Display mode the screen just changes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { waitFor } from '../ui/test-utils'
import { animatesScreens, leaveScreen, openTaskFromList, SHARED_TITLE, withScreenTransition } from './transition'

/** The document with the API as something a test can set and remove. */
const doc = document as unknown as { startViewTransition?: unknown }
const original = window.matchMedia
let reduced = false
let seen: string[] = []

/** A stand-in for the browser: runs the update and reports the direction it was started under. */
function fakeApi() {
  doc.startViewTransition = (update: () => Promise<void>) => {
    seen.push(document.documentElement.dataset.phoneNav ?? 'none')
    const finished = Promise.resolve().then(update)
    return { finished, ready: Promise.reject(new Error('skipped')), updateCallbackDone: finished }
  }
}

beforeEach(() => {
  seen = []
  reduced = false
  delete document.documentElement.dataset.motion
  window.matchMedia = ((q: string) => ({ matches: q.includes('reduce') ? reduced : false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  delete doc.startViewTransition
  window.matchMedia = original
  vi.unstubAllGlobals()
})

describe('screen transitions', () => {
  it('runs the navigation under its direction and clears it afterwards', async () => {
    fakeApi()
    const update = vi.fn()
    withScreenTransition('push', update)
    expect(document.documentElement.dataset.phoneNav).toBe('push')
    await waitFor(() => document.documentElement.dataset.phoneNav === undefined, 'the direction cleared')
    expect(seen).toEqual(['push'])
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('waits for the new screen in timer steps, never an animation frame, which a transition holds back', async () => {
    fakeApi()
    vi.stubGlobal('requestAnimationFrame', () => { throw new Error('no frame is drawn during the update') })
    let shown = false
    setTimeout(() => { shown = true }, 40)
    withScreenTransition('push', () => {}, () => shown)
    await waitFor(() => document.documentElement.dataset.phoneNav === undefined, 'the transition finished')
    expect(shown).toBe(true)
  })

  it('just changes the screen without the API', () => {
    const update = vi.fn()
    expect(animatesScreens()).toBe(false)
    withScreenTransition('push', update)
    expect(update).toHaveBeenCalledTimes(1)
    expect(document.documentElement.dataset.phoneNav).toBeUndefined()
  })

  it('just changes the screen under reduced motion and in Display mode', () => {
    fakeApi()
    reduced = true
    const a = vi.fn()
    withScreenTransition('pop', a)
    expect(a).toHaveBeenCalledTimes(1)
    reduced = false
    document.documentElement.dataset.motion = 'none'
    const b = vi.fn()
    withScreenTransition('push', b)
    expect(b).toHaveBeenCalledTimes(1)
    expect(seen).toEqual([])
  })

  it('a Back pops, and ends when the history has moved', async () => {
    fakeApi()
    history.pushState(null, '', '/today')
    history.pushState(null, '', '/task/t1')
    const back = vi.fn(() => { history.replaceState(null, '', '/today') })
    leaveScreen(back)
    await waitFor(() => back.mock.calls.length === 1 && document.documentElement.dataset.phoneNav === undefined, 'the pop finished')
    expect(seen).toEqual(['pop'])
  })

  // phone-delight D2: the tapped row's title and the page's title share one name, one element per capture.
  it('a Back names the row of the task it leaves after the list returns, and clears the name when done', async () => {
    let named: string[] = []
    doc.startViewTransition = (update: () => Promise<void>) => {
      const finished = Promise.resolve().then(update).then(() => {
        named = [...document.querySelectorAll<HTMLElement>('[data-row-title]')].filter((el) => el.style.getPropertyValue('view-transition-name') === SHARED_TITLE).map((el) => el.textContent ?? '')
      })
      return { finished, updateCallbackDone: finished }
    }
    history.pushState(null, '', '/today')
    history.pushState(null, '', '/task/t1')
    document.body.innerHTML = ''
    const back = () => {
      history.replaceState(null, '', '/today')
      document.body.innerHTML = '<ul><li data-phone-row="t0"><span data-row-title>Other</span></li><li data-phone-row="t1"><span data-row-title>Call Anna</span></li></ul>'
    }
    leaveScreen(back)
    await waitFor(() => document.documentElement.dataset.phoneNav === undefined, 'the pop finished')
    expect(named).toEqual(['Call Anna'])
    await waitFor(() => !document.querySelector<HTMLElement>('[data-phone-row="t1"] [data-row-title]')!.style.getPropertyValue('view-transition-name'), 'the name cleared')
  })

  it('a push names the tapped row in the old capture only, and clears it', async () => {
    let atStart: string[] = []
    doc.startViewTransition = (update: () => Promise<void>) => {
      atStart = [...document.querySelectorAll<HTMLElement>('[data-row-title]')].filter((el) => el.style.getPropertyValue('view-transition-name') === SHARED_TITLE).map((el) => el.textContent ?? '')
      const finished = Promise.resolve().then(update)
      return { finished, updateCallbackDone: finished }
    }
    history.replaceState(null, '', '/today')
    document.body.innerHTML = '<ul><li data-phone-row="t0"><span data-row-title>Other</span></li><li data-phone-row="t1"><span data-row-title>Call Anna</span></li></ul>'
    openTaskFromList('t1')
    expect(atStart).toEqual(['Call Anna'])
    await waitFor(() => document.documentElement.dataset.phoneNav === undefined, 'the push finished')
    expect(document.querySelector<HTMLElement>('[data-phone-row="t1"] [data-row-title]')!.style.getPropertyValue('view-transition-name')).toBe('')
  })
})
