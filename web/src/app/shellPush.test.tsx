// @vitest-environment happy-dom
// Reminders by push in the Android app (OpenSpec change shell-push; native-shells
// "Reminders by push through UnifiedPush", reminders "Push delivery setting in the
// Android app"): the shell's subscription is posted to the existing push routes,
// follows the registration, and goes at sign-out; the row's states in Settings.
import 'fake-indexeddb/auto'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, getMeta, setMeta } from '../lib/db'
import { getDeviceId, resetDeviceId } from '../lib/ops'
import { unsubscribeOnSignOut } from '../lib/push'
import type { OpenTodoShell } from '../lib/shell'
import { BACKGROUND_PUSH_MS, startBackgroundRun } from '../lib/shellBackground'
import { META_SHELL_PUSH, META_SHELL_PUSH_ON, disableShellPush, enableShellPush, shellPushState, syncShellPush } from '../lib/shellPush'
import { setShellNotifications, setShellTitles } from '../lib/shellPublish'
import { click, render, waitFor } from '../ui/test-utils'
import { ShellNotifications, ShellNotificationsView, shellPushErrorText } from './ShellNotifications'

const SUB = { endpoint: 'https://ntfy.example/upAbC123', p256dh: 'BGkLNImBoTeeh4TeK41SZl8nl2k2MTk0Js-rf7fmKwzkXy0QrgmNf_0W7JVGV3qb-zC1rzcWkVTkJfT6ut--2t4', auth: '2J0U_Lsm0Ur3Q4PJqlrh9g' }

/** The phone: what the shell answers, and what it was asked. */
function phone(over: { capabilities?: string[]; platform?: 'android' | 'ios'; subscribe?: unknown; state?: unknown } = {}) {
  const p = {
    state: over.state ?? { available: true, registered: false } as unknown,
    subscribe: over.subscribe ?? SUB as unknown,
    asked: [] as string[],
    unsubscribed: 0,
  }
  window.opentodoShell = {
    bridge: 1, platform: over.platform ?? 'android', app: '1.7.0', capabilities: over.capabilities ?? ['reminders', 'links', 'push'],
    scheduleReminders: async () => 'granted' as const,
    pushSubscribe: async (key: string) => {
      p.asked.push(key)
      if (p.subscribe && typeof p.subscribe === 'object' && 'endpoint' in p.subscribe) p.state = { available: true, registered: true, ...p.subscribe }
      return JSON.stringify(p.subscribe)
    },
    pushState: async () => JSON.stringify(p.state),
    pushUnsubscribe: () => { p.unsubscribed++; p.state = { available: true, registered: false } },
  } as OpenTodoShell
  return p
}

/** The server's push routes: 404 while push is off, unreachable while offline. */
function server(over: { push?: boolean; offline?: boolean } = {}) {
  const s = { push: over.push ?? true, offline: over.offline ?? false, ids: ['s-1', 's-2', 's-3'], posted: [] as Record<string, unknown>[], deleted: [] as string[] }
  vi.stubGlobal('fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://test.invalid')
    const method = init?.method ?? 'GET'
    if (!url.pathname.startsWith('/api/v1/push/')) throw new Error(`unexpected request ${method} ${url.pathname}`)
    if (s.offline) throw new TypeError('Failed to fetch')
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    if (!s.push) return json(404, { error: { code: 'not_found', message: 'not found' } })
    if (method === 'GET' && url.pathname === '/api/v1/push/vapid-key') return json(200, { publicKey: 'vapid-key', subscription: null })
    if (method === 'POST' && url.pathname === '/api/v1/push/subscriptions') {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      s.posted.push(body)
      return json(200, { subscription: { id: s.ids[s.posted.length - 1], deviceId: body.deviceId, includeContent: body.includeContent, createdAt: 0, lastOkAt: null, lastError: '', failures: 0, needsRenewal: false } })
    }
    if (method === 'DELETE' && url.pathname.startsWith('/api/v1/push/subscriptions/')) {
      s.deleted.push(decodeURIComponent(url.pathname.split('/').pop() ?? ''))
      return new Response(null, { status: 204 })
    }
    throw new Error(`unexpected request ${method} ${url.pathname}`)
  }) as typeof fetch)
  return s
}

