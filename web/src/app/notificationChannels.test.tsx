// @vitest-environment happy-dom
// Settings → Notifications → Delivery channels (OpenSpec change notification-channels,
// task 3.1): rows lead with their last result, the owner's switch, members while it
// is off, the offline card, the editor's body never carries a secret it did not type,
// a webhook's signing secret is shown once, and the encrypted account's titles switch.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { cacheChannels, type NotificationChannel } from '../lib/notificationChannels'
import { click, flush, render } from '../ui/test-utils'
import { channelDraftBody, channelDraftError, channelDraftOf, newChannelDraft } from './NotificationChannelEditor'
import { ChannelsView, channelStatus, NotificationChannelsCard, type ChannelsViewProps } from './NotificationChannels'

const NOW = new Date(2026, 9, 20, 12, 0).getTime()
const ntfy: NotificationChannel = {
  id: 'n1', kind: 'ntfy', name: 'Phone', url: 'https://ntfy.sh', topic: 'ana-tasks', events: ['reminder', 'assigned'], includeTitles: false,
  enabled: true, lang: 'en', tokenSet: false, lastOkAt: NOW - 3 * 60_000, failures: 0, createdAt: NOW - 86400_000, updatedAt: NOW - 600_000,
}
const failing: NotificationChannel = { ...ntfy, id: 'g1', kind: 'gotify', name: 'Home', url: 'https://gotify.example.com', topic: undefined, tokenSet: true,
  enabled: false, disabledReason: 'too_many_failures', lastError: 'HTTP 401', failures: 20 }
let calls: { k: string; body?: string }[] = []

function serve(routes: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const k = `${init?.method ?? 'GET'} ${new URL(url, 'http://x').pathname}`
    calls.push({ k, body: typeof init?.body === 'string' ? init.body : undefined })
    if (k in routes) {
      const body = routes[k]
      return body === null ? new Response(null, { status: 204 }) : new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ error: { code: 'not_found', message: 'not found' } }), { status: 404 })
  }))
}

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

const noop = () => undefined
function view(p: Partial<ChannelsViewProps>): ChannelsViewProps {
  return { isOwner: false, enabled: true, connected: true, encrypted: false, channels: [ntfy], busy: false, error: null, draft: null, fieldError: null,
    secret: null, tests: {}, now: NOW, onToggle: noop, onDraftChange: noop, onSave: noop, onSetEnabled: noop, onTest: noop, onRotate: noop,
    onDelete: noop, onSecretSeen: noop, ...p }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await db.delete()
  await db.open()
  calls = []
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('delivery channels', () => {
  it('says why a row is off, its last error or when it last delivered', () => {
    expect(channelStatus(ntfy, NOW)).toMatch(/^Last delivered/)
    expect(channelStatus(failing, NOW)).toBe('Turned off after 20 failed messages. Check its settings, then turn it on.')
    expect(channelStatus({ ...ntfy, lastOkAt: null }, NOW)).toBe('Nothing delivered yet')
    expect(channelStatus({ ...ntfy, lastError: 'token_missing' }, NOW)).toMatch(/No token is stored/)
  })

  it('loads the rows and shows the owner switch', async () => {
    serve({ 'GET /api/v1/settings/notification-channels': { enabled: true }, 'GET /api/v1/notification-channels': { channels: [ntfy, failing] } })
    const r = await render(<NotificationChannelsCard isOwner />)
    await waitFor(() => r.container.querySelectorAll('[data-channel]').length === 2)
    expect(r.container.textContent).toContain('On this server')
    expect(r.container.querySelector('[data-channel="g1"] [data-channel-status]')?.textContent).toMatch(/Turned off after 20/)
    expect(r.container.textContent).not.toContain('gotify-token')
  })

  it('tells a member when the owner turned channels off, and lists nothing', async () => {
    const r = await render(<ChannelsView {...view({ enabled: false })} />)
    expect(r.container.textContent).toContain('The server owner has turned delivery channels off.')
    expect(r.container.querySelector('[data-channel]')).toBeNull()
    const member = await render(<ChannelsView {...view({ enabled: true })} />)
    expect(member.container.textContent).not.toContain('On this server')
  })

  it('keeps the last loaded rows offline with every control off', async () => {
    await cacheChannels([ntfy])
    serve({})
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const r = await render(<NotificationChannelsCard isOwner={false} />)
    await waitFor(() => r.container.querySelector('[data-channel="n1"]') !== null)
    expect(r.container.textContent).toContain('Changing delivery channels needs a connection.')
    const sw = r.container.querySelector<HTMLButtonElement>('[data-channel="n1"] [role="switch"]')!
    expect(sw.disabled || sw.getAttribute('aria-disabled') === 'true').toBe(true)
  })

  it('sends a secret only when typed, and the kind only on creation', () => {
    const d = { ...newChannelDraft('gotify'), url: 'https://gotify.example.com', token: ' tok ' }
    expect(channelDraftBody(d)).toMatchObject({ kind: 'gotify', url: 'https://gotify.example.com', token: 'tok' })
    const edit = channelDraftOf(failing)
    expect(edit.token).toBe('')
    const body = channelDraftBody({ ...edit, name: 'Home server' })
    expect(body).not.toHaveProperty('token')
    expect(body).not.toHaveProperty('kind')
    expect(channelDraftError({ ...newChannelDraft('ntfy'), topic: 'my topic!' })?.field).toBe('topic')
    expect(channelDraftError({ ...newChannelDraft('pushover'), token: 'x' })?.field).toBe('userKey')
    expect(channelDraftError({ ...newChannelDraft('ntfy'), topic: 't', events: [] })?.field).toBe('events')
  })

  it('creates a webhook channel and shows its signing secret once', async () => {
    const created = { ...ntfy, id: 'w1', kind: 'webhook', name: 'Webhook', url: 'https://hooks.example.com', topic: undefined, secretSet: true, lastOkAt: null }
    serve({
      'GET /api/v1/settings/notification-channels': { enabled: true }, 'GET /api/v1/notification-channels': { channels: [] },
      'POST /api/v1/notification-channels': { channel: created, secret: 'whsec_shown_once' },
    })
    const r = await render(<NotificationChannelsCard isOwner={false} />)
    await waitFor(() => [...r.container.querySelectorAll('button')].some((b) => b.textContent === 'Add channel'))
    await click([...r.container.querySelectorAll('button')].find((b) => b.textContent === 'Add channel')!)
    await click(document.querySelector<HTMLButtonElement>('[data-channel-kind="webhook"]')!)
    const address = document.querySelector<HTMLInputElement>('input[aria-label="Address"]')!
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(address, 'https://hooks.example.com')
    address.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    await click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Add channel' && b.getAttribute('type') === 'submit')!)
    await waitFor(() => document.querySelector<HTMLInputElement>('input[aria-label="Signing secret"]')?.value === 'whsec_shown_once')
    const post = calls.find((c) => c.k === 'POST /api/v1/notification-channels')!
    expect(JSON.parse(post.body!)).toMatchObject({ kind: 'webhook', url: 'https://hooks.example.com', lang: 'en' })
  })

  it('turns the titles switch off and explains it on an encrypted account', async () => {
    await render(<ChannelsView {...view({ encrypted: true, draft: { ...channelDraftOf(ntfy), includeTitles: true } })} />)
    const titles = document.querySelector<HTMLButtonElement>('[data-channel-titles] [role="switch"]')!
    expect(titles.getAttribute('aria-checked')).toBe('false')
    expect(document.body.textContent).toContain('Never with end-to-end encryption')
  })
})
