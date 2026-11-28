// @vitest-environment happy-dom
// The focus timer's engine (OpenSpec change focus-mode, task 4.1): the end of a
// session noticed from the clock, one transition for two tabs, the notification
// in a hidden tab only with permission, and the tone only when turned on, once per
// end, and on time in a hidden tab whose audio runs (focus-alert-hidden-tab).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { applyOps, createTask, mutate, resetDeviceId } from '../../lib/ops'
import type { Op } from '../../lib/types'
import { setCurrentUserId } from '../../lib/sharing'
import { FOCUS_DEFAULTS } from '../../lib/focus/prefs'
import { pauseSession, resumeSession, startSession } from '../../lib/focus/session'
import { readFocus } from '../../lib/focus/state'
import { primeTone, resetTone } from '../../lib/focus/tone'
import { readString, writeString } from '../../lib/deviceStorage'
import { alertPlaying } from '../../lib/focus/alert'
import { flush, render, waitFor } from '../../ui/test-utils'
import { installShortcutDispatcher } from '../shortcuts/dispatch'
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
  await flush()
}

async function advance(ms: number) {
  vi.setSystemTime(Date.now() + ms)
  window.dispatchEvent(new Event('focus'))
  await flush()
}

/** The engine, with the phase and the sound it last rendered, so a test can wait for them. */
function Engine() {
  const { state, prefs } = useFocusTimer()
  return <i data-engine-phase={state?.phase ?? ''} data-engine-sound={prefs.sound ? 'on' : 'off'} />
}
const phases = () => [...document.querySelectorAll('[data-engine-phase]')].map((e) => e.getAttribute('data-engine-phase'))
/** Turns the sound off and waits until the engine renders it: the row reaches it through a live query, not within one flush. */
async function soundOff() {
  await mutate('user_prefs', 'me', { focus_sound: 'off' })
  await waitFor(() => document.querySelector('[data-engine-sound]')?.getAttribute('data-engine-sound') === 'off', 'the engine sees the sound off')
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
})

/** Tones are counted per oscillator: one tone is two notes. */
const tonesPlayed = () => tones / 2

