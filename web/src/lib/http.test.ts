// Request deadlines (OpenSpec change client-sync-robustness): every request to
// the server has a timeout, a timeout and a network failure are transient, and
// a hung request no longer blocks the sync loop for ever.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { useDatabase } from './db'
import { fetchWithTimeout, isTransientNetworkError, NetworkError, RequestTimeoutError, setRequestTimeouts } from './http'
import { resetDeviceId } from './ops'
import { stopSync, syncNow, syncSnapshot } from './sync'

/** A fetch that never answers, but honours its abort signal like the browser's. */
function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal!.reason ?? new DOMException('aborted', 'AbortError')))
  }))
}

const syncAnswer = () => new Response(JSON.stringify({ applied: 0, ops: [], cursor: 1, hasMore: false, serverTime: Date.now() }), { status: 200, headers: { 'Content-Type': 'application/json' } })

let n = 0
beforeEach(() => {
  useDatabase(`http-${Date.now()}-${n++}`)
  resetDeviceId()
  setRequestTimeouts({ request: 30, transfer: 60 })
})

afterEach(() => {
  stopSync()
  setRequestTimeouts()
  vi.unstubAllGlobals()
})

describe('fetchWithTimeout', () => {
  it('a request without an answer fails with a timeout, which is transient', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const err = await fetchWithTimeout('/api/v1/me').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RequestTimeoutError)
    expect(isTransientNetworkError(err)).toBe(true)
  })

  it('every api call carries a deadline', async () => {
    const f = hangingFetch()
    vi.stubGlobal('fetch', f)
    await expect(api.me()).rejects.toBeInstanceOf(RequestTimeoutError)
    expect(f.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('a network failure is a NetworkError; other errors are not transient', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const err = await fetchWithTimeout('/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(NetworkError)
    expect(isTransientNetworkError(err)).toBe(true)
    expect(isTransientNetworkError(new TypeError('x is not a function'))).toBe(false)
  })

  it("the caller's own abort is passed on, not reported as a timeout", async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const c = new AbortController()
    const p = fetchWithTimeout('/x', { signal: c.signal, timeoutMs: 10_000 }).catch((e: unknown) => e)
    c.abort()
    const err = await p
    expect(err).not.toBeInstanceOf(RequestTimeoutError)
    expect((err as DOMException).name).toBe('AbortError')
  })
})

describe('a hung sync request', () => {
  it('does not block the next exchange', async () => {
    const f = vi.fn(hangingFetch())
    vi.stubGlobal('fetch', f)
    // Before the fix this never resolved: `running` stayed true for good.
    await syncNow()
    expect(syncSnapshot().state).toBe('offline')
    f.mockImplementation(async (url: string) => (url === '/api/v1/sync' ? syncAnswer() : new Response('{}', { status: 200 })))
    await syncNow()
    expect(f.mock.calls.filter((c) => c[0] === '/api/v1/sync')).toHaveLength(2)
    expect(syncSnapshot().state).toBe('idle')
  })
})