const remembered = () => getMeta<{ subscriptionId: string; endpoint: string; includeContent: boolean } | null>(META_SHELL_PUSH, null)
const on = () => getMeta<boolean>(META_SHELL_PUSH_ON, false)

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})
afterEach(() => {
  delete window.opentodoShell
  vi.unstubAllGlobals()
})

describe('push delivery through the Android app', () => {
  it('enabling posts the shell\'s subscription with the titles option and remembers it', async () => {
    const p = phone()
    const s = server()
    expect(await enableShellPush()).toEqual({ ok: true })
    expect(p.asked).toEqual(['vapid-key'])
    expect(s.posted).toEqual([{ deviceId: await getDeviceId(), endpoint: SUB.endpoint, keys: { p256dh: SUB.p256dh, auth: SUB.auth }, includeContent: true }])
    expect(await remembered()).toEqual({ subscriptionId: 's-1', endpoint: SUB.endpoint, includeContent: true })
    expect(await on()).toBe(true)
    expect(await shellPushState()).toEqual({ offered: true, available: true, enabled: true })
    // Unchanged: a later start asks the server nothing more.
    await syncShellPush()
    expect(s.posted).toHaveLength(1)
    expect(s.deleted).toEqual([])
  })

  it('with task titles off the device is subscribed without content, and changing the option subscribes again', async () => {
    phone()
    const s = server()
    await setMeta('push:includeContent', false)
    await enableShellPush()
    expect(s.posted[0]).toMatchObject({ includeContent: false })
    await setShellTitles(true)
    await waitFor(() => s.posted.length === 2, 'the subscription follows the titles option')
    expect(s.posted[1]).toMatchObject({ endpoint: SUB.endpoint, includeContent: true })
    await waitFor(async () => (await remembered())?.includeContent === true, 'the option is remembered')
  })

  it('a rotated endpoint replaces the row: the new one is posted and the old one deleted', async () => {
    const p = phone()
    const s = server()
    await enableShellPush()
    const rotated = { ...SUB, endpoint: 'https://ntfy.example/upXyZ789' }
    p.state = { available: true, registered: true, ...rotated }
    await syncShellPush()
    expect(s.posted[1]).toMatchObject({ endpoint: rotated.endpoint, keys: { p256dh: SUB.p256dh, auth: SUB.auth } })
    expect(s.deleted).toEqual(['s-1'])
    expect(await remembered()).toMatchObject({ subscriptionId: 's-2', endpoint: rotated.endpoint })
    expect(await on()).toBe(true)
    // A server that replaced the device's row in place (the same id) has nothing left to delete.
    s.ids[2] = 's-2'
    p.state = { available: true, registered: true, ...SUB }
    await syncShellPush()
    expect(s.posted).toHaveLength(3)
    expect(s.deleted).toEqual(['s-1'])
  })

  it('a rotated endpoint while offline is subscribed by a later run', async () => {
    const p = phone()
    const s = server()
    await enableShellPush()
    p.state = { available: true, registered: true, ...SUB, endpoint: 'https://ntfy.example/new' }
    s.offline = true
    await syncShellPush()
    expect(await on()).toBe(true)
    expect(await remembered()).toMatchObject({ endpoint: SUB.endpoint })
    s.offline = false
    await syncShellPush()
    expect(await remembered()).toMatchObject({ endpoint: 'https://ntfy.example/new' })
  })

  it('a background run subscribes the new endpoint before it tells the shell it is done', async () => {
    const p = phone({ capabilities: ['reminders', 'widgets', 'background', 'push'] })
    const s = server()
    await setMeta(META_SHELL_PUSH_ON, true)
    await setMeta(META_SHELL_PUSH, { subscriptionId: 's-0', endpoint: 'https://ntfy.example/old', includeContent: true })
    p.state = { available: true, registered: true, ...SUB }
    let done = false
    window.opentodoShell!.backgroundDone = () => { done = true }
    let t = 0
    // The run's own waits pass at once; the limit on the push subscription never fires.
    await startBackgroundRun({ now: () => t, sleep: (ms) => (ms === BACKGROUND_PUSH_MS ? new Promise(() => undefined) : Promise.resolve(void (t += ms))), search: '' })
    expect(done).toBe(true)
    expect(s.posted[0]).toMatchObject({ endpoint: SUB.endpoint })
    expect(s.deleted).toEqual(['s-0'])
  })

  it('a registration the UnifiedPush app dropped turns it off and deletes the row', async () => {
    const p = phone()
    const s = server()
    await enableShellPush()
    p.state = { available: true, registered: false }
    await syncShellPush()
    expect(s.deleted).toEqual(['s-1'])
    expect(await on()).toBe(false)
    expect(await remembered()).toBeNull()
    expect(await shellPushState()).toEqual({ offered: true, available: true, enabled: false })
  })

  it('an answer of the shell that cannot be read changes nothing', async () => {
    const p = phone()
    const s = server()
    await enableShellPush()
    p.state = 'nonsense'
    await syncShellPush()
    expect(await on()).toBe(true)
    expect(s.deleted).toEqual([])
  })

  it('sign-out deletes the row and unregisters the shell', async () => {
    const p = phone()
    const s = server()
    await enableShellPush()
    await unsubscribeOnSignOut()
    expect(s.deleted).toEqual(['s-1'])
    expect(p.unsubscribed).toBe(1)
    expect(await on()).toBe(false)
    expect(await remembered()).toBeNull()
  })

  it('turning it off, or turning the device\'s notifications off, removes the subscription and the registration', async () => {
    const p = phone()
    const s = server()
    await enableShellPush()
    await disableShellPush()
    expect(s.deleted).toEqual(['s-1'])
    expect(p.unsubscribed).toBe(1)
    expect(await on()).toBe(false)
    await enableShellPush()
    await setShellNotifications(false)
    expect(s.deleted).toEqual(['s-1', 's-2'])
    expect(p.unsubscribed).toBe(2)
    expect(await on()).toBe(false)
  })

  it('a server without push hides the row', async () => {
    phone()
    server({ push: false })
    expect(await shellPushState()).toEqual({ offered: false, available: false, enabled: false })
  })

  it('is not offered on an iPhone or without the capability', async () => {
    server()
    phone({ platform: 'ios' })
    expect(await shellPushState()).toMatchObject({ offered: false })
    phone({ capabilities: ['reminders', 'links'] })
    expect(await shellPushState()).toMatchObject({ offered: false })
    expect(await enableShellPush()).toEqual({ ok: false, reason: 'failed' })
  })

  it('offline leaves it off with the reason, and nothing is registered', async () => {
    const p = phone()
    const s = server({ offline: true })
    expect(await enableShellPush()).toEqual({ ok: false, reason: 'offline' })
    expect(p.asked).toEqual([])
    expect(await on()).toBe(false)
    // The row stays: only a server that says it has no push hides it.
    expect(await shellPushState()).toEqual({ offered: true, available: true, enabled: false })
    // The connection drops between the key and the subscription: the shell's registration is undone.
    s.offline = false
    const fetched = globalThis.fetch
    vi.stubGlobal('fetch', ((input: RequestInfo | URL, init?: RequestInit) => (init?.method === 'POST' ? Promise.reject(new TypeError('Failed to fetch')) : fetched(input, init))) as typeof fetch)
    expect(await enableShellPush()).toEqual({ ok: false, reason: 'offline' })
    expect(p.unsubscribed).toBe(1)
    expect(await on()).toBe(false)
    expect(await remembered()).toBeNull()
  })

  it('the shell\'s refusals leave it off with their reason', async () => {
    const s = server()
    for (const error of ['no-distributor', 'cancelled', 'failed', 'action-required', 'network'] as const) {
      phone({ subscribe: { error } })
      expect(await enableShellPush()).toEqual({ ok: false, reason: error })
    }
    phone({ subscribe: { endpoint: 'http://ntfy.example/plain', p256dh: 'a', auth: 'b' } })
    expect(await enableShellPush()).toEqual({ ok: false, reason: 'failed' })
    expect(s.posted).toEqual([])
    expect(await on()).toBe(false)
  })
})