describe('the end of a session', () => {
  it('Hidden tab: one notification naming the task, opening /focus; the tone waits until the tab is shown', async () => {
    await mutate('user_prefs', 'me', { focus_sound: 'on' })
    const r = await render(<Engine />)
    await startSession(task, FOCUS_DEFAULTS, Date.now())
    await waitFor(() => phases().includes('work'), 'the engine sees the session')
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
    await waitFor(() => phases().every((p) => p === 'done'), 'the engine sees the end')
    await flush()
    expect(shown).toEqual([])
    await r.unmount()
  })

  it('In a shell that lists focus (focus-live-activity D3): the shell owns the notification, none from here', async () => {
    window.opentodoShell = { bridge: 1, platform: 'android', app: '1.7.0', capabilities: ['focus'], publishFocus: () => undefined }
    try {
      const r = await render(<Engine />)
      await startSession(task, FOCUS_DEFAULTS, Date.now())
      await waitFor(() => phases().includes('work'), 'the engine sees the session')
      await setVisibility('hidden')
      await advance(30 * MIN)
      await waitFor(async () => (await readFocus())?.phase === 'done', 'done')
      await waitFor(() => phases().every((p) => p === 'done'), 'the engine sees the end')
      await flush()
      expect(shown).toEqual([])
      await r.unmount()
    } finally {
      delete window.opentodoShell
    }
  })

  it('Two tabs: two engines on one row write one end and show at most one notification', async () => {
    const r1 = await render(<Engine />)
    const r2 = await render(<Engine />)
    await startSession(task, FOCUS_DEFAULTS, Date.now())
    await waitFor(() => phases().length === 2 && phases().every((p) => p === 'work'), 'both engines see the session')
    await setVisibility('hidden')
    await advance(26 * MIN)
    await waitFor(async () => (await readFocus())?.phase === 'done', 'done')
    await waitFor(() => phases().every((p) => p === 'done') && shown.length > 0, 'both engines see the end')
    await flush()
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
    await waitFor(() => phases().every((p) => p === 'done'), 'the engine sees the end')
    await flush()
    expect(tonesPlayed()).toBe(0)
    expect(shown).toEqual([])
    await r.unmount()
  })

  it('Long (focus-end-alert): a visible end starts the repeating alert, and a key press stops it', async () => {
    await mutate('user_prefs', 'me', { focus_sound: 'on', focus_alert: 'long' })
    const r = await render(<Engine />)
    await startSession(task, FOCUS_DEFAULTS, Date.now())
    await waitFor(() => phases().includes('work'), 'the engine sees the session')
    await advance(25 * MIN)
    await waitFor(async () => (await readFocus())?.phase === 'done', 'done')
    await waitFor(() => alertPlaying(), 'alert')
    expect(tonesPlayed()).toBeGreaterThanOrEqual(1)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(alertPlaying()).toBe(false)
    await r.unmount()
  })

  it('Another device\'s session (sync-focus-sessions D2, D4): the engine adopts it, and its end plays no tone, shows no notification and writes nothing', async () => {
    await mutate('user_prefs', 'me', { focus_sound: 'on' })
    const r = await render(<Engine />)
    const record = { v: 1, rev: 'laptop-1', taskId: task, mode: 'pomodoro', phase: 'work', startedAt: T0, resumedAt: T0, accumulatedMs: 0, plannedMs: 25 * MIN, cycle: 1, breakKind: null, entryId: null, ended: null }
    await applyOps([{ id: 'l1', entity: 'user_prefs', entityId: 'me', field: 'focus_run', value: JSON.stringify(record), ts: Date.now() + 1, device: 'laptop' } as Op])
    await waitFor(() => phases().includes('work'), 'the engine adopts the session')
    expect(await readFocus()).toMatchObject({ taskId: task, phase: 'work', rev: 'laptop-1', remote: true })
    await setVisibility('hidden')
    await advance(30 * MIN)
    await waitFor(async () => (await readFocus())?.phase === 'done', 'done')
    await waitFor(() => phases().every((p) => p === 'done'), 'the engine sees the end')
    await setVisibility('visible')
    await flush()
    expect(shown).toEqual([])
    expect(tonesPlayed()).toBe(0)
    expect((await db.outbox.toArray()).filter((o) => o.field === 'focus_run')).toEqual([])
    await r.unmount()
  })

  it('Sound on: a visible end plays one tone', async () => {
    await mutate('user_prefs', 'me', { focus_sound: 'on' })
    const r = await render(<Engine />)
    await startSession(task, FOCUS_DEFAULTS, Date.now())
    await waitFor(() => phases().includes('work'), 'the engine sees the session')
    await advance(25 * MIN)
    await waitFor(async () => (await readFocus())?.phase === 'done', 'done')
    await waitFor(() => tonesPlayed() === 1, 'tone')
    await waitFor(() => phases().every((p) => p === 'done'), 'the engine sees the end')
    await flush()
    expect(tonesPlayed()).toBe(1)
    await r.unmount()
  })
})

