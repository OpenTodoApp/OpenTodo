// Settings → AI assistants without a DOM: the pure AssistantsView is rendered to
// static markup for each state, and the helpers and API client are checked.
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../lib/api'
import { connectionSnippet, describeAssistantsError } from '../lib/assistants'
import { AssistantsView, type AssistantsViewProps } from './AssistantsPanel'

const noop = () => {}
const endpoint = 'https://todo.example.com/mcp'

function render(over: Partial<AssistantsViewProps> = {}) {
  const props: AssistantsViewProps = {
    isOwner: true, connected: true, status: { enabled: false, endpoint }, access: { allow_writes: false, owner_allows_writes: false },
    busy: false, error: null, secret: null, copied: null,
    onToggle: noop, onToggleWrites: noop, onToggleAccess: noop, onCreateToken: noop, onCopy: noop, onDismissSecret: noop, ...over,
  }
  return renderToStaticMarkup(<AssistantsView {...props} />)
}

const buttons = (html: string) => [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map((m) => ({ attrs: m[1], label: m[2].replace(/<[^>]+>/g, '').trim() }))
const button = (html: string, label: string) => buttons(html).find((b) => b.label === label)
const switches = (html: string) => [...html.matchAll(/<button([^>]*role="switch"[^>]*)>/g)].map((m) => m[1])

describe('AssistantsView', () => {
  it('gives the owner a toggle with its state, the endpoint and a read-only token shortcut', () => {
    const off = render()
    expect(off).toContain('AI assistants')
    expect(off).toContain('role="switch"')
    expect(off).not.toContain('aria-checked="true"')
    expect(off).toContain('answers “not found”')
    expect(off).toContain(endpoint)
    expect(button(off, 'Copy URL')).toBeTruthy()
    expect(button(off, 'Create read-only token')?.attrs).not.toContain('disabled')
    const on = render({ status: { enabled: true, endpoint } })
    expect(on).toContain('aria-checked="true"')
    expect(on).toContain('connect an assistant with its own token')
  })

  it('tells an encrypted account what remote assistants can do and how ot mcp --decrypt works (mcp-projects)', () => {
    const html = render({ encrypted: true, status: { enabled: true, endpoint } })
    expect(html).toContain('data-assistants-encrypted')
    expect(html).toContain('colours, icons, order and dates')
    expect(html).toContain('<code>ot encryption unlock</code>')
    expect(html).toContain('<code>ot mcp --decrypt</code>')
    expect(html).toContain('Your AI provider then receives that text in plain form; the server still receives only ciphertext.')
    expect(render({ status: { enabled: true, endpoint } })).not.toContain('data-assistants-encrypted')
    expect(render({ encrypted: true })).not.toContain('data-assistants-encrypted')
  })

  it('shows members the status without a toggle', () => {
    const html = render({ isOwner: false })
    expect(html).not.toContain('role="switch"')
    expect(html).toContain('The server owner has not enabled AI assistant access')
    expect(render({ isOwner: false, status: { enabled: true, endpoint } })).toContain('has enabled AI assistant access')
    // Members can still prepare a token.
    expect(button(html, 'Create read-only token')).toBeTruthy()
  })

  it('shows the last fetched state offline with actions disabled', () => {
    const html = render({ connected: false, status: { enabled: true, endpoint } })
    expect(html).toContain('Offline: these settings live on the server')
    expect(html).toContain(endpoint)
    expect(switches(html).every((b) => b.includes('disabled=""'))).toBe(true)
    expect(button(html, 'Create read-only token')?.attrs).toContain('disabled')
    expect(render({ connected: false, status: null })).toContain('Nothing fetched yet.')
    // A request in flight keeps the controls focusable (keyboard focus is not lost).
    const busy = button(render({ busy: true }), 'Create read-only token')
    expect(busy?.attrs).not.toContain('disabled')
    expect(busy?.attrs).toContain('aria-busy="true"')
  })

  it('shows a created token once with copy actions and puts it in the snippet', () => {
    const html = render({ secret: 'ot_assistant123' })
    expect(html).toContain('ot_assistant123')
    expect(html).toContain('will not be shown again')
    expect(button(html, 'Copy')).toBeTruthy()
    expect(button(html, 'Done')).toBeTruthy()
    expect(html).toContain('Bearer ot_assistant123')
    const plain = render()
    expect(plain).not.toContain('ot_')
    expect(plain).toContain('Bearer &lt;your token&gt;')
    expect(render({ copied: 'endpoint' })).toContain('Copied')
  })

  it('includes connection instructions and the time-zone note', () => {
    const html = render()
    expect(html).toContain('Connection instructions')
    expect(html).toContain('streamable HTTP')
    expect(html).toContain('time zone')
    expect(button(html, 'Copy configuration')).toBeTruthy()
  })
})

const AGENT = 'Create a token for an assistant that can make changes'

describe('AssistantsView: assistant writes (mcp-write-tools)', () => {
  const on = { enabled: true, writes_enabled: true, endpoint }

  it('gives the owner a second switch once the endpoint is on', () => {
    expect(render()).not.toContain('AI assistants may make changes')
    const html = render({ status: { enabled: true, writes_enabled: false, endpoint } })
    expect(html).toContain('AI assistants may make changes')
    expect(html).toContain('Assistants can only read')
    expect(render({ status: on })).toContain('with a dedicated token change their tasks')
    // Members get no owner switches, only their own.
    const member = render({ isOwner: false, status: on })
    expect(member).not.toContain('AI assistants may make changes</span>')
    expect(member).toContain('allows assistants to make changes')
    expect(switches(member)).toHaveLength(1)
  })

  it('shows every user their own switch with what assistants can and cannot do', () => {
    const html = render({ isOwner: false, status: { enabled: true, endpoint } })
    expect(html).toContain('Changes to my tasks')
    expect(html).toContain('Allow AI assistants to make changes to my tasks')
    expect(html).toContain('has not allowed assistants to make changes')
    expect(html).toContain('aria-describedby="assistant-writes-help"')
    expect(render({ status: on, access: { allow_writes: true, owner_allows_writes: true } })).not.toContain('has not allowed assistants')
  })

  it('offers the agent token only when both switches are on; read-only stays the default', () => {
    expect(button(render({ status: on }), AGENT)).toBeUndefined()
    expect(button(render({ status: { enabled: true, endpoint }, access: { allow_writes: true, owner_allows_writes: false } }), AGENT)).toBeUndefined()
    const both = render({ status: on, access: { allow_writes: true, owner_allows_writes: true } })
    expect(button(both, AGENT)).toBeTruthy()
    const labels = buttons(both).map((b) => b.label)
    expect(labels.indexOf('Create read-only token')).toBeLessThan(labels.indexOf(AGENT))
    expect(button(both, 'Create read-only token')?.attrs).toContain('ui-btn--primary')
    expect(render({ status: on, secret: 'ot_a', secretScope: 'agent' })).toContain('assistant that can make changes now')
  })

  it('disables every switch and action offline, keeping the last state', () => {
    const html = render({ connected: false, status: on, access: { allow_writes: true, owner_allows_writes: true } })
    const boxes = switches(html)
    expect(boxes).toHaveLength(3)
    for (const b of boxes) expect(b).toContain('disabled=""')
    expect(boxes.every((b) => b.includes('aria-checked="true"'))).toBe(true)
    expect(button(html, AGENT)?.attrs).toContain('disabled')
    expect(html).toContain('this is the last state fetched')
  })
})

describe('assistants helpers', () => {
  it('builds an MCP client entry with URL and bearer header', () => {
    expect(JSON.parse(connectionSnippet(endpoint, 'ot_x'))).toEqual({
      mcpServers: { opentodo: { type: 'http', url: endpoint, headers: { Authorization: 'Bearer ot_x' } } },
    })
  })

  it('describes errors', () => {
    expect(describeAssistantsError(new ApiError(403, 'forbidden', 'only the owner'))).toContain('Only the server owner')
    expect(describeAssistantsError(new ApiError(403, 'insufficient_scope', 'no'))).toContain('Only you')
    expect(describeAssistantsError(new TypeError('Failed to fetch'))).toContain('unreachable')
  })
})

describe('api MCP settings', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads and writes the toggle', async () => {
    const calls: { method: string; url: string; body: unknown }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ method: init.method ?? 'GET', url, body: init.body ? JSON.parse(String(init.body)) : null })
      return new Response(JSON.stringify({ enabled: true, endpoint }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
    expect(await api.getMcpSettings()).toEqual({ enabled: true, endpoint })
    await api.setMcpSettings(true)
    await api.setMcpWrites(true)
    await api.getAgentAccess()
    await api.setAgentAccess(false)
    expect(calls).toEqual([
      { method: 'GET', url: '/api/v1/settings/mcp', body: null },
      { method: 'PUT', url: '/api/v1/settings/mcp', body: { enabled: true } },
      { method: 'PUT', url: '/api/v1/settings/mcp', body: { writes_enabled: true } },
      { method: 'GET', url: '/api/v1/me/agent-access', body: null },
      { method: 'PUT', url: '/api/v1/me/agent-access', body: { allow_writes: false } },
    ])
  })
})
