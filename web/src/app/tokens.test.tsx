// Settings → API tokens without a DOM: the pure TokensView is rendered to static
// markup, and the API client is checked for the scope it sends.
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import { scopeLabel, type ApiToken } from '../lib/assistants'
import { scopeBadge, tokenMeta, TokensView, type TokensViewProps } from './TokensSection'

const noop = () => {}

function render(over: Partial<TokensViewProps> = {}) {
  const props: TokensViewProps = {
    tokens: [], name: '', scope: 'full', secret: null, error: null,
    onNameChange: noop, onScopeChange: noop, onCreate: noop, onRevoke: noop, ...over,
  }
  return renderToStaticMarkup(<TokensView {...props} />)
}

const token = (over: Partial<ApiToken> = {}): ApiToken => ({ id: 't1', name: 'laptop CLI', scope: 'full', createdAt: 1, lastUsedAt: null, ...over })

describe('TokensView', () => {
  it('offers the scopes as described choices in the New token dialog, with full access preselected', () => {
    expect(render()).not.toContain('aria-label="Token scope"')
    const html = render({ creating: true })
    expect(html).toContain('aria-label="Token scope"')
    expect(html).toMatch(/value="full" checked=""|checked="" value="full"/)
    for (const line of ['Everything you can do, except sign-in credentials and administration.', 'Reads everything you can; every change is refused.',
      'An AI assistant changes tasks only through its tools, while you and the owner allow it.', 'Full access plus credentials and administration. Keep it like a password.']) {
      expect(html).toContain(line)
    }
    expect(render({ creating: true, scope: 'read' })).toMatch(/value="read" checked=""|checked="" value="read"/)
  })

  it('warns about the admin scope only while it is chosen (route-authorization-policy)', () => {
    expect(render({ creating: true })).not.toContain('An admin token can turn off two-factor authentication')
    expect(render({ creating: true, scope: 'admin' })).toContain('An admin token can turn off two-factor authentication')
    expect(render({ tokens: [token({ scope: 'admin' })] })).toContain('>Admin<')
  })

  it('Token rows: name, scope badge, "Created 3 Oct · Last used today", and Revoke; tokens from before scopes read as full', () => {
    const now = new Date(2026, 9, 14, 12).getTime()
    const claude = token({ name: 'Claude', scope: 'read', createdAt: new Date(2026, 9, 3, 9).getTime(), lastUsedAt: now - 3600_000 })
    expect(tokenMeta(claude, now)).toMatch(/^Created .*3.* · Last used today$/)
    expect(tokenMeta({ ...claude, lastUsedAt: null }, now)).toMatch(/· Never used$/)
    expect(tokenMeta({ ...claude, lastUsedAt: now - 86400_000 }, now)).toMatch(/· Last used yesterday$/)
    const html = render({ tokens: [claude, token({ id: 't3', name: 'old', scope: undefined }), token({ id: 't4', name: 'desk', scope: 'agent' })], now })
    expect(html).toContain('>Read only<')
    expect(html).toContain('>Full access<')
    expect(html).toContain('>Assistant<')
    expect(html).toContain('aria-label="Revoke Claude"')
    expect(html).toContain('New token')
  })

  it('offline: the list stays with New token and Revoke disabled', () => {
    const html = render({ tokens: [token()], offline: true })
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-token-revoke/)
  })

  it('shows the secret once in the dialog, with copy, and the empty state', () => {
    const shown = render({ creating: true, secret: 'ot_secret123' })
    expect(shown).toContain('ot_secret123')
    expect(shown).toContain('will not be shown again')
    expect(shown).toContain('>Copy<')
    expect(render()).not.toContain('ot_')
    const empty = render()
    expect(empty).toContain('No API tokens yet')
    expect(empty).toContain('without your password')
    expect(empty).toContain('New token')
  })

  it('maps scopes to labels', () => {
    expect(scopeBadge('read')).toBe('Read only')
    expect(scopeBadge(undefined)).toBe('Full access')
    expect(scopeLabel('read')).toBe('read-only')
    expect(scopeLabel('full')).toBe('full access')
    expect(scopeLabel(undefined)).toBe('full access')
    expect(scopeLabel('agent')).toBe('assistant, can make changes')
    expect(scopeLabel('admin')).toBe('admin')
  })
})

describe('api.createToken', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the scope only when one is chosen', async () => {
    const bodies: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ token: token({ scope: 'read' }), secret: 'ot_x' }), { status: 201, headers: { 'Content-Type': 'application/json' } })
    }))
    await api.createToken('assistant', 'read')
    await api.createToken('cli')
    expect(bodies).toEqual([{ name: 'assistant', scope: 'read' }, { name: 'cli' }])
  })
})