// The sound of a hidden tab at the planned end (focus-alert-hidden-tab): the
// audio clock follows the fake Date, timers are frozen as a throttled tab's, and
// the audio thread's `ended` events fire with audioTick().
describe('the sound in a hidden tab (focus-alert-hidden-tab)', () => {
  interface Note { frequency: { value: number }; at: number; gain: { connected: boolean }; onended: (() => void) | null; ended: boolean }
  let notes: Note[] = []
  let audio: 'running' | 'suspended' = 'running'
  let frozen: number | null = null
  const clock = () => frozen ?? (Date.now() - T0) / 1000

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(T0)
    notes = []
    audio = 'running'
    frozen = null
    class ClockContext {
      get state() { return audio }
      get currentTime() { return clock() }
      destination = {}
      resume = async () => { audio = 'running'; frozen = null }
      createGain() {
        const g = { connected: false, connect() { g.connected = true }, disconnect() { g.connected = false }, gain: { setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined } }
        return g
      }
      createOscillator() {
        const o: Note & Record<string, unknown> = {
          type: '', frequency: { value: 0 }, at: Infinity, gain: { connected: false }, onended: null, ended: false,
          connect(g: { connected: boolean }) { o.gain = g }, start(at: number) { o.at = at }, stop: () => undefined,
        }
        notes.push(o)
        return o
      }
    }
    vi.stubGlobal('AudioContext', ClockContext)
  })

  /** Tones heard so far: first notes whose time came while connected. */
  const heard = () => notes.filter((n) => n.frequency.value === 660 && n.gain.connected && n.at <= clock()).length
  /** The audio thread reports the notes that ended (an event, not a throttled timer). */
  const audioTick = async () => {
    for (const n of notes) if (!n.ended && n.at + 0.12 <= clock()) { n.ended = true; n.onended?.() }
    await flush()
  }
  /** Time passes in a hidden tab whose timers do not run. */
  const passTime = async (ms: number) => {
    vi.setSystemTime(Date.now() + ms)
    await flush()
  }
  const startHere = async () => {
    primeTone() // the Start click
    await startSession(task, FOCUS_DEFAULTS, Date.now())
    await waitFor(() => phases().includes('work'), 'the engine sees the session')
  }

  it('Short plays at the planned end, the tone wakes the engine for the done state and the notification, and nothing plays again on return', async () => {
    await mutate('user_prefs', 'me', { focus_sound: 'on' })
    const r = await render(<Engine />)
    await startHere()
    await setVisibility('hidden')
    await passTime(25 * MIN - 1000)
    expect(heard()).toBe(0)
    await passTime(1200)
    expect(heard()).toBe(1)
    await audioTick()
    await waitFor(async () => (await readFocus())?.phase === 'done', 'done without a timer tick')
    await waitFor(() => shown.length === 1, 'notification with the sound')
    expect((await readFocus())?.ended?.at).toBe(T0 + 25 * MIN)
    await setVisibility('visible')
    await flush()
    expect(heard()).toBe(1)
    await r.unmount()
  })

  it('Long repeats in the background and stops when the tab is shown', async () => {
    await mutate('user_prefs', 'me', { focus_sound: 'on', focus_alert: 'long' })
    const r = await render(<Engine />)
    await startHere()
    await setVisibility('hidden')
    await passTime(25 * MIN + 3500)
    await audioTick()
    await waitFor(async () => (await readFocus())?.phase === 'done', 'done')
    expect(heard()).toBe(4)
    await setVisibility('visible')
    await passTime(20_000)
    expect(heard()).toBe(4)
    expect(alertPlaying()).toBe(false)
    await r.unmount()
  })

  it('Long plays its ten repeats when nobody comes back', async () => {
    await mutate('user_prefs', 'me', { focus_sound: 'on', focus_alert: 'long' })
    const r = await render(<Engine />)
    await startHere()
    await setVisibility('hidden')
    await passTime(25 * MIN + 200)
    await audioTick()
    await waitFor(async () => (await readFocus())?.phase === 'done', 'done')
    await passTime(30_000)
    expect(heard()).toBe(10)
    await r.unmount()
  })

  it('Sound off: nothing is scheduled', async () => {
    const r = await render(<Engine />)
    await startHere()
    await setVisibility('hidden')
    await passTime(26 * MIN)
    expect(notes).toHaveLength(0)
    await r.unmount()
  })

  it('Paused on another device before the end: no tone at the planned end, and none on return', async () => {
    await mutate('user_prefs', 'me', { focus_sound: 'on' })
    const r = await render(<Engine />)
    await startHere()
    await setVisibility('hidden')
    await passTime(10 * MIN)
    const paused = { v: 1, rev: 'phone-1', taskId: task, mode: 'pomodoro', phase: 'work', startedAt: T0, resumedAt: null, accumulatedMs: 10 * MIN, plannedMs: 25 * MIN, cycle: 1, breakKind: null, entryId: null, ended: null }
    await applyOps([{ id: 'p1', entity: 'user_prefs', entityId: 'me', field: 'focus_run', value: JSON.stringify(paused), ts: Date.now() + 1, device: 'phone' } as Op])
    await waitFor(async () => (await readFocus())?.remote === true, 'adopted')
    await flush()
    await passTime(20 * MIN)
    await audioTick()
    expect(heard()).toBe(0)
    await setVisibility('visible')
    await flush()
    expect(heard()).toBe(0)
    await r.unmount()
  })

  it('Two tabs: the end rings once', async () => {
    await mutate('user_prefs', 'me', { focus_sound: 'on' })
    const r1 = await render(<Engine />)
    const r2 = await render(<Engine />)
    primeTone()
    await startSession(task, FOCUS_DEFAULTS, Date.now())
    await waitFor(() => phases().length === 2 && phases().every((p) => p === 'work'), 'both engines see the session')
    await setVisibility('hidden')
    await passTime(25 * MIN + 200)
    await audioTick()
    await waitFor(() => phases().every((p) => p === 'done'), 'both engines see the end')
    await setVisibility('visible')
    await flush()
    expect(heard()).toBe(1)
    await r1.unmount()
    await r2.unmount()
  })

  it('An end another tab already rang is not rung in a visible tab', async () => {
    await mutate('user_prefs', 'me', { focus_sound: 'on' })
    const r = await render(<Engine />)
    await startHere()
    writeString('focusAlertRung', `${T0}:${T0 + 25 * MIN}:work`)
    await advance(25 * MIN)
    await waitFor(() => phases().every((p) => p === 'done'), 'the engine sees the end')
    await flush()
    expect(heard()).toBe(0)
    await r.unmount()
  })

  it('Audio suspended in the background: nothing plays hidden, and the tone plays once on return', async () => {
    await mutate('user_prefs', 'me', { focus_sound: 'on' })
    const r = await render(<Engine />)
    await startHere()
    await setVisibility('hidden')
    await passTime(MIN)
    audio = 'suspended'
    frozen = clock()
    await advance(29 * MIN)
    await waitFor(async () => (await readFocus())?.phase === 'done', 'done')
    await waitFor(() => phases().every((p) => p === 'done'), 'the engine sees the end')
    expect(heard()).toBe(0)
    await setVisibility('visible')
    await waitFor(() => heard() === 1, 'tone on return')
    await flush()
    expect(heard()).toBe(1)
    await r.unmount()
  })

  const END_KEY = `${T0}:${T0 + 25 * MIN}:work`

  it('A tab closed or discarded before the end gives its claim back: the end rings once, in the tab that is left', async () => {
    await mutate('user_prefs', 'me', { focus_sound: 'on' })
    const r1 = await render(<Engine />)
    const r2 = await render(<Engine />)
    await startHere()
    await setVisibility('hidden')
    expect(readString('focusAlertRung')).toBe(END_KEY)
    // No unmount: React's cleanup never runs in a closed tab.
    window.dispatchEvent(new Event('pagehide'))
    expect(readString('focusAlertRung')).toBeNull()
    await advance(25 * MIN + 200)
    await audioTick()
    await waitFor(() => phases().every((p) => p === 'done'), 'the engines see the end')
    expect(heard()).toBe(0)
    await setVisibility('visible')
    await waitFor(() => heard() === 1, 'tone on return')
    await flush()
    expect(heard()).toBe(1)
    await r1.unmount()
    await r2.unmount()
  })

  it('A key press in another tab of the app stops a background Long', async () => {
    await mutate('user_prefs', 'me', { focus_sound: 'on', focus_alert: 'long' })
    const r = await render(<Engine />)
    await startHere()
    await setVisibility('hidden')
    await passTime(25 * MIN + 1500)
    await audioTick()
    await waitFor(async () => (await readFocus())?.phase === 'done', 'done')
    expect(heard()).toBe(2)
    window.dispatchEvent(new StorageEvent('storage', { key: 'focusAlertStop', newValue: END_KEY }))
    await passTime(20_000)
    expect(heard()).toBe(2)
    await r.unmount()
  })

  it('A visible tab sends the stop for a Long another tab rings, only during that Long', async () => {
    await mutate('user_prefs', 'me', { focus_sound: 'on', focus_alert: 'long' })
    const r = await render(<Engine />)
    await waitFor(() => phases().length === 1, 'engine')
    await flush()
    const future = `${T0}:${T0 + MIN}:work`
    const release = installShortcutDispatcher()
    writeString('focusAlertRung', future)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    expect(readString('focusAlertStop')).toBeNull()
    const ringingNow = `${T0 - 25 * MIN}:${T0 - 3000}:work`
    writeString('focusAlertRung', ringingNow)
    window.dispatchEvent(new PointerEvent('pointerdown'))
    expect(readString('focusAlertStop')).toBe(ringingNow)
    // A key, through the shortcut dispatcher's one listener.
    writeString('focusAlertStop', null)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    expect(readString('focusAlertStop')).toBe(ringingNow)
    release()
    await r.unmount()
  })

  it('Turning the sound off stops a background Long and cancels a waiting tone', async () => {
    await mutate('user_prefs', 'me', { focus_sound: 'on', focus_alert: 'long' })
    const r = await render(<Engine />)
    await startHere()
    await setVisibility('hidden')
    await passTime(25 * MIN + 1500)
    await audioTick()
    await waitFor(async () => (await readFocus())?.phase === 'done', 'done')
    expect(heard()).toBe(2)
    await soundOff()
    await passTime(20_000)
    expect(heard()).toBe(2)
    await r.unmount()
  })

  it('Sound turned off while the tone waits: nothing plays at the end', async () => {
    await mutate('user_prefs', 'me', { focus_sound: 'on' })
    const r = await render(<Engine />)
    await startHere()
    await setVisibility('hidden')
    await passTime(10 * MIN)
    await soundOff()
    expect(readString('focusAlertRung')).toBeNull()
    await passTime(16 * MIN)
    await audioTick()
    expect(heard()).toBe(0)
    await r.unmount()
  })

  it('Paused and resumed here while hidden: the tone moves to the new end', async () => {
    await mutate('user_prefs', 'me', { focus_sound: 'on' })
    const r = await render(<Engine />)
    await startHere()
    await setVisibility('hidden')
    await passTime(10 * MIN)
    await pauseSession(Date.now())
    await waitFor(async () => (await readFocus())?.resumedAt === null, 'paused')
    await flush()
    await passTime(20 * MIN)
    expect(heard()).toBe(0)
    await resumeSession(Date.now())
    await waitFor(async () => (await readFocus())?.resumedAt !== null, 'resumed')
    await flush()
    await passTime(15 * MIN - 1000)
    expect(heard()).toBe(0)
    await passTime(1200)
    expect(heard()).toBe(1)
    await audioTick()
    await waitFor(async () => (await readFocus())?.phase === 'done', 'done')
    expect((await readFocus())?.ended?.at).toBe(T0 + 45 * MIN)
    await r.unmount()
  })

  it('Shown again before the end: the waiting tone is cancelled and the visible end rings once', async () => {
    await mutate('user_prefs', 'me', { focus_sound: 'on' })
    const r = await render(<Engine />)
    await startHere()
    await setVisibility('hidden')
    await passTime(10 * MIN)
    await setVisibility('visible')
    await advance(15 * MIN)
    await waitFor(async () => (await readFocus())?.phase === 'done', 'done')
    await waitFor(() => heard() === 1, 'visible tone')
    await flush()
    expect(heard()).toBe(1)
    await r.unmount()
  })
})
