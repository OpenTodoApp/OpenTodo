// Settings → Webhooks without a DOM: the pure WebhooksView is rendered to static
// markup for each state, and the API client and helpers are checked directly.
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../lib/api'
import { useDatabase } from '../lib/db'
import type { Webhook, WebhookDelivery } from '../lib/types'
import {
  cacheWebhooks, deliveryOutcome, describeWebhookError, insecureTarget, loadCachedWebhooks, toggleEvent, webhookStatus,
} from '../lib/webhooks'
import { emptyDraft, WebhooksView, type WebhooksViewProps } from './WebhooksPanel'

const noop = () => {}

const hook = (over: Partial<Webhook> = {}): Webhook => ({
  id: 'w1', url: 'https://n8n.example.com/webhook/plants', events: ['task.completed'], projectId: null,
  enabled: true, disabledReason: null, consecutiveFailures: 0, createdAt: 1, updatedAt: 1, ...over,
})

const delivery = (over: Partial<WebhookDelivery> = {}): WebhookDelivery => ({
  id: 'd1', webhookId: 'w1', event: 'task.completed', status: 'delivered', attempts: 1, nextAttemptAt: null,
  statusCode: 200, error: null, responseExcerpt: 'ok', durationMs: 42, createdAt: 1, deliveredAt: 2, ...over,
})

function render(over: Partial<WebhooksViewProps> = {}) {
  const props: WebhooksViewProps = {
    isOwner: false, connected: true, webhooks: [], projects: [{ id: 'p1', name: 'Garden' }], allowPrivate: null,
    busy: false, error: null, draft: null, secret: null, testResults: {}, log: null,
    onDraftChange: noop, onSave: noop, onDismissSecret: noop, onToggleEnabled: noop, onTest: noop,
    onDelete: noop, onOpenLog: noop, onRefreshLog: noop, onRedeliver: noop, onPolicyChange: noop,
    ...over,
  }
  return renderToStaticMarkup(<WebhooksView {...props} />)
}

const buttons = (html: string) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => ({ tag: m[0], label: m[1].replace(/<[^>]+>/g, '') }))
const button = (html: string, label: string) => buttons(html).find((b) => b.label === label)

describe('WebhooksView', () => {
  it('lists webhooks with status, events and project filter', () => {
    const html = render({
      webhooks: [
        hook(),
        hook({ id: 'w2', url: 'https://ha.example.com/x', projectId: 'p1', enabled: false, disabledReason: 'too_many_failures', consecutiveFailures: 20 }),
        hook({ id: 'w3', enabled: false }),
      ],
    })
    expect(html).toContain('https://n8n.example.com/webhook/plants')
    expect(html).toContain('Active')
    expect(html).toContain('Disabled after repeated failures')
    expect(html).toContain('Paused')
    expect(html).toContain('Garden')
    expect(html).toContain('All projects')
    expect(html).toContain('task.completed')
  })

  it('says nothing is sent until a webhook exists', () => {
    expect(render({ webhooks: [] })).toContain('Nothing is sent until you add one')
  })

  it('shows the secret once with a copy action', () => {
    const html = render({ secret: { webhookId: 'w1', value: 'whsec_abc123' }, webhooks: [hook()] })
    expect(html).toContain('whsec_abc123')
    expect(html).toContain('will not be shown again')
    expect(button(html, 'Copy')).toBeTruthy()
    expect(button(html, 'Done')).toBeTruthy()
    expect(html).toContain('data-testid="webhook-secret"')
    // Without the one-time state the secret is nowhere on the page.
    expect(render({ webhooks: [hook()] })).not.toContain('whsec_')
  })

  it('renders the create form with event checkboxes, project filter and an http:// warning', () => {
    const html = render({ draft: { ...emptyDraft(), url: 'http://192.168.1.10:8123/api/webhook/x' } })
    expect(html).toContain('role="dialog"')
    expect(html).toContain('New webhook')
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(12)
    expect(html).toContain('<option value="p1">Garden</option>')
    expect(html).toContain('travels unencrypted')
    expect(render({ draft: { ...emptyDraft(), url: 'https://example.com/x' } })).not.toContain('travels unencrypted')
    expect(render({ draft: { ...emptyDraft(), url: 'http://localhost:5678/x' } })).not.toContain('travels unencrypted')
  })

  it('offers enable/disable in the edit form only', () => {
    expect(render({ draft: { ...emptyDraft(), id: 'w1', url: 'https://x.example' } })).toContain('Enabled')
    expect(render({ draft: emptyDraft() })).not.toContain('>Enabled')
  })

  it('shows the owner policy toggle only to the owner', () => {
    expect(render({ isOwner: true, allowPrivate: false })).toContain('Allow private network targets')
    expect(render({ isOwner: false })).not.toContain('Allow private network targets')
  })

  it('keeps the last list visible offline, disables actions and says a connection is required', () => {
    const html = render({ connected: false, webhooks: [hook()], isOwner: true, allowPrivate: true })
    expect(html).toContain('https://n8n.example.com/webhook/plants')
    expect(html).toContain('needs a connection')
    expect(button(html, 'Add webhook')?.tag).toContain('disabled')
    expect(html).toMatch(/role="switch"[^>]*aria-checked="true"[^>]*disabled=""|role="switch"[^>]*disabled=""[^>]*aria-checked="true"/)
    // Online, Add webhook is enabled; the row actions are checked with the menu open (webhooksView.test.tsx).
    expect(button(render({ webhooks: [hook()] }), 'Add webhook')?.tag).not.toContain('disabled')
  })

  it('renders the delivery log with outcome and redeliver', () => {
    const html = render({
      webhooks: [hook()],
      log: {
        webhookId: 'w1',
        deliveries: [
          delivery(),
          delivery({ id: 'd2', status: 'retry', statusCode: 503, error: 'HTTP 503', attempts: 1, nextAttemptAt: 10 }),
          delivery({ id: 'd3', status: 'failed', statusCode: null, error: 'private_target', responseExcerpt: null }),
        ],
      },
    })
    expect(html).toContain('Last 100 deliveries')
    expect(html).toContain('HTTP 200 · 42 ms')
    expect(html).toContain('HTTP 503')
    expect(html).toContain('refused: private network target')
    expect(buttons(html).filter((b) => b.label === 'Redeliver')).toHaveLength(2)
  })

  it('shows the test result', () => {
    const html = render({ webhooks: [hook()], testResults: { w1: { ok: true, text: 'Ping delivered: HTTP 200 · 12 ms' } } })
    expect(html).toContain('Ping delivered')
  })

  it('every action is a native button or form control (keyboard reachable)', () => {
    const html = render({ webhooks: [hook()], isOwner: true, allowPrivate: false, log: { webhookId: 'w1', deliveries: [delivery()] } })
    expect(html).not.toMatch(/onclick=|<div[^>]*role="button"/i)
    expect(html).toContain('aria-label="Actions for webhook https://n8n.example.com/webhook/plants"')
  })
})