describe('the push row in Settings → Notifications', () => {
  const view = (push: Parameters<typeof ShellNotificationsView>[0]['push'], extra: Partial<Parameters<typeof ShellNotificationsView>[0]> = {}) => renderToStaticMarkup(
    <ShellNotificationsView state={{ enabled: true, includeContent: true, permission: 'granted' }} busy={false} message={null} push={push} onPush={() => {}} onEnable={() => {}} onIncludeContent={() => {}} onTest={() => {}} {...extra} />,
  )
  const LABEL = 'Deliver instantly through UnifiedPush'
  /** The row's switch: the one its (visually hidden) label names. */
  const pushSwitch = (el: Element) => Array.from(el.querySelectorAll('label')).find((l) => l.textContent?.includes(LABEL))?.querySelector<HTMLElement>('[role="switch"]') ?? null

  it('renders its three states, and nothing where push is not offered', () => {
    const dom = (html: string) => { const el = document.createElement('div'); el.innerHTML = html; return el }
    expect(view(null)).not.toContain(LABEL)
    expect(view({ offered: false, available: false, enabled: false })).not.toContain(LABEL)
    const off = dom(view({ offered: true, available: true, enabled: false }))
    expect(pushSwitch(off)?.getAttribute('aria-checked')).toBe('false')
    expect(off.textContent).not.toContain('Needs a UnifiedPush app')
    expect(pushSwitch(dom(view({ offered: true, available: true, enabled: true })))?.getAttribute('aria-checked')).toBe('true')
    const none = dom(view({ offered: true, available: false, enabled: false }))
    expect(none.textContent).toContain(LABEL)
    expect(none.textContent).toContain('Needs a UnifiedPush app such as ntfy')
    expect(pushSwitch(none)).toBeNull()
    // With the device's notifications off, push delivery cannot be turned on.
    const quiet = dom(view({ offered: true, available: true, enabled: false }, { state: { enabled: false, includeContent: true, permission: null } }))
    expect(pushSwitch(quiet)?.hasAttribute('disabled')).toBe(true)
  })

  it('says why enabling failed, and nothing when the user cancelled', () => {
    expect(shellPushErrorText('offline')).toBe('The server could not be reached.')
    expect(shellPushErrorText('no-distributor')).toBe('Needs a UnifiedPush app such as ntfy')
    expect(shellPushErrorText('cancelled')).toBeNull()
    expect(shellPushErrorText('action-required')).toContain('needs attention')
    expect(shellPushErrorText('network')).toBe(shellPushErrorText('failed'))
  })

  it('turning the switch on subscribes the device and shows it on; offline it stays off and says so', async () => {
    phone()
    const s = server({ offline: true })
    const r = await render(<ShellNotifications />)
    const toggle = () => pushSwitch(r.container)
    await waitFor(() => !!toggle(), 'the push row shows')
    await click(toggle()!)
    await waitFor(() => r.container.textContent?.includes('The server could not be reached.') === true, 'the reason shows')
    expect(toggle()!.getAttribute('aria-checked')).toBe('false')
    s.offline = false
    await click(toggle()!)
    await waitFor(() => toggle()?.getAttribute('aria-checked') === 'true', 'the switch reads on')
    expect(s.posted).toHaveLength(1)
    expect(r.container.textContent).not.toContain('The server could not be reached.')
    await click(toggle()!)
    await waitFor(() => toggle()?.getAttribute('aria-checked') === 'false', 'the switch reads off')
    expect(s.deleted).toEqual(['s-1'])
    r.unmount()
  })

  it('without a UnifiedPush app the row says so and offers no switch; a server without push shows no row', async () => {
    phone({ state: { available: false, registered: false } })
    const s = server()
    const r = await render(<ShellNotifications />)
    await waitFor(() => r.container.textContent?.includes('Needs a UnifiedPush app such as ntfy') === true, 'the row says what is missing')
    expect(pushSwitch(r.container)).toBeNull()
    r.unmount()
    s.push = false
    const r2 = await render(<ShellNotifications />)
    await waitFor(() => r2.container.textContent?.includes('Include task titles') === true, 'the settings show')
    await waitFor(async () => !(await shellPushState()).offered, 'the server has no push')
    expect(r2.container.textContent).not.toContain(LABEL)
    r2.unmount()
  })
})
