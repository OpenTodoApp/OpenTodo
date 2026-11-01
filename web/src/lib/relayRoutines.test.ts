// "Run my routines on this device" over a fake relay stream (OpenSpec change
// routines-ai-step, 3.5): the stream announces the capabilities, a sealed
// routine.run request reaches the runner, locking keeps the routines opt-in.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, getMeta, setMeta } from './db'
import { b64url, fromB64url, generateAccountKey } from './crypto'

const key = vi.hoisted(() => ({ current: null as CryptoKey | null }))
vi.mock('./e2ee', async (orig) => ({ ...(await orig<typeof import('./e2ee')>()), currentKey: async () => key.current }))
vi.mock('./sync', async (orig) => ({ ...(await orig<typeof import('./sync')>()), onLeadership: (cb: (on: boolean) => void) => { cb(true); return () => undefined } }))
const ran = vi.hoisted(() => ({ requests: [] as unknown[] }))
vi.mock('./rules/deviceRun', () => ({
  runOnDevice: async (req: unknown, onStart: (name: string) => void) => { onStart('Groceries'); ran.requests.push(req); return { name: 'Groceries', outcome: 'applied', writes: 2 } },
}))
vi.mock('./rules/deviceAI', () => ({ deviceAIReady: async () => true }))

const { api } = await import('./api')
const { publishEncryption } = await import('./e2ee')
const { relaySnapshot, seal, startRelay, streamKey } = await import('./relay')

/** A fake EventSource: the test plays the server's side of the stream. */
class FakeSource {
  static last: FakeSource | null = null
  listeners = new Map<string, (ev: { data: string }) => void>()
  onerror: (() => void) | null = null
  closed = false
  constructor(public url: string) { FakeSource.last = this }
  addEventListener(name: string, fn: (ev: { data: string }) => void) { this.listeners.set(name, fn) }
  close() { this.closed = true }
  emit(name: string, data: unknown) { this.listeners.get(name)?.({ data: JSON.stringify(data) }) }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  key.current = await generateAccountKey()
  ran.requests = []
  FakeSource.last = null
  vi.stubGlobal('EventSource', FakeSource)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('routines on this device', () => {
  it('announces its capabilities, runs a sealed routine.run and keeps the opt-in when locked', async () => {
    const out = vi.spyOn(api, 'relayOptOut').mockResolvedValue(undefined)
    await setMeta('relay.routines', true)
    publishEncryption({ enabled: true, unlocked: true })
    const stop = startRelay()
    await vi.waitFor(() => expect(FakeSource.last).not.toBeNull())
    const es = FakeSource.last!
    const url = new URL(es.url, 'https://todo.example')
    expect(url.searchParams.get('caps')).toBe('routines,ai')

    // The server's side of the key exchange.
    const server = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']) as CryptoKeyPair
    const serverPub = new Uint8Array(await crypto.subtle.exportKey('raw', server.publicKey))
    es.emit('hello', { stream: 's1', key: b64url(serverPub) })
    await vi.waitFor(() => expect(relaySnapshot().connected).toBe(true))
    const k = await streamKey(server.privateKey, fromB64url(url.searchParams.get('key')!), 's1')

    const request = { op: 'routine.run', rule: 'g', run: 'run-9', occurrence: 'schedule:1', at: 1, rev: 'x', auto: false, tokens: 0, budget: 0 }
    es.emit('routine', { id: 'run-9', box: await seal(k, JSON.stringify(request), 'run-9') })
    await vi.waitFor(() => expect(ran.requests).toEqual([request]))
    await vi.waitFor(() => expect(relaySnapshot().routineRecent[0]).toMatchObject({ rule: 'g', name: 'Groceries', outcome: 'applied', writes: 2 }))
    expect(relaySnapshot().running).toBeNull()
    expect((await getMeta<unknown[]>('relay.routineRecent', [])).length).toBe(1)

    // A box sealed for another run is ignored.
    es.emit('routine', { id: 'run-10', box: await seal(k, JSON.stringify({ ...request, run: 'run-10' }), 'run-9') })
    es.emit('routine', { id: 'run-11', box: await seal(k, JSON.stringify({ ...request, run: 'run-11' }), 'run-11') })
    await vi.waitFor(() => expect(ran.requests).toHaveLength(2))
    expect(ran.requests.map((r) => (r as { run: string }).run)).toEqual(['run-9', 'run-11'])

    // Locking closes the stream but keeps "Run my routines" (no opt-out is sent).
    publishEncryption({ unlocked: false })
    expect(es.closed).toBe(true)
    expect(out).not.toHaveBeenCalled()
    expect(relaySnapshot().routines).toBe(true)
    stop()
  })
})
