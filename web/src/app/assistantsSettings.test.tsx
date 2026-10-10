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
    isOwner: true, connected: true, status: { enabled: false, endpoint }, busy: false, error: null, secret: null, copied: null,
    onToggle: noop, onCreateToken: noop, onCopy: noop, onDismissSecret: noop, ...over,
  }
  return renderToStaticMarkup(<AssistantsView {...props} />)
}

const buttons = (html: string) => [...html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].map((m) => ({ attrs: m[1], label: m[2] }))
const button = (html: string, label: string) => buttons(html).find((b) => b.label === label)

describe('AssistantsView', () => {
  it('gives the owner a toggle with its state, the endpoint and a read-only token shortcut', () => {
    const off = render()
    expect(off).toContain('AI assistants')
    expect(off).toContain('type="checkbox"')
    expect(off).not.toContain('checked=""')
    expect(off).toContain('answers “not found”')
    expect(off).toContain(endpoint)
    expect(button(off, 'Copy URL')).toBeTruthy()
    expect(button(off, 'Create read-only token')?.attrs).not.toContain('disabled')
    const on = render({ status: { enabled: true, endpoint } })
    expect(on).toContain('checked=""')
    expect(on).toContain('sees only its own data')
  })

  it('shows members the status without a toggle', () => {
    const html = render({ isOwner: false })
    expect(html).not.toContain('type="checkbox"')
    expect(html).toContain('The server owner has not enabled AI assistant access')
    expect(render({ isOwner: false, status: { enabled: true, endpoint } })).toContain('has enabled AI assistant access')
    // Members can still prepare a token.
    expect(button(html, 'Create read-only token')).toBeTruthy()
  })

  it('shows the last fetched state offline with actions disabled', () => {
    const html = render({ connected: false, status: { enabled: true, endpoint } })
    expect(html).toContain('You are offline')
    expect(html).toContain(endpoint)
    expect(html).toMatch(/type="checkbox"[^>]*disabled=""|disabled=""[^>]*type="checkbox"/)
    expect(button(html, 'Create read-only token')?.attrs).toContain('disabled')
    expect(render({ connected: false, status: null })).toContain('Nothing fetched yet.')
  })

  it('shows a created token once with copy actions and puts it in the snippet', () => {
    const html = render({ secret: 'ot_assistant123' })
    expect(html).toContain('ot_assistant123')
    expect(html).toContain('will not be shown again')
    expect(button(html, 'Copy token')).toBeTruthy()
    expect(button(html, 'Done')).toBeTruthy()
    expect(html).toContain('Bearer ot_assistant123')
    const plain = render()
    expect(plain).not.toContain('ot_')
    expect(plain).toContain('Bearer &lt;your read-only token&gt;')
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

describe('assistants helpers', () => {
  it('builds an MCP client entry with URL and bearer header', () => {
    expect(JSON.parse(connectionSnippet(endpoint, 'ot_x'))).toEqual({
      mcpServers: { opentodo: { type: 'http', url: endpoint, headers: { Authorization: 'Bearer ot_x' } } },
    })
  })

  it('describes errors', () => {
    expect(describeAssistantsError(new ApiError(403, 'forbidden', 'only the owner'))).toContain('Only the server owner')
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
    expect(calls).toEqual([
      { method: 'GET', url: '/api/v1/settings/mcp', body: null },
      { method: 'PUT', url: '/api/v1/settings/mcp', body: { enabled: true } },
    ])
  })
})
