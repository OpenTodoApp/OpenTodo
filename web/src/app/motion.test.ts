// @vitest-environment happy-dom
// List reflow (OpenSpec change motion-v2, task-list-presentation "List reflow", design
// D4) and the haptic tick (appearance-preferences "Haptic feedback preference", D6).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createTask, mutate, resetDeviceId } from '../lib/ops'
import { USER_PREFS_ID } from '../lib/userPrefs'
import { runBulk } from './bulk/BulkActions'
import { hideBulkToast } from './bulk/toastStore'
import { canReflow, REFLOW_CAP, registerList, resetHaptics, tick, withListTransition } from './motion'
import { setDueWithUndo } from './undoable'

type Update = () => Promise<void> | void

/** A stand-in for the browser's view transitions: runs the update, records what was named. */
function stubTransitions() {
  const calls: { namedBefore: number; namedDuring: number; skipped: boolean }[] = []
  const named = () => document.querySelectorAll('[style*="view-transition-name"]').length
  const start = vi.fn((update: Update) => {
    const call = { namedBefore: named(), namedDuring: 0, skipped: false }
    calls.push(call)
    const finished = (async () => { await update(); call.namedDuring = named() })()
    return { finished, skipTransition: () => { call.skipped = true } }
  })
  Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true, writable: true })
  return { start, calls, named }
}

const stubReduced = (reduce: boolean) => {
  window.matchMedia = ((q: string) => ({ matches: q.includes('reduce') ? reduce : false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia
}

function rows(n: number) {
  const ul = document.createElement('ul')
  for (let i = 0; i < n; i++) {
    const li = document.createElement('li')
    li.dataset.taskId = `t${i}`
    ul.append(li)
  }
  document.body.append(ul)
}

const original = window.matchMedia
let unregister = () => {}
beforeEach(async () => {
  // A list on screen (the transition has nothing to move otherwise).
  unregister = registerList()
  await db.delete()
  await db.open()
  resetDeviceId()
  stubReduced(false)
})
afterEach(() => {
  unregister()
  window.matchMedia = original
  delete (document as { startViewTransition?: unknown }).startViewTransition
  delete document.documentElement.dataset.motion
  document.body.innerHTML = ''
  hideBulkToast()
  vi.unstubAllGlobals()
})

describe('withListTransition gates', () => {
  it('runs a local change inside a view transition when every gate holds', async () => {
    const { start } = stubTransitions()
    expect(canReflow(1)).toBe(true)
    const out = await withListTransition(1, async () => 42)
    expect(out).toBe(42)
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('takes the direct path without the API, under reduced motion, under no motion, above the cap, while typing or hidden', async () => {
    let update = vi.fn(async () => 'done')
    expect(await withListTransition(1, update)).toBe('done')
    expect(update).toHaveBeenCalledTimes(1)

    const { start } = stubTransitions()
    const direct = async (setup: () => void, affected = 1, undo: () => void = () => {}) => {
      setup()
      update = vi.fn(async () => 'done')
      await withListTransition(affected, update)
      expect(update).toHaveBeenCalledTimes(1)
      undo()
    }
    await direct(() => stubReduced(true), 1, () => stubReduced(false))
    await direct(() => { document.documentElement.dataset.motion = 'none' }, 1, () => { delete document.documentElement.dataset.motion })
    await direct(() => {}, REFLOW_CAP + 1)
    await direct(() => {}, 0)
    await direct(() => unregister(), 1, () => { unregister = registerList() })
    const input = document.createElement('input')
    await direct(() => { document.body.append(input); input.focus() }, 1, () => input.remove())
    await direct(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }) }, 1,
      () => { delete (document as { visibilityState?: unknown }).visibilityState })
    expect(start).not.toHaveBeenCalled()
  })

  it('names at most the cap of rows, only while the transition runs', async () => {
    rows(200)
    const { calls, named } = stubTransitions()
    await withListTransition(10, async () => {})
    expect(calls[0].namedBefore).toBe(REFLOW_CAP)
    expect(calls[0].namedDuring).toBeLessThanOrEqual(REFLOW_CAP)
    await Promise.resolve()
    expect(named()).toBe(0)
  })

  it('a new change cuts a running transition short instead of waiting', async () => {
    const { calls } = stubTransitions()
    let release!: () => void
    const first = withListTransition(1, () => new Promise<void>((r) => { release = r }))
    await Promise.resolve()
    const second = withListTransition(1, async () => {})
    expect(calls[0].skipped).toBe(true)
    release()
    await Promise.all([first, second])
  })

  it('a write that fails still rejects, and the list is left unnamed', async () => {
    rows(3)
    const { named } = stubTransitions()
    await expect(withListTransition(1, async () => { throw new Error('nope') })).rejects.toThrow('nope')
    expect(named()).toBe(0)
  })
})

describe('local list actions request a transition', () => {
  it('a reschedule and a bulk action go through it; more than the cap applies at once', async () => {
    const { start } = stubTransitions()
    const id = await createTask({ title: 'Pay rent' })
    await setDueWithUndo(id, { date: '2026-10-23' })
    expect(start).toHaveBeenCalledTimes(1)
    await runBulk([id], { kind: 'priority', priority: 1 })
    expect(start).toHaveBeenCalledTimes(2)
    const many = await Promise.all(Array.from({ length: REFLOW_CAP + 20 }, (_, i) => createTask({ title: `T${i}` })))
    await runBulk(many, { kind: 'priority', priority: 2 })
    expect(start).toHaveBeenCalledTimes(2)
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-23' })
  })
})

describe('haptic tick', () => {
  beforeEach(() => resetHaptics())

  it('vibrates once with the preference on (the default), never with it off or without vibration', async () => {
    const vibrate = vi.fn(() => true)
    vi.stubGlobal('navigator', { ...navigator, vibrate })
    tick()
    await vi.waitFor(() => expect(vibrate).toHaveBeenCalledTimes(1))
    expect(vibrate).toHaveBeenCalledWith(10)

    await mutate('user_prefs', USER_PREFS_ID, { haptics: 'off' })
    resetHaptics()
    tick()
    await new Promise((r) => setTimeout(r, 20))
    expect(vibrate).toHaveBeenCalledTimes(1)

    vi.stubGlobal('navigator', { userAgent: 'test' })
    expect(() => tick()).not.toThrow()
  })
})
