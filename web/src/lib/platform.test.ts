// @vitest-environment happy-dom
// The platform port (native-app-foundation D3): the web implementation is the
// browser's behaviour, and the shared modules use whatever host is installed.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installPlatform, platform, type Platform } from './platform'
import { resetModuleState } from './moduleState'
import { refreshViewerZone, viewerZone, watchViewerZone } from './dates'
import { withSyncLock } from './sync'
import { createStoredValue, readString, writeString } from './deviceStorage'
import { browserLanguages } from './i18n/locale'
import { shell } from './shell'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A host with no browser behind it, as the native app's. */
function fakeHost(over: Partial<Platform> = {}): Platform {
  return {
    visibility: { visible: () => true, onChange: () => () => undefined },
    network: { online: () => true, onOnline: () => () => undefined },
    leader: null,
    broadcast: () => null,
    prefs: { get: () => null, set: () => false, remove: () => undefined, onChange: () => () => undefined },
    session: { get: () => null, set: () => false, remove: () => undefined },
    languages: () => ['en'],
    showLanguage: () => undefined,
    persistStorage: async () => false,
    indexedDB: () => undefined,
    shell: () => undefined,
    timeZone: { current: () => 'UTC', onChange: () => () => undefined },
    ...over,
  }
}

describe('web implementation', () => {
  it('is offline only when the browser says so', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(platform.network.online()).toBe(false)
    vi.stubGlobal('navigator', { onLine: true })
    expect(platform.network.online()).toBe(true)
    vi.stubGlobal('navigator', {})
    expect(platform.network.online()).toBe(true)
  })

  it('has no shared lock without Web Locks or BroadcastChannel', () => {
    vi.stubGlobal('navigator', { onLine: true })
    expect(platform.leader).toBeNull()
    vi.stubGlobal('navigator', { onLine: true, locks: { request: () => Promise.resolve() } })
    vi.stubGlobal('BroadcastChannel', undefined)
    expect(platform.leader).toBeNull()
    expect(platform.broadcast('x')).toBeNull()
  })

  it('keeps preferences in localStorage', () => {
    platform.prefs.set('platform.test', 'on')
    expect(localStorage.getItem('platform.test')).toBe('on')
    expect(platform.prefs.get('platform.test')).toBe('on')
    platform.prefs.remove('platform.test')
    expect(platform.prefs.get('platform.test')).toBeNull()
  })

  it('keeps session values in sessionStorage, and survives a storage that throws', () => {
    expect(platform.session.set('platform.test', 'tab')).toBe(true)
    expect(sessionStorage.getItem('platform.test')).toBe('tab')
    platform.session.remove('platform.test')
    expect(platform.session.get('platform.test')).toBeNull()
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('full') } })
    expect(platform.prefs.get('x')).toBeNull()
    expect(platform.prefs.set('x', 'y')).toBe(false)
    vi.stubGlobal('sessionStorage', undefined)
    expect(platform.session.set('x', 'y')).toBe(false)
  })

  it('tells of a preference another tab changed', () => {
    const keys: (string | null)[] = []
    const off = platform.prefs.onChange((k) => keys.push(k))
    window.dispatchEvent(new StorageEvent('storage', { key: 'a' }))
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    off()
    window.dispatchEvent(new StorageEvent('storage', { key: 'b' }))
    expect(keys).toEqual(['a', null])
  })

  it("reads the browser's languages and sets the page's language", () => {
    vi.stubGlobal('navigator', { languages: ['de-CH', 'en'] })
    expect(platform.languages()).toEqual(['de-CH', 'en'])
    vi.stubGlobal('navigator', { languages: [], language: 'fr' })
    expect(platform.languages()).toEqual(['fr'])
    vi.stubGlobal('navigator', undefined)
    expect(platform.languages()).toEqual(['en'])
    platform.showLanguage('it')
    expect(document.documentElement.lang).toBe('it')
  })

  it('asks the browser to persist storage, and answers false without the API', async () => {
    vi.stubGlobal('navigator', {})
    expect(await platform.persistStorage()).toBe(false)
    vi.stubGlobal('navigator', { storage: { persisted: async () => false, persist: async () => true } })
    expect(await platform.persistStorage()).toBe(true)
    vi.stubGlobal('navigator', { storage: { persist: async () => { throw new Error('no') } } })
    expect(await platform.persistStorage()).toBe(false)
  })

  it('gives the IndexedDB of the page, or none', () => {
    expect(platform.indexedDB()).toBe(indexedDB)
    vi.stubGlobal('indexedDB', undefined)
    expect(platform.indexedDB()).toBeUndefined()
  })

  it("finds a native shell's bridge on the page", () => {
    expect(platform.shell()).toBeUndefined()
    window.opentodoShell = { bridge: 1, platform: 'android', app: '0.20.0', capabilities: ['links'] }
    expect(platform.shell()).toBe(window.opentodoShell)
    delete window.opentodoShell
  })

  it('reports the page visibility', () => {
    const seen: boolean[] = []
    const off = platform.visibility.onChange((v) => seen.push(v))
    document.dispatchEvent(new Event('visibilitychange'))
    off()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(seen).toEqual([platform.visibility.visible()])
  })
})

