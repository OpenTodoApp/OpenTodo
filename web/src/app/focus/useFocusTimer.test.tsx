// @vitest-environment happy-dom
// The focus timer's engine (OpenSpec change focus-mode, task 4.1): the end of a
// session noticed from the clock, one transition for two tabs, the notification
// in a hidden tab only with permission, and the tone only when turned on and only
// while the tab is visible.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createTask, mutate, resetDeviceId } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import { FOCUS_DEFAULTS } from '../../lib/focus/prefs'
import { startSession } from '../../lib/focus/session'
import { readFocus } from '../../lib/focus/state'
import { resetTone } from '../../lib/focus/tone'
import { flush, render, waitFor } from '../../ui/test-utils'
import { resetFocusNotices, useFocusTimer } from './useFocusTimer'

const T0 = new Date(2026, 9, 14, 9, 0).getTime()
const MIN = 60_000
let visibility: 'visible' | 'hidden' = 'visible'
let shown: { title: string; options: NotificationOptions }[] = []
let tones = 0

function stubNotification(permission: NotificationPermission) {
  class FakeNotification {
    static permission = permission
    constructor(title: string, options: NotificationOptions) { shown.push({ title, options }) }
  }
  vi.stubGlobal('Notification', FakeNotification)
}

function stubAudio() {
  class FakeContext {
    state = 'running'
    currentTime = 0
    destination = {}
    resume = async () => undefined
    createGain() { return { connect: () => undefined, gain: { setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined } } }
    createOscillator() {
      return { type: '', frequency: { value: 0 }, connect: () => undefined, start: () => { tones++ }, stop: () => undefined }
    }
  }
  vi.stubGlobal('AudioContext', FakeContext)
}

async function setVisibility(v: 'visible' | 'hidden') {
  visibility = v
  document.dispatchEvent(new Event('visibilitychange'))
  await flush(30)
}

async function advance(ms: number) {
  vi.setSystemTime(Date.now() + ms)
  window.dispatchEvent(new Event('focus'))
  await flush(30)
}

function Engine() {
  useFocusTimer()
  return null
}

let task = ''
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  await db.delete()
  await db.open()
  resetDeviceId()
  resetTone()
  resetFocusNotices()
  await setCurrentUserId('u1')
  visibility = 'visible'
  shown = []
  tones = 0
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  stubNotification('granted')
  stubAudio()
  task = await createTask({ title: 'Write the report' })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** Tones are counted per oscillator: one tone is two notes. */
const tonesPlayed = () => tones / 2

describe('the end of a session', () => {
  it('Hidden tab: one notification naming the task, opening /focus; the tone waits until the tab is shown', async () => {
    await mutate('user_prefs', 'me', { focus_sound: 'on' })
    const r = await render(<Engine />)
    await startSession(task, FOCUS_DEFAULTS, Date.now())
    await flush(30)
    await setVisibility('hidden')
    await advance(30 * MIN)
    await waitFor(async () => (await readFocus())?.phase === 'done', 'done')
    await waitFor(() => shown.length === 1, 'notification')
    expect(shown[0].title).toBe('Session done')
    expect(shown[0].options).toMatchObject({ body: 'Write the report', data: { url: '/focus' } })
    expect(String(shown[0].options.tag)).toMatch(/^focus:/)
    expect(tonesPlayed()).toBe(0)
    await setVisibility('visible')
    await waitFor(() => tonesPlayed() === 1, 'tone on return')
    expect((await readFocus())?.ended?.workedMs).toBe(25 * MIN)
    await r.unmount()
  })

  it('Permission denied: no notification is attempted and the done state is there on return', async () => {
    stubNotification('denied')
    const r = await render(<Engine />)
    await startSession(task, FOCUS_DEFAULTS, Date.now())
    await setVisibility('hidden')
    await advance(26 * MIN)
    await waitFor(async () => (await readFocus())?.phase === 'done', 'done')
    await flush(50)
    expect(shown).toEqual([])
    await r.unmount()
  })

  it('Two tabs: two engines on one row write one end and show at most one notification', async () => {
    const r1 = await render(<Engine />)
    const r2 = await render(<Engine />)
    await startSession(task, FOCUS_DEFAULTS, Date.now())
    await flush(30)
    await setVisibility('hidden')
    await advance(26 * MIN)
    await waitFor(async () => (await readFocus())?.phase === 'done', 'done')
    await flush(80)
    expect(shown).toHaveLength(1)
    const entries = await db.timeEntries.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0].ended_at).toBe(T0 + 25 * MIN)
    const ends = (await db.outbox.toArray()).filter((o) => o.entity === 'time_entry' && o.field === 'ended_at' && o.value !== null)
    expect(ends).toHaveLength(1)
    await r1.unmount()
    await r2.unmount()
  })

  it('Sound off by default: a visible end plays nothing', async () => {
    const r = await render(<Engine />)
    await startSession(task, FOCUS_DEFAULTS, Date.now())
    await advance(25 * MIN)
    await waitFor(async () => (await readFocus())?.phase === 'done', 'done')
    await flush(50)
    expect(tonesPlayed()).toBe(0)
    expect(shown).toEqual([])
    await r.unmount()
  })

  it('Sound on: a visible end plays one tone', async () => {
    await mutate('user_prefs', 'me', { focus_sound: 'on' })
    const r = await render(<Engine />)
    await startSession(task, FOCUS_DEFAULTS, Date.now())
    await flush(30)
    await advance(25 * MIN)
    await waitFor(async () => (await readFocus())?.phase === 'done', 'done')
    await waitFor(() => tonesPlayed() === 1, 'tone')
    await flush(50)
    expect(tonesPlayed()).toBe(1)
    await r.unmount()
  })
})
