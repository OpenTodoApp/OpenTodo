// The app's platform port (design D3) over a fake React Native host.
import { createPlatform, type Host } from '../src/platform'

function fakeHost(state = 'active') {
  const appState = new Set<(s: string) => void>()
  const connected = new Set<(c: boolean) => void>()
  const store = new Map<string, string>()
  let zone: string | null = 'Europe/Rome'
  const host: Host = {
    appState: () => state,
    onAppState(fn) {
      appState.add(fn)
      return () => { appState.delete(fn) }
    },
    onConnected(fn) {
      connected.add(fn)
      return () => { connected.delete(fn) }
    },
    storage: { getString: (k) => store.get(k), set: (k, v) => { store.set(k, v) }, remove: (k) => { store.delete(k) } },
    timeZone: () => zone,
  }
  return {
    host,
    setState(s: string) { state = s; for (const fn of appState) fn(s) },
    setConnected(c: boolean) { for (const fn of connected) fn(c) },
    setZone(z: string | null) { zone = z },
  }
}

describe('the app platform', () => {
  it('is visible while the app is active and reports each change', () => {
    const h = fakeHost('background')
    const p = createPlatform(h.host)
    expect(p.visibility.visible()).toBe(false)
    const seen: boolean[] = []
    const off = p.visibility.onChange((v) => seen.push(v))
    h.setState('active')
    h.setState('inactive')
    off()
    h.setState('active')
    expect(seen).toEqual([true, false])
    expect(p.visibility.visible()).toBe(true)
  })

  it('is online until the device knows otherwise, and calls onOnline when it comes back', () => {
    const h = fakeHost()
    const p = createPlatform(h.host)
    expect(p.network.online()).toBe(true)
    let back = 0
    p.network.onOnline(() => back++)
    h.setConnected(true)
    expect(back).toBe(0)
    h.setConnected(false)
    expect(p.network.online()).toBe(false)
    h.setConnected(true)
    expect([p.network.online(), back]).toEqual([true, 1])
  })

  it('leads at once, with no lock and no broadcast channel', () => {
    const p = createPlatform(fakeHost().host)
    expect(p.leader).toBeNull()
    expect(p.broadcast('opentodo-sync')).toBeNull()
  })

  it('keeps preferences in the device store', () => {
    const p = createPlatform(fakeHost().host)
    expect(p.prefs.get('k')).toBeNull()
    p.prefs.set('k', 'v')
    expect(p.prefs.get('k')).toBe('v')
    p.prefs.remove('k')
    expect(p.prefs.get('k')).toBeNull()
  })

  it('reads the zone again when the app comes to the front, UTC when unknown', () => {
    const h = fakeHost('background')
    const p = createPlatform(h.host)
    expect(p.timeZone.current()).toBe('Europe/Rome')
    let reads = 0
    p.timeZone.onChange(() => reads++)
    h.setState('inactive')
    h.setState('active')
    h.setZone(null)
    expect([reads, p.timeZone.current()]).toEqual([1, 'UTC'])
  })
})
