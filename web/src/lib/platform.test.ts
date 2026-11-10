// @vitest-environment happy-dom
// The platform port (native-app-foundation D3): the web implementation is the
// browser's behaviour, and the shared modules use whatever host is installed.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installPlatform, platform, type Platform } from './platform'
import { resetModuleState } from './moduleState'
import { refreshViewerZone, viewerZone, watchViewerZone } from './dates'
import { withSyncLock } from './sync'

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
    prefs: { get: () => null, set: () => undefined, remove: () => undefined },
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

  it('is replaced by the web implementation between tests', () => {
    const fake = fakeHost()
    installPlatform(fake)
    expect(platform).toBe(fake)
    resetModuleState()
    expect(platform).not.toBe(fake)
    expect(platform.network.online()).toBe(true)
  })
})
