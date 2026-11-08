// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db'
import { mutate, resetDeviceId } from '../ops'
import { alertPlaying, REPEAT_MS, REPEATS, startAlert, stopAlert } from './alert'
import { resetTone } from './tone'

// The Long alert (OpenSpec change focus-end-alert, task 2.1): louder repeats about
// once a second until a click, tap or key press, the page hidden, or ten repeats;
// a vibration with each repeat while haptics are on.

let tones = 0
let vibrations: (number | number[])[] = []
let visibility: 'visible' | 'hidden' = 'visible'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  tones = 0
  vibrations = []
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  class FakeContext {
    state = 'running'
    currentTime = 0
    destination = {}
    resume = async () => undefined
    createGain() { return { connect: () => undefined, gain: { setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined } } }
    createOscillator() { return { type: '', frequency: { value: 0 }, connect: () => undefined, start: () => { tones++ }, stop: () => undefined } }
  }
  vi.stubGlobal('AudioContext', FakeContext)
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (p: number | number[]) => { vibrations.push(p); return true } })
})
afterEach(() => {
  stopAlert()
  resetTone()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** One tone is two notes. */
const played = () => tones / 2

/** Only the alert's interval is faked; the database keeps its real timers. */
const fakeIntervals = () => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

async function tick(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('the Long alert', () => {
  it('repeats once a second and stops by itself after ten', async () => {
    fakeIntervals()
    await startAlert()
    expect(played()).toBe(1)
    await tick(REPEAT_MS * 3)
    expect(played()).toBe(4)
    await tick(REPEAT_MS * 20)
    expect(played()).toBe(REPEATS)
    expect(alertPlaying()).toBe(false)
  })

  it('stops at the first key press, and at a tap', async () => {
    fakeIntervals()
    await startAlert()
    await tick(REPEAT_MS)
    expect(played()).toBe(2)
    expect(alertPlaying()).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }))
    expect(alertPlaying()).toBe(false)
    await tick(REPEAT_MS * 5)
    expect(played()).toBe(2)
    await startAlert()
    window.dispatchEvent(new Event('pointerdown'))
    expect(alertPlaying()).toBe(false)
  })

  it('stops when the page is hidden', async () => {
    fakeIntervals()
    await startAlert()
    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    expect(alertPlaying()).toBe(false)
  })

  it('vibrates with each repeat while haptics are on, and a dismissal cancels the vibration', async () => {
    fakeIntervals()
    await startAlert()
    await tick(REPEAT_MS)
    expect(vibrations).toEqual([[200, 100, 200], [200, 100, 200]])
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }))
    expect(vibrations.at(-1)).toBe(0)
  })

  it('does not vibrate with haptics off', async () => {
    await mutate('user_prefs', 'me', { haptics: 'off' })
    fakeIntervals()
    await startAlert()
    await tick(REPEAT_MS)
    expect(played()).toBe(2)
    expect(vibrations).toEqual([])
  })
})