describe('webhook helpers', () => {
  it('flags plain http outside loopback', () => {
    expect(insecureTarget('http://ha.local:8123/x')).toBe(true)
    expect(insecureTarget('http://127.0.0.1:8080')).toBe(false)
    expect(insecureTarget('http://[::1]/x')).toBe(false)
    expect(insecureTarget('https://ha.local')).toBe(false)
    expect(insecureTarget('not a url')).toBe(false)
  })

  it('toggles events in canonical order', () => {
    expect(toggleEvent(['task.completed'], 'task.created')).toEqual(['task.created', 'task.completed'])
    expect(toggleEvent(['task.created', 'task.completed'], 'task.created')).toEqual(['task.completed'])
  })

  it('describes status and errors', () => {
    expect(webhookStatus(hook({ consecutiveFailures: 3 })).label).toContain('3 failed')
    expect(describeWebhookError(new ApiError(400, 'private_target', 'x'))).toContain('owner')
    expect(describeWebhookError(new ApiError(409, 'limit_reached', 'x'))).toContain('20')
    expect(describeWebhookError(new TypeError('Failed to fetch'))).toContain('unreachable')
    expect(deliveryOutcome(delivery({ statusCode: null, error: 'timeout', durationMs: 10000 }))).toBe('timeout · 10000 ms')
  })

  it('caches the list without secrets for offline display', async () => {
    useDatabase(`webhooks-test-${Math.random()}`)
    expect(await loadCachedWebhooks()).toBeNull()
    await cacheWebhooks([hook({ secret: 'whsec_leak' })])
    const cached = await loadCachedWebhooks()
    expect(cached?.[0].url).toBe('https://n8n.example.com/webhook/plants')
    expect(JSON.stringify(cached)).not.toContain('whsec_leak')
  })
})

describe('webhook API client', () => {
  type Call = { url: string; init: RequestInit }
  let calls: Call[]
  let respond: () => Response
  beforeEach(() => {
    calls = []
    respond = () => new Response('{}', { status: 200 })
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return respond()
    }))
  })
  afterEach(() => vi.unstubAllGlobals())
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

  it('uses the documented routes and methods', async () => {
    respond = () => json(201, { webhook: hook({ secret: 'whsec_x' }) })
    const created = await api.createWebhook({ url: 'https://x.example', events: ['task.created'], projectId: null })
    expect(created.webhook.secret).toBe('whsec_x')
    expect(calls[0]).toMatchObject({ url: '/api/v1/webhooks', init: { method: 'POST' } })
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ url: 'https://x.example', events: ['task.created'], projectId: null })

    respond = () => json(200, {})
    await api.listWebhooks()
    await api.updateWebhook('w1', { enabled: false })
    await api.testWebhook('w1')
    await api.listDeliveries('w1')
    await api.redeliver('w1', 'd1')
    await api.getWebhookPolicy()
    await api.setWebhookPolicy(true)
    respond = () => new Response(null, { status: 204 })
    await api.deleteWebhook('w1')
    expect(calls.slice(1).map((c) => `${c.init.method} ${c.url}`)).toEqual([
      'GET /api/v1/webhooks',
      'PATCH /api/v1/webhooks/w1',
      'POST /api/v1/webhooks/w1/test',
      'GET /api/v1/webhooks/w1/deliveries',
      'POST /api/v1/webhooks/w1/deliveries/d1/redeliver',
      'GET /api/v1/settings/webhooks',
      'PUT /api/v1/settings/webhooks',
      'DELETE /api/v1/webhooks/w1',
    ])
    expect(JSON.parse(calls[7].init.body as string)).toEqual({ allowPrivate: true })
  })

  it('surfaces private_target as an ApiError', async () => {
    respond = () => json(400, { error: { code: 'private_target', message: 'url: private' } })
    const err = await api.createWebhook({ url: 'http://10.0.0.1', events: ['task.created'] }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('private_target')
  })
})
