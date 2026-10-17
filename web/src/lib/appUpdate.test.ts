// Open tabs after a server upgrade (OpenSpec change client-sync-robustness).
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logUnhandledRejections, resetAppUpdate, updateReason, watchAppUpdates } from './appUpdate'
import { databaseOutdated, db, requestPersistentStorage, useDatabase } from './db'

function fakeWindow() {
  const target = new EventTarget()
  return Object.assign(target, { location: { reload: vi.fn() } })
}

function fakeServiceWorker(controller: unknown) {
  return Object.assign(new EventTarget(), { controller }) as unknown as Pick<ServiceWorkerContainer, 'addEventListener' | 'controller' | 'dispatchEvent'>
}

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  resetAppUpdate()
  vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) })
})
afterEach(() => vi.unstubAllGlobals())

describe('a chunk of the previous release is gone', () => {
  it('reloads once, and asks instead of reloading again right after', () => {
    const win = fakeWindow()
    let now = 1_000_000
    watchAppUpdates(win, undefined, () => now)
    const first = new Event('vite:preloadError', { cancelable: true })
    win.dispatchEvent(first)
    expect(win.location.reload).toHaveBeenCalledTimes(1)
    expect(first.defaultPrevented).toBe(true)
    // The reloaded page still misses a chunk five seconds later: no loop.
    now += 5_000
    const second = new Event('vite:preloadError', { cancelable: true })
    win.dispatchEvent(second)
    expect(win.location.reload).toHaveBeenCalledTimes(1)
    expect(second.defaultPrevented).toBe(false)
    expect(updateReason()).toBe('release')
  })
})

describe('a new service worker takes over', () => {
  it('an update shows the reload prompt; the first install does not', () => {
    const win = fakeWindow()
    const fresh = fakeServiceWorker(null)
    watchAppUpdates(win, fresh)
    fresh.dispatchEvent(new Event('controllerchange'))
    expect(updateReason()).toBeNull()
    const updated = fakeServiceWorker({})
    watchAppUpdates(fakeWindow(), updated)
    updated.dispatchEvent(new Event('controllerchange'))
    expect(updateReason()).toBe('release')
    expect(win.location.reload).not.toHaveBeenCalled()
  })
})

describe('a newer tab upgrades the database', () => {
  it('this tab closes its connection and asks to reload', async () => {
    const name = `upgrade-${Date.now()}`
    useDatabase(name)
    watchAppUpdates(fakeWindow(), undefined)
    await db.open()
    const newer = new Dexie(name)
    newer.version(db.verno + 1).stores({ extra: 'id' })
    await newer.open()
    expect(databaseOutdated()).toBe(true)
    expect(db.isOpen()).toBe(false)
    expect(updateReason()).toBe('database')
    newer.close()
  })
})

describe('persistent storage', () => {
  it('is requested once and the answer is passed on', async () => {
    const persist = vi.fn(async () => true)
    vi.stubGlobal('navigator', { storage: { persisted: async () => false, persist } })
    expect(await requestPersistentStorage()).toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('a browser without the API, or one that throws, changes nothing', async () => {
    vi.stubGlobal('navigator', {})
    expect(await requestPersistentStorage()).toBe(false)
    vi.stubGlobal('navigator', { storage: { persist: async () => { throw new Error('denied') } } })
    expect(await requestPersistentStorage()).toBe(false)
  })
})

describe('unhandled rejections', () => {
  it('are logged', () => {
    const win = new EventTarget()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    logUnhandledRejections(win as unknown as Window)
    const ev = Object.assign(new Event('unhandledrejection'), { reason: new Error('lost write') })
    win.dispatchEvent(ev)
    expect(log).toHaveBeenCalledWith('OpenTodo: unhandled rejection', ev.reason)
    log.mockRestore()
  })
})
