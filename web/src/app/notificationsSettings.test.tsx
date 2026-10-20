// Settings → Notifications delivery check (OpenSpec change `push-test-delivery`):
// the checklist rows and the test summary never claim more than the device knows.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PushState, TestOutcome } from '../lib/push'
import { NotificationsView, PushDelivery, testSummary, type TestPhase } from './NotificationsSettings'

const subscribed: PushState = {
  supported: true, available: true, permission: 'granted', enabled: true, includeContent: false, needsRenewal: false,
  serviceWorker: true, serverUnreachable: false,
  subscription: { id: 's', deviceId: 'dev', includeContent: false, createdAt: 1, lastOkAt: 1_760_000_000_000, lastError: '', failures: 0, needsRenewal: false },
}

const render = (state: PushState, lastTest: TestOutcome | null, opts: { online?: boolean; dev?: boolean; phase?: TestPhase } = {}) =>
  renderToStaticMarkup(
    <PushDelivery state={state} lastTest={lastTest} online={opts.online ?? true} dev={opts.dev ?? false} busy={false}
      phase={opts.phase ?? 'idle'} onTest={() => {}} onLocalTest={() => {}} onAction={() => {}} />,
  )
const status = (html: string, step: string) => html.match(new RegExp(`data-step="${step}" data-status="(\\w+)"`))?.[1]

describe('PushDelivery', () => {
  it('without a subscription: says so, offers Enable and a labelled local test, and cannot send a real test', () => {
    const html = render({ ...subscribed, enabled: false, subscription: null }, null)
    expect(status(html, 'subscription')).toBe('fail')
    expect(html).toContain('This device has no subscription on the server.')
    expect(html).toMatch(/>Enable</)
    expect(html).toContain('Show a local notification')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Send test notification/)
    expect(html).toContain('Enable notifications on this device first.')
    expect(html).not.toMatch(/sent\./i)
  })

  it('received: every row is OK and the summary says received on this device', () => {
    const html = render(subscribed, { kind: 'received', testId: 't', receivedAt: 1_760_000_000_000 })
    for (const step of ['support', 'permission', 'serviceWorker', 'subscription', 'delivery', 'test']) expect(status(html, step)).toBe('ok')
    expect(html).toContain('Received on this device.')
    expect(html).not.toContain('Show a local notification')
  })

  it('accepted but not seen: the test row fails with OS hints and the summary does not claim success', () => {
    const html = render(subscribed, { kind: 'accepted_not_seen', testId: 't' })
    expect(status(html, 'test')).toBe('fail')
    expect(html).toContain('has not reported receiving it')
    expect(html).not.toContain('Received on this device')
  })

  it('in a development build explains the missing service worker and offers no enable action', () => {
    const html = render({ ...subscribed, serviceWorker: false, subscription: null }, null, { dev: true })
    expect(status(html, 'serviceWorker')).toBe('fail')
    expect(html).toContain('Development builds have no service worker')
    expect(html).not.toMatch(/>(Enable|Re-enable)</)
  })

  it('offline: the test is unavailable with an explanation', () => {
    const html = render(subscribed, null, { online: false })
    expect(status(html, 'subscription')).toBe('unknown')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Send test notification/)
    expect(html).toContain("You&#x27;re offline; the test needs the server.")
  })
})

describe('testSummary', () => {
  it('distinguishes waiting for the device from received', () => {
    expect(testSummary(null, 'waiting')).toMatch(/Waiting for this device/)
    expect(testSummary({ kind: 'failed', status: 500, error: 'push service answered 500' }, 'idle')).toMatch(/status 500/)
    expect(testSummary(null, 'idle')).toBeNull()
  })
})

describe('NotificationsView', () => {
  const view = (state: PushState | null, extra: Partial<Parameters<typeof NotificationsView>[0]> = {}) => renderToStaticMarkup(
    <NotificationsView state={state} busy={false} message={null} onEnable={() => {}} onIncludeContent={() => {}} onRenew={() => {}} now={1_760_000_060_000} {...extra} />,
  )

  it('leads with this device: on, permission and the last delivery', () => {
    const html = view(subscribed)
    expect(html).toContain('data-testid="push-summary"')
    expect(html).toContain('>On<')
    expect(html).toContain('Permission: Allowed')
    expect(html).toContain('Last delivered')
    expect(html).toContain('Enable notifications on this device')
    expect(html).toContain('role="switch"')
  })

  it('off and blocked: says so with a warning', () => {
    const html = view({ ...subscribed, enabled: false, permission: 'denied', subscription: null })
    expect(html).toContain('>Off<')
    expect(html).toContain('Permission: Blocked')
    expect(html).toContain('blocked in your browser settings')
    expect(html).not.toContain('Last delivered')
  })

  it('offers Re-enable when the push service stopped accepting', () => {
    expect(view({ ...subscribed, needsRenewal: true })).toMatch(/stopped accepting[\s\S]*>Re-enable</)
  })

  it('says when the server turned push off, with no controls', () => {
    const html = view({ ...subscribed, available: false })
    expect(html).toContain('turned off on this server')
    expect(html).not.toContain('role="switch"')
  })
})