describe('an installed host', () => {
  it('gives the time zone and says when to read it again', () => {
    let zone = 'Asia/Tokyo'
    let changed: (() => void) | null = null
    installPlatform(fakeHost({ timeZone: { current: () => zone, onChange: (fn) => { changed = fn; return () => { changed = null } } } }))
    refreshViewerZone()
    expect(viewerZone()).toBe('Asia/Tokyo')
    const stop = watchViewerZone()
    zone = 'America/Los_Angeles'
    changed!()
    expect(viewerZone()).toBe('America/Los_Angeles')
    stop()
    expect(changed).toBeNull()
  })

  it('runs the sync lock through its leader, or at once without one', async () => {
    const names: string[] = []
    installPlatform(fakeHost({ leader: { request: (name, fn) => { names.push(name); return fn() } } }))
    expect(await withSyncLock(async () => 'locked')).toBe('locked')
    expect(names).toEqual(['opentodo-sync'])
    installPlatform(fakeHost())
    expect(await withSyncLock(async () => 'direct')).toBe('direct')
    expect(names).toHaveLength(1)
  })

  it('holds the device storage, the languages and the shell bridge', () => {
    const prefs = new Map<string, string>()
    let other: ((key: string | null) => void) | null = null
    installPlatform(fakeHost({
      prefs: {
        get: (k) => prefs.get(k) ?? null,
        set: (k, v) => { if (v === null) prefs.delete(k); else prefs.set(k, v); return true },
        remove: (k) => { prefs.delete(k) },
        onChange: (fn) => { other = fn; return () => { other = null } },
      },
      languages: () => ['pt-BR'],
    }))
    expect(writeString('platform.app', 'on')).toBe(true)
    expect(readString('platform.app')).toBe('on')
    expect(localStorage.getItem('platform.app')).toBeNull()
    expect(writeString('platform.app', 'tab', 'session')).toBe(false)
    expect(readString('platform.app', 'session')).toBeNull()
    const value = createStoredValue('platform.app', { parse: (raw) => raw ?? '', serialize: (v) => v }, { crossTab: true })
    let heard = 0
    const off = value.subscribe(() => heard++)
    prefs.set('platform.app', 'changed')
    other!('platform.app')
    other!('another')
    expect(heard).toBe(1)
    expect(value.get()).toBe('changed')
    off()
    expect(other).toBeNull()
    expect(browserLanguages()).toEqual(['pt-BR'])
    expect(shell()).toBeNull()
  })

  it('is replaced by the web implementation between tests', () => {
    const fake = fakeHost()
    installPlatform(fake)
    expect(platform).toBe(fake)
    resetModuleState()
    expect(platform).not.toBe(fake)
    expect(platform.network.online()).toBe(true)
  })
})
