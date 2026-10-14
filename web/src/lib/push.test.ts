// Test notifications (OpenSpec change `push-test-delivery`): the server call,
// the service worker's receipt and every outcome Settings can show.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pushChecklist, sendTestPush, type MessageSource, type PushState } from './push'

class FakeSource implements MessageSource {
  listeners = new Set<(ev: MessageEvent) => void>()
  addEventListener(_t: 'message', fn: (ev: MessageEvent) => void) { this.listeners.add(fn) }
  removeEventListener(_t: 'message', fn: (ev: MessageEvent) => void) { this.listeners.delete(fn) }
  receipt(testId: string, receivedAt = 42) {
    for (const fn of [...this.listeners]) fn({ data: { type: 'push:test-received', testId, receivedAt } } as MessageEvent)
  }
}

function answer(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })))
}

let source: FakeSource
beforeEach(() => {
  source = new FakeSource()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('sendTestPush', () => {
  it('reports received when the service worker confirms the test', async () => {
    answer(200, { outcome: 'sent', testId: 't1' })
    const sent = vi.fn()
    const p = sendTestPush('dev', { source, onSent: sent })
    await vi.waitFor(() => expect(sent).toHaveBeenCalledWith('t1'))
    source.receipt('other') // another test's receipt is ignored
    source.receipt('t1', 99)
    expect(await p).toEqual({ kind: 'received', testId: 't1', receivedAt: 99 })
    expect(source.listeners.size).toBe(0)
  })

  it('accepts a receipt that arrives before the server answers', async () => {
    let release: () => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      release = () => resolve(new Response(JSON.stringify({ outcome: 'sent', testId: 't2' }), { status: 200 }))
    })))
    const p = sendTestPush('dev', { source })
    await vi.waitFor(() => expect(source.listeners.size).toBe(1))
    source.receipt('t2', 7)
    release()
    expect(await p).toEqual({ kind: 'received', testId: 't2', receivedAt: 7 })
  })

  it('says accepted but not seen after the wait, then upgrades on a late receipt', async () => {
    answer(200, { outcome: 'sent', testId: 't3' })
    const late = vi.fn()
    const p = sendTestPush('dev', { source, timeoutMs: 10_000, onLateReceipt: late })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await p).toEqual({ kind: 'accepted_not_seen', testId: 't3' })
    source.receipt('t3', 123)
    expect(late).toHaveBeenCalledWith({ kind: 'received', testId: 't3', receivedAt: 123 })
    expect(source.listeners.size).toBe(0)
  })

  it.each([
    [{ outcome: 'no_subscription', subscription: null }, { kind: 'no_subscription' }],
    [{ outcome: 'gone', subscription: null }, { kind: 'gone' }],
    [{ outcome: 'failed', status: 500, error: 'push service answered 500' }, { kind: 'failed', status: 500, error: 'push service answered 500' }],
  ])('maps the server outcome %j', async (body, outcome) => {
    answer(200, body)
    expect(await sendTestPush('dev', { source })).toEqual(outcome)
    expect(source.listeners.size).toBe(0)
  })

  it('reports rate limiting and an older server', async () => {
    answer(429, { error: { code: 'rate_limited', message: 'too many' } })
    expect(await sendTestPush('dev', { source })).toEqual({ kind: 'rate_limited' })
    answer(404, { error: { code: 'not_found', message: 'not found' } })
    expect(await sendTestPush('dev', { source })).toEqual({ kind: 'server_too_old' })
  })

  it('reports offline without calling the server', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('navigator', { onLine: false })
    expect(await sendTestPush('dev', { source })).toEqual({ kind: 'offline' })
    expect(fetchMock).not.toHaveBeenCalled()
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    expect(await sendTestPush('dev', { source })).toEqual({ kind: 'offline' })
  })
})

const healthy: PushState = {
  supported: true, available: true, permission: 'granted', enabled: true, includeContent: false, needsRenewal: false,
  serviceWorker: true, serverUnreachable: false,
  subscription: { id: 's', deviceId: 'dev', includeContent: false, createdAt: 1, lastOkAt: 1_760_000_000_000, lastError: '', failures: 0, needsRenewal: false },
}
const step = (steps: ReturnType<typeof pushChecklist>, id: string) => steps.find((s) => s.id === id)!
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'

describe('pushChecklist', () => {
  it('is all green on a healthy device after a received test', () => {
    const steps = pushChecklist(healthy, { kind: 'received', testId: 't', receivedAt: 1 }, true)
    expect(steps.map((s) => s.status)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'ok'])
  })

  it('without a service worker, fails that step and never offers Enable', () => {
    const noSw = { ...healthy, serviceWorker: false, subscription: null }
    for (const dev of [true, false]) {
      const steps = pushChecklist(noSw, { kind: 'no_subscription' }, true, { dev })
      expect(step(steps, 'serviceWorker').status).toBe('fail')
      expect(steps.some((s) => s.action === 'enable' || s.action === 'reenable')).toBe(false)
    }
    expect(step(pushChecklist(noSw, null, true, { dev: true }), 'serviceWorker').detail).toMatch(/make run/)
  })

  it('with permission denied, later steps read not checked', () => {
    const steps = pushChecklist({ ...healthy, permission: 'denied' }, null, true)
    expect(step(steps, 'permission').status).toBe('fail')
    expect(step(steps, 'permission').detail).toMatch(/site settings/)
    expect(steps.slice(2).every((s) => s.status === 'not_checked')).toBe(true)
  })

  it('offline, the server steps say they cannot be checked', () => {
    const steps = pushChecklist(healthy, null, false)
    for (const id of ['subscription', 'delivery', 'test']) expect(step(steps, id).status).toBe('unknown')
    expect(step(steps, 'subscription').detail).toMatch(/offline/)
    expect(step(steps, 'serviceWorker').status).toBe('ok')
  })

  it('with failed sends, shows the last error and offers Re-enable', () => {
    const failing = { ...healthy, subscription: { ...healthy.subscription!, failures: 3, lastError: 'push service answered 500' } }
    const s = step(pushChecklist(failing, null, true), 'delivery')
    expect(s).toMatchObject({ status: 'fail', action: 'reenable' })
    expect(s.detail).toMatch(/3 sends failed: push service answered 500/)
  })

  it('accepted but not seen names the operating system settings', () => {
    const s = step(pushChecklist(healthy, { kind: 'accepted_not_seen', testId: 't' }, true, { ua: MAC }), 'test')
    expect(s.status).toBe('fail')
    expect(s.detail).toMatch(/System Settings → Notifications/)
  })
})
